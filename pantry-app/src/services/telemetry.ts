import { supabase } from '../lib/supabase';

/**
 * Telemetry Service - Track Cook Card ingress funnel events
 * PRD Reference: COOKCARD_PRD_V1.md Task 2.2 - Telemetry implementation
 *
 * Events tracked:
 * - ingress_opened: User opened share extension or paste screen
 * - url_pasted: User pasted URL (paste flow only)
 * - extraction_started: Extraction API call initiated
 * - extraction_completed: Extraction succeeded
 * - extraction_failed: Extraction failed (validation, parsing, API error)
 * - cook_card_saved: User saved Cook Card to their collection
 *
 * Used for:
 * - Gate 4 economics analysis (cost per save, LLM call frequency)
 * - Conversion funnel optimization (where users drop off)
 * - A/B testing (compare ingress methods: share vs paste vs browser extension)
 * - Platform performance (YouTube vs Instagram vs TikTok extraction quality)
 */

export type IngressEventType =
  | 'ingress_opened'
  | 'url_pasted'
  | 'extraction_started'
  | 'extraction_completed'
  | 'extraction_failed'
  | 'cook_card_saved';

export type IngressMethod =
  | 'share_extension_ios'
  | 'share_extension_android'
  | 'paste_link'
  | 'browser_extension';

export type Platform = 'youtube' | 'instagram' | 'tiktok' | 'unknown' | 'other';

export interface IngressEventPayload {
  sessionId: string;
  eventType: IngressEventType;
  ingressMethod: IngressMethod;
  platform?: Platform;
  recipeUrl?: string;
  normalizedUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

/**
 * Log an ingress event to cook_card_ingress_events table
 * Fails silently to prevent telemetry from breaking user experience
 */
export async function logIngressEvent(payload: IngressEventPayload): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.warn('Cannot log ingress event: user not authenticated');
      return;
    }

    const { error } = await supabase.from('cook_card_ingress_events').insert({
      user_id: user.id,
      session_id: payload.sessionId,
      event_type: payload.eventType,
      ingress_method: payload.ingressMethod,
      platform: payload.platform || null,
      recipe_url: payload.recipeUrl || null,
      normalized_url: payload.normalizedUrl || null,
      error_code: payload.errorCode || null,
      error_message: payload.errorMessage || null,
      metadata: payload.metadata || null,
    });

    if (error) {
      console.error('Failed to log ingress event:', error);
      // Don't throw - telemetry failures should not break UX
    } else {
      console.log(`[Telemetry] ${payload.eventType}:`, payload);
    }
  } catch (err) {
    console.error('Unexpected error logging ingress event:', err);
    // Don't throw - telemetry failures should not break UX
  }
}

/**
 * Query conversion funnel metrics
 * Used for analytics dashboards and Gate 4 monitoring
 */
export async function getConversionFunnel(
  startDate: Date,
  endDate: Date
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('ingress_conversion_funnel')
      .select('*')
      .gte('day', startDate.toISOString())
      .lte('day', endDate.toISOString())
      .order('day', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Failed to fetch conversion funnel:', err);
    return [];
  }
}

/**
 * Get ingress events for a specific session
 * Used for debugging user flows and analyzing drop-off points
 */
export async function getSessionEvents(sessionId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('cook_card_ingress_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Failed to fetch session events:', err);
    return [];
  }
}

/**
 * Helper: Generate unique session ID for grouping events
 * Format: session_<timestamp>_<random>
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
