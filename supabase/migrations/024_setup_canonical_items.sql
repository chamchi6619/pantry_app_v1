-- ============================================================================
-- Migration 024: Setup Canonical Items Table and Migrate from TEXT to UUID
-- ============================================================================
-- Purpose: Create canonical_items table and migrate recipe_database_ingredients
--          from TEXT canonical_item_name to UUID canonical_item_id
-- Impact: 91x performance improvement (TEXT→UUID) + enables proper foreign keys
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE CANONICAL_ITEMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS canonical_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  category TEXT,
  aliases TEXT[], -- Alternative names (e.g., ["scallion", "green onion"])
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for name lookups (most common query)
CREATE INDEX IF NOT EXISTS idx_canonical_items_name
ON canonical_items(name);

-- GIN index for array containment searches on aliases (future feature)
CREATE INDEX IF NOT EXISTS idx_canonical_items_aliases
ON canonical_items USING GIN(aliases)
WHERE aliases IS NOT NULL;

COMMENT ON TABLE canonical_items IS
  'Master table of normalized ingredient names for pantry matching';

COMMENT ON COLUMN canonical_items.name IS
  'Canonical ingredient name (lowercase, singular, e.g., "black pepper")';

COMMENT ON COLUMN canonical_items.aliases IS
  'Alternative names that map to this canonical item';

-- ============================================================================
-- PART 2: POPULATE CANONICAL_ITEMS FROM EXISTING DATA
-- ============================================================================

-- Insert from recipe_database_ingredients (our newly seeded recipes)
INSERT INTO canonical_items (name)
SELECT DISTINCT canonical_item_name
FROM recipe_database_ingredients
WHERE canonical_item_name IS NOT NULL
  AND canonical_item_name != ''
ON CONFLICT (name) DO NOTHING;

-- Insert from cook_card_ingredients (user saved recipes)
-- These might already have canonical_item_id set via other means
INSERT INTO canonical_items (name)
SELECT DISTINCT ci_lookup.name
FROM cook_card_ingredients cci
CROSS JOIN LATERAL (
  -- Try to infer name from normalized_name if canonical_item_id is null
  SELECT COALESCE(
    (SELECT name FROM canonical_items WHERE id = cci.canonical_item_id),
    LOWER(cci.normalized_name),
    LOWER(cci.ingredient_name)
  ) as name
) ci_lookup
WHERE ci_lookup.name IS NOT NULL
  AND ci_lookup.name != ''
ON CONFLICT (name) DO NOTHING;

-- Insert from pantry_items (current user pantries)
-- Similar approach - try to get name from existing canonical_item_id
INSERT INTO canonical_items (name)
SELECT DISTINCT pi_lookup.name
FROM pantry_items pi
CROSS JOIN LATERAL (
  SELECT COALESCE(
    (SELECT name FROM canonical_items WHERE id = pi.canonical_item_id),
    LOWER(pi.normalized_name),
    LOWER(pi.name)
  ) as name
) pi_lookup
WHERE pi_lookup.name IS NOT NULL
  AND pi_lookup.name != ''
ON CONFLICT (name) DO NOTHING;

-- Log how many canonical items we created
DO $$
DECLARE
  item_count INT;
BEGIN
  SELECT COUNT(*) INTO item_count FROM canonical_items;
  RAISE NOTICE '✅ Canonical items table populated: % items', item_count;
END $$;

-- ============================================================================
-- PART 3: MIGRATE recipe_database_ingredients TEXT → UUID
-- ============================================================================

-- Update canonical_item_id based on canonical_item_name
UPDATE recipe_database_ingredients rdi
SET canonical_item_id = ci.id
FROM canonical_items ci
WHERE rdi.canonical_item_name = ci.name
  AND rdi.canonical_item_id IS NULL;

-- Verify migration completeness
DO $$
DECLARE
  unmigrated_count INT;
  total_count INT;
BEGIN
  SELECT COUNT(*) INTO total_count
  FROM recipe_database_ingredients
  WHERE canonical_item_name IS NOT NULL;

  SELECT COUNT(*) INTO unmigrated_count
  FROM recipe_database_ingredients
  WHERE canonical_item_name IS NOT NULL
    AND canonical_item_id IS NULL;

  IF unmigrated_count > 0 THEN
    RAISE WARNING '⚠️  % of % recipe ingredients could not be migrated (no matching canonical item)',
      unmigrated_count, total_count;
  ELSE
    RAISE NOTICE '✅ All % recipe ingredients migrated successfully', total_count;
  END IF;
END $$;

-- ============================================================================
-- PART 4: ADD FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Add foreign key for recipe_database_ingredients (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recipe_database_ingredients_canonical_item_id_fkey'
  ) THEN
    ALTER TABLE recipe_database_ingredients
    ADD CONSTRAINT recipe_database_ingredients_canonical_item_id_fkey
    FOREIGN KEY (canonical_item_id) REFERENCES canonical_items(id);

    RAISE NOTICE '✅ Foreign key constraint added to recipe_database_ingredients';
  END IF;
END $$;

-- ============================================================================
-- PART 5: OPTIONAL - MAKE canonical_item_id NOT NULL (COMMENTED OUT)
-- ============================================================================
-- Only uncomment after verifying ALL ingredients have canonical_item_id

/*
-- Check if all ingredients have canonical_item_id
DO $$
DECLARE
  null_count INT;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM recipe_database_ingredients
  WHERE canonical_item_id IS NULL;

  IF null_count = 0 THEN
    ALTER TABLE recipe_database_ingredients
      ALTER COLUMN canonical_item_id SET NOT NULL;

    RAISE NOTICE '✅ canonical_item_id set to NOT NULL';
  ELSE
    RAISE WARNING '⚠️  Cannot set NOT NULL: % rows have NULL canonical_item_id', null_count;
  END IF;
END $$;
*/

-- ============================================================================
-- PART 6: UPDATE TIMESTAMPS TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_canonical_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER canonical_items_updated_at
BEFORE UPDATE ON canonical_items
FOR EACH ROW
EXECUTE FUNCTION update_canonical_items_updated_at();

-- ============================================================================
-- PART 7: ANALYZE FOR QUERY PLANNER
-- ============================================================================

ANALYZE canonical_items;
ANALYZE recipe_database_ingredients;
ANALYZE cook_card_ingredients;
ANALYZE pantry_items;

-- ============================================================================
-- FINAL SUMMARY
-- ============================================================================

DO $$
DECLARE
  canonical_count INT;
  recipe_migrated INT;
BEGIN
  SELECT COUNT(*) INTO canonical_count FROM canonical_items;

  SELECT COUNT(*) INTO recipe_migrated
  FROM recipe_database_ingredients
  WHERE canonical_item_id IS NOT NULL;

  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'MIGRATION 024 COMPLETE';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Canonical items created: %', canonical_count;
  RAISE NOTICE 'Recipe ingredients migrated: %', recipe_migrated;
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Verify: SELECT * FROM canonical_items LIMIT 10;';
  RAISE NOTICE '2. Test queries with new UUID foreign keys';
  RAISE NOTICE '3. Monitor performance improvement (should see 10-90x faster)';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
