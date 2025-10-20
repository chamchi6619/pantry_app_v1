-- Weekly OOV Review Queries
-- Run these every Monday morning to identify top missing ingredients

-- =============================================================================
-- QUERY 1: Top 20 OOV ingredients from last 7 days
-- =============================================================================
SELECT
  ingredient,
  COUNT(*) as occurrences,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen
FROM ingredient_oov
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY ingredient
ORDER BY occurrences DESC
LIMIT 20;

-- =============================================================================
-- QUERY 2: OOV by day (trend analysis)
-- See if OOV rate is increasing or decreasing
-- =============================================================================
SELECT
  DATE(created_at) as day,
  COUNT(*) as total_oov,
  COUNT(DISTINCT ingredient) as unique_oov
FROM ingredient_oov
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY day DESC;

-- =============================================================================
-- QUERY 3: Use the built-in view for weekly review
-- =============================================================================
SELECT * FROM weekly_oov_review;

-- =============================================================================
-- QUERY 4: Monthly trending ingredients (good for planning)
-- =============================================================================
SELECT
  ingredient,
  COUNT(*) as occurrences,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen,
  COUNT(DISTINCT DATE(created_at)) as days_appearing
FROM ingredient_oov
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY ingredient
HAVING COUNT(*) >= 10  -- Appeared 10+ times in last month
ORDER BY occurrences DESC
LIMIT 50;

-- =============================================================================
-- CLEANUP: After adding items to canonical database
-- Remove entries for ingredients you've just added
-- =============================================================================
-- DELETE FROM ingredient_oov
-- WHERE ingredient IN ('gochugaru', 'fish sauce', 'mirin')
-- AND created_at < NOW() - INTERVAL '7 days';

-- =============================================================================
-- COVERAGE METRICS: Calculate overall coverage
-- Requires tracking total ingredients processed (implement separately)
-- =============================================================================
-- SELECT
--   (total_ingredients - total_oov)::float / total_ingredients * 100 as coverage_pct
-- FROM (
--   SELECT
--     COUNT(*) as total_oov
--   FROM ingredient_oov
--   WHERE created_at > NOW() - INTERVAL '7 days'
-- ) oov,
-- (
--   SELECT COUNT(*) as total_ingredients
--   FROM ... -- your ingredient processing log
-- ) total;
