-- Cook Card Schema Migration
-- Context: Strategic pivot from AI recipe generation to social recipe organization
-- Purpose: Create tables for Cook Card system with fail-closed extraction and pantry intelligence
-- PRD Reference: COOKCARD_PRD_V1.md Section 4 (Core Product) + Section 20 (Tasks 1.1)

-- =============================================================================
-- COOK CARDS: Core table for saved social recipes
-- =============================================================================
CREATE TABLE IF NOT EXISTS cook_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User & Household
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  -- Source Attribution (REQUIRED - legal/compliance)
  source_url TEXT NOT NULL UNIQUE, -- Original social media post URL
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'youtube', 'web')),
  creator_handle TEXT, -- @username or channel name
  creator_name TEXT, -- Display name
  creator_avatar_url TEXT,

  -- Recipe Metadata
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT, -- Thumbnail from oEmbed (not rehosted media)

  -- Time Estimates (optional, extracted or user-provided)
  prep_time_minutes INTEGER CHECK (prep_time_minutes >= 0),
  cook_time_minutes INTEGER CHECK (cook_time_minutes >= 0),
  total_time_minutes INTEGER CHECK (total_time_minutes >= 0),
  servings INTEGER CHECK (servings > 0),

  -- Instructions Handling (NEVER AI-generated)
  instructions_type TEXT NOT NULL DEFAULT 'link_only' CHECK (
    instructions_type IN ('link_only', 'creator_provided', 'user_notes')
  ),
  instructions_text TEXT, -- Only if creator explicitly provided or user added notes
  instructions_json JSONB, -- Structured steps with timestamps (if available)

  -- Extraction Provenance
  extraction_method TEXT NOT NULL CHECK (
    extraction_method IN ('metadata', 'creator_text', 'llm_assisted', 'user_manual')
  ),
  extraction_confidence NUMERIC(3,2) CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),
  extraction_version TEXT DEFAULT 'v1.0', -- Ladder version used
  extraction_cache_key TEXT, -- For 30-day URL caching
  extraction_cost_cents INTEGER DEFAULT 0, -- LLM cost tracking for Gate 4

  -- User Interaction Tracking (for Ship Gates)
  confirm_taps INTEGER DEFAULT 0, -- Gate 1: Quality metric
  user_edited BOOLEAN DEFAULT FALSE,
  times_cooked INTEGER DEFAULT 0,
  last_cooked_at TIMESTAMPTZ,

  -- Status & Flags
  is_favorite BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  compliance_flagged BOOLEAN DEFAULT FALSE, -- Gate 3: Compliance violations
  compliance_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_cook_cards_user_id ON cook_cards(user_id);
CREATE INDEX idx_cook_cards_household_id ON cook_cards(household_id);
CREATE INDEX idx_cook_cards_source_url ON cook_cards(source_url);
CREATE INDEX idx_cook_cards_platform ON cook_cards(platform);
CREATE INDEX idx_cook_cards_created_at ON cook_cards(created_at DESC);
CREATE INDEX idx_cook_cards_extraction_cache_key ON cook_cards(extraction_cache_key);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_cook_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cook_cards_updated_at
  BEFORE UPDATE ON cook_cards
  FOR EACH ROW
  EXECUTE FUNCTION update_cook_cards_updated_at();

-- =============================================================================
-- COOK CARD INGREDIENTS: Extracted ingredients with confidence & provenance
-- =============================================================================
CREATE TABLE IF NOT EXISTS cook_card_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cook_card_id UUID NOT NULL REFERENCES cook_cards(id) ON DELETE CASCADE,

  -- Ingredient Data
  ingredient_name TEXT NOT NULL, -- Raw extracted name
  normalized_name TEXT, -- For matching
  canonical_item_id UUID REFERENCES canonical_items(id), -- Linked to pantry system

  -- Quantities (nullable - not all posts include amounts)
  amount NUMERIC,
  unit TEXT,
  preparation TEXT, -- "diced", "minced", etc.

  -- Extraction Provenance (per-ingredient)
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  provenance TEXT NOT NULL CHECK (
    provenance IN ('creator_provided', 'detected', 'user_edited', 'substitution')
  ),

  -- Pantry Matching
  in_pantry BOOLEAN DEFAULT FALSE, -- Calculated at query time
  is_substitution BOOLEAN DEFAULT FALSE,
  substitution_for UUID REFERENCES cook_card_ingredients(id), -- Original ingredient
  substitution_rationale TEXT, -- "Greek yogurt ↔ sour cream: similar fat/protein"

  -- Grouping & Ordering
  ingredient_group TEXT, -- "For the sauce", "For garnish"
  sort_order INTEGER,
  is_optional BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_cook_card_ingredients_cook_card_id ON cook_card_ingredients(cook_card_id);
CREATE INDEX idx_cook_card_ingredients_canonical_item_id ON cook_card_ingredients(canonical_item_id);
CREATE INDEX idx_cook_card_ingredients_confidence ON cook_card_ingredients(confidence);

