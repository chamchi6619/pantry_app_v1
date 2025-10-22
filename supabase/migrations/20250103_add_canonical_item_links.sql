-- Add canonical_item_id to recipe_ingredients
ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS canonical_item_id UUID REFERENCES canonical_items(id);

-- Add canonical_item_id to pantry_items
ALTER TABLE pantry_items
  ADD COLUMN IF NOT EXISTS canonical_item_id UUID REFERENCES canonical_items(id);

-- Create indexes for fast joins
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_canonical
  ON recipe_ingredients(canonical_item_id)
  WHERE canonical_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pantry_items_canonical
  ON pantry_items(canonical_item_id)
  WHERE canonical_item_id IS NOT NULL;

-- Add composite index for recipe matching (household + canonical)
CREATE INDEX IF NOT EXISTS idx_pantry_canonical_household
  ON pantry_items(household_id, canonical_item_id)
  WHERE canonical_item_id IS NOT NULL;

-- Create function for fast recipe matching
CREATE OR REPLACE FUNCTION match_recipes_to_pantry(p_household_id UUID, p_limit INT DEFAULT 50)
RETURNS TABLE (
  recipe_id UUID,
  recipe_title TEXT,
  total_ingredients BIGINT,
  matched_ingredients BIGINT,
  match_percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id as recipe_id,
    r.title as recipe_title,
    COUNT(ri.id) as total_ingredients,
    COUNT(pi.id) as matched_ingredients,
    ROUND((COUNT(pi.id)::NUMERIC / NULLIF(COUNT(ri.id), 0)) * 100, 0) as match_percentage
  FROM recipes r
  JOIN recipe_ingredients ri ON r.id = ri.recipe_id
  LEFT JOIN pantry_items pi ON
    ri.canonical_item_id = pi.canonical_item_id
    AND pi.household_id = p_household_id
  WHERE ri.canonical_item_id IS NOT NULL
  GROUP BY r.id, r.title
  HAVING COUNT(pi.id) > 0  -- Only return recipes with at least 1 match
  ORDER BY match_percentage DESC, matched_ingredients DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION match_recipes_to_pantry(UUID, INT) TO authenticated;

-- Add helpful comments
COMMENT ON COLUMN recipe_ingredients.canonical_item_id IS 'Links to canonical_items for normalized ingredient matching';
COMMENT ON COLUMN pantry_items.canonical_item_id IS 'Links to canonical_items for normalized ingredient matching';
COMMENT ON FUNCTION match_recipes_to_pantry IS 'Fast recipe matching based on pantry items via canonical item IDs';
