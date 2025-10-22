-- Migration: Extend Telemetry for Evidence-Based Extraction
-- Date: 2025-10-08
-- Purpose: Add secondary evidence ladder telemetry fields

-- Add evidence ladder fields to cook_card_events
ALTER TABLE cook_card_events ADD COLUMN IF NOT EXISTS evidence_source TEXT;
ALTER TABLE cook_card_events ADD COLUMN IF NOT EXISTS comment_score INTEGER;
ALTER TABLE cook_card_events ADD COLUMN IF NOT EXISTS comment_used BOOLEAN DEFAULT FALSE;
ALTER TABLE cook_card_events ADD COLUMN IF NOT EXISTS pre_gate_skip BOOLEAN DEFAULT FALSE;
ALTER TABLE cook_card_events ADD COLUMN IF NOT EXISTS pre_gate_reason TEXT;
ALTER TABLE cook_card_events ADD COLUMN IF NOT EXISTS signals_detected INTEGER;
ALTER TABLE cook_card_events ADD COLUMN IF NOT EXISTS rejected_count INTEGER DEFAULT 0;
ALTER TABLE cook_card_events ADD COLUMN IF NOT EXISTS removed_count INTEGER DEFAULT 0;

-- Update event_type enum to include new events
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
    'budget_exceeded',
    -- New secondary ladder events
    'pre_gate_evaluated',
    'comment_harvest_success',
    'comment_harvest_failed',
    'comment_harvest_error',
    'ingredients_rejected_no_evidence',
    'section_headers_removed'
  ));

-- Add indexes for analytics
CREATE INDEX IF NOT EXISTS idx_cook_card_events_evidence_source
  ON cook_card_events(evidence_source);

CREATE INDEX IF NOT EXISTS idx_cook_card_events_comment_used
  ON cook_card_events(comment_used);

CREATE INDEX IF NOT EXISTS idx_cook_card_events_pre_gate_skip
  ON cook_card_events(pre_gate_skip);

-- Add JSON fields for detailed breakdowns
ALTER TABLE cook_card_events ADD COLUMN IF NOT EXISTS rejection_reasons JSONB;
ALTER TABLE cook_card_events ADD COLUMN IF NOT EXISTS removal_reasons JSONB;
ALTER TABLE cook_card_events ADD COLUMN IF NOT EXISTS comment_stats JSONB;

-- Add comments for documentation
COMMENT ON COLUMN cook_card_events.evidence_source IS 'Source of ingredients: description, youtube_comment, screenshot_ocr, manual_paste';
COMMENT ON COLUMN cook_card_events.comment_score IS 'Score of best comment used (if applicable)';
COMMENT ON COLUMN cook_card_events.comment_used IS 'Whether extraction used YouTube comment instead of description';
COMMENT ON COLUMN cook_card_events.pre_gate_skip IS 'Whether L3 extraction was skipped by pre-gate logic';
COMMENT ON COLUMN cook_card_events.pre_gate_reason IS 'Reason for pre-gate skip: description_too_short, no_ingredient_signals, only_weak_signals';
COMMENT ON COLUMN cook_card_events.signals_detected IS 'Number of ingredient signals found in pre-gate analysis';
COMMENT ON COLUMN cook_card_events.rejected_count IS 'Number of ingredients rejected during evidence validation';
COMMENT ON COLUMN cook_card_events.removed_count IS 'Number of section headers removed';
COMMENT ON COLUMN cook_card_events.rejection_reasons IS 'Breakdown of rejection reasons: {missing_evidence_phrase: N, evidence_not_found: N}';
COMMENT ON COLUMN cook_card_events.removal_reasons IS 'Breakdown of removal reasons: {ends_with_colon: N, known_section_name: N, etc.}';
COMMENT ON COLUMN cook_card_events.comment_stats IS 'Statistics about comment harvesting: {total_comments: N, avg_score: N, above_threshold: N}';

-- Create view for secondary ladder success rate
CREATE OR REPLACE VIEW secondary_ladder_stats AS
SELECT
  DATE(created_at) as date,
  COUNT(*) FILTER (WHERE event_type = 'pre_gate_evaluated') as total_evaluations,
  COUNT(*) FILTER (WHERE event_type = 'pre_gate_evaluated' AND pre_gate_skip = true) as pre_gate_skips,
  COUNT(*) FILTER (WHERE event_type = 'comment_harvest_success') as comment_successes,
  COUNT(*) FILTER (WHERE event_type = 'comment_harvest_failed') as comment_failures,
  COUNT(*) FILTER (WHERE event_type = 'comment_harvest_success') * 100.0 /
    NULLIF(COUNT(*) FILTER (WHERE event_type = 'comment_harvest_success' OR event_type = 'comment_harvest_failed'), 0) as comment_success_rate,
  AVG(rejected_count) FILTER (WHERE event_type = 'ingredients_rejected_no_evidence') as avg_rejected_per_extraction,
  AVG(removed_count) FILTER (WHERE event_type = 'section_headers_removed') as avg_removed_per_extraction
FROM cook_card_events
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

COMMENT ON VIEW secondary_ladder_stats IS 'Daily statistics for secondary evidence ladder performance';

-- Create view for evidence source breakdown
CREATE OR REPLACE VIEW evidence_source_breakdown AS
SELECT
  evidence_source,
  COUNT(*) as extraction_count,
  AVG(extraction_confidence) as avg_confidence,
  AVG(ingredients_count) as avg_ingredients_count,
  AVG(extraction_latency_ms) as avg_latency_ms,
  AVG(extraction_cost_cents) as avg_cost_cents
FROM cook_card_events
WHERE event_type = 'extraction_completed'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY evidence_source
ORDER BY extraction_count DESC;

COMMENT ON VIEW evidence_source_breakdown IS 'Extraction statistics grouped by evidence source (description vs comment)';
