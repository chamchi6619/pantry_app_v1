-- Migration: Add ingress tracking for Cook Card telemetry
-- Purpose: Track how users discover and save Cook Cards (share extension, paste link, future browser extension)
-- PRD Reference: COOKCARD_PRD_V1.md Task 2.2 - Telemetry implementation

-- cook_card_ingress_events: Tracks each step of the Cook Card ingress funnel
CREATE TABLE cook_card_ingress_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL, -- Client-generated UUID to group events within single ingress flow
  event_type TEXT NOT NULL CHECK (event_type IN (
    'ingress_opened',           -- User opened share extension or paste screen
    'url_pasted',               -- User pasted URL (paste flow only)
    'extraction_started',       -- Extraction API call initiated
    'extraction_completed',     -- Extraction succeeded
    'extraction_failed',        -- Extraction failed (validation, parsing, API error)
    'cook_card_saved'           -- User saved Cook Card to their collection
  )),
  ingress_method TEXT NOT NULL CHECK (ingress_method IN (
    'share_extension_ios',      -- iOS native share extension
    'share_extension_android',  -- Android native share intent
    'paste_link',               -- Manual paste in app
    'browser_extension'         -- Future: Browser extension (Week 3-4)
  )),
  platform TEXT CHECK (platform IN ('youtube', 'instagram', 'tiktok', 'other')),
  recipe_url TEXT,              -- Original URL (before normalization)
  normalized_url TEXT,          -- After tracking param removal, mobile->desktop conversion
  error_code TEXT,              -- If extraction_failed: validation_error, api_error, parse_error
  error_message TEXT,           -- Human-readable error for debugging
  metadata JSONB,               -- Flexible field for platform-specific data
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_ingress_events_user_id ON cook_card_ingress_events(user_id);
CREATE INDEX idx_ingress_events_session_id ON cook_card_ingress_events(session_id);
CREATE INDEX idx_ingress_events_type ON cook_card_ingress_events(event_type);
CREATE INDEX idx_ingress_events_method ON cook_card_ingress_events(ingress_method);
CREATE INDEX idx_ingress_events_platform ON cook_card_ingress_events(platform);
CREATE INDEX idx_ingress_events_created_at ON cook_card_ingress_events(created_at);

-- RLS policies (users can only see their own events)
ALTER TABLE cook_card_ingress_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own ingress events"
  ON cook_card_ingress_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own ingress events"
  ON cook_card_ingress_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- ingress_conversion_funnel: View for analyzing conversion rates
CREATE VIEW ingress_conversion_funnel AS
WITH funnel_metrics AS (
  SELECT
    ingress_method,
    platform,
    DATE_TRUNC('day', created_at) AS day,
    COUNT(*) FILTER (WHERE event_type = 'ingress_opened') AS opened,
    COUNT(*) FILTER (WHERE event_type = 'url_pasted') AS pasted,
    COUNT(*) FILTER (WHERE event_type = 'extraction_started') AS extraction_started,
    COUNT(*) FILTER (WHERE event_type = 'extraction_completed') AS extraction_completed,
    COUNT(*) FILTER (WHERE event_type = 'extraction_failed') AS extraction_failed,
    COUNT(*) FILTER (WHERE event_type = 'cook_card_saved') AS saved
  FROM cook_card_ingress_events
  GROUP BY ingress_method, platform, day
)
SELECT
  ingress_method,
  platform,
  day,
  opened,
  pasted,
  extraction_started,
  extraction_completed,
  extraction_failed,
  saved,
  -- Conversion rates
  ROUND(100.0 * extraction_completed / NULLIF(extraction_started, 0), 1) AS extraction_success_rate,
  ROUND(100.0 * saved / NULLIF(extraction_completed, 0), 1) AS save_rate,
  ROUND(100.0 * saved / NULLIF(opened, 0), 1) AS overall_conversion_rate
FROM funnel_metrics
ORDER BY day DESC, ingress_method, platform;

-- Grant access to authenticated users
GRANT SELECT ON ingress_conversion_funnel TO authenticated;

COMMENT ON TABLE cook_card_ingress_events IS 'Tracks user journey from recipe discovery to Cook Card save. Used for Gate 4 economics analysis and UX optimization.';
COMMENT ON VIEW ingress_conversion_funnel IS 'Daily conversion metrics by ingress method and platform. Supports A/B testing and quality gate decisions.';
