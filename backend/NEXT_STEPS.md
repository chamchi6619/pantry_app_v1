# Next Steps Runbook - Recipe Collection

## ✅ Completed (Ready to Ship)

### Day 1 Sources
- ✅ **MFDS Korea API** - 2000+ recipes
- ✅ **USDA Enhanced** - 1000-3000 recipes
- ✅ **TheMealDB Commercial** - 300+ recipes
- 🔄 **Buenos Aires** - Needs HTML scraper

### Infrastructure
- ✅ Compliance enforcement with image/instruction flags
- ✅ Smart deduplication with fingerprints
- ✅ Parallel orchestrator with circuit breakers
- ✅ Daily cron script for automation
- ✅ Database optimization script
- ✅ Test compliance validation

## 📋 Today → 48 Hours Action Items

### 1. Set API Keys & Run Day 1 Collection
```bash
# Set up environment
cp .env.example .env
# Edit .env with your keys:
# MFDS_API_KEY=<get from http://openapi.foodsafetykorea.go.kr>
# THEMEALDB_API_KEY=<Patreon key or "1" for test>

# Apply all schema updates
sqlite3 data/pantry.db < migrations/sqlite_schema.sql
sqlite3 data/pantry.db < migrations/add_collection_fields.sql
sqlite3 data/pantry.db < migrations/add_production_fields.sql

# Test compliance first
python scripts/test_compliance.py

# Run Day 1 collection
python scripts/collect_all.py --sources=mfds,usda,themealdb
python scripts/deduplicate_enhanced.py
python scripts/optimize_db.py
python scripts/ingest_recipes.py stats
```

### 2. Add Buenos Aires Scraper (Day 1 completion)
Create `app/ingestion/scrapers/ba_argentina.py`:
- Parse recipe index pages
- Extract recipe details
- CC BY 2.5 AR attribution

### 3. Lock Media Compliance
✅ Already implemented:
- `image_licence_allowed` defaults to false
- NHS/MAFF/GoJ marked as hotlink-only
- Images cleared when not allowed

### 4. Make Imports Bulletproof
✅ Already implemented:
- Unique index on (source_key, external_id)
- WAL mode for SQLite concurrency
- Add `--dry-run` flag to collectors (TODO)

## 📅 7-Day Micro-Roadmap

### Day 1-2 (Now)
```bash
# Add BA scraper
# Scale MFDS/USDA volume
python scripts/collect_all.py --sources=mfds,usda,themealdb --limit=0
bash scripts/cron_daily.sh  # Test automation
```

### Day 3-4 (Add Gov Sources)
Create scrapers:
- `nhs_uk.py` - JSON-LD extraction, OGL attribution
- `maff_japan.py` - Prefecture crawling, Japanese + English

```bash
python scripts/collect_all.py --sources=nhs,maff
python scripts/deduplicate_enhanced.py
```

### Day 5 (PDFs + Classics)
- Uruguay INDA PDF parser
- Project Gutenberg classics

```bash
python scripts/quality_audit.py --sample=150
```

### Day 6 (Integration)
- Connect Expo app to PC backend
- Test search/match performance
- Add attribution UI

### Day 7 (Production)
- Load 10k recipes
- Export backup
- Tag "MVP dataset"

## 🔧 Quick Commands Reference

### Daily Operations
```bash
# Manual daily run
bash scripts/cron_daily.sh

# Or schedule with cron
0 2 * * * /path/to/backend/scripts/cron_daily.sh

# Check status
python scripts/ingest_recipes.py stats

# Optimize after large import
python scripts/optimize_db.py
```

### Testing & Validation
```bash
# Test compliance rules
python scripts/test_compliance.py

# Test collection pipeline
python scripts/test_collection.py

# Smoke test (5 recipes)
python scripts/collect_all.py --sources=mfds --limit=5
```

### Deduplication & Cleanup
```bash
# Run deduplication
python scripts/deduplicate_enhanced.py

# View stats only
python scripts/deduplicate_enhanced.py stats

# Restore deleted (if needed)
python scripts/deduplicate_enhanced.py restore
```

## 📊 Monitoring & Health

### Add to API (TODO)
```python
@app.get("/healthz")
async def health_check():
    # Check database accessible
    # Return {"status": "ok", "recipes": count}

@app.get("/metrics")
async def metrics():
    # Recipe counts by source
    # Last collection timestamp
    # Duplicate removal stats
```

### Manual Health Checks
```sql
-- Check recipe distribution
SELECT source_key, COUNT(*) as count,
       AVG(LENGTH(instructions)) as avg_instructions
FROM recipes
WHERE takedown = 0
GROUP BY source_key;

-- Check compliance
SELECT license_code,
       SUM(instructions_allowed) as with_instructions,
       SUM(image_licence_allowed) as with_images,
       COUNT(*) as total
FROM recipes
WHERE takedown = 0
GROUP BY license_code;

-- Performance check
EXPLAIN QUERY PLAN
SELECT * FROM recipes
WHERE ingredients_vec LIKE '%ing_123%'
LIMIT 10;
```

## ⚠️ Critical Reminders

### Legal Compliance
- ❌ **NO RecipeNLG** (academic only)
- ⚠️ **Canada restricted** to facts-only
- 🖼️ **Images**: Never rehost unless `image_licence_allowed=1`
- 📝 **Attribution**: Always stored at import time

### Performance Targets
- Database: 150-250MB for 10k recipes (not <100MB)
- Search: <100ms with indexes
- Pantry match: P95 <150ms

### Backup Strategy
```bash
# Before major operations
cp data/pantry.db data/backups/pantry_$(date +%Y%m%d).db

# Keep raw responses
ls -la data/raw/*/20*/  # Verify snapshots saved
```

## 🚀 Pre-flight Checklist

- [x] Compliance enforcement tested
- [x] Deduplication working
- [x] Attribution rendered at import
- [x] Image licenses enforced
- [x] Canada marked restricted
- [ ] API keys configured
- [ ] First collection run
- [ ] Metrics endpoint added
- [ ] Expo app connected

## 📈 Expected Results

### After Day 1
- MFDS: 1500-2500 recipes
- USDA: 1000-3000 recipes
- TheMealDB: 200-300 recipes
- **Total: 2700-5800 recipes**

### After Day 3
- +NHS: 500 recipes
- +MAFF: 1000 recipes
- +BA: 300 recipes
- **Total: 4500-7600 recipes**

### After Day 7
- +INDA: 200 recipes
- +Gutenberg: 500 recipes
- **Total: 5200-8300 deduplicated**

## 🎯 Ship It!

Ready to start:
```bash
# Final check
python scripts/test_compliance.py

# Launch collection
export MFDS_API_KEY="your-key"
export THEMEALDB_API_KEY="your-key-or-1"
python scripts/collect_all.py --sources=mfds,usda,themealdb

# Verify
python scripts/ingest_recipes.py stats
```

You're at the **"feed it and ship it"** stage! 🚀