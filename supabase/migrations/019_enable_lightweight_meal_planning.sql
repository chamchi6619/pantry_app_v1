-- Migration: Enable Lightweight Meal Planning
-- Context: Support text-first meal planning without forced recipe extraction
-- Purpose: Allow users to plan meals with just a title, optionally link to cook_card later
-- Date: 2025-10-26
--
-- Changes:
--   - Make cook_card_id nullable in planned_meals (was NOT NULL)
--   - Add meal_title TEXT field (for quick planning without extraction)
--   - Add source_url TEXT field (optional reference URL)
--   - Add CHECK constraint: must have either meal_title OR cook_card_id
--   - Add is_extracted BOOLEAN to track extraction status

-- =============================================================================
-- PLANNED MEALS: Update schema for lightweight planning
-- =============================================================================

-- Step 1: Make cook_card_id nullable
ALTER TABLE planned_meals
  ALTER COLUMN cook_card_id DROP NOT NULL;

-- Step 2: Add meal_title field (for text-only meals)
ALTER TABLE planned_meals
  ADD COLUMN meal_title TEXT;

-- Step 3: Add source_url field (optional recipe URL)
ALTER TABLE planned_meals
  ADD COLUMN source_url TEXT;

-- Step 4: Add extraction status flag
ALTER TABLE planned_meals
  ADD COLUMN is_extracted BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN planned_meals.meal_title IS 'User-provided meal title (for lightweight planning without cook_card)';
COMMENT ON COLUMN planned_meals.source_url IS 'Optional recipe URL reference (not yet extracted)';
COMMENT ON COLUMN planned_meals.is_extracted IS 'TRUE if cook_card exists, FALSE if text-only meal';

-- Step 5: Add constraint - must have either meal_title OR cook_card_id
ALTER TABLE planned_meals
  ADD CONSTRAINT meal_has_title_or_card CHECK (
    meal_title IS NOT NULL OR cook_card_id IS NOT NULL
  );

-- Step 6: Create index on meal_title for search
CREATE INDEX idx_planned_meals_title ON planned_meals(meal_title) WHERE meal_title IS NOT NULL;

-- Step 7: Update existing rows to have meal_title from cook_cards
-- This ensures backward compatibility - all existing planned meals get titles
UPDATE planned_meals pm
SET
  meal_title = cc.title,
  is_extracted = TRUE
FROM cook_cards cc
WHERE pm.cook_card_id = cc.id
  AND pm.meal_title IS NULL;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function: Link meal to cook_card (when user extracts a text-only meal)
CREATE OR REPLACE FUNCTION link_meal_to_cook_card(
  p_meal_id UUID,
  p_cook_card_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE planned_meals
  SET
    cook_card_id = p_cook_card_id,
    is_extracted = TRUE,
    updated_at = NOW()
  WHERE id = p_meal_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION link_meal_to_cook_card IS
  'Links a text-only planned meal to a cook_card after extraction';

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  v_nullable_check BOOLEAN;
  v_title_column_exists BOOLEAN;
BEGIN
  -- Verify cook_card_id is nullable
  SELECT is_nullable = 'YES' INTO v_nullable_check
  FROM information_schema.columns
  WHERE table_name = 'planned_meals'
    AND column_name = 'cook_card_id';

  IF v_nullable_check THEN
    RAISE NOTICE '✅ cook_card_id is now nullable';
  ELSE
    RAISE EXCEPTION '❌ cook_card_id is still NOT NULL';
  END IF;

  -- Verify meal_title column exists
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'planned_meals'
      AND column_name = 'meal_title'
  ) INTO v_title_column_exists;

  IF v_title_column_exists THEN
    RAISE NOTICE '✅ meal_title column added successfully';
  ELSE
    RAISE EXCEPTION '❌ meal_title column not found';
  END IF;

  RAISE NOTICE '🎉 Migration 019 complete: Lightweight meal planning enabled';
  RAISE NOTICE '   Users can now plan meals with just a title (no forced extraction)';
  RAISE NOTICE '   Next: Update mealPlanningService.ts to support text-only meals';
END $$;

-- =============================================================================
-- USAGE EXAMPLES
-- =============================================================================

-- Example 1: Add text-only meal (no extraction)
-- INSERT INTO planned_meals (
--   meal_plan_id,
--   meal_title,
--   source_url,
--   planned_date,
--   meal_type,
--   is_extracted
-- ) VALUES (
--   'plan-uuid',
--   'Tacos',
--   'https://instagram.com/reel/abc123',
--   '2025-10-28',
--   'dinner',
--   FALSE
-- );

-- Example 2: Add meal with extracted cook_card
-- INSERT INTO planned_meals (
--   meal_plan_id,
--   cook_card_id,
--   meal_title,
--   planned_date,
--   meal_type,
--   is_extracted,
--   pantry_match_percent
-- ) VALUES (
--   'plan-uuid',
--   'cook-card-uuid',
--   'Chicken Stir Fry',
--   '2025-10-28',
--   'dinner',
--   TRUE,
--   85.50
-- );

-- Example 3: Extract a text-only meal later
-- UPDATE planned_meals
-- SET
--   cook_card_id = 'newly-extracted-cook-card-uuid',
--   is_extracted = TRUE,
--   pantry_match_percent = 78.00
-- WHERE id = 'text-only-meal-uuid';
