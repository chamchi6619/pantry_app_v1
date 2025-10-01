# Production Monitoring & Alerts Setup

## 1. Metrics to Monitor

### Edge Function Metrics
```sql
-- Create monitoring views
CREATE VIEW receipt_processing_metrics AS
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE status = 'completed') as successful,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration_seconds,
  COUNT(DISTINCT household_id) as unique_households
FROM receipt_jobs
GROUP BY 1;

CREATE VIEW parse_method_breakdown AS
SELECT
  DATE_TRUNC('day', created_at) as day,
  parse_method,
  COUNT(*) as count,
  AVG(confidence) as avg_confidence
FROM receipts
GROUP BY 1, 2;

CREATE VIEW rate_limit_metrics AS
SELECT
  DATE_TRUNC('hour', updated_at) as hour,
  endpoint,
  COUNT(*) as requests,
  SUM(CASE WHEN tokens <= 0 THEN 1 ELSE 0 END) as rate_limited
FROM rate_limits
GROUP BY 1, 2;
```

## 2. Supabase Dashboard Queries

### Daily Health Check
```sql
-- Run daily to check system health
WITH metrics AS (
  SELECT
    COUNT(*) as total_receipts_24h,
    AVG(confidence) as avg_confidence,
    SUM(CASE WHEN parse_method = 'heuristics' THEN 1 ELSE 0 END)::float / COUNT(*) as heuristic_rate,
    COUNT(DISTINCT household_id) as active_households
  FROM receipts
  WHERE created_at > now() - interval '24 hours'
)
SELECT
  total_receipts_24h,
  ROUND(avg_confidence::numeric, 2) as avg_confidence,
  ROUND(heuristic_rate::numeric * 100, 1) as heuristic_percentage,
  active_households,
  CASE
    WHEN heuristic_rate < 0.6 THEN 'ALERT: Low heuristic success'
    WHEN avg_confidence < 0.7 THEN 'ALERT: Low confidence'
    ELSE 'HEALTHY'
  END as status
FROM metrics;
```

### Error Rate Monitoring
```sql
-- Check error rates every hour
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as total_attempts,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failures,
  ROUND(
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::numeric /
    COUNT(*)::numeric * 100,
    2
  ) as error_rate_percent
FROM receipt_jobs
WHERE created_at > now() - interval '24 hours'
GROUP BY 1
HAVING SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) > 0
ORDER BY 1 DESC;
```

## 3. CloudWatch-style Alerts (Using Supabase Functions)

```sql
-- Function to check metrics and send alerts
CREATE OR REPLACE FUNCTION check_system_alerts()
RETURNS jsonb AS $$
DECLARE
  v_alerts jsonb[] := ARRAY[]::jsonb[];
  v_error_rate numeric;
  v_heuristic_rate numeric;
  v_rate_limited_count int;
BEGIN
  -- Check error rate
  SELECT
    COUNT(*) FILTER (WHERE status = 'failed')::numeric / NULLIF(COUNT(*), 0) * 100
  INTO v_error_rate
  FROM receipt_jobs
  WHERE created_at > now() - interval '1 hour';

  IF v_error_rate > 10 THEN
    v_alerts := v_alerts || jsonb_build_object(
      'level', 'critical',
      'metric', 'error_rate',
      'value', v_error_rate,
      'threshold', 10,
      'message', format('Error rate is %.1f%% (threshold: 10%%)', v_error_rate)
    );
  END IF;

  -- Check heuristic success rate
  SELECT
    COUNT(*) FILTER (WHERE parse_method = 'heuristics')::numeric / NULLIF(COUNT(*), 0) * 100
  INTO v_heuristic_rate
  FROM receipts
  WHERE created_at > now() - interval '1 hour';

  IF v_heuristic_rate < 60 THEN
    v_alerts := v_alerts || jsonb_build_object(
      'level', 'warning',
      'metric', 'heuristic_rate',
      'value', v_heuristic_rate,
      'threshold', 60,
      'message', format('Heuristic rate is %.1f%% (threshold: 60%%)', v_heuristic_rate)
    );
  END IF;

  -- Check rate limiting
  SELECT COUNT(*)
  INTO v_rate_limited_count
  FROM rate_limits
  WHERE tokens <= 0 AND updated_at > now() - interval '1 hour';

  IF v_rate_limited_count > 50 THEN
    v_alerts := v_alerts || jsonb_build_object(
      'level', 'warning',
      'metric', 'rate_limiting',
      'value', v_rate_limited_count,
      'threshold', 50,
      'message', format('%s users rate limited in last hour', v_rate_limited_count)
    );
  END IF;

  RETURN jsonb_build_object(
    'timestamp', now(),
    'alerts', v_alerts,
    'alert_count', array_length(v_alerts, 1)
  );
END;
$$ LANGUAGE plpgsql;

-- Schedule this to run every 15 minutes
-- In production, connect this to your notification system (email, Slack, etc.)
```

## 4. Log Aggregation Queries

