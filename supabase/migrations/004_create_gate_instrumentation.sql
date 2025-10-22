-- Gate Instrumentation Migration
-- Context: Ship gates MUST pass for 14 consecutive days before beta expansion
-- PRD Reference: COOKCARD_PRD_V1.md Section 9 (Acceptance Criteria & Ship Gates)

-- =============================================================================
-- GATE 1: QUALITY
-- Threshold: ≥95% of saves yield Cook Card with ≥80% confidence OR ≤2 taps to confirm
-- =============================================================================

CREATE OR REPLACE VIEW gate_1_quality AS
SELECT
  DATE_TRUNC('day', created_at) as date,

  -- Average taps to confirm per save
  AVG(confirm_taps) as avg_confirm_taps,

  -- P95 confidence across all extractions
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY extraction_confidence) as p95_confidence,

  -- Pass/Fail logic
  CASE
    WHEN AVG(confirm_taps) <= 2.0 AND
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY extraction_confidence) >= 0.80
    THEN 'PASS'
    ELSE 'FAIL'
  END as gate_status,

  -- Supporting metrics
  COUNT(*) as total_saves,
  COUNT(*) FILTER (WHERE extraction_confidence >= 0.80) as high_confidence_saves,
  COUNT(*) FILTER (WHERE confirm_taps = 0) as zero_tap_saves,
  COUNT(*) FILTER (WHERE confirm_taps <= 2) as acceptable_tap_saves

FROM cook_cards
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;

-- Gate 1 current status (single row summary for dashboard)
CREATE OR REPLACE VIEW gate_1_current AS
SELECT
  AVG(confirm_taps) as avg_confirm_taps,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY extraction_confidence) as p95_confidence,

  CASE
    WHEN AVG(confirm_taps) <= 2.0 AND
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY extraction_confidence) >= 0.80
    THEN 'PASS'
    ELSE 'FAIL'
  END as gate_status,

  COUNT(*) as total_saves_7d,
  MIN(created_at) as window_start,
  MAX(created_at) as window_end

FROM cook_cards
WHERE created_at > NOW() - INTERVAL '7 days';

-- =============================================================================
-- GATE 2: CONVERSION
-- Threshold: Save → Cook ≥20% in beta cohort within 7 days
-- =============================================================================

CREATE OR REPLACE VIEW gate_2_conversion AS
SELECT
  DATE_TRUNC('day', e.created_at) as date,

  -- Conversion rate calculation
  COUNT(DISTINCT e.user_id) FILTER (WHERE e.event_type = 'cook_started') * 100.0 /
  NULLIF(COUNT(DISTINCT e.user_id) FILTER (WHERE e.event_type = 'cook_card_saved'), 0) as conversion_pct,

  -- Pass/Fail logic
  CASE
    WHEN COUNT(DISTINCT e.user_id) FILTER (WHERE e.event_type = 'cook_started') * 100.0 /
         NULLIF(COUNT(DISTINCT e.user_id) FILTER (WHERE e.event_type = 'cook_card_saved'), 0) >= 20.0
    THEN 'PASS'
    ELSE 'FAIL'
  END as gate_status,

  -- Supporting metrics
  COUNT(DISTINCT e.user_id) FILTER (WHERE e.event_type = 'cook_card_saved') as users_saved,
  COUNT(DISTINCT e.user_id) FILTER (WHERE e.event_type = 'cook_started') as users_cooked,
  COUNT(*) FILTER (WHERE e.event_type = 'cook_card_saved') as total_saves,
  COUNT(*) FILTER (WHERE e.event_type = 'cook_started') as total_cooks,
  e.cohort

FROM cook_card_events e
WHERE e.created_at > NOW() - INTERVAL '7 days'
  AND e.cohort = 'beta'
GROUP BY DATE_TRUNC('day', e.created_at), e.cohort
ORDER BY date DESC;

