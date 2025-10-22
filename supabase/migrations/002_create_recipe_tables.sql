-- Recipe Tables Migration
-- Supports Claude-generated recipes for ingredient matching

-- ============================================
-- RECIPES
-- ============================================

-- Recipe collection
CREATE TABLE IF NOT EXISTS recipes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Basic info
    title text NOT NULL,
    slug text UNIQUE,
    description text,
    difficulty text CHECK (difficulty IN ('easy', 'medium', 'hard')),

    -- Instructions
    instructions text,
    instructions_json jsonb, -- Structured steps: [{"step": 1, "instruction": "...", "timing": "5 min"}]
    video_url text,

    -- Timing
    prep_time_minutes int,
    cook_time_minutes int,
    total_time_minutes int,

    -- Yield
    servings int,
    yield_amount numeric,
    yield_unit text,

    -- Categories
    cuisine text[], -- ["italian", "mediterranean"]
    meal_type text[], -- ["breakfast", "lunch", "dinner", "snack"]
    course text[], -- ["appetizer", "main", "dessert", "side"]
    season text[], -- ["spring", "summer", "fall", "winter"]
    occasion text[], -- ["holiday", "party", "weeknight"]

    -- Dietary
    dietary_tags text[], -- ["vegan", "gluten-free", "keto", "vegetarian"]
    allergen_info text[], -- ["dairy", "nuts", "shellfish"]

    -- Media
    image_url text,
    thumbnail_url text,

    -- Attribution
    source text, -- "claude-generated", "user-submitted", etc
    source_url text,
    author text,
    license text,

    -- Analytics
    times_cooked int DEFAULT 0,
    avg_rating numeric(2,1),
    total_ratings int DEFAULT 0,
    favorites_count int DEFAULT 0,

    -- Metadata
    is_public boolean DEFAULT true,
    created_by uuid REFERENCES profiles(id),

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Recipe ingredients with quantities
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id uuid REFERENCES recipes(id) ON DELETE CASCADE,

    ingredient_name text NOT NULL,
    normalized_name text,
    product_id uuid, -- Future: link to products table
    canonical_item_id uuid, -- Link to canonical_items if exists

    amount numeric,
    unit text,

    preparation text, -- "diced", "minced", "chopped"
    notes text, -- "or substitute with..."

    is_optional boolean DEFAULT false,
    ingredient_group text, -- "For the sauce", "For the marinade"

    sort_order int,

    created_at timestamptz DEFAULT now()
);

-- User's interaction with recipes
CREATE TABLE IF NOT EXISTS user_recipes (
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    recipe_id uuid REFERENCES recipes(id) ON DELETE CASCADE,

    is_favorite boolean DEFAULT false,
    rating int CHECK (rating >= 1 AND rating <= 5),
    notes text,

    times_cooked int DEFAULT 0,
    last_cooked_at timestamptz,

    modifications jsonb, -- Personal tweaks to recipe

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    PRIMARY KEY (user_id, recipe_id)
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Recipe search
CREATE INDEX IF NOT EXISTS idx_recipes_slug ON recipes(slug);
CREATE INDEX IF NOT EXISTS idx_recipes_cuisine ON recipes USING GIN (cuisine);
CREATE INDEX IF NOT EXISTS idx_recipes_meal_type ON recipes USING GIN (meal_type);
CREATE INDEX IF NOT EXISTS idx_recipes_dietary ON recipes USING GIN (dietary_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_difficulty ON recipes(difficulty) WHERE is_public = true;

-- Ingredient search
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_normalized ON recipe_ingredients(normalized_name);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_canonical ON recipe_ingredients(canonical_item_id) WHERE canonical_item_id IS NOT NULL;

-- User interactions
CREATE INDEX IF NOT EXISTS idx_user_recipes_user ON user_recipes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_recipes_favorites ON user_recipes(user_id) WHERE is_favorite = true;

-- Full-text search on recipes
CREATE INDEX IF NOT EXISTS idx_recipes_title_search ON recipes USING GIN (to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_recipes_description_search ON recipes USING GIN (to_tsvector('english', description));

-- ============================================
-- FUNCTIONS
-- ============================================

-- Search recipes by ingredients user has in pantry
CREATE OR REPLACE FUNCTION match_recipes_to_pantry(
  p_household_id uuid,
  p_min_match_percent numeric DEFAULT 0.7,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  recipe_id uuid,
  recipe_title text,
  recipe_difficulty text,
  total_ingredients int,
  matched_ingredients int,
  match_percent numeric,
  missing_ingredients text[]
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH user_pantry AS (
    SELECT DISTINCT normalized_name
    FROM pantry_items
    WHERE household_id = p_household_id
    AND status = 'active'
  ),
  recipe_stats AS (
    SELECT
      ri.recipe_id,
      COUNT(*) as total_ing,
      COUNT(CASE WHEN up.normalized_name IS NOT NULL THEN 1 END) as matched_ing,
      ARRAY_AGG(
        CASE WHEN up.normalized_name IS NULL THEN ri.ingredient_name END
        ORDER BY ri.sort_order
      ) FILTER (WHERE up.normalized_name IS NULL) as missing
    FROM recipe_ingredients ri
    LEFT JOIN user_pantry up ON ri.normalized_name = up.normalized_name
    WHERE ri.is_optional = false
    GROUP BY ri.recipe_id
  )
  SELECT
    r.id,
    r.title,
    r.difficulty,
    rs.total_ing::int,
    rs.matched_ing::int,
    ROUND((rs.matched_ing::numeric / rs.total_ing::numeric), 2) as match_pct,
    rs.missing
  FROM recipes r
  INNER JOIN recipe_stats rs ON r.id = rs.recipe_id
  WHERE r.is_public = true
  AND (rs.matched_ing::numeric / rs.total_ing::numeric) >= p_min_match_percent
  ORDER BY match_pct DESC, r.favorites_count DESC
  LIMIT p_limit;
END;
$$;

-- ============================================
-- TRIGGERS
-- ============================================

-- Updated_at triggers
CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON recipes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_recipes_updated_at BEFORE UPDATE ON user_recipes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_recipes ENABLE ROW LEVEL SECURITY;

-- Recipes: Public recipes are viewable by all, private only by creator
CREATE POLICY "Public recipes are viewable by everyone" ON recipes
    FOR SELECT USING (is_public = true OR created_by = auth.uid());

CREATE POLICY "Users can create recipes" ON recipes
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own recipes" ON recipes
    FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own recipes" ON recipes
    FOR DELETE USING (auth.uid() = created_by);

-- Recipe ingredients: Follow recipe visibility
CREATE POLICY "Recipe ingredients follow recipe visibility" ON recipe_ingredients
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM recipes
            WHERE recipes.id = recipe_ingredients.recipe_id
            AND (recipes.is_public = true OR recipes.created_by = auth.uid())
        )
    );

CREATE POLICY "Users can add ingredients to own recipes" ON recipe_ingredients
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM recipes
            WHERE recipes.id = recipe_ingredients.recipe_id
            AND recipes.created_by = auth.uid()
        )
    );

-- User recipes: Users manage their own interactions
CREATE POLICY "Users can view own recipe interactions" ON user_recipes
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own recipe interactions" ON user_recipes
    FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- GRANTS
-- ============================================

GRANT ALL ON recipes TO authenticated;
GRANT ALL ON recipe_ingredients TO authenticated;
GRANT ALL ON user_recipes TO authenticated;

GRANT EXECUTE ON FUNCTION match_recipes_to_pantry TO authenticated;
