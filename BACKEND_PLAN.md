# Pantry Pal Backend Implementation Plan

## Overview
Local backend on PC using FastAPI + SQLite with FTS5, designed for immediate Expo Go testing and future migration to Supabase.

## Architecture

### Stack
- **API**: FastAPI with async SQLite support
- **Database**: SQLite with FTS5 for full-text search
- **Caching**: In-memory for hot queries
- **Migration Path**: SQLite → PostgreSQL/Supabase

### Directory Structure
```
pantry_app_v1/
├── pantry-app/         (React Native)
└── backend/
    ├── app/
    │   ├── __init__.py
    │   ├── main.py      # FastAPI app
    │   ├── models.py    # SQLAlchemy models
    │   ├── schemas.py   # Pydantic schemas
    │   ├── database.py  # DB connection
    │   └── utils/
    │       ├── pantry_matcher.py
    │       └── rate_limiter.py
    ├── data/
    │   ├── pantry.db    # Pre-built with recipes
    │   ├── pantry_template.db  # Clean schema
    │   ├── logs/
    │   └── raw/         # Source files
    ├── scripts/
    │   ├── build_database.py
    │   ├── ingest_usda.py
    │   ├── ingest_nhs.py
    │   └── verify_fts5.py
    ├── migrations/
    │   ├── sqlite_schema.sql
    │   └── postgres_schema.sql
    ├── requirements.txt
    └── .env
```

## Database Schema (Supabase-Compatible)

### Core Tables
```sql
-- recipes table
CREATE TABLE recipes (
    id TEXT PRIMARY KEY,  -- UUID as text
    slug TEXT UNIQUE,
    title TEXT NOT NULL,
    title_en TEXT,
    instructions TEXT,
    instructions_en TEXT,
    total_time_min INTEGER,
    prep_time_min INTEGER,
    yields TEXT,
    image_url TEXT,
    ingredients_vec TEXT,  -- CSV of ingredient IDs for fast matching
    required_count INTEGER, -- Precomputed count

    -- Attribution fields (mandatory)
    source_id TEXT NOT NULL,
    source_url TEXT NOT NULL,
    license_code TEXT NOT NULL,
    license_url TEXT,
    attribution_text TEXT NOT NULL,
    instructions_allowed INTEGER DEFAULT 1,
    share_alike_required INTEGER DEFAULT 0,
    takedown INTEGER DEFAULT 0,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ingredients table
CREATE TABLE ingredients (
    id TEXT PRIMARY KEY,
    canonical_name TEXT UNIQUE NOT NULL,
    aliases TEXT  -- JSON array
);

-- recipe_ingredients junction
CREATE TABLE recipe_ingredients (
    recipe_id TEXT,
    ingredient_id TEXT,
    qty_value REAL,
    qty_unit TEXT,
    raw_text TEXT,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id),
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
);

-- nutrition table
CREATE TABLE nutrition (
    recipe_id TEXT PRIMARY KEY,
    calories INTEGER,
    protein_g REAL,
    fat_g REAL,
    carbs_g REAL,
    fiber_g REAL,
    sugar_g REAL,
    sodium_mg REAL
);

-- tags table
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE,
    type TEXT -- diet|meal|cuisine|technique
);

-- recipe_tags junction
CREATE TABLE recipe_tags (
    recipe_id TEXT,
    tag_id TEXT
);

-- sources table
CREATE TABLE sources (
    id TEXT PRIMARY KEY,
    name TEXT,
    territory TEXT,
    license_code TEXT,
    license_url TEXT,
    tos_notes TEXT
);

-- staples table (for pantry matching)
CREATE TABLE staples (
    ingredient_id TEXT PRIMARY KEY,
    penalty_weight REAL DEFAULT 0.1
);
```

### Indexes & FTS5
```sql
-- Performance indexes
CREATE INDEX idx_recipes_time ON recipes(total_time_min);
CREATE INDEX idx_recipes_takedown ON recipes(takedown);
CREATE INDEX idx_ri_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX idx_ri_ingredient ON recipe_ingredients(ingredient_id);

-- FTS5 for search
CREATE VIRTUAL TABLE recipes_fts USING fts5(
    title, ingredients_flat, content=recipes, tokenize='unicode61'
);
```

## API Endpoints

### Core Endpoints
```python
GET  /healthz                    # Health check with FTS5 verification
GET  /metrics                    # Simple counts for monitoring
GET  /recipes/search             # Search with filters, pagination
POST /recipes/match              # Pantry matching with scoring
GET  /recipes/{id}               # Recipe details with attribution
GET  /ingredients/search         # Ingredient autocomplete
POST /recipes/bulk-import        # Admin: ingest recipes
```

### Response Shapes (Standardized)
```typescript
// Search Response
{
  items: Recipe[],
  next_cursor?: string,
  total?: number
}

// Match Response
{
  items: Array<{
    recipe: Recipe,
    score: number,
    present: string[],
    missing: string[]
  }>
}
```

## Implementation Phases

