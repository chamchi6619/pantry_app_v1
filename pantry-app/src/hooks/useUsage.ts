/**
 * Usage Hook - Check scan/import limits and trigger native paywall
 *
 * Usage:
 *   const { checkCanScan, checkCanImport, usage, refreshUsage } = useUsage();
 *
 *   // Before scanning:
 *   const allowed = await checkCanScan(); // returns false if limit reached
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { presentPaywallIfNeeded, PAYWALL_RESULT } from '../services/purchaseService';

export interface UsageInfo {
  tier: string;
  scan_count: number;
  scan_limit: number;
  import_count: number;
  import_limit: number;
  scans_remaining: number;
  imports_remaining: number;
}

const DEFAULT_USAGE: UsageInfo = {
  tier: 'free',
  scan_count: 0,
  scan_limit: 5,
  import_count: 0,
  import_limit: 3,
  scans_remaining: 5,
  imports_remaining: 3,
};

export function useUsage() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<UsageInfo>(DEFAULT_USAGE);
  const usageRef = useRef<UsageInfo>(DEFAULT_USAGE);

  // Keep ref in sync with state so we always have last-known good value
  useEffect(() => {
    usageRef.current = usage;
  }, [usage]);

  /**
   * Fetch fresh usage data from the server.
   * Returns the fresh data directly (avoids stale closure issues).
   * On failure, returns last-known state (not DEFAULT_USAGE, which could
   * misclassify paid users during outages).
   */
  const refreshUsage = useCallback(async (): Promise<UsageInfo> => {
    if (!user?.id) return usageRef.current;

    try {
      const { data, error } = await supabase.rpc('get_my_usage_info');

      if (!error && data) {
        const fresh = data as UsageInfo;
        setUsage(fresh);
        return fresh;
      }
    } catch {
      // Silent - return last-known state below
    }

    return usageRef.current;
  }, [user?.id]);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  /**
   * Check if user can perform a scan. Shows paywall for free users at limit,
   * or "limit reached" alert for premium users at cap.
   * Returns true if allowed, false if blocked.
   */
  const checkCanScan = useCallback(async (): Promise<boolean> => {
    const fresh = await refreshUsage();

    if (fresh.scans_remaining > 0) return true;

    if (fresh.tier === 'free') {
      const result = await presentPaywallIfNeeded();
      if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
        await refreshUsage();
        return true;
      }
      return false;
    }

    // Premium user at cap
    Alert.alert(
      'Limit Reached',
      `You've used all ${fresh.scan_limit} scans this month. Your limit resets next month.`
    );
    return false;
  }, [refreshUsage]);

  /**
   * Check if user can perform a recipe import. Shows paywall for free users
   * at limit, or "limit reached" alert for premium users at cap.
   * Returns true if allowed, false if blocked.
   */
  const checkCanImport = useCallback(async (): Promise<boolean> => {
    const fresh = await refreshUsage();

    if (fresh.imports_remaining > 0) return true;

    if (fresh.tier === 'free') {
      const result = await presentPaywallIfNeeded();
      if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
        await refreshUsage();
        return true;
      }
      return false;
    }

    // Premium user at cap
    Alert.alert(
      'Limit Reached',
      `You've used all ${fresh.import_limit} recipe imports this month. Your limit resets next month.`
    );
    return false;
  }, [refreshUsage]);

  return {
    usage,
    checkCanScan,
    checkCanImport,
    refreshUsage,
  };
}
