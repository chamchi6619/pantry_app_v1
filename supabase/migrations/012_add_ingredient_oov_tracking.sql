-- Minimal OOV (out-of-vocabulary) ingredient tracking
-- Logs ingredients that fail to match against canonical database
-- Used for weekly review and database expansion

CREATE TABLE IF NOT EXISTS ingredient_oov (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast aggregation by ingredient
CREATE INDEX idx_oov_ingredient ON ingredient_oov(ingredient);

-- Index for time-based queries (last 7 days, last 30 days)
CREATE INDEX idx_oov_created_at ON ingredient_oov(created_at);

-- View for weekly OOV review (top missing ingredients)
CREATE OR REPLACE VIEW weekly_oov_review AS
SELECT
  ingredient,
  COUNT(*) as occurrences,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen
FROM ingredient_oov
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY ingredient
ORDER BY occurrences DESC
LIMIT 50;

COMMENT ON TABLE ingredient_oov IS 'Tracks ingredients that failed to match canonical database for weekly expansion review';
COMMENT ON VIEW weekly_oov_review IS 'Top 50 OOV ingredients from last 7 days for weekly promotion review';