### Phase 1: Backend Foundation (Day 1)
1. **Setup Python Environment**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate
   pip install fastapi uvicorn[standard] sqlalchemy aiosqlite python-dotenv pydantic
   ```

2. **Create Database Schema**
   - SQLite with FTS5 support
   - Indexes for performance
   - Attribution fields mandatory

3. **FastAPI Core**
   - CORS configuration for Expo
   - Rate limiting (in-memory token bucket)
   - JSON logging with request IDs

4. **Verify FTS5 on Startup**
   ```python
   SELECT sqlite_compileoption_used('ENABLE_FTS5')
   ```

### Phase 2: Data Ingestion (Day 2)
1. **Build Pre-populated Database**
   - Run ingestion on PC, not devices
   - USDA recipes (~5000)
   - NHS recipes (~500)
   - Store in `data/pantry.db`

2. **Attribution Enforcement**
   - Reject any recipe without license_code
   - Auto-generate attribution_text
   - Track source_url for compliance

3. **Performance Optimizations**
   - Precompute ingredients_vec (CSV of IDs)
   - Build FTS5 index
   - Load staples into memory

### Phase 3: React Native Integration (Day 3)
1. **API Service Layer**
   ```typescript
   const API_URL = Platform.select({
     ios: 'http://localhost:8000',
     android: 'http://10.0.2.2:8000'
   });
   ```

2. **Device Connectivity**
   - iOS Simulator: localhost
   - Android Emulator: 10.0.2.2
   - Physical devices: PC's LAN IP
   - Android: may need networkSecurityConfig

3. **Update Recipe Store**
   - Replace mock data with API calls
   - Add loading/error states
   - Implement response caching

### Phase 4: Features & Polish (Week 2)
1. **Search & Filters**
   - Full-text search via FTS5
   - Diet/cuisine/time filters
   - Cursor-based pagination

2. **Pantry Matching**
   - Set operations on ingredients_vec
   - Staples penalty from memory
   - Target: <150ms for 3k recipes

3. **Monitoring & Logging**
   - JSON logs to files
   - Request latency tracking
   - Simple metrics endpoint

## Performance Targets

### Response Times (Local PC)
- Search: P95 < 100ms
- Pantry Match: P95 < 150ms (3k recipes)
- Recipe Detail: P95 < 50ms

### Capacity
- 25-50k recipes in SQLite
- 100+ concurrent Expo clients
- Rate limit: 300 req/min per IP

## Migration to Supabase (Future)

### Database Migration
```bash
# Export from SQLite
sqlite3 pantry.db .dump > export.sql

# Transform for PostgreSQL
# - TEXT (json) → JSONB
# - INTEGER (bool) → BOOLEAN
# - Add GIN indexes

# Import to Supabase
psql $SUPABASE_URL < postgres_schema.sql
```

### Code Changes
```python
# Change connection string
DATABASE_URL = "postgresql://..."

# Optional: Use Supabase client
from supabase import create_client
```

## Quick Start Commands

```bash
# Terminal 1: Build database (once)
cd backend
python scripts/build_database.py

# Terminal 2: Start backend
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 3: Start Expo
cd pantry-app
npm start

# Test endpoints
curl http://localhost:8000/healthz
curl http://localhost:8000/recipes/search?q=chicken
```

## Environment Variables

```bash
# backend/.env
DATABASE_URL=sqlite:///./data/pantry.db
ALLOWED_ORIGINS=["http://localhost:19006","http://10.0.2.2:19006"]
LOG_LEVEL=INFO
RATE_LIMIT_PER_MINUTE=300
```

## Testing Checklist

### Day 1: Foundation
- [ ] SQLite with FTS5 verified
- [ ] FastAPI docs at /docs
- [ ] CORS allows Expo connections
- [ ] Rate limiter active

### Day 2: Data
- [ ] 3k+ recipes ingested
- [ ] Attribution fields populated
- [ ] FTS5 search working
- [ ] Pantry match < 150ms

### Day 3: Integration
- [ ] iOS Simulator connects
- [ ] Android Emulator connects
- [ ] Search from Expo works
- [ ] Attribution displays in app

### Day 4: Polish
- [ ] Physical device via LAN IP
- [ ] Response caching active
- [ ] Logs written to files
- [ ] All endpoints < 200ms

## Recipe Data Sources

### Tier A (Full Text Allowed)
- **USDA/MyPlate**: Public domain, ~5000 recipes
- **NHS (UK)**: Open Government License
- **Project Gutenberg**: Classic cookbooks (public domain)
- **Government sites**: Korea MFDS, Japan MAFF, Argentina BA

### Tier B (Share-Alike)
- **Wikibooks**: CC BY-SA (separate collection)
- **CODH Edo Recipes**: CC BY-SA (Japanese)

### Attribution Templates
```python
# Public Domain
"Recipe from USDA MyPlate. Public domain."

# Government License
"Contains recipe from [Agency] licensed under [OGL/KOGL]. Source: [URL]"

# CC BY
"Recipe © original authors, CC BY 4.0. Source: [URL]"
```

## Security & Compliance

### Attribution Enforcement
- Database constraint: NOT NULL on license fields
- API validation: reject missing attribution
- Takedown flag: hide instructions if flagged

### Rate Limiting
- In-memory token bucket
- 300 requests/minute per IP
- Configurable via environment

### CORS Policy
- Development: Allow Expo ports
- Production: Whitelist specific domains
- Include exp:// for Expo Go

## Notes

- **Pre-build database on PC**: Don't ingest on devices, too slow
- **Use ingredients_vec**: CSV of IDs for fast set operations
- **FTS5 required**: Verify at startup, error if not available
- **LAN IP for devices**: Start with --host 0.0.0.0
- **Keep images as URLs**: Don't store binaries in SQLite

---

*Last Updated: December 2024*
*Version: 1.0.0*