### Edge Function Logs Analysis
```sql
-- Parse structured logs from Edge Functions
CREATE OR REPLACE FUNCTION analyze_edge_logs(p_hours int DEFAULT 24)
RETURNS TABLE (
  correlation_id uuid,
  duration_ms numeric,
  phase text,
  error text,
  method text,
  confidence numeric
) AS $$
BEGIN
  -- This would parse actual logs in production
  -- For now, we use receipt_jobs as proxy
  RETURN QUERY
  SELECT
    gen_random_uuid() as correlation_id,
    EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000 as duration_ms,
    CASE
      WHEN status = 'completed' THEN 'success'
      ELSE 'failed'
    END as phase,
    error_message,
    'heuristics' as method,
    0.75 as confidence
  FROM receipt_jobs
  WHERE created_at > now() - (p_hours || ' hours')::interval;
END;
$$ LANGUAGE plpgsql;
```

## 5. Performance Monitoring

```sql
-- Track p95 response times
CREATE OR REPLACE FUNCTION get_performance_metrics()
RETURNS TABLE (
  metric text,
  value numeric,
  unit text
) AS $$
BEGIN
  RETURN QUERY
  WITH processing_times AS (
    SELECT
      EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000 as duration_ms
    FROM receipt_jobs
    WHERE status = 'completed'
      AND created_at > now() - interval '24 hours'
  ),
  percentiles AS (
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) as p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) as p99,
      AVG(duration_ms) as avg
    FROM processing_times
  )
  SELECT 'p50_response_time', p50, 'ms' FROM percentiles
  UNION ALL
  SELECT 'p95_response_time', p95, 'ms' FROM percentiles
  UNION ALL
  SELECT 'p99_response_time', p99, 'ms' FROM percentiles
  UNION ALL
  SELECT 'avg_response_time', avg, 'ms' FROM percentiles;
END;
$$ LANGUAGE plpgsql;
```

## 6. Cost Monitoring

```sql
-- Monitor Gemini API usage
CREATE VIEW gemini_usage_daily AS
SELECT
  DATE_TRUNC('day', created_at) as day,
  COUNT(*) as gemini_calls,
  COUNT(*) * 0.00002 as estimated_cost_usd -- Adjust based on actual pricing
FROM receipts
WHERE parse_method = 'gemini'
GROUP BY 1;

-- Alert if daily cost exceeds threshold
CREATE OR REPLACE FUNCTION check_cost_alerts()
RETURNS jsonb AS $$
DECLARE
  v_daily_cost numeric;
BEGIN
  SELECT SUM(gemini_calls * 0.00002)
  INTO v_daily_cost
  FROM gemini_usage_daily
  WHERE day = CURRENT_DATE;

  IF v_daily_cost > 1.00 THEN
    RETURN jsonb_build_object(
      'alert', true,
      'message', format('Daily Gemini cost: $%.2f (threshold: $1.00)', v_daily_cost),
      'action', 'Review Gemini usage patterns'
    );
  END IF;

  RETURN jsonb_build_object('alert', false, 'daily_cost', v_daily_cost);
END;
$$ LANGUAGE plpgsql;
```

## 7. Grafana Dashboard JSON

```json
{
  "dashboard": {
    "title": "Receipt OCR Production Monitoring",
    "panels": [
      {
        "title": "Request Volume",
        "type": "graph",
        "targets": [
          {
            "query": "SELECT hour, total_requests FROM receipt_processing_metrics WHERE hour > now() - interval '24 hours'"
          }
        ]
      },
      {
        "title": "Success Rate",
        "type": "gauge",
        "targets": [
          {
            "query": "SELECT (successful::float / total_requests * 100) as success_rate FROM receipt_processing_metrics WHERE hour > now() - interval '1 hour' LIMIT 1"
          }
        ]
      },
      {
        "title": "Heuristic vs Gemini",
        "type": "pie",
        "targets": [
          {
            "query": "SELECT parse_method, count FROM parse_method_breakdown WHERE day = CURRENT_DATE"
          }
        ]
      },
      {
        "title": "P95 Response Time",
        "type": "stat",
        "targets": [
          {
            "query": "SELECT value FROM get_performance_metrics() WHERE metric = 'p95_response_time'"
          }
        ]
      }
    ]
  }
}
```

## 8. Alerting Rules

### Critical Alerts (Page immediately)
- Error rate > 10%
- P95 latency > 2000ms
- Edge Function returning 5xx errors
- Database connection failures

### Warning Alerts (Notify team)
- Heuristic success rate < 60%
- Rate limiting affecting > 50 users/hour
- Daily Gemini cost > $1
- Duplicate rate > 20%

### Info Alerts (Log only)
- New store format detected
- Confidence trending down
- Unusual traffic patterns

## 9. Implementation Checklist

- [ ] Deploy monitoring views to Supabase
- [ ] Set up scheduled functions for alerts
- [ ] Configure webhook endpoints for notifications
- [ ] Create Grafana/Datadog dashboards
- [ ] Set up PagerDuty integration for critical alerts
- [ ] Configure log aggregation (Datadog, CloudWatch, etc.)
- [ ] Set up cost tracking and budget alerts
- [ ] Create runbooks for common issues
- [ ] Test alert escalation paths
- [ ] Document monitoring procedures

## 10. Monitoring Endpoints

```typescript
// Add these to Edge Function for health checks
if (req.url.endsWith('/health')) {
  return new Response('OK', { status: 200 })
}

if (req.url.endsWith('/metrics')) {
  const metrics = await getSystemMetrics()
  return new Response(JSON.stringify(metrics), {
    headers: { 'Content-Type': 'application/json' }
  })
}
```