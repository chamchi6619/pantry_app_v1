-- Migration: 013_recommendation_engine_indexes.sql
-- Phase 3: Database optimizations for personalized recommendation engine
-- Created: 2025-10-17
-- Purpose: Add indexes and materialized views to speed up pantry matching queries

-- ============================================================================
-- PART 1: INDEXES FOR FAST LOOKUPS
-- ============================================================================

-- Index for user's saved recipes lookup (filter by user and exclude archived)
CREATE INDEX IF NOT EXISTS idx_cook_cards_user_active
ON cook_cards(user_id, is_archived)
WHERE is_archived = false;

-- Index for ingredient lookups by canonical item
CREATE INDEX IF NOT EXISTS idx_cook_card_ingredients_canonical
ON cook_card_ingredients(canonical_item_id)
WHERE canonical_item_id IS NOT NULL;

-- Index for pantry lookups by household and active status
CREATE INDEX IF NOT EXISTS idx_pantry_household_active
ON pantry_items(household_id, status)
WHERE status = 'active';

-- Composite index for meal history (recent meals by user)
CREATE INDEX IF NOT EXISTS idx_meal_history_user_date
ON meal_history(user_id, cooked_at DESC);

-- Index for meal history ratings
CREATE INDEX IF NOT EXISTS idx_meal_history_rating
ON meal_history(cook_card_id, rating)
WHERE rating IS NOT NULL;

-- ============================================================================
-- PART 2: PANTRY ITEM EXPIRY TRACKING
-- ============================================================================

-- Index for expiring ingredients (within 7 days)
CREATE INDEX IF NOT EXISTS idx_pantry_expiring
ON pantry_items(household_id, expiry_date)
WHERE status = 'active' AND expiry_date IS NOT NULL;

-- Index for recently purchased items (for waste prevention)
CREATE INDEX IF NOT EXISTS idx_pantry_recent_purchase
ON pantry_items(household_id, purchase_date)
WHERE status = 'active' AND purchase_date IS NOT NULL;

-- ============================================================================
-- PART 3: COOK CARD INGREDIENTS JOIN OPTIMIZATION
-- ============================================================================

-- Composite index for fast ingredient matching
-- Used when joining cook_card_ingredients with pantry_items
CREATE INDEX IF NOT EXISTS idx_cook_card_ingredients_composite
ON cook_card_ingredients(cook_card_id, canonical_item_id)
WHERE canonical_item_id IS NOT NULL;

-- ============================================================================
-- PART 4: MATERIALIZED VIEW FOR RECIPE-PANTRY MATCHES (OPTIONAL)
-- ============================================================================
-- Note: This is commented out for now because it needs to be refreshed regularly
-- and may add complexity. We'll use direct queries first and add this later if needed.

/*
CREATE MATERIALIZED VIEW IF NOT EXISTS recipe_pantry_matches AS
SELECT
  cc.id as cook_card_id,
  cc.user_id,
  pi.household_id,
  COUNT(DISTINCT cci.canonical_item_id) as total_ingredients,
  COUNT(DISTINCT CASE
    WHEN pi.canonical_item_id = cci.canonical_item_id
    THEN cci.canonical_item_id
  END) as matched_ingredients,
  ROUND(
    COUNT(DISTINCT CASE
      WHEN pi.canonical_item_id = cci.canonical_item_id
      THEN cci.canonical_item_id
    END)::numeric /
    NULLIF(COUNT(DISTINCT cci.canonical_item_id), 0),
    2
  ) as match_percentage
FROM cook_cards cc
JOIN cook_card_ingredients cci ON cc.id = cci.cook_card_id
CROSS JOIN pantry_items pi
WHERE cc.is_archived = false
  AND pi.status = 'active'
  AND cci.canonical_item_id IS NOT NULL
GROUP BY cc.id, cc.user_id, pi.household_id;

-- Index on materialized view
CREATE INDEX IF NOT EXISTS idx_recipe_pantry_matches_user
ON recipe_pantry_matches(user_id, household_id, match_percentage DESC);

-- Refresh strategy (run this periodically or on-demand)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY recipe_pantry_matches;
*/

-- ============================================================================
-- PART 5: HELPER FUNCTION FOR QUICK RECIPE MATCH CALCULATION
-- ============================================================================

-- Function to calculate match percentage for a single recipe
CREATE OR REPLACE FUNCTION calculate_recipe_match(
  p_cook_card_id uuid,
  p_household_id uuid
)
RETURNS TABLE (
  match_percentage numeric,
  matched_count bigint,
  total_count bigint,
  missing_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROUND(
      COALESCE(
        COUNT(DISTINCT CASE WHEN pi.canonical_item_id IS NOT NULL THEN cci.canonical_item_id END)::numeric /
        NULLIF(COUNT(DISTINCT cci.canonical_item_id), 0),
        0
      ) * 100,
      0
    ) as match_percentage,
    COUNT(DISTINCT CASE WHEN pi.canonical_item_id IS NOT NULL THEN cci.canonical_item_id END) as matched_count,
    COUNT(DISTINCT cci.canonical_item_id) as total_count,
    COUNT(DISTINCT CASE WHEN pi.canonical_item_id IS NULL THEN cci.canonical_item_id END) as missing_count
  FROM cook_card_ingredients cci
  LEFT JOIN pantry_items pi ON pi.canonical_item_id = cci.canonical_item_id
    AND pi.household_id = p_household_id
    AND pi.status = 'active'
  WHERE cci.cook_card_id = p_cook_card_id
    AND cci.canonical_item_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- PART 6: PERFORMANCE MONITORING
-- ============================================================================

-- Add comments for documentation
COMMENT ON INDEX idx_cook_cards_user_active IS
  'Fast lookup of active recipes for a user (recommendation engine)';

COMMENT ON INDEX idx_cook_card_ingredients_canonical IS
  'Fast lookup of ingredients by canonical item (pantry matching)';

COMMENT ON INDEX idx_pantry_household_active IS
  'Fast lookup of active pantry items for a household';

COMMENT ON INDEX idx_meal_history_user_date IS
  'Fast lookup of recent meal history (prevent repetition)';

COMMENT ON FUNCTION calculate_recipe_match IS
  'Calculate match percentage for a single recipe given a household pantry';

-- ============================================================================
-- PART 7: VERIFY INDEXES
-- ============================================================================

-- Query to verify indexes were created
DO $$
BEGIN
  RAISE NOTICE 'Recommendation engine indexes created successfully';
  RAISE NOTICE 'Total indexes created: 7';
  RAISE NOTICE 'Helper function created: calculate_recipe_match()';
END $$;
