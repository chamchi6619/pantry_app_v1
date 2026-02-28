/**
 * Budget Check Utilities
 *
 * Purpose: Enforce operation limits per user tier
 *
 * Tiers:
 * - Free: 5 scans/month, 3 imports/month
 * - Premium: 50 scans/month, 30 imports/month
 *
 * Rate limiting: 50 calls/hour (all tiers)
 */

export type OperationType = 'scan' | 'import';

const TIER_LIMITS = {
  free: { scans: 5, imports: 3 },
  premium: { scans: 50, imports: 30 },
  lifetime: { scans: 50, imports: 30 },
  pro: { scans: 50, imports: 30 },
  pro_plus: { scans: 50, imports: 30 },
};

const HOURLY_RATE_LIMIT = 50;

/**
 * Budget check result
 */
export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  current_count: number;
  monthly_limit: number;
  hourly_count?: number;
  tier: string;
  operation?: OperationType;
}

/**
 * Check if user is within extraction budget for a specific operation type
 */
export async function checkExtractionBudget(
  supabase: any,
  userId: string,
  operation: OperationType = 'scan'
): Promise<BudgetCheckResult> {
  try {
    // Get or create user limits
    let { data: limits, error } = await supabase
      .from('user_extraction_limits')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Create default limits if not exists
    if (error || !limits) {
      console.log(`📝 Creating default limits for user ${userId}`);
      const tierLimits = TIER_LIMITS.free;
      const { data: newLimits, error: insertError } = await supabase
        .from('user_extraction_limits')
        .insert({
          user_id: userId,
          tier: 'free',
          monthly_limit: tierLimits.scans,
          current_month_count: 0,
          scan_month_count: 0,
          import_month_count: 0,
          scan_monthly_limit: tierLimits.scans,
          import_monthly_limit: tierLimits.imports,
          hourly_limit: HOURLY_RATE_LIMIT,
          current_hour_count: 0,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Failed to create user limits:', insertError);
        throw new Error('Failed to initialize budget limits');
      }

      limits = newLimits;
    }

    // Determine which counter and limit to check
    const currentCount = operation === 'import'
      ? (limits.import_month_count ?? 0)
      : (limits.scan_month_count ?? 0);
    const monthlyLimit = operation === 'import'
      ? (limits.import_monthly_limit ?? TIER_LIMITS.free.imports)
      : (limits.scan_monthly_limit ?? TIER_LIMITS.free.scans);

    // Check operation-specific limit
    if (currentCount >= monthlyLimit) {
      const opLabel = operation === 'import' ? 'imports' : 'scans';
      return {
        allowed: false,
        reason: `Monthly ${opLabel} limit reached (${currentCount}/${monthlyLimit}). Upgrade to Premium for more.`,
        current_count: currentCount,
        monthly_limit: monthlyLimit,
        tier: limits.tier,
        operation,
      };
    }

    // Check hourly rate limit
    if ((limits.current_hour_count ?? 0) >= (limits.hourly_limit ?? HOURLY_RATE_LIMIT)) {
      return {
        allowed: false,
        reason: `Hourly rate limit reached. Please try again in a few minutes.`,
        current_count: currentCount,
        monthly_limit: monthlyLimit,
        hourly_count: limits.current_hour_count,
        tier: limits.tier,
        operation,
      };
    }

    return {
      allowed: true,
      current_count: currentCount,
      monthly_limit: monthlyLimit,
      hourly_count: limits.current_hour_count,
      tier: limits.tier,
      operation,
    };
  } catch (err) {
    console.error('Budget check error:', err);
    throw err;
  }
}

/**
 * Increment extraction count for a specific operation type
 */
export async function incrementExtractionCount(
  supabase: any,
  userId: string,
  operation: OperationType = 'scan'
): Promise<void> {
  try {
    const { error } = await supabase.rpc('increment_extraction_counts', {
      p_user_id: userId,
      p_operation: operation,
    });

    if (error) {
      console.error('RPC increment failed, using fallback:', error);
      const { data: limits } = await supabase
        .from('user_extraction_limits')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (limits) {
        const update: any = {
          current_month_count: (limits.current_month_count ?? 0) + 1,
          current_hour_count: (limits.current_hour_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        };
        if (operation === 'import') {
          update.import_month_count = (limits.import_month_count ?? 0) + 1;
        } else {
          update.scan_month_count = (limits.scan_month_count ?? 0) + 1;
        }

        await supabase
          .from('user_extraction_limits')
          .update(update)
          .eq('user_id', userId);
      }
    }

    console.log(`📊 Incremented ${operation} count for user ${userId}`);
  } catch (err) {
    console.error('Failed to increment extraction count:', err);
  }
}

/**
 * Get user tier info (for display in UI)
 */
export async function getUserTierInfo(supabase: any, userId: string) {
  const { data: limits } = await supabase
    .from('user_extraction_limits')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!limits) {
    return {
      tier: 'free',
      scan_count: 0,
      scan_limit: TIER_LIMITS.free.scans,
      import_count: 0,
      import_limit: TIER_LIMITS.free.imports,
      scans_remaining: TIER_LIMITS.free.scans,
      imports_remaining: TIER_LIMITS.free.imports,
    };
  }

  return {
    tier: limits.tier,
    scan_count: limits.scan_month_count ?? 0,
    scan_limit: limits.scan_monthly_limit ?? TIER_LIMITS.free.scans,
    import_count: limits.import_month_count ?? 0,
    import_limit: limits.import_monthly_limit ?? TIER_LIMITS.free.imports,
    scans_remaining: Math.max(0, (limits.scan_monthly_limit ?? 5) - (limits.scan_month_count ?? 0)),
    imports_remaining: Math.max(0, (limits.import_monthly_limit ?? 3) - (limits.import_month_count ?? 0)),
  };
}

/**
 * Upgrade user tier
 */
export async function upgradeUserTier(
  supabase: any,
  userId: string,
  newTier: 'premium' | 'lifetime' | 'pro' | 'pro_plus'
): Promise<void> {
  const tierLimits = TIER_LIMITS[newTier];

  await supabase
    .from('user_extraction_limits')
    .upsert({
      user_id: userId,
      tier: newTier,
      monthly_limit: tierLimits.scans,
      scan_monthly_limit: tierLimits.scans,
      import_monthly_limit: tierLimits.imports,
      updated_at: new Date().toISOString(),
    });

  console.log(`⬆️  Upgraded user ${userId} to ${newTier} (scans: ${tierLimits.scans}/mo, imports: ${tierLimits.imports}/mo)`);
}
