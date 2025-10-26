-- Migration: Create Meal Planning Tables
-- Context: Add meal planning feature to Pantry App
-- Purpose: Enable users to plan weekly meals with AI assistance and pantry matching
-- Date: 2025-10-26
--
-- Tables:
--   - meal_plans: Weekly meal plan containers
--   - planned_meals: Individual meals within a plan
--   - ai_meal_generations: AI generation history and constraints

-- =============================================================================
-- MEAL PLANS: Weekly meal planning containers
-- =============================================================================
CREATE TABLE IF NOT EXISTS meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,

  -- Plan Details
  title TEXT NOT NULL DEFAULT 'Meal Plan',
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,

  -- Generation Method
  generated_by TEXT NOT NULL CHECK (generated_by IN ('manual', 'ai')),
  generation_cost_cents INTEGER DEFAULT 0,

  -- AI Generation Metadata (if applicable)
  ai_model TEXT, -- e.g., 'gemini-2.0-flash'
  ai_prompt_tokens INTEGER,
  ai_completion_tokens INTEGER,
  ai_generation_time_ms INTEGER,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints: Only one active plan per household per week
  CONSTRAINT unique_active_plan_per_household UNIQUE (household_id, week_start_date) WHERE is_active = TRUE
);

-- Indexes for performance
CREATE INDEX idx_meal_plans_household_id ON meal_plans(household_id);
CREATE INDEX idx_meal_plans_user_id ON meal_plans(user_id);
CREATE INDEX idx_meal_plans_week_start ON meal_plans(week_start_date DESC);
CREATE INDEX idx_meal_plans_active ON meal_plans(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE meal_plans IS 'Weekly meal planning containers';
COMMENT ON COLUMN meal_plans.generated_by IS 'How plan was created: manual (tap-to-add) or ai (AI-generated)';
COMMENT ON COLUMN meal_plans.generation_cost_cents IS 'LLM API cost in cents for AI-generated plans';

-- =============================================================================
-- PLANNED MEALS: Individual meals in a plan
-- =============================================================================
CREATE TABLE IF NOT EXISTS planned_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Plan Association
  meal_plan_id UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,

  -- Meal Details
  cook_card_id UUID NOT NULL REFERENCES cook_cards(id) ON DELETE CASCADE,
  planned_date DATE NOT NULL,
  meal_type TEXT CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),

  -- Pantry Intelligence
  pantry_match_percent NUMERIC(5,2), -- 0.00 to 100.00
  missing_ingredients_count INTEGER DEFAULT 0,
  substitutions_applied JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"from": "butter", "to": "margarine", "reason": "Equal fat content"}]

  -- User Interaction
  is_locked BOOLEAN DEFAULT FALSE, -- For lock & regenerate feature
  user_notes TEXT,

  -- Status Tracking
  status TEXT NOT NULL DEFAULT 'planned' CHECK (
    status IN ('planned', 'cooking', 'cooked', 'skipped')
  ),
  cooked_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints: One meal per day+type combination
  CONSTRAINT unique_meal_per_day_type UNIQUE (meal_plan_id, planned_date, meal_type)
);

-- Indexes for performance
CREATE INDEX idx_planned_meals_plan_id ON planned_meals(meal_plan_id);
CREATE INDEX idx_planned_meals_cook_card_id ON planned_meals(cook_card_id);
CREATE INDEX idx_planned_meals_date ON planned_meals(planned_date);
CREATE INDEX idx_planned_meals_status ON planned_meals(status);
CREATE INDEX idx_planned_meals_locked ON planned_meals(is_locked) WHERE is_locked = TRUE;

COMMENT ON TABLE planned_meals IS 'Individual meals within a meal plan';
COMMENT ON COLUMN planned_meals.pantry_match_percent IS 'Percentage of ingredients user already has (with substitutions)';
COMMENT ON COLUMN planned_meals.is_locked IS 'Locked meals are preserved during AI regeneration';
COMMENT ON COLUMN planned_meals.substitutions_applied IS 'List of ingredient substitutions made for this meal';

