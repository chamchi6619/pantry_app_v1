# Recipe Collection & Ingestion Plan for SQLite Backend

## Overview
This document adapts our 25-50k recipe collection strategy to work with the implemented FastAPI + SQLite backend with FTS5 search capabilities.

## Current Backend Capabilities
- **Database**: SQLite with FTS5 full-text search
- **Schema**: recipes, ingredients, sources tables ready
- **API**: Recipe endpoints with pagination and search
- **Matching**: Pre-computed ingredients_vec for fast pantry matching
- **Attribution**: License tracking and enforcement built-in

## Phase 1: Core Infrastructure (Week 1)

### 1.1 Ingredient Normalization System
Location: `/backend/app/ingestion/ingredient_normalizer.py`

```python
class IngredientNormalizer:
    def __init__(self, db_path: str):
        # Load existing ingredients from SQLite
        # Build alias mappings
        # Create category inference rules

    def normalize(self, raw_text: str) -> NormalizedIngredient:
        # Parse quantity and unit
        # Extract ingredient name
        # Match to canonical ingredient
        # Return structured data

    def get_or_create_ingredient(self, name: str, category: str = None):
        # Check if exists in DB
        # Create if new with auto-generated ID
        # Update aliases if variation found
```

### 1.2 Recipe Data Validators
Location: `/backend/app/ingestion/validators.py`

```python
class RecipeValidator:
    REQUIRED_FIELDS = ['title', 'ingredients', 'instructions']
    MIN_INGREDIENTS = 2
    MAX_INGREDIENTS = 50

    def validate_recipe(self, recipe_data: dict) -> ValidationResult:
        # Check required fields
        # Validate ingredient format
        # Ensure license compliance
        # Check for duplicates via FTS5
```

### 1.3 Source Management
Location: `/backend/app/ingestion/source_manager.py`

```python
class SourceManager:
    def register_source(self, name: str, license_code: str, url: str):
        # Add to sources table
        # Validate license compatibility
        # Set ingestion rules based on license
```

## Phase 2: USDA Recipe Ingestion (Week 1-2)

### 2.1 USDA Recipe Scraper
Location: `/backend/app/ingestion/scrapers/usda_scraper.py`

Target: 5,000+ recipes from USDA sources
- MyPlate Kitchen API
- USDA Recipe Database
- FoodData Central recipes

```python
class USDARecipeScraper:
    BASE_URL = "https://www.myplate.gov/myplate-kitchen"

    async def fetch_recipes(self, limit: int = None):
        # Use their API if available
        # Otherwise respectful scraping with delays
        # Parse JSON/HTML responses

    def parse_recipe(self, raw_data: dict) -> Recipe:
        # Extract title, summary, instructions
        # Parse ingredients with normalizer
        # Calculate nutrition if available
        # Set source attribution
```

### 2.2 Batch Ingestion Pipeline
Location: `/backend/scripts/ingest_recipes.py`

```python
async def ingest_batch(source: str, recipes: List[dict], db_path: str):
    # Open SQLite connection
    # Begin transaction

    for recipe_data in recipes:
        # Validate recipe
        # Normalize ingredients
        # Generate ingredients_vec
        # Insert into recipes table
        # Update FTS5 index

    # Commit transaction
    # Log statistics
```

## Phase 3: NHS & International Sources (Week 2-3)

### 3.1 NHS Recipe Scraper
Target: 3,000+ recipes from NHS sources
- NHS.uk/healthier-families/recipes
- Change4Life recipes

### 3.2 Canadian Government Recipes
Target: 2,000+ recipes
- Canada.ca/food-guide/recipes
- healthycanadians.gc.ca

### 3.3 Australian/NZ Sources
Target: 2,000+ recipes
- eatforhealth.gov.au
- health.govt.nz

## Phase 4: Creative Commons Sources (Week 3-4)

### 4.1 CC-Licensed Recipe Blogs
Curated list of CC BY/CC BY-SA food blogs
- Validate licenses
- Implement attribution templates
- Respect robots.txt

### 4.2 Wiki Sources
- Wikibooks Cookbook (CC BY-SA)
- Wikipedia recipe articles (CC BY-SA)

## Phase 5: Data Processing & Optimization

### 5.1 Ingredient Vector Generation
```python
def generate_ingredients_vec(ingredients: List[str], db) -> str:
    """Generate CSV of ingredient IDs for fast matching."""
    ing_ids = []
    for ingredient in ingredients:
        normalized = normalizer.normalize(ingredient)
        ing_id = db.get_ingredient_id(normalized.name)
        if ing_id:
            ing_ids.append(ing_id)
    return ','.join(ing_ids)
```

### 5.2 FTS5 Index Population
```sql
-- Update FTS5 index after batch ingestion
INSERT INTO recipes_fts (rowid, title, ingredients_flat)
SELECT id, title,
       (SELECT GROUP_CONCAT(canonical_name, ' ')
        FROM ingredients
        WHERE id IN (SELECT value FROM json_each(ingredients_vec)))
FROM recipes
WHERE id > :last_indexed_id;
```

### 5.3 Staples Detection
```python
def detect_staples(db):
    """Identify common ingredients across recipes."""
    # Query ingredient frequency
    # Mark top 10% as staples
    # Set appropriate penalty weights
```

## Phase 6: Prebuilt Database Creation

### 6.1 Database Packaging
Location: `/backend/data/pantry.db`

```bash
# Build script
python scripts/build_production_db.py
# - Ingest all recipe sources
# - Optimize indexes
# - VACUUM database
# - Add metadata table with version
# - Compress for distribution
```

### 6.2 Database Statistics
Target metrics:
- 25,000+ recipes minimum
- 1,500+ unique ingredients
- 15+ recipe categories
- <100MB database size
- <100ms FTS5 search response

