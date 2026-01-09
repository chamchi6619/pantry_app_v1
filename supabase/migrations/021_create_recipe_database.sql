-- ============================================================================
-- RECIPE DATABASE: Global AI-generated recipe templates
-- ============================================================================
-- Purpose: Separate table for 200 AI-generated recipes (cold start content)
-- Architecture: Copy-on-save pattern - users save DB recipes → copies to cook_cards
-- RLS: Public read (no auth), only admins can write
-- ============================================================================

-- Main recipe table
CREATE TABLE recipe_database (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic Info
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL, -- italian, mexican, chinese, etc.

  -- Media
  image_url TEXT, -- Stock photo or AI-generated (optional for MVP)

  -- Times
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  total_time_minutes INTEGER NOT NULL,

  -- Serving
  servings INTEGER DEFAULT 4,

  -- Classification
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  tags TEXT[], -- ["vegetarian", "quick", "healthy"]

  -- Metadata
  source TEXT DEFAULT 'ai_generated' NOT NULL,
  generation_model TEXT, -- "gemini-2.5-flash-exp"
  generated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Engagement (for ranking)
  times_saved INTEGER DEFAULT 0,
  avg_pantry_match NUMERIC(5,2), -- Cached avg across all users

  -- Admin
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Ingredients for DB recipes
CREATE TABLE recipe_database_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID REFERENCES recipe_database(id) ON DELETE CASCADE NOT NULL,

  -- Ingredient data
  ingredient_name TEXT NOT NULL,
  normalized_name TEXT, -- For matching
  canonical_item_id UUID REFERENCES canonical_items(id), -- KEY: Links to pantry

  -- Quantity
  amount NUMERIC,
  unit TEXT,
  preparation TEXT, -- "diced", "minced"

  -- Display
  sort_order INTEGER NOT NULL,
  ingredient_group TEXT, -- "For sauce", "For topping"
  is_optional BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Instructions for DB recipes
CREATE TABLE recipe_database_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID REFERENCES recipe_database(id) ON DELETE CASCADE NOT NULL,

  step_number INTEGER NOT NULL,
  instruction_text TEXT NOT NULL,

  -- Future: video clips, images per step
  media_url TEXT,
  duration_seconds INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  UNIQUE(recipe_id, step_number)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Recipe browsing (category carousels)
CREATE INDEX idx_recipe_database_category ON recipe_database(category, is_published);
CREATE INDEX idx_recipe_database_difficulty ON recipe_database(difficulty);
CREATE INDEX idx_recipe_database_tags ON recipe_database USING GIN(tags);

-- Popularity sorting
CREATE INDEX idx_recipe_database_times_saved ON recipe_database(times_saved DESC);
CREATE INDEX idx_recipe_database_pantry_match ON recipe_database(avg_pantry_match DESC NULLS LAST);

-- Ingredient lookups (for pantry matching)
CREATE INDEX idx_recipe_db_ingredients_recipe ON recipe_database_ingredients(recipe_id);
CREATE INDEX idx_recipe_db_ingredients_canonical ON recipe_database_ingredients(canonical_item_id);

-- Instructions ordering
CREATE INDEX idx_recipe_db_instructions_recipe ON recipe_database_instructions(recipe_id, step_number);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE recipe_database ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_database_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_database_instructions ENABLE ROW LEVEL SECURITY;

-- Public read (no auth required for browsing)
CREATE POLICY recipe_database_public_read ON recipe_database
  FOR SELECT USING (is_published = true);

CREATE POLICY recipe_db_ingredients_public_read ON recipe_database_ingredients
  FOR SELECT USING (
    recipe_id IN (SELECT id FROM recipe_database WHERE is_published = true)
  );

CREATE POLICY recipe_db_instructions_public_read ON recipe_database_instructions
  FOR SELECT USING (
    recipe_id IN (SELECT id FROM recipe_database WHERE is_published = true)
  );

-- Admin write policies (service_role only)
-- Note: These are implicit - service_role bypasses RLS
-- Documented here for completeness

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Increment save counter when user saves DB recipe to their queue
CREATE OR REPLACE FUNCTION increment_recipe_saves(recipe_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE recipe_database
  SET times_saved = times_saved + 1,
      updated_at = NOW()
  WHERE id = recipe_id;
$$;

-- Update pantry match cache (run periodically or on-demand)
CREATE OR REPLACE FUNCTION update_recipe_pantry_match_cache(recipe_id UUID, new_avg NUMERIC)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE recipe_database
  SET avg_pantry_match = new_avg,
      updated_at = NOW()
  WHERE id = recipe_id;
$$;

-- ============================================================================
-- COMMENTS (for documentation)
-- ============================================================================

COMMENT ON TABLE recipe_database IS 'Global AI-generated recipe templates. Users browse these and save copies to cook_cards (copy-on-save pattern).';
COMMENT ON TABLE recipe_database_ingredients IS 'Ingredients for recipe_database. Links to canonical_items for pantry matching.';
COMMENT ON TABLE recipe_database_instructions IS 'Step-by-step cooking instructions for recipe_database.';

COMMENT ON COLUMN recipe_database.category IS 'Recipe category for carousel organization (italian, mexican, chinese, etc.)';
COMMENT ON COLUMN recipe_database.times_saved IS 'Engagement metric: how many users saved this recipe to their queue';
COMMENT ON COLUMN recipe_database.avg_pantry_match IS 'Cached average pantry match percentage across all users (for sorting)';

COMMENT ON COLUMN recipe_database_ingredients.canonical_item_id IS 'CRITICAL: Links ingredient to canonical_items for pantry matching';
COMMENT ON COLUMN recipe_database_ingredients.sort_order IS 'Display order in recipe (1, 2, 3...)';
COMMENT ON COLUMN recipe_database_ingredients.ingredient_group IS 'Optional grouping like "For sauce", "For topping"';
