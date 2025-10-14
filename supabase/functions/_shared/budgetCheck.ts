/**
 * Budget Check Utilities
 *
 * Purpose: Enforce LLM extraction limits per user tier
 *
 * Tiers:
 * - Free: 5 LLM calls/month
 * - Pro: 1000 LLM calls/month
 * - Pro Plus: 5000 LLM calls/month
 *
 * Rate limiting: 50 LLM calls/hour (all tiers)
 */

/**
 * User tier limits
 */
const TIER_LIMITS = {
  free: 5,
  pro: 1000,
  pro_plus: 5000,
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
}

/**
 * Check if user is within extraction budget
 *
 * @param supabase - Supabase client
 * @param userId - User ID
 * @returns Budget check result
 */
export async function checkExtractionBudget(
  supabase: any,
  userId: string
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
      const { data: newLimits, error: insertError } = await supabase
        .from('user_extraction_limits')
        .insert({
          user_id: userId,
          tier: 'free',
          monthly_limit: TIER_LIMITS.free,
          current_month_count: 0,
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

    // Check monthly limit
    if (limits.current_month_count >= limits.monthly_limit) {
      return {
        allowed: false,
        reason: `Monthly limit reached (${limits.monthly_limit}/${limits.monthly_limit}). Upgrade to Pro for 1000/month.`,
        current_count: limits.current_month_count,
        monthly_limit: limits.monthly_limit,
        tier: limits.tier,
      };
    }

    // Check hourly rate limit
    if (limits.current_hour_count >= limits.hourly_limit) {
      return {
        allowed: false,
        reason: `Hourly rate limit reached (${limits.hourly_limit}/hour). Please try again in a few minutes.`,
        current_count: limits.current_month_count,
        monthly_limit: limits.monthly_limit,
        hourly_count: limits.current_hour_count,
        tier: limits.tier,
      };
    }

    // Budget OK
    return {
      allowed: true,
      current_count: limits.current_month_count,
      monthly_limit: limits.monthly_limit,
      hourly_count: limits.current_hour_count,
      tier: limits.tier,
    };
  } catch (err) {
    console.error('Budget check error:', err);
    throw err;
  }
}

/**
 * Increment extraction count (call after successful extraction)
 *
 * @param supabase - Supabase client
 * @param userId - User ID
 */
export async function incrementExtractionCount(
  supabase: any,
  userId: string
): Promise<void> {
  try {
    // Increment both monthly and hourly counts
    const { error } = await supabase.rpc('increment_extraction_counts', {
      p_user_id: userId,
    });

    if (error) {
      // Fallback: manual update
      const { data: limits } = await supabase
        .from('user_extraction_limits')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (limits) {
        await supabase
          .from('user_extraction_limits')
          .update({
            current_month_count: limits.current_month_count + 1,
            current_hour_count: limits.current_hour_count + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
      }
    }

    console.log(`📊 Incremented extraction count for user ${userId}`);
  } catch (err) {
    console.error('Failed to increment extraction count:', err);
    // Non-blocking: Continue even if increment fails
  }
}

/**
 * Get user tier info (for display in UI)
 *
 * @param supabase - Supabase client
 * @param userId - User ID
 * @returns Tier info
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
      monthly_limit: TIER_LIMITS.free,
      current_count: 0,
      remaining: TIER_LIMITS.free,
      percentage_used: 0,
    };
  }

  const remaining = Math.max(0, limits.monthly_limit - limits.current_month_count);
  const percentageUsed = Math.min(
    100,
    Math.round((limits.current_month_count / limits.monthly_limit) * 100)
  );

  return {
    tier: limits.tier,
    monthly_limit: limits.monthly_limit,
    current_count: limits.current_month_count,
    remaining,
    percentage_used: percentageUsed,
    hourly_count: limits.current_hour_count,
    hourly_limit: limits.hourly_limit,
  };
}

/**
 * Upgrade user tier (admin function)
 *
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param newTier - New tier ('pro' or 'pro_plus')
 */
export async function upgradeUserTier(
  supabase: any,
  userId: string,
  newTier: 'pro' | 'pro_plus'
): Promise<void> {
  const newLimit = TIER_LIMITS[newTier];

  await supabase
    .from('user_extraction_limits')
    .upsert({
      user_id: userId,
      tier: newTier,
      monthly_limit: newLimit,
      updated_at: new Date().toISOString(),
    });

  console.log(`⬆️  Upgraded user ${userId} to ${newTier} (limit: ${newLimit}/mo)`);
}
