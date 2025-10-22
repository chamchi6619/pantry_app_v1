/**
 * Gate Monitor Edge Function
 *
 * Purpose: Monitors 4 ship gates and sends alerts when gates fail
 * Trigger: Supabase Cron (hourly) or manual API call
 * PRD Reference: COOKCARD_PRD_V1.md Section 9 (Ship Gates)
 *
 * Ship Gates:
 * - Gate 1: Quality (avg_taps ≤2.0 AND p95_confidence ≥0.80)
 * - Gate 2: Conversion (save→cook ≥20%)
 * - Gate 3: Compliance (0 violations)
 * - Gate 4: Economics (<$0.015/save AND <0.4 LLM calls/URL)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface GateStatus {
  gate_name: string;
  gate_status: string;
  metrics: {
    [key: string]: any;
  };
}

interface Alert {
  gate_name: string;
  status: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  metrics: any;
  timestamp: string;
  message: string;
}

serve(async (req) => {
  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query gates dashboard
    const { data: gates, error } = await supabase
      .from("gates_dashboard")
      .select("*");

    if (error) {
      console.error("Error fetching gates:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch gate status" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Process gate statuses
    const alerts: Alert[] = [];
    const gateResults: GateStatus[] = gates || [];

    for (const gate of gateResults) {
      if (gate.gate_status === "FAIL") {
        const severity = gate.gate_name.includes("Gate 1") || gate.gate_name.includes("Gate 4")
          ? "CRITICAL"
          : "WARNING";

        const alert: Alert = {
          gate_name: gate.gate_name,
          status: gate.gate_status,
          severity,
          metrics: gate.metrics,
          timestamp: new Date().toISOString(),
          message: generateAlertMessage(gate),
        };

        alerts.push(alert);
      }
    }

    // Query 14-day streak tracker for go/no-go status
    const { data: streakData, error: streakError } = await supabase
      .from("gate_streak_tracker")
      .select("*")
      .limit(1);

    const goNoGoStatus = streakData?.[0]?.go_no_go_status || "NO-GO - Continue beta at 100 users";
    const consecutiveDays = streakData?.[0]?.consecutive_pass_days || 0;

    // Send alerts if any gates are failing
    if (alerts.length > 0) {
      console.log(`⚠️  ${alerts.length} gate(s) failing:`, alerts);

      // TODO: Integrate with PagerDuty, Slack, or email service
      // For now, log to console and store in a monitoring table
      await logAlertsToDatabase(supabase, alerts);

      // Optional: Send webhook to external service
      // await sendWebhookAlert(alerts);
    } else {
      console.log("✅ All gates passing");
    }

    // Response payload
    const response = {
      timestamp: new Date().toISOString(),
      gates: gateResults,
      alerts: alerts,
      go_no_go_status: goNoGoStatus,
      consecutive_pass_days: consecutiveDays,
      summary: {
        total_gates: gateResults.length,
        passing: gateResults.filter((g) => g.gate_status === "PASS").length,
        failing: gateResults.filter((g) => g.gate_status === "FAIL").length,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Gate monitor error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

/**
 * Generate human-readable alert message for each gate
 */
function generateAlertMessage(gate: GateStatus): string {
  const metrics = gate.metrics;

  switch (gate.gate_name) {
    case "Gate 1: Quality":
      return `Quality gate FAILING: avg_confirm_taps=${metrics.avg_confirm_taps?.toFixed(2)} (need ≤2.0), p95_confidence=${metrics.p95_confidence?.toFixed(2)} (need ≥0.80). Users are struggling to confirm ingredients.`;

    case "Gate 2: Conversion":
      return `Conversion gate FAILING: ${metrics.conversion_pct?.toFixed(1)}% save→cook (need ≥20%). ${metrics.users_saved} users saved, ${metrics.users_cooked} cooked. Low engagement.`;

    case "Gate 3: Compliance":
      return `Compliance gate FAILING: ${metrics.violation_count} violations detected. MUST be 0. Violations: ${JSON.stringify(metrics.recent_violations)}. Immediate action required.`;

    case "Gate 4: Economics":
      return `Economics gate FAILING: $${metrics.avg_cost_per_save?.toFixed(4)}/save (need <$0.015), ${metrics.llm_calls_per_save?.toFixed(2)} LLM calls/save (need <0.4). Cost control issue.`;

    default:
      return `Gate ${gate.gate_name} is FAILING. Check metrics.`;
  }
}

/**
 * Log alerts to database for historical tracking
 */
async function logAlertsToDatabase(supabase: any, alerts: Alert[]) {
  // Create a simple alerts log table if it doesn't exist
  // For now, we'll use cook_card_events with event_type = 'gate_alert'

  for (const alert of alerts) {
    await supabase.from("cook_card_events").insert({
      event_type: "gate_alert",
      event_data: {
        gate_name: alert.gate_name,
        status: alert.status,
        severity: alert.severity,
        metrics: alert.metrics,
        message: alert.message,
      },
      created_at: alert.timestamp,
    });
  }
}

/**
 * Send webhook alert to external service (PagerDuty, Slack, etc.)
 * Uncomment and configure when ready to integrate
 */
// async function sendWebhookAlert(alerts: Alert[]) {
//   const webhookUrl = Deno.env.get("ALERT_WEBHOOK_URL");
//   if (!webhookUrl) {
//     console.log("No webhook URL configured, skipping external alert");
//     return;
//   }
//
//   const criticalAlerts = alerts.filter((a) => a.severity === "CRITICAL");
//
//   if (criticalAlerts.length > 0) {
//     await fetch(webhookUrl, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         text: `🚨 ${criticalAlerts.length} CRITICAL gate(s) failing`,
//         alerts: criticalAlerts,
//       }),
//     });
//   }
// }
