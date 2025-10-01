-- Alias Map System for Progressive Learning
-- This enables the system to learn from user corrections and reduce LLM usage over time

-- Create enum for pattern types
CREATE TYPE pattern_type AS ENUM ('exact', 'regex', 'token');

-- Create enum for alias sources
CREATE TYPE alias_source AS ENUM ('user', 'system', 'llm');

-- Main alias map table
CREATE TABLE IF NOT EXISTS ingredient_aliases (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

    -- Pattern matching
    pattern TEXT NOT NULL,
    pattern_type pattern_type NOT NULL DEFAULT 'exact',

    -- What it maps to
    ingredient_class TEXT NOT NULL,

    -- Scoping (optional)
    merchant TEXT,              -- Store-specific patterns
    household_id TEXT,          -- Household-specific overrides

    -- Confidence and learning
    confidence REAL DEFAULT 0.5 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    hit_count INTEGER DEFAULT 0,
    miss_count INTEGER DEFAULT 0,
    last_used TIMESTAMP WITH TIME ZONE,

    -- Source tracking
    source alias_source NOT NULL DEFAULT 'system',
    created_by TEXT,            -- User ID who created it

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Indexes for lookup performance
    CONSTRAINT unique_pattern_scope UNIQUE NULLS NOT DISTINCT (pattern, pattern_type, merchant, household_id)
);

-- Create indexes for fast lookups
CREATE INDEX idx_alias_lookup ON ingredient_aliases (household_id, merchant, pattern_type, pattern);
CREATE INDEX idx_alias_confidence ON ingredient_aliases (confidence DESC);
CREATE INDEX idx_alias_merchant ON ingredient_aliases (merchant) WHERE merchant IS NOT NULL;
CREATE INDEX idx_alias_household ON ingredient_aliases (household_id) WHERE household_id IS NOT NULL;
CREATE INDEX idx_alias_class ON ingredient_aliases (ingredient_class);

-- Table for tracking alias performance over time
CREATE TABLE IF NOT EXISTS alias_feedback (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    alias_id TEXT REFERENCES ingredient_aliases(id) ON DELETE CASCADE,

    -- Feedback data
    was_correct BOOLEAN NOT NULL,
    raw_text TEXT NOT NULL,
    corrected_to TEXT,

    -- Context
    receipt_id TEXT,
    household_id TEXT,

    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_feedback_alias ON alias_feedback (alias_id);
CREATE INDEX idx_feedback_date ON alias_feedback (created_at);

-- Table for common pattern expansions (pre-compiled patterns)
CREATE TABLE IF NOT EXISTS pattern_expansions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

    -- Original pattern and expansions
    base_pattern TEXT NOT NULL,
    expanded_patterns TEXT[] NOT NULL,

    -- Type of expansion
    expansion_type TEXT CHECK (expansion_type IN ('abbreviation', 'brand', 'synonym')),

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_base_pattern UNIQUE (base_pattern)
);

-- Insert common pattern expansions
INSERT INTO pattern_expansions (base_pattern, expanded_patterns, expansion_type) VALUES
    ('MILK', ARRAY['MLK', 'WHOLE MILK', '2% MILK', 'SKIM MILK', 'FAT FREE'], 'abbreviation'),
    ('CHICKEN', ARRAY['CHKN', 'CHICK', 'POULTRY'], 'abbreviation'),
    ('VEGETABLE', ARRAY['VEG', 'VEGGIES', 'PRODUCE'], 'synonym'),
    ('TOMATO', ARRAY['TOM', 'TOMATOES', 'ROMA', 'CHERRY TOM'], 'abbreviation'),
    ('BREAD', ARRAY['BRD', 'LOAF', 'WHEAT BREAD', 'WHITE BREAD'], 'synonym')
ON CONFLICT (base_pattern) DO NOTHING;

-- Function to update confidence based on feedback
CREATE OR REPLACE FUNCTION update_alias_confidence(
    p_alias_id TEXT,
    p_was_correct BOOLEAN
) RETURNS VOID AS $$
DECLARE
    current_confidence REAL;
    new_confidence REAL;