-- Gate 2 current status
CREATE OR REPLACE VIEW gate_2_current AS
SELECT
  COUNT(DISTINCT e.user_id) FILTER (WHERE e.event_type = 'cook_started') * 100.0 /
  NULLIF(COUNT(DISTINCT e.user_id) FILTER (WHERE e.event_type = 'cook_card_saved'), 0) as conversion_pct,

  CASE
    WHEN COUNT(DISTINCT e.user_id) FILTER (WHERE e.event_type = 'cook_started') * 100.0 /
         NULLIF(COUNT(DISTINCT e.user_id) FILTER (WHERE e.event_type = 'cook_card_saved'), 0) >= 20.0
    THEN 'PASS'
    ELSE 'FAIL'
  END as gate_status,

  COUNT(DISTINCT e.user_id) FILTER (WHERE e.event_type = 'cook_card_saved') as users_saved,
  COUNT(DISTINCT e.user_id) FILTER (WHERE e.event_type = 'cook_started') as users_cooked,
  MIN(e.created_at) as window_start,
  MAX(e.created_at) as window_end

FROM cook_card_events e
WHERE e.created_at > NOW() - INTERVAL '7 days'
  AND e.cohort = 'beta';

-- =============================================================================
-- GATE 3: COMPLIANCE
-- Threshold: 0 violations in 200-save audit (ToS, copyright, dietary safety)
-- =============================================================================

CREATE OR REPLACE VIEW gate_3_compliance AS
SELECT
  DATE_TRUNC('day', created_at) as date,

  -- Violation count
  COUNT(*) FILTER (WHERE compliance_flagged = true) as violation_count,

  -- Pass/Fail logic (MUST be 0 violations)
  CASE
    WHEN COUNT(*) FILTER (WHERE compliance_flagged = true) = 0
    THEN 'PASS'
    ELSE 'FAIL'
  END as gate_status,

  -- Supporting metrics
  COUNT(*) as total_saves,
  COUNT(*) FILTER (WHERE compliance_flagged = true AND compliance_reason LIKE '%copyright%') as copyright_violations,
  COUNT(*) FILTER (WHERE compliance_flagged = true AND compliance_reason LIKE '%ToS%') as tos_violations,
  COUNT(*) FILTER (WHERE compliance_flagged = true AND compliance_reason LIKE '%dietary%') as dietary_violations,

  -- Compliance event details (JSONB array)
  JSONB_AGG(
    JSONB_BUILD_OBJECT(
      'cook_card_id', id,
      'source_url', source_url,
      'reason', compliance_reason,
      'flagged_at', created_at
    ) ORDER BY created_at DESC
  ) FILTER (WHERE compliance_flagged = true) as violation_details

FROM cook_cards
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;

-- Gate 3 current status
CREATE OR REPLACE VIEW gate_3_current AS
SELECT
  COUNT(*) FILTER (WHERE compliance_flagged = true) as violation_count,

  CASE
    WHEN COUNT(*) FILTER (WHERE compliance_flagged = true) = 0
    THEN 'PASS'
    ELSE 'FAIL'
  END as gate_status,

  COUNT(*) as total_saves_7d,
  MIN(created_at) as window_start,
  MAX(created_at) as window_end,

  -- Recent violations for immediate action
  JSONB_AGG(
    JSONB_BUILD_OBJECT(
      'cook_card_id', id,
      'source_url', source_url,
      'reason', compliance_reason,
      'flagged_at', created_at
    ) ORDER BY created_at DESC
  ) FILTER (WHERE compliance_flagged = true) as recent_violations

FROM cook_cards
WHERE created_at > NOW() - INTERVAL '7 days';

-- =============================================================================
-- GATE 4: ECONOMICS
-- Threshold: <$0.015 LLM cost per save AND <0.4 LLM calls per URL (average)
-- =============================================================================

