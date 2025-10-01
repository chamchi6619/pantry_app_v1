# Recipe Collection Guide

## Overview
We've built a legally-compliant recipe collection system that can gather 10,000+ recipes from government and open sources.

## What's Been Built

### 1. Collectors
- **MFDS Korea API** (`app/ingestion/scrapers/mfds_api.py`)
  - Target: 2000+ Korean recipes with nutrition
  - License: KOGL Type 1 (full text allowed)

- **USDA Enhanced** (`app/ingestion/scrapers/usda_enhanced.py`)
  - Uses sitemap.xml and JSON-LD parsing
  - Target: 1000-3000 recipes
  - License: Public Domain (no attribution)

### 2. Infrastructure
- **Source Manager** (`app/ingestion/source_manager.py`)
  - Tracks licenses and attribution requirements
  - Validates compliance

- **Enhanced Deduplication** (`scripts/deduplicate_enhanced.py`)
  - Fingerprint-based matching
  - FTS5 similarity checking
  - License-based priority

- **Parallel Orchestrator** (`scripts/collect_all.py`)
  - Runs multiple collectors concurrently
  - Circuit breakers for fault tolerance
  - Automatic ingestion pipeline

### 3. Database Enhancements
- Added idempotency fields (external_id, source_key)
- Fingerprint tracking for deduplication
- Open collection flag for share-alike content

## Quick Start

### 1. Initialize Database
```bash
cd backend

# Run schema migrations
sqlite3 data/pantry.db < migrations/sqlite_schema.sql
sqlite3 data/pantry.db < migrations/add_collection_fields.sql

# Initialize with test data
python scripts/init_db.py
```

### 2. Test Collection Pipeline
```bash
# Test individual components
python scripts/test_collection.py
```

### 3. Run Day 1 Collection
```bash
# Collect from MFDS and USDA (public domain/open licenses)
python scripts/collect_all.py --sources=mfds,usda --limit=100

# Or collect and save without ingesting
python scripts/collect_all.py --sources=mfds,usda --save-only
```

### 4. Deduplicate
```bash
# Run deduplication
python scripts/deduplicate_enhanced.py

# Check statistics
python scripts/deduplicate_enhanced.py stats

# Restore if needed
python scripts/deduplicate_enhanced.py restore
```

### 5. Check Results
```bash
# View database statistics
python scripts/ingest_recipes.py stats

# Test the API
uvicorn app.main:app --reload
# Visit http://localhost:8000/docs
```

## API Keys Required

### MFDS Korea
1. Visit: http://openapi.foodsafetykorea.go.kr
2. Register for API key
3. Set environment variable:
```bash
export MFDS_API_KEY="your-key-here"
```

### TheMealDB (Optional)
- For commercial use, need Patreon subscription
- Visit: https://www.themealdb.com/api.php

## Collection Strategy

### Day 1: APIs & Public Domain (3-6k recipes)
```bash
python scripts/collect_all.py --sources=mfds,usda
```

### Day 2: Government Sources (2-3k recipes)
Add scrapers for:
- NHS UK (OGL license)
- Japan MAFF (GoJ v2.0)
- Canada Food Guide (Crown copyright)

### Day 3: PDFs & Archives (1-2k recipes)
- Uruguay INDA PDFs (CC BY 4.0)
- Project Gutenberg classics (Public Domain)

## File Structure
```
backend/
├── app/
│   └── ingestion/
│       ├── scrapers/
│       │   ├── mfds_api.py          # Korea API
│       │   └── usda_enhanced.py     # USDA scraper
│       ├── ingredient_normalizer.py # Parse ingredients
│       ├── validators.py            # Recipe validation
│       └── source_manager.py        # License management
├── scripts/
│   ├── collect_all.py              # Orchestrator
│   ├── deduplicate_enhanced.py     # Smart deduplication
│   ├── ingest_recipes.py           # Batch ingestion
│   └── test_collection.py          # Test pipeline
├── data/
│   ├── pantry.db                   # SQLite database
│   ├── collected/                  # JSON exports
│   └── raw/                       # Raw responses
└── migrations/
    ├── sqlite_schema.sql
    └── add_collection_fields.sql
```

## Compliance Checklist

✅ **Always Store:**
- `license_code` - License identifier
- `source_url` - Original recipe URL
- `attribution_text` - Required attribution
- `instructions_allowed` - Can we store full text?

✅ **License Priority:**
1. PUBLIC/CC0 - No attribution needed
2. CC-BY/OGL/KOGL - Attribution required
3. CC-BY-SA - Share-alike (mark as open_collection)
4. API - Follow specific terms

✅ **Never Use:**
- RecipeNLG (academic only)
- CC-BY-NC (non-commercial)
- Unlicensed content

## Quality Gates

### Minimum Requirements
- 2+ ingredients
- Instructions >50 chars OR summary >20 chars
- Valid license
- Proper attribution

### Nutrition Sanity
- Calories: 20-2000
- Sodium: <10,000mg
- Times: 5-480 minutes

### Deduplication Rules
- Fingerprint matching (ingredients + title)
- FTS5 similarity >85% = duplicate
- Keep best by: license > nutrition > image > newer

## Troubleshooting

### "No recipes collected"
- Check API keys are set
- Verify internet connection
- Check rate limits

### "Duplicate key error"
- Run deduplication script
- Check (source_key, external_id) uniqueness

### "License validation failed"
- Verify source is in KNOWN_SOURCES
- Check license_code is valid

## Next Steps

1. **Add More Scrapers:**
   - NHS UK scraper
   - Buenos Aires HTML parser
   - Japan MAFF collector

2. **Enhance Quality:**
   - Add image validation
   - Implement translation for non-English
   - Add cuisine classification

3. **Scale Up:**
   - Target 10k+ recipes
   - Add caching layer
   - Optimize FTS5 indexes

## Success Metrics

- ✅ 10k+ recipes legally collected
- ✅ 100% attribution compliance
- ✅ <100ms search performance
- ✅ <200MB database size
- ✅ Zero legal exposure

---

Ready to collect recipes? Start with:
```bash
python scripts/test_collection.py
```

Then run the full pipeline:
```bash
python scripts/collect_all.py --sources=mfds,usda
```