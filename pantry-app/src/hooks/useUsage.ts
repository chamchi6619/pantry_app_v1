/**
 * Usage Hook - Check scan/import limits and trigger native paywall
 *
 * Usage:
 *   const { checkCanScan, checkCanImport, usage, refreshUsage } = useUsage();
 *
 *   // Before scanning:
 *   const allowed = await checkCanScan(); // returns false if limit reached
 */

import { useState, useEffect, useCallback } from 'react';
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

  const refreshUsage = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase.rpc('get_usage_info', {
        p_user_id: user.id,
      });

      if (!error && data) {
        setUsage(data as UsageInfo);
      }
    } catch {
      // Silent - don't block UX on usage fetch failure
    }
  }, [user?.id]);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  const checkCanScan = useCallback(async (): Promise<boolean> => {
    await refreshUsage();
    if (usage.scans_remaining <= 0 && usage.tier === 'free') {
      const result = await presentPaywallIfNeeded();
      if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
        await refreshUsage();
        return true;
      }
      return false;
    }
    return true;
  }, [refreshUsage, usage]);

  const checkCanImport = useCallback(async (): Promise<boolean> => {
    await refreshUsage();
    if (usage.imports_remaining <= 0 && usage.tier === 'free') {
      const result = await presentPaywallIfNeeded();
      if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
        await refreshUsage();
        return true;
      }
      return false;
    }
    return true;
  }, [refreshUsage, usage]);

  return {
    usage,
    checkCanScan,
    checkCanImport,
    refreshUsage,
  };
}