CREATE OR REPLACE VIEW gate_4_economics AS
SELECT
  DATE_TRUNC('day', created_at) as date,

  -- Cost per save (in dollars)
  AVG(extraction_cost_cents) / 100.0 as avg_cost_per_save,

  -- LLM call rate (from events table)
  (
    SELECT COUNT(*)
    FROM cook_card_events e
    WHERE e.event_type = 'llm_call_made'
      AND e.created_at > NOW() - INTERVAL '7 days'
  )::FLOAT / NULLIF(COUNT(*), 0) as llm_calls_per_save,

  -- Cache hit rate
  (
    SELECT COUNT(*)
    FROM cook_card_events e
    WHERE e.event_type = 'url_cached'
      AND e.cache_hit = true
      AND e.created_at > NOW() - INTERVAL '7 days'
  )::FLOAT / NULLIF(
    (SELECT COUNT(*) FROM cook_card_events WHERE event_type = 'url_cached' AND created_at > NOW() - INTERVAL '7 days'),
    0
  ) as cache_hit_rate,

  -- Pass/Fail logic
  CASE
    WHEN AVG(extraction_cost_cents) / 100.0 < 0.015 AND
         (
           SELECT COUNT(*)
           FROM cook_card_events e
           WHERE e.event_type = 'llm_call_made'
             AND e.created_at > NOW() - INTERVAL '7 days'
         )::FLOAT / NULLIF(COUNT(*), 0) < 0.4
    THEN 'PASS'
    ELSE 'FAIL'
  END as gate_status,

  -- Supporting metrics
  COUNT(*) as total_saves,
  SUM(extraction_cost_cents) / 100.0 as total_cost_dollars,
  MAX(extraction_cost_cents) / 100.0 as max_cost_per_save,
  MIN(extraction_cost_cents) / 100.0 as min_cost_per_save

FROM cook_cards
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;

-- Gate 4 current status
CREATE OR REPLACE VIEW gate_4_current AS
SELECT
  AVG(extraction_cost_cents) / 100.0 as avg_cost_per_save,

  (
    SELECT COUNT(*)
    FROM cook_card_events e
    WHERE e.event_type = 'llm_call_made'
      AND e.created_at > NOW() - INTERVAL '7 days'
  )::FLOAT / NULLIF(COUNT(*), 0) as llm_calls_per_save,

  (
    SELECT COUNT(*)
    FROM cook_card_events e
    WHERE e.event_type = 'url_cached'
      AND e.cache_hit = true
      AND e.created_at > NOW() - INTERVAL '7 days'
  )::FLOAT / NULLIF(
    (SELECT COUNT(*) FROM cook_card_events WHERE event_type = 'url_cached' AND created_at > NOW() - INTERVAL '7 days'),
    0
  ) as cache_hit_rate,

  CASE
    WHEN AVG(extraction_cost_cents) / 100.0 < 0.015 AND
         (
           SELECT COUNT(*)
           FROM cook_card_events e
           WHERE e.event_type = 'llm_call_made'
             AND e.created_at > NOW() - INTERVAL '7 days'
         )::FLOAT / NULLIF(COUNT(*), 0) < 0.4
    THEN 'PASS'
    ELSE 'FAIL'
  END as gate_status,

  COUNT(*) as total_saves_7d,
  SUM(extraction_cost_cents) / 100.0 as total_cost_dollars,
  MIN(created_at) as window_start,
  MAX(created_at) as window_end

FROM cook_cards
WHERE created_at > NOW() - INTERVAL '7 days';

-- =============================================================================
-- MASTER GATE DASHBOARD: All 4 gates in one view
-- =============================================================================

CREATE OR REPLACE VIEW gates_dashboard AS
SELECT
  'Gate 1: Quality' as gate_name,
  gate_status,
  JSONB_BUILD_OBJECT(
    'avg_confirm_taps', avg_confirm_taps,
    'p95_confidence', p95_confidence,
    'total_saves', total_saves_7d,
    'threshold', 'avg_taps ≤2.0 AND p95_conf ≥0.80'
  ) as metrics
FROM gate_1_current

UNION ALL

SELECT
  'Gate 2: Conversion' as gate_name,
  gate_status,
  JSONB_BUILD_OBJECT(
    'conversion_pct', conversion_pct,
    'users_saved', users_saved,
    'users_cooked', users_cooked,
    'threshold', '≥20% save→cook'
  ) as metrics
FROM gate_2_current

UNION ALL

SELECT
  'Gate 3: Compliance' as gate_name,
  gate_status,
  JSONB_BUILD_OBJECT(
    'violation_count', violation_count,
    'total_saves', total_saves_7d,
    'recent_violations', recent_violations,
    'threshold', '0 violations'
  ) as metrics
FROM gate_3_current

UNION ALL

