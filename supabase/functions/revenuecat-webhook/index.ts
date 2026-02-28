/**
 * RevenueCat Webhook Handler
 *
 * Handles subscription lifecycle events:
 * - INITIAL_PURCHASE: User subscribes -> upgrade to premium
 * - RENEWAL: Subscription renews -> ensure premium
 * - NON_RENEWING_PURCHASE: Lifetime purchase -> upgrade to lifetime
 * - CANCELLATION: User cancels (still active until period end)
 * - EXPIRATION: Subscription expired -> downgrade to free (unless lifetime)
 *
 * Security: Validates webhook authorization header
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// RevenueCat event types we handle
const UPGRADE_EVENTS = [
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
];

const LIFETIME_EVENTS = [
  "NON_RENEWING_PURCHASE",
];

const DOWNGRADE_EVENTS = [
  "EXPIRATION",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate webhook auth
    const authHeader = req.headers.get("Authorization");
    const webhookSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");

    if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      console.warn("Unauthorized webhook attempt");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const event = body.event;

    if (!event) {
      return new Response(JSON.stringify({ error: "Missing event" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventType: string = event.type;
    const appUserId: string = event.app_user_id;

    console.log(`[RevenueCat] ${eventType} for user ${appUserId}`);

    if (!appUserId) {
      console.warn("No app_user_id in event");
      return new Response(JSON.stringify({ ok: true, skipped: "no_user_id" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (LIFETIME_EVENTS.includes(eventType)) {
      // Lifetime purchase
      console.log(`[RevenueCat] Upgrading ${appUserId} to lifetime`);

      await supabase
        .from("user_extraction_limits")
        .upsert({
          user_id: appUserId,
          tier: "lifetime",
          monthly_limit: 50,
          scan_monthly_limit: 50,
          import_monthly_limit: 30,
          updated_at: new Date().toISOString(),
        });

      console.log(`[RevenueCat] User ${appUserId} upgraded to lifetime`);
    } else if (UPGRADE_EVENTS.includes(eventType)) {
      // Upgrade to premium
      console.log(`[RevenueCat] Upgrading ${appUserId} to premium`);

      await supabase
        .from("user_extraction_limits")
        .upsert({
          user_id: appUserId,
          tier: "premium",
          monthly_limit: 50,
          scan_monthly_limit: 50,
          import_monthly_limit: 30,
          updated_at: new Date().toISOString(),
        });

      console.log(`[RevenueCat] User ${appUserId} upgraded to premium`);
    } else if (DOWNGRADE_EVENTS.includes(eventType)) {
      // Check if user has lifetime — protect from downgrade
      const { data: currentLimits } = await supabase
        .from("user_extraction_limits")
        .select("tier")
        .eq("user_id", appUserId)
        .single();

      if (currentLimits?.tier === "lifetime") {
        console.log(`[RevenueCat] User ${appUserId} has lifetime — skipping downgrade`);
      } else {
        // Downgrade to free
        console.log(`[RevenueCat] Downgrading ${appUserId} to free`);

        await supabase
          .from("user_extraction_limits")
          .update({
            tier: "free",
            monthly_limit: 5,
            scan_monthly_limit: 5,
            import_monthly_limit: 3,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", appUserId);

        console.log(`[RevenueCat] User ${appUserId} downgraded to free`);
      }
    } else {
      console.log(`[RevenueCat] Unhandled event type: ${eventType}`);
    }

    return new Response(
      JSON.stringify({ ok: true, event_type: eventType }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[RevenueCat] Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
