-- Migration 009: Add Recipe Tracking to Shopping List
-- Purpose: Link shopping list items back to source recipes for better UX
-- Date: 2025-10-08

-- Add recipe tracking fields to shopping_list_items
ALTER TABLE shopping_list_items
ADD COLUMN IF NOT EXISTS recipe_id TEXT,
ADD COLUMN IF NOT EXISTS recipe_name TEXT;

-- Add index for recipe queries
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_recipe_id
ON shopping_list_items(recipe_id);

-- Add comment for documentation
COMMENT ON COLUMN shopping_list_items.recipe_id IS 'Source recipe ID (from cook_cards or recipes table)';
COMMENT ON COLUMN shopping_list_items.recipe_name IS 'Source recipe name for display';
