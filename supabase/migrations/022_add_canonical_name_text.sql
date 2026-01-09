-- Add text field for canonical item names (temporary bridge)
-- This allows us to seed recipes with canonical names before fully normalizing

ALTER TABLE recipe_database_ingredients
ADD COLUMN canonical_item_name TEXT;

-- Add index for faster lookups
CREATE INDEX idx_recipe_ingredients_canonical_name
ON recipe_database_ingredients(canonical_item_name);

COMMENT ON COLUMN recipe_database_ingredients.canonical_item_name IS
'Temporary text field storing canonical ingredient name for pantry matching. Will be migrated to canonical_item_id once canonical_items table is populated.';