SELECT
  'Gate 4: Economics' as gate_name,
  gate_status,
  JSONB_BUILD_OBJECT(
    'avg_cost_per_save', avg_cost_per_save,
    'llm_calls_per_save', llm_calls_per_save,
    'cache_hit_rate', cache_hit_rate,
    'total_cost_dollars', total_cost_dollars,
    'threshold', '<$0.015/save AND <0.4 LLM calls/URL'
  ) as metrics
FROM gate_4_current;

-- =============================================================================
-- 14-DAY GATE STREAK TRACKER (Go/No-Go Decision)
-- =============================================================================

CREATE OR REPLACE VIEW gate_streak_tracker AS
WITH daily_gates AS (
  SELECT
    date,
    'Gate 1' as gate_name,
    gate_status
  FROM gate_1_quality
  WHERE date > NOW() - INTERVAL '14 days'

  UNION ALL

  SELECT
    date,
    'Gate 2' as gate_name,
    gate_status
  FROM gate_2_conversion
  WHERE date > NOW() - INTERVAL '14 days'

  UNION ALL

  SELECT
    date,
    'Gate 3' as gate_name,
    gate_status
  FROM gate_3_compliance
  WHERE date > NOW() - INTERVAL '14 days'

  UNION ALL

  SELECT
    date,
    'Gate 4' as gate_name,
    gate_status
  FROM gate_4_economics
  WHERE date > NOW() - INTERVAL '14 days'
),
gate_summary AS (
  SELECT
    date,
    COUNT(*) FILTER (WHERE gate_status = 'PASS') as gates_passed,
    COUNT(*) as total_gates,
    BOOL_AND(gate_status = 'PASS') as all_gates_pass
  FROM daily_gates
  GROUP BY date
  ORDER BY date DESC
)
SELECT
  date,
  gates_passed,
  total_gates,
  all_gates_pass,

  -- Consecutive days with all gates passing
  SUM(CASE WHEN all_gates_pass THEN 1 ELSE 0 END) OVER (
    ORDER BY date DESC
    ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING
  ) as consecutive_pass_days,

  -- Go/No-Go decision
  CASE
    WHEN SUM(CASE WHEN all_gates_pass THEN 1 ELSE 0 END) OVER (
      ORDER BY date DESC
      ROWS BETWEEN CURRENT ROW AND 13 FOLLOWING
    ) >= 14
    THEN 'GO - Expand to 1000 users'
    ELSE 'NO-GO - Continue beta at 100 users'
  END as go_no_go_status

FROM gate_summary
ORDER BY date DESC
LIMIT 14;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to log gate status changes (for alerting)
CREATE OR REPLACE FUNCTION check_gate_status_change()
RETURNS TABLE(gate_name TEXT, old_status TEXT, new_status TEXT, alert_severity TEXT) AS $$
BEGIN
  -- This would be called by a cron job to detect status changes
  -- For now, returns current status (integrate with PagerDuty in Task 1.2 part 2)
  RETURN QUERY
  SELECT
    g.gate_name::TEXT,
    'UNKNOWN'::TEXT as old_status,
    (g.metrics->>'gate_status')::TEXT as new_status,
    CASE
      WHEN g.gate_name LIKE '%Gate 1%' OR g.gate_name LIKE '%Gate 4%' THEN 'CRITICAL'
      ELSE 'WARNING'
    END as alert_severity
  FROM gates_dashboard g
  WHERE (g.metrics->>'gate_status')::TEXT = 'FAIL';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Gate instrumentation complete. Views created:';
  RAISE NOTICE '  - gate_1_quality, gate_1_current (Quality gate)';
  RAISE NOTICE '  - gate_2_conversion, gate_2_current (Conversion gate)';
  RAISE NOTICE '  - gate_3_compliance, gate_3_current (Compliance gate)';
  RAISE NOTICE '  - gate_4_economics, gate_4_current (Economics gate)';
  RAISE NOTICE '  - gates_dashboard (Master view)';
  RAISE NOTICE '  - gate_streak_tracker (14-day Go/No-Go tracker)';
  RAISE NOTICE 'Next: Set up PagerDuty alerting + Grafana dashboards (Task 1.2 part 2)';
END $$;