-- =============================================================================
-- AI MEAL GENERATIONS: Track AI generation history and constraints
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai_meal_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Association
  meal_plan_id UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Generation Constraints (for lock & regenerate)
  constraints_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example structure:
  -- {
  --   "locked_meal_ids": ["uuid1", "uuid2"],
  --   "preferences": {
  --     "max_prep_time": 30,
  --     "dietary_restrictions": ["vegetarian"],
  --     "avoid_ingredients": ["cilantro"]
  --   },
  --   "avoided_cook_card_ids": ["uuid3"] // Recently used
  -- }

  -- AI Response
  suggested_meals JSONB NOT NULL,
  -- Example: [{"day": "monday", "cook_card_id": "...", "meal_type": "dinner", "rationale": "..."}]

  rationale TEXT, -- AI's overall explanation for meal selection

  -- Performance Metrics
  generation_time_ms INTEGER,
  cache_hit BOOLEAN DEFAULT FALSE,
  cost_cents INTEGER DEFAULT 0,

  -- User Feedback
  user_accepted BOOLEAN,
  edits_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_ai_generations_meal_plan ON ai_meal_generations(meal_plan_id);
CREATE INDEX idx_ai_generations_user ON ai_meal_generations(user_id);
CREATE INDEX idx_ai_generations_created ON ai_meal_generations(created_at DESC);

COMMENT ON TABLE ai_meal_generations IS 'Track AI meal plan generation history and constraints';
COMMENT ON COLUMN ai_meal_generations.constraints_json IS 'Constraints passed to AI (locked meals, preferences, dietary restrictions)';
COMMENT ON COLUMN ai_meal_generations.cache_hit IS 'Whether this generation used cached results';

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_meal_generations ENABLE ROW LEVEL SECURITY;

-- Meal Plans: Users can see plans in their households
CREATE POLICY meal_plans_select ON meal_plans FOR SELECT USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY meal_plans_insert ON meal_plans FOR INSERT WITH CHECK (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  ) AND user_id = auth.uid()
);

CREATE POLICY meal_plans_update ON meal_plans FOR UPDATE USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY meal_plans_delete ON meal_plans FOR DELETE USING (
  user_id = auth.uid()
);

-- Planned Meals: Inherit permissions from meal plans
CREATE POLICY planned_meals_select ON planned_meals FOR SELECT USING (
  meal_plan_id IN (
    SELECT id FROM meal_plans WHERE household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY planned_meals_insert ON planned_meals FOR INSERT WITH CHECK (
  meal_plan_id IN (
    SELECT id FROM meal_plans WHERE household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY planned_meals_update ON planned_meals FOR UPDATE USING (
  meal_plan_id IN (
    SELECT id FROM meal_plans WHERE household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY planned_meals_delete ON planned_meals FOR DELETE USING (
  meal_plan_id IN (
    SELECT id FROM meal_plans WHERE household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  )
);

-- AI Generations: Visible to user who created them
CREATE POLICY ai_generations_select ON ai_meal_generations FOR SELECT USING (
  user_id = auth.uid()
);

CREATE POLICY ai_generations_insert ON ai_meal_generations FOR INSERT WITH CHECK (
  user_id = auth.uid()
);

-- =============================================================================
-- TRIGGERS: Auto-update timestamps
-- =============================================================================

CREATE OR REPLACE FUNCTION update_meal_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER meal_plans_updated_at
  BEFORE UPDATE ON meal_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_meal_plans_updated_at();

CREATE TRIGGER planned_meals_updated_at
  BEFORE UPDATE ON planned_meals
  FOR EACH ROW
  EXECUTE FUNCTION update_meal_plans_updated_at();

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  -- Verify tables are created
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meal_plans') THEN
    RAISE NOTICE '✅ meal_plans table created successfully';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'planned_meals') THEN
    RAISE NOTICE '✅ planned_meals table created successfully';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_meal_generations') THEN
    RAISE NOTICE '✅ ai_meal_generations table created successfully';
  END IF;

  RAISE NOTICE '🎉 Migration 017 complete: Meal planning tables ready';
  RAISE NOTICE '   Next: Run migration 018 to populate substitution rules';
END $$;
