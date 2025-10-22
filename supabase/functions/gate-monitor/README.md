# Gate Monitor Edge Function

**Purpose:** Monitors 4 ship gates hourly and sends alerts when gates fail.

## Ship Gates

| Gate | Threshold | Severity |
|------|-----------|----------|
| Gate 1: Quality | avg_taps ≤2.0 AND p95_confidence ≥0.80 | CRITICAL |
| Gate 2: Conversion | save→cook ≥20% | WARNING |
| Gate 3: Compliance | 0 violations | WARNING |
| Gate 4: Economics | <$0.015/save AND <0.4 LLM calls/URL | CRITICAL |

## Deployment

### Deploy to Supabase

```bash
npx supabase functions deploy gate-monitor
```

### Set up Supabase Cron (Hourly)

```sql
-- Run in Supabase SQL Editor
SELECT cron.schedule(
  'gate-monitor-hourly',
  '0 * * * *',  -- Every hour at minute 0
  $$
  SELECT net.http_post(
    url := 'https://dyevpemrrlmbhifhqiwx.supabase.co/functions/v1/gate-monitor',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))
  ) AS request_id;
  $$
);
```

### Manual Invocation

```bash
curl -X POST https://dyevpemrrlmbhifhqiwx.supabase.co/functions/v1/gate-monitor \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json"
```

## Response Format

```json
{
  "timestamp": "2025-10-07T12:00:00Z",
  "gates": [
    {
      "gate_name": "Gate 1: Quality",
      "gate_status": "PASS",
      "metrics": {
        "avg_confirm_taps": 1.2,
        "p95_confidence": 0.87,
        "total_saves": 150
      }
    }
  ],
  "alerts": [],
  "go_no_go_status": "NO-GO - Continue beta at 100 users",
  "consecutive_pass_days": 3,
  "summary": {
    "total_gates": 4,
    "passing": 4,
    "failing": 0
  }
}
```

## Alert Configuration

### PagerDuty Integration (TODO)

1. Set environment variable in Supabase dashboard:
   ```
   ALERT_WEBHOOK_URL=https://events.pagerduty.com/v2/enqueue
   PAGERDUTY_INTEGRATION_KEY=<your-key>
   ```

2. Uncomment `sendWebhookAlert()` in `index.ts`

### Slack Integration (TODO)

1. Create Slack webhook URL
2. Set `ALERT_WEBHOOK_URL` to Slack webhook
3. Modify `sendWebhookAlert()` for Slack formatting

### Email Alerts (Alternative)

Use Supabase's built-in email service or Resend.com:

```typescript
await supabase.functions.invoke('send-email', {
  body: {
    to: 'alerts@yourcompany.com',
    subject: `Gate Alert: ${alert.gate_name}`,
    html: alert.message
  }
});
```

## Historical Alert Tracking

Alerts are logged to `cook_card_events` table with `event_type = 'gate_alert'`.

Query recent alerts:
```sql
SELECT
  event_data->>'gate_name' as gate,
  event_data->>'severity' as severity,
  event_data->>'message' as message,
  created_at
FROM cook_card_events
WHERE event_type = 'gate_alert'
ORDER BY created_at DESC
LIMIT 20;
```

## Dashboard Integration

Use with Grafana or Metabase:

1. Create Postgres data source pointing to Supabase DB
2. Query `gates_dashboard` view for current status
3. Query `gate_streak_tracker` for 14-day trend
4. Set up alerts when `gate_status = 'FAIL'`

## Development

Test locally:
```bash
npx supabase functions serve gate-monitor
```

Invoke locally:
```bash
curl -X POST http://localhost:54321/functions/v1/gate-monitor \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}"
```