-- =============================================================================
-- COOK CARD EVENTS: Event stream for Ship Gate instrumentation
-- =============================================================================
CREATE TABLE IF NOT EXISTS cook_card_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event Context
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  cook_card_id UUID REFERENCES cook_cards(id) ON DELETE CASCADE,

  -- Event Type (for Gate calculations)
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'cook_card_saved',      -- Gate 2: Conversion numerator denominator
      'cook_started',          -- Gate 2: Conversion numerator
      'ingredient_confirmed',  -- Gate 1: Quality tracking
      'ingredient_edited',     -- Gate 1: Quality tracking
      'shopping_list_added',
      'compliance_flagged',    -- Gate 3: Compliance violations
      'llm_call_made',         -- Gate 4: Economics tracking
      'url_cached'             -- Gate 4: Cache hit rate
    )
  ),

  -- Event Metadata (JSONB for flexibility)
  event_data JSONB, -- {confirm_taps: 2, confidence: 0.85, cost_cents: 1.2, etc.}

  -- Gate Metrics (denormalized for fast queries)
  confirm_taps INTEGER, -- Gate 1
  extraction_confidence NUMERIC(3,2), -- Gate 1
  llm_cost_cents INTEGER, -- Gate 4
  cache_hit BOOLEAN, -- Gate 4

  -- Attribution
  cohort TEXT DEFAULT 'beta', -- For Gate 2 segmentation

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for Gate queries
CREATE INDEX idx_cook_card_events_event_type ON cook_card_events(event_type);
CREATE INDEX idx_cook_card_events_created_at ON cook_card_events(created_at DESC);
CREATE INDEX idx_cook_card_events_cohort ON cook_card_events(cohort);
CREATE INDEX idx_cook_card_events_user_id ON cook_card_events(user_id);

-- =============================================================================
-- EXTRACTION CACHE: 30-day per-URL caching for cost control (Gate 4)
-- =============================================================================
CREATE TABLE IF NOT EXISTS extraction_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cache Key
  source_url TEXT NOT NULL UNIQUE,
  url_hash TEXT NOT NULL UNIQUE, -- SHA-256 for fast lookup

  -- Cached Data
  metadata_json JSONB, -- oEmbed metadata
  ingredients_json JSONB, -- Extracted ingredients with confidence
  extraction_method TEXT,
  extraction_confidence NUMERIC(3,2),

  -- Cost Tracking (Gate 4)
  llm_calls_count INTEGER DEFAULT 0,
  total_cost_cents INTEGER DEFAULT 0,

  -- Cache Management
  ttl_days INTEGER DEFAULT 30,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  hit_count INTEGER DEFAULT 0, -- Analytics for cache effectiveness

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_extraction_cache_url_hash ON extraction_cache(url_hash);
CREATE INDEX idx_extraction_cache_expires_at ON extraction_cache(expires_at);
CREATE INDEX idx_extraction_cache_source_url ON extraction_cache(source_url);

-- Cleanup expired cache entries (run daily via cron job)
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM extraction_cache
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SUBSTITUTION RULES: Pre-defined ingredient substitutions (Task 3.1)
-- =============================================================================
CREATE TABLE IF NOT EXISTS substitution_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Substitution Mapping
  canonical_item_a UUID NOT NULL REFERENCES canonical_items(id),
  canonical_item_b UUID NOT NULL REFERENCES canonical_items(id),

  -- Substitution Metadata
  rationale TEXT NOT NULL, -- "Greek yogurt ↔ sour cream: similar fat/protein"
  ratio NUMERIC(5,2) DEFAULT 1.0, -- 1 cup yogurt = 1 cup sour cream
  category TEXT, -- "dairy", "fat", "acid"

  -- Constraints
  bidirectional BOOLEAN DEFAULT TRUE,
  requires_cooking_adjustment BOOLEAN DEFAULT FALSE,
  dietary_safe BOOLEAN DEFAULT TRUE, -- Safe for allergen/religious restrictions?

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_substitution_rules_canonical_a ON substitution_rules(canonical_item_a);
CREATE INDEX idx_substitution_rules_canonical_b ON substitution_rules(canonical_item_b);

-- Ensure no duplicate rules (A→B and B→A both allowed if bidirectional=true)
CREATE UNIQUE INDEX idx_substitution_unique ON substitution_rules(
  LEAST(canonical_item_a, canonical_item_b),
  GREATEST(canonical_item_a, canonical_item_b)
);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Cook Cards: Users can only see their own
ALTER TABLE cook_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY cook_cards_user_policy ON cook_cards
  FOR ALL
  USING (user_id = auth.uid());

-- Cook Card Ingredients: Inherit from cook_cards
ALTER TABLE cook_card_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY cook_card_ingredients_policy ON cook_card_ingredients
  FOR ALL
  USING (
    cook_card_id IN (
      SELECT id FROM cook_cards WHERE user_id = auth.uid()
    )
  );

-- Cook Card Events: Users can insert their own events, admins can read all
ALTER TABLE cook_card_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY cook_card_events_insert_policy ON cook_card_events
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY cook_card_events_select_policy ON cook_card_events
  FOR SELECT
  USING (user_id = auth.uid());

-- Extraction Cache: Public read (no PII), service role write
ALTER TABLE extraction_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY extraction_cache_read_policy ON extraction_cache
  FOR SELECT
  USING (true); -- Cache is shared across users (no PII)

CREATE POLICY extraction_cache_write_policy ON extraction_cache
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Substitution Rules: Public read, admin write
ALTER TABLE substitution_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY substitution_rules_read_policy ON substitution_rules
  FOR SELECT
  USING (true);

CREATE POLICY substitution_rules_write_policy ON substitution_rules
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Log migration success
DO $$
BEGIN
  RAISE NOTICE 'Cook Card schema migration complete. Tables created:';
  RAISE NOTICE '  - cook_cards';
  RAISE NOTICE '  - cook_card_ingredients';
  RAISE NOTICE '  - cook_card_events';
  RAISE NOTICE '  - extraction_cache';
  RAISE NOTICE '  - substitution_rules';
  RAISE NOTICE 'RLS policies enabled. Ready for Week 3-4 share extension development.';
END $$;
