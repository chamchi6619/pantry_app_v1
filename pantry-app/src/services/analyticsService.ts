/**
 * Analytics Service - Track user events for product decisions
 *
 * Design:
 * - Fail silently (never break UX)
 * - Batch events (queue + flush every 30s or on app background)
 * - Session-based (new session ID on each app foreground)
 * - Includes app_version and platform automatically
 */

import { AppState, AppStateStatus, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import Constants from 'expo-constants';

// --- Types ---

type AnalyticsEvent = {
  event_name: string;
  properties: Record<string, any>;
  created_at: string;
};

// --- Module state ---

let sessionId = generateSessionId();
let eventQueue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const PLATFORM = Platform.OS; // 'ios' | 'android'
const FLUSH_INTERVAL_MS = 30_000;
const MAX_BATCH_SIZE = 50;

// --- Core API ---

/**
 * Track a single analytics event.
 * Queued and flushed in batches. Never throws.
 */
export function trackEvent(eventName: string, properties: Record<string, any> = {}): void {
  try {
    eventQueue.push({
      event_name: eventName,
      properties,
      created_at: new Date().toISOString(),
    });

    // Auto-flush if queue gets large
    if (eventQueue.length >= MAX_BATCH_SIZE) {
      flush();
    }
  } catch {
    // Silent - analytics must never break UX
  }
}

/**
 * Initialize analytics: start flush timer + listen for app state changes.
 * Call once at app startup.
 */
export function initAnalytics(): void {
  try {
    // Start periodic flush
    if (!flushTimer) {
      flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
    }

    // Listen for app state changes
    if (!appStateSubscription) {
      appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
    }
  } catch {
    // Silent
  }
}

/**
 * Flush queued events to Supabase. Safe to call anytime.
 */
export async function flush(): Promise<void> {
  if (eventQueue.length === 0) return;

  const batch = eventQueue.splice(0, MAX_BATCH_SIZE);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // No auth - put events back (they'll be flushed after login)
      eventQueue.unshift(...batch);
      return;
    }

    const rows = batch.map((e) => ({
      user_id: user.id,
      event_name: e.event_name,
      session_id: sessionId,
      properties: e.properties,
      app_version: APP_VERSION,
      platform: PLATFORM,
      created_at: e.created_at,
    }));

    const { error } = await supabase.from('analytics_events').insert(rows);
    if (error) {
      console.warn('[Analytics] flush error:', error.message);
      // Put events back for retry (cap at 200 to prevent unbounded growth)
      if (eventQueue.length < 200) {
        eventQueue.unshift(...batch);
      }
    }
  } catch {
    // Put events back for retry
    if (eventQueue.length < 200) {
      eventQueue.unshift(...batch);
    }
  }
}

/**
 * Get current session ID (useful for correlating events).
 */
export function getSessionId(): string {
  return sessionId;
}

// --- Internal ---

function handleAppStateChange(nextState: AppStateStatus): void {
  if (nextState === 'active') {
    // New foreground = new session
    sessionId = generateSessionId();
    trackEvent('app_opened');
  } else if (nextState === 'background') {
    // Flush before backgrounding
    flush();
  }
}

function generateSessionId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
