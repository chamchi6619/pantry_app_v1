-- Drop existing function if it exists with different signature
DROP FUNCTION IF EXISTS search_recipes_by_canonical_items(uuid[], integer, integer, integer);

-- Create function to search recipes by canonical items
CREATE OR REPLACE FUNCTION search_recipes_by_canonical_items(
  p_canonical_item_ids UUID[],
  p_min_match_percent INT DEFAULT 70,
  p_max_missing INT DEFAULT 3,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  recipe_id UUID,
  title TEXT,
  description TEXT,
  image_url TEXT,
  total_time_minutes INT,
  servings INT,
  total_ingredients INT,
  matched_ingredients INT,
  missing_ingredients INT,
  match_percent NUMERIC,
  matched_ingredient_names TEXT[],
  missing_ingredient_names TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  WITH recipe_stats AS (
    -- Count ingredients per recipe
    SELECT
      r.id AS recipe_id,
      r.title,
      r.description,
      r.image_url,
      r.total_time_minutes,
      r.servings,
      COUNT(ri.id) AS total_ingredients,
      COUNT(ri.canonical_item_id) FILTER (
        WHERE ri.canonical_item_id = ANY(p_canonical_item_ids)
      ) AS matched_ingredients,
      COUNT(ri.id) FILTER (
        WHERE ri.canonical_item_id IS NULL
        OR ri.canonical_item_id != ALL(p_canonical_item_ids)
      ) AS missing_ingredients,
      -- Get matched ingredient names
      ARRAY_AGG(DISTINCT ci.canonical_name) FILTER (
        WHERE ri.canonical_item_id = ANY(p_canonical_item_ids)
        AND ci.canonical_name IS NOT NULL
      ) AS matched_names,
      -- Get missing ingredient names
      ARRAY_AGG(DISTINCT COALESCE(ci2.canonical_name, ri.ingredient_name)) FILTER (
        WHERE (ri.canonical_item_id IS NULL OR ri.canonical_item_id != ALL(p_canonical_item_ids))
        AND COALESCE(ci2.canonical_name, ri.ingredient_name) IS NOT NULL
      ) AS missing_names
    FROM recipes r
    JOIN recipe_ingredients ri ON r.id = ri.recipe_id
    LEFT JOIN canonical_items ci ON ri.canonical_item_id = ci.id
    LEFT JOIN canonical_items ci2 ON ri.canonical_item_id = ci2.id
    WHERE r.is_public = TRUE
    GROUP BY r.id, r.title, r.description, r.image_url, r.total_time_minutes, r.servings
  )
  SELECT
    rs.recipe_id,
    rs.title,
    rs.description,
    rs.image_url,
    rs.total_time_minutes,
    rs.servings,
    rs.total_ingredients::INT,
    rs.matched_ingredients::INT,
    rs.missing_ingredients::INT,
    CASE
      WHEN rs.total_ingredients > 0
      THEN ROUND((rs.matched_ingredients::NUMERIC / rs.total_ingredients::NUMERIC) * 100, 0)
      ELSE 0
    END AS match_percent,
    COALESCE(rs.matched_names, ARRAY[]::TEXT[]) AS matched_ingredient_names,
    COALESCE(rs.missing_names, ARRAY[]::TEXT[]) AS missing_ingredient_names
  FROM recipe_stats rs
  WHERE
    -- Filter by minimum match percentage
    (rs.matched_ingredients::NUMERIC / NULLIF(rs.total_ingredients, 0)::NUMERIC * 100) >= p_min_match_percent
    -- Filter by maximum missing ingredients
    AND rs.missing_ingredients <= p_max_missing
    -- Must have at least one matched ingredient
    AND rs.matched_ingredients > 0
  ORDER BY
    -- Sort by most matched first
    rs.matched_ingredients DESC,
    -- Then by fewest missing
    rs.missing_ingredients ASC,
    -- Then by recipe popularity
    rs.recipe_id
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
