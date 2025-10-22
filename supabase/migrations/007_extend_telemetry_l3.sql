-- Migration: Extend Telemetry for L3 Metrics
-- Date: 2025-10-08
-- Purpose: Add L3-specific fields to cook_card_events for cost tracking

-- Add L3 extraction fields to cook_card_events
ALTER TABLE cook_card_events ADD COLUMN IF NOT EXISTS extraction_method TEXT;
ALTER TABLE cook_card_events ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC;
ALTER TABLE cook_card_events ADD COLUMN IF NOT EXISTS extraction_cost_cents INTEGER;
ALTER TABLE cook_card_events ADD COLUMN IF NOT EXISTS input_hash TEXT;
ALTER TABLE cook_card_events ADD COLUMN IF NOT EXISTS ingredients_count INTEGER;
ALTER TABLE cook_card_events ADD COLUMN IF NOT EXISTS extraction_latency_ms INTEGER;

-- Update event_type enum to include new L3 events
ALTER TABLE cook_card_events DROP CONSTRAINT IF EXISTS cook_card_events_event_type_check;
ALTER TABLE cook_card_events ADD CONSTRAINT cook_card_events_event_type_check
  CHECK (event_type IN (
    'cook_card_saved',
    'cook_started',
    'ingredient_confirmed',
    'ingredient_edited',
    'shopping_list_added',
    'compliance_flagged',
    'llm_call_made',
    'url_cached',
    'extraction_started',
    'extraction_completed',
    'extraction_failed',
    'budget_exceeded'
  ));

-- Add indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_cook_card_events_extraction_method
  ON cook_card_events(extraction_method);

CREATE INDEX IF NOT EXISTS idx_cook_card_events_cache_hit
  ON cook_card_events(cache_hit);

CREATE INDEX IF NOT EXISTS idx_cook_card_events_event_type
  ON cook_card_events(event_type);

CREATE INDEX IF NOT EXISTS idx_cook_card_events_created_at
  ON cook_card_events(created_at DESC);

-- Add comments for documentation
COMMENT ON COLUMN cook_card_events.extraction_method IS 'L1=metadata, L2=creator_text, L3=llm_assisted';
COMMENT ON COLUMN cook_card_events.extraction_confidence IS 'Average confidence score (0.0-1.0) for extracted ingredients';
COMMENT ON COLUMN cook_card_events.extraction_cost_cents IS 'LLM API cost in cents (0 for L1/L2)';
COMMENT ON COLUMN cook_card_events.input_hash IS 'SHA256 hash of extraction inputs (url+title+description+userPaste) for cache key';
COMMENT ON COLUMN cook_card_events.ingredients_count IS 'Number of ingredients extracted';
COMMENT ON COLUMN cook_card_events.extraction_latency_ms IS 'Time taken for extraction in milliseconds';