BEGIN
    SELECT confidence INTO current_confidence
    FROM ingredient_aliases
    WHERE id = p_alias_id;

    IF p_was_correct THEN
        -- Increase confidence (max 1.0)
        new_confidence := LEAST(current_confidence * 1.02, 1.0);
        UPDATE ingredient_aliases
        SET confidence = new_confidence,
            hit_count = hit_count + 1,
            last_used = NOW(),
            updated_at = NOW()
        WHERE id = p_alias_id;
    ELSE
        -- Decay confidence (min 0.3)
        new_confidence := GREATEST(current_confidence * 0.95, 0.3);
        UPDATE ingredient_aliases
        SET confidence = new_confidence,
            miss_count = miss_count + 1,
            updated_at = NOW()
        WHERE id = p_alias_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get best matching alias
CREATE OR REPLACE FUNCTION get_best_alias(
    p_raw_text TEXT,
    p_merchant TEXT DEFAULT NULL,
    p_household_id TEXT DEFAULT NULL
) RETURNS TABLE (
    alias_id TEXT,
    ingredient_class TEXT,
    confidence REAL,
    pattern_type pattern_type,
    source alias_source
) AS $$
BEGIN
    -- Resolution order: household exact → merchant exact → global exact →
    --                   household regex → merchant regex → global regex → token

    RETURN QUERY
    WITH ranked_aliases AS (
        SELECT
            a.id as alias_id,
            a.ingredient_class,
            a.confidence,
            a.pattern_type,
            a.source,
            CASE
                -- Household-specific exact match (highest priority)
                WHEN a.pattern_type = 'exact' AND a.household_id = p_household_id
                    AND UPPER(p_raw_text) = UPPER(a.pattern) THEN 1

                -- Merchant-specific exact match
                WHEN a.pattern_type = 'exact' AND a.merchant = p_merchant
                    AND a.household_id IS NULL
                    AND UPPER(p_raw_text) = UPPER(a.pattern) THEN 2

                -- Global exact match
                WHEN a.pattern_type = 'exact'
                    AND a.merchant IS NULL AND a.household_id IS NULL
                    AND UPPER(p_raw_text) = UPPER(a.pattern) THEN 3

                -- Household regex match
                WHEN a.pattern_type = 'regex' AND a.household_id = p_household_id
                    AND p_raw_text ~* a.pattern THEN 4

                -- Merchant regex match
                WHEN a.pattern_type = 'regex' AND a.merchant = p_merchant
                    AND a.household_id IS NULL
                    AND p_raw_text ~* a.pattern THEN 5

                -- Global regex match
                WHEN a.pattern_type = 'regex'
                    AND a.merchant IS NULL AND a.household_id IS NULL
                    AND p_raw_text ~* a.pattern THEN 6

                -- Token match
                WHEN a.pattern_type = 'token'
                    AND position(UPPER(a.pattern) IN UPPER(p_raw_text)) > 0 THEN 7

                ELSE 999
            END as priority
        FROM ingredient_aliases a
        WHERE confidence >= 0.3  -- Minimum confidence threshold
    )
    SELECT
        alias_id,
        ingredient_class,
        confidence,
        pattern_type,
        source
    FROM ranked_aliases
    WHERE priority < 999
    ORDER BY priority, confidence DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Seed initial system aliases from taxonomy
INSERT INTO ingredient_aliases (pattern, pattern_type, ingredient_class, confidence, source)
SELECT
    unnest(ARRAY[
        'WHOLE MILK', '2% MILK', 'SKIM MILK', 'MILK GAL', 'MLK'
    ]) as pattern,
    'exact' as pattern_type,
    'milk' as ingredient_class,
    0.8 as confidence,
    'system' as source
ON CONFLICT DO NOTHING;

INSERT INTO ingredient_aliases (pattern, pattern_type, ingredient_class, confidence, source)
VALUES
    ('(WHOLE|2%|SKIM|FAT FREE)?\s*MILK', 'regex', 'milk', 0.7, 'system'),
    ('EGGS?\s*(DOZEN)?', 'regex', 'eggs', 0.75, 'system'),
    ('CHICKEN\s*(BREAST|THIGH|WING)?', 'regex', 'chicken', 0.75, 'system'),
    ('(WHITE|WHEAT|WHOLE WHEAT)?\s*BREAD', 'regex', 'bread', 0.7, 'system')
ON CONFLICT DO NOTHING;