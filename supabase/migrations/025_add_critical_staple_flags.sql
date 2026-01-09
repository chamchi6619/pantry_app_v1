-- ============================================================================
-- CRITICAL & STAPLE INGREDIENT FLAGGING
-- ============================================================================
-- Purpose: Solve "false perfect match" problem where recipes show 75% match
--          but user can't actually make the recipe (e.g., salmon recipe
--          matching on salt/pepper/oil only).
--
-- Problem: Pan-Seared Salmon with 4 ingredients:
--   - Salmon (CRITICAL - recipe doesn't exist without it)
--   - Olive oil (STAPLE - common pantry item)
--   - Salt (STAPLE)
--   - Pepper (STAPLE)
--   User has 3/4 ingredients (75%) but CAN'T make recipe.
--
-- Solution: Mark ingredients as critical (hero) or staple, filter accordingly.
-- ============================================================================

-- Add flags to cook_card_ingredients (user-saved recipes)
ALTER TABLE cook_card_ingredients
  ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_staple BOOLEAN DEFAULT FALSE;

-- Add flags to recipe_database_ingredients (global DB recipes)
ALTER TABLE recipe_database_ingredients
  ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_staple BOOLEAN DEFAULT FALSE;

-- Add comments
COMMENT ON COLUMN cook_card_ingredients.is_critical IS
  'Hero ingredient - recipe cannot be made without it (e.g., salmon in Pan-Seared Salmon). Missing critical ingredients = recipe not cookable.';

COMMENT ON COLUMN cook_card_ingredients.is_staple IS
  'Common pantry staple (salt, pepper, oil, etc.). Staples should not inflate match percentage.';

COMMENT ON COLUMN recipe_database_ingredients.is_critical IS
  'Hero ingredient - recipe cannot be made without it (e.g., salmon in Pan-Seared Salmon). Missing critical ingredients = recipe not cookable.';

COMMENT ON COLUMN recipe_database_ingredients.is_staple IS
  'Common pantry staple (salt, pepper, oil, etc.). Staples should not inflate match percentage.';

-- Create indexes for filtering queries
CREATE INDEX IF NOT EXISTS idx_cook_card_ingredients_critical
  ON cook_card_ingredients(cook_card_id, is_critical)
  WHERE is_critical = TRUE;

CREATE INDEX IF NOT EXISTS idx_cook_card_ingredients_staple
  ON cook_card_ingredients(is_staple)
  WHERE is_staple = TRUE;

CREATE INDEX IF NOT EXISTS idx_recipe_db_ingredients_critical
  ON recipe_database_ingredients(recipe_id, is_critical)
  WHERE is_critical = TRUE;

CREATE INDEX IF NOT EXISTS idx_recipe_db_ingredients_staple
  ON recipe_database_ingredients(is_staple)
  WHERE is_staple = TRUE;

-- ============================================================================
-- HELPER FUNCTION: Detect hero ingredient from recipe title
-- ============================================================================
CREATE OR REPLACE FUNCTION detect_hero_ingredient_from_title(recipe_title TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  title_lower TEXT;
  hero_ingredient TEXT;
BEGIN
  title_lower := LOWER(recipe_title);

  -- Common protein heroes
  IF title_lower ~ '\y(salmon|tuna|tilapia|cod|halibut|snapper)\y' THEN
    RETURN REGEXP_REPLACE(title_lower, '.*\y(salmon|tuna|tilapia|cod|halibut|snapper)\y.*', '\1');
  ELSIF title_lower ~ '\y(chicken|turkey|duck)\y' THEN
    RETURN REGEXP_REPLACE(title_lower, '.*\y(chicken|turkey|duck)\y.*', '\1');
  ELSIF title_lower ~ '\y(beef|steak|brisket|ribs)\y' THEN
    RETURN REGEXP_REPLACE(title_lower, '.*\y(beef|steak|brisket|ribs)\y.*', '\1');
  ELSIF title_lower ~ '\y(pork|bacon|ham|sausage)\y' THEN
    RETURN REGEXP_REPLACE(title_lower, '.*\y(pork|bacon|ham|sausage)\y.*', '\1');
  ELSIF title_lower ~ '\y(lamb|mutton)\y' THEN
    RETURN REGEXP_REPLACE(title_lower, '.*\y(lamb|mutton)\y.*', '\1');
  ELSIF title_lower ~ '\y(shrimp|prawn|lobster|crab|scallop)\y' THEN
    RETURN REGEXP_REPLACE(title_lower, '.*\y(shrimp|prawn|lobster|crab|scallop)\y.*', '\1');
  ELSIF title_lower ~ '\y(tofu|tempeh|seitan)\y' THEN
    RETURN REGEXP_REPLACE(title_lower, '.*\y(tofu|tempeh|seitan)\y.*', '\1');
  -- Pasta & grains
  ELSIF title_lower ~ '\y(pasta|spaghetti|linguine|fettuccine|penne|rigatoni)\y' THEN
    RETURN REGEXP_REPLACE(title_lower, '.*\y(pasta|spaghetti|linguine|fettuccine|penne|rigatoni)\y.*', '\1');
  ELSIF title_lower ~ '\y(rice|risotto|paella)\y' THEN
    RETURN REGEXP_REPLACE(title_lower, '.*\y(rice|risotto|paella)\y.*', '\1');
  -- Vegetables (when clearly the star)
  ELSIF title_lower ~ '\y(mushroom|eggplant|zucchini|cauliflower|broccoli)\y' THEN
    RETURN REGEXP_REPLACE(title_lower, '.*\y(mushroom|eggplant|zucchini|cauliflower|broccoli)\y.*', '\1');
  END IF;

  RETURN NULL; -- No clear hero detected
END;
$$;

COMMENT ON FUNCTION detect_hero_ingredient_from_title IS
  'Parse recipe title to extract hero ingredient (e.g., "Pan-Seared Salmon" → "salmon"). Returns NULL if no clear hero.';

-- ============================================================================
-- COMMON STAPLE INGREDIENTS LIST
-- ============================================================================
-- Note: This is a reference list. Actual flagging happens in backfill script.
-- Common staples that shouldn't inflate match percentage:
--   - salt, black pepper, white pepper, cayenne pepper
--   - olive oil, vegetable oil, canola oil, sesame oil
--   - butter, unsalted butter
--   - garlic, onion, shallot
--   - water, chicken stock, vegetable stock
--   - sugar, brown sugar, honey
--   - flour, all-purpose flour
--   - soy sauce, fish sauce
--   - lemon juice, lime juice
--   - bay leaves, thyme, rosemary, basil, oregano, parsley

-- ============================================================================
-- USAGE EXAMPLES (for app queries)
-- ============================================================================

-- Example 1: Filter "Perfect Matches" to require ALL critical ingredients
-- SELECT * FROM recipe_database
-- WHERE pantry_match_percent >= 70
-- AND NOT EXISTS (
--   SELECT 1 FROM recipe_database_ingredients
--   WHERE recipe_id = recipe_database.id
--   AND is_critical = TRUE
--   AND canonical_item_id NOT IN (user_pantry_item_ids)
-- );

-- Example 2: Calculate match % excluding staples
-- WITH non_staple_ingredients AS (
--   SELECT * FROM recipe_database_ingredients
--   WHERE recipe_id = $1 AND is_staple = FALSE
-- )
-- SELECT
--   COUNT(*) FILTER (WHERE canonical_item_id IN (user_pantry)) as matched,
--   COUNT(*) as total,
--   (COUNT(*) FILTER (WHERE canonical_item_id IN (user_pantry))::FLOAT / COUNT(*)) * 100 as match_percent
-- FROM non_staple_ingredients;

-- Example 3: Show missing critical ingredients for "Almost There" section
-- SELECT ingredient_name
-- FROM recipe_database_ingredients
-- WHERE recipe_id = $1
-- AND is_critical = TRUE
-- AND canonical_item_id NOT IN (user_pantry);