## Implementation Timeline

### Week 1
- [x] Backend structure ready
- [ ] Ingredient normalizer
- [ ] USDA scraper
- [ ] Basic ingestion pipeline

### Week 2
- [ ] NHS/UK sources
- [ ] Canadian sources
- [ ] Batch processing optimization
- [ ] FTS5 index tuning

### Week 3
- [ ] Australian/NZ sources
- [ ] CC-licensed blogs
- [ ] Wiki sources
- [ ] Deduplication system

### Week 4
- [ ] Quality validation
- [ ] Database optimization
- [ ] Prebuilt DB creation
- [ ] Distribution package

## SQLite-Specific Optimizations

### 1. Batch Transactions
```python
async with db.begin() as transaction:
    # Insert 1000 recipes at a time
    # Single transaction for speed
```

### 2. Prepared Statements
```python
stmt = await db.prepare("""
    INSERT INTO recipes (id, title, ...)
    VALUES (?, ?, ...)
""")
await stmt.executemany(recipe_batch)
```

### 3. Index Strategy
```sql
-- Add covering index for common queries
CREATE INDEX idx_recipes_ingredients
ON recipes(ingredients_vec, title, total_time_min);

-- Optimize FTS5 for phrase searching
CREATE VIRTUAL TABLE recipes_fts USING fts5(
    title, ingredients_flat,
    tokenize='porter unicode61',
    prefix='2 3'
);
```

### 4. PRAGMA Optimizations
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;  -- 64MB cache
PRAGMA temp_store = MEMORY;
```

## Attribution Templates

### Public Domain (USDA)
```json
{
  "source_name": "USDA MyPlate Kitchen",
  "source_url": "https://www.myplate.gov/recipes/{id}",
  "license_code": "PUBLIC",
  "attribution_text": "Recipe from USDA MyPlate Kitchen"
}
```

### CC BY (NHS)
```json
{
  "source_name": "NHS Healthier Families",
  "source_url": "https://www.nhs.uk/recipes/{slug}",
  "license_code": "CC-BY",
  "attribution_text": "© Crown copyright, licensed under CC BY 4.0"
}
```

### CC BY-SA (Wikibooks)
```json
{
  "source_name": "Wikibooks Cookbook",
  "source_url": "https://en.wikibooks.org/wiki/Cookbook:{recipe}",
  "license_code": "CC-BY-SA",
  "attribution_text": "From Wikibooks Cookbook, CC BY-SA 3.0"
}
```

## Quality Metrics

### Per-Recipe Requirements
- Title: 5-60 characters
- Summary: 10-200 characters
- Instructions: 50+ characters
- Ingredients: 2-50 items
- Time: 5-480 minutes
- Valid source attribution

### Collection Requirements
- Duplicate rate: <5%
- Ingredient match rate: >90%
- Category coverage: All major cuisines
- Dietary options: Vegetarian, vegan, gluten-free tags
- License compliance: 100%

## Testing Strategy

### 1. Unit Tests
```python
def test_ingredient_normalizer():
    assert normalize("2 cups flour") == {
        "quantity": 2, "unit": "cup", "name": "flour"
    }

def test_recipe_validator():
    assert validate_recipe(sample_recipe).is_valid
```

### 2. Integration Tests
- Test full ingestion pipeline
- Verify FTS5 search accuracy
- Check pantry matching performance

### 3. Data Quality Tests
- Ingredient normalization accuracy
- Recipe completeness
- Attribution compliance

## Migration Path to Supabase

When ready to migrate:

1. **Export from SQLite**
```bash
python scripts/export_to_postgres.py
# Exports to SQL format compatible with Supabase
```

2. **Import to Supabase**
```sql
-- Use Supabase SQL editor
\i exported_recipes.sql
```

3. **Update ingredients_vec**
- Convert to PostgreSQL arrays
- Or use junction table for better queries

4. **Setup RLS policies**
```sql
CREATE POLICY "Recipes are viewable by all users"
ON recipes FOR SELECT
USING (true);
```

## Deployment Strategy

### Local Development
1. Run ingestion scripts locally
2. Test with SQLite backend
3. Validate with Expo app

### Production Build
1. Create optimized pantry.db
2. Include in backend Docker image
3. Or distribute as separate download

### Updates
1. Incremental recipe additions
2. Version tracking in metadata table
3. Delta updates for existing deployments

## Legal Compliance

### Per-Source Requirements
1. **USDA**: No requirements (public domain)
2. **NHS**: Attribution required, include Crown copyright
3. **CC BY**: Attribution with link to source
4. **CC BY-SA**: Attribution + share-alike notice

### Implementation
```python
def format_attribution(recipe, source):
    template = ATTRIBUTION_TEMPLATES[source.license_code]
    return template.format(
        source_name=source.name,
        source_url=recipe.source_url,
        year=datetime.now().year
    )
```

## Next Steps

1. **Immediate** (Today):
   - Create `/backend/app/ingestion/` directory
   - Implement IngredientNormalizer class
   - Write USDA scraper skeleton

2. **This Week**:
   - Test USDA API access
   - Build first 1000 recipes
   - Tune FTS5 performance

3. **Next Week**:
   - Add NHS sources
   - Implement deduplication
   - Create validation suite

## Success Metrics

- **Week 1**: 5,000 recipes ingested
- **Week 2**: 15,000 recipes, 1000+ ingredients
- **Week 3**: 25,000 recipes, <100ms search
- **Week 4**: Production-ready pantry.db (<100MB)

---

*This plan adapts our original 25-50k recipe collection strategy to work specifically with our SQLite/FastAPI backend implementation.*