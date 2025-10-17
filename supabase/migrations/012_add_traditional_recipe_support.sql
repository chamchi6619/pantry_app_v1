-- Migration: Add Traditional Recipe Support
-- Purpose: Extend cook_cards schema to support schema.org recipe ingestion
-- Cost: $0.00 per recipe (no AI processing needed)

-- Add index on platform for efficient filtering
CREATE INDEX IF NOT EXISTS idx_cook_cards_platform ON cook_cards(platform);

-- Add index on source_url for cache lookups
CREATE INDEX IF NOT EXISTS idx_cook_cards_source_url ON cook_cards(source_url);

-- Add index on user_id + created_at for user recipe queries
CREATE INDEX IF NOT EXISTS idx_cook_cards_user_created ON cook_cards(user_id, created_at DESC);

-- Add comment documenting platform types
COMMENT ON COLUMN cook_cards.platform IS 'Platform source: youtube, instagram, tiktok, xiaohongshu, facebook, traditional';

-- Add platform_identifier column if it doesn't exist (for traditional recipe hostnames)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cook_cards' AND column_name = 'platform_identifier'
  ) THEN
    ALTER TABLE cook_cards ADD COLUMN platform_identifier TEXT;
    COMMENT ON COLUMN cook_cards.platform_identifier IS 'Platform-specific identifier (e.g., hostname for traditional recipes, video ID for social)';
  END IF;
END $$;

-- Add nutrition fields if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cook_cards' AND column_name = 'nutrition_json'
  ) THEN
    ALTER TABLE cook_cards ADD COLUMN nutrition_json JSONB;
    COMMENT ON COLUMN cook_cards.nutrition_json IS 'Nutrition information from schema.org (calories, protein, carbs, fat)';
  END IF;
END $$;

-- Add rating fields if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cook_cards' AND column_name = 'rating_value'
  ) THEN
    ALTER TABLE cook_cards ADD COLUMN rating_value NUMERIC(3,2);
    ALTER TABLE cook_cards ADD COLUMN rating_count INTEGER;
    COMMENT ON COLUMN cook_cards.rating_value IS 'Aggregate rating value (1.0-5.0)';
    COMMENT ON COLUMN cook_cards.rating_count IS 'Number of ratings/reviews';
  END IF;
END $$;

-- Add category and cuisine fields if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cook_cards' AND column_name = 'category'
  ) THEN
    ALTER TABLE cook_cards ADD COLUMN category TEXT;
    COMMENT ON COLUMN cook_cards.category IS 'Recipe category (e.g., "Dinner", "Dessert", "Appetizer")';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cook_cards' AND column_name = 'cuisine'
  ) THEN
    ALTER TABLE cook_cards ADD COLUMN cuisine TEXT;
    COMMENT ON COLUMN cook_cards.cuisine IS 'Cuisine type (e.g., "Italian", "Mexican", "Asian")';
  END IF;
END $$;

-- Add keywords array if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cook_cards' AND column_name = 'keywords'
  ) THEN
    ALTER TABLE cook_cards ADD COLUMN keywords TEXT[];
    COMMENT ON COLUMN cook_cards.keywords IS 'Recipe keywords/tags from schema.org';
    CREATE INDEX IF NOT EXISTS idx_cook_cards_keywords ON cook_cards USING GIN(keywords);
  END IF;
END $$;

-- Add date_published if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cook_cards' AND column_name = 'date_published'
  ) THEN
    ALTER TABLE cook_cards ADD COLUMN date_published TIMESTAMPTZ;
    COMMENT ON COLUMN cook_cards.date_published IS 'Original publication date from schema.org';
  END IF;
END $$;

-- Create materialized view for recipe discovery (Phase 3-4)
CREATE MATERIALIZED VIEW IF NOT EXISTS recipe_discovery_view AS
SELECT
  cc.id,
  cc.user_id,
  cc.household_id,
  cc.title,
  cc.description,
  cc.image_url,
  cc.platform,
  cc.category,
  cc.cuisine,
  cc.prep_time_minutes,
  cc.cook_time_minutes,
  cc.servings,
  cc.rating_value,
  cc.rating_count,
  cc.keywords,
  cc.created_at,
  COUNT(cci.id) as ingredient_count,
  ARRAY_AGG(cci.normalized_name ORDER BY cci.sort_order) as ingredient_names
FROM cook_cards cc
LEFT JOIN cook_card_ingredients cci ON cc.id = cci.cook_card_id
WHERE cc.is_archived = false
GROUP BY cc.id;

-- Create index on materialized view for fast lookups
CREATE INDEX IF NOT EXISTS idx_recipe_discovery_user ON recipe_discovery_view(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_discovery_platform ON recipe_discovery_view(platform);
CREATE INDEX IF NOT EXISTS idx_recipe_discovery_category ON recipe_discovery_view(category);
CREATE INDEX IF NOT EXISTS idx_recipe_discovery_cuisine ON recipe_discovery_view(cuisine);

-- Add function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_recipe_discovery_view()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY recipe_discovery_view;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to refresh view when cook_cards or ingredients change
DROP TRIGGER IF EXISTS trigger_refresh_recipe_discovery_on_cook_card ON cook_cards;
CREATE TRIGGER trigger_refresh_recipe_discovery_on_cook_card
AFTER INSERT OR UPDATE OR DELETE ON cook_cards
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_recipe_discovery_view();

DROP TRIGGER IF EXISTS trigger_refresh_recipe_discovery_on_ingredient ON cook_card_ingredients;
CREATE TRIGGER trigger_refresh_recipe_discovery_on_ingredient
AFTER INSERT OR UPDATE OR DELETE ON cook_card_ingredients
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_recipe_discovery_view();

-- Add telemetry tracking for traditional recipe extractions
INSERT INTO cook_card_events (event_type, user_id, metadata)
SELECT
  'schema_migration_completed',
  '00000000-0000-0000-0000-000000000000',
  jsonb_build_object(
    'migration', '012_add_traditional_recipe_support',
    'timestamp', NOW(),
    'description', 'Added support for schema.org recipe ingestion'
  )
WHERE NOT EXISTS (
  SELECT 1 FROM cook_card_events
  WHERE metadata->>'migration' = '012_add_traditional_recipe_support'
);
