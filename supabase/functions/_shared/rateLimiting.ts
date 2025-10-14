/**
 * Rate Limiting Utilities
 *
 * Purpose: Postgres-based rate limiting for extraction requests
 * - Monthly quotas (10/500/2000 per tier)
 * - Hourly rate limits (2/10/20 per tier)
 * - Daily L4 vision budgets (0/30/60 minutes per tier)
 * - Global L4 budget (400 minutes/day across all users)
 */

export interface UserQuota {
  user_id: string;
  tier: 'free' | 'pro' | 'pro_plus';
  extractions_this_month: number;
  extraction_cost_cents: number;
  month_started_at: string;
}

export interface RateLimitConfig {
  monthly_limit: number;
  hourly_limit: number;
  daily_l4_limit_minutes: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  free: {
    monthly_limit: 10,
    hourly_limit: 2,
    daily_l4_limit_minutes: 0, // No vision access on free tier
  },
  pro: {
    monthly_limit: 500,
    hourly_limit: 10,
    daily_l4_limit_minutes: 30,
  },
  pro_plus: {
    monthly_limit: 2000,
    hourly_limit: 20,
    daily_l4_limit_minutes: 60,
  },
};

// Global L4 budget (shared across all users)
export const GLOBAL_L4_DAILY_LIMIT_MINUTES = 400;

// Special UUID for global counters
export const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Check monthly quota
 *
 * @param supabase - Supabase client
 * @param user_id - User ID
 * @returns Quota check result
 */
export async function checkMonthlyQuota(
  supabase: any,
  user_id: string
): Promise<{
  allowed: boolean;
  quota: UserQuota | null;
  reason?: string;
}> {
  try {
    const { data: quota, error } = await supabase
      .from('user_quotas')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (error || !quota) {
      // No quota record - create default free tier
      const { data: newQuota, error: insertError } = await supabase
        .from('user_quotas')
        .insert({
          user_id,
          tier: 'free',
          extractions_this_month: 0,
          extraction_cost_cents: 0,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Failed to create user quota:', insertError);
        return {
          allowed: false,
          quota: null,
          reason: 'Failed to check quota',
        };
      }

      return {
        allowed: true,
        quota: newQuota,
      };
    }

    const limits = RATE_LIMITS[quota.tier];
    const allowed = quota.extractions_this_month < limits.monthly_limit;

    return {
      allowed,
      quota,
      reason: allowed ? undefined : `Monthly limit reached (${limits.monthly_limit} extractions)`,
    };
  } catch (err) {
    console.error('Monthly quota check error:', err);
    return {
      allowed: false,
      quota: null,
      reason: 'Quota check failed',
    };
  }
}

/**
 * Check hourly rate limit
 *
 * @param supabase - Supabase client
 * @param user_id - User ID
 * @param tier - User tier
 * @returns Rate limit check result
 */
export async function checkHourlyRateLimit(
  supabase: any,
  user_id: string,
  tier: string
): Promise<{
  allowed: boolean;
  current_count: number;
  limit: number;
  retry_after_seconds?: number;
}> {
  try {
    const currentHour = new Date().toISOString().slice(0, 13); // "2025-10-10T14"
    const limits = RATE_LIMITS[tier];

    // Increment counter atomically
    const { data, error } = await supabase.rpc('increment_rate_limit', {
      p_user_id: user_id,
      p_counter_type: 'hourly',
      p_window_key: currentHour,
      p_increment: 1,
      p_ttl_seconds: 3600, // 1 hour
    });

    if (error) {
      console.error('Hourly rate limit check error:', error);
      // Fail open (allow request) on error
      return {
        allowed: true,
        current_count: 0,
        limit: limits.hourly_limit,
      };
    }

    const currentCount = parseFloat(data || '0');
    const allowed = currentCount <= limits.hourly_limit;

    return {
      allowed,
      current_count: currentCount,
      limit: limits.hourly_limit,
      retry_after_seconds: allowed ? undefined : 3600,
    };
  } catch (err) {
    console.error('Hourly rate limit error:', err);
    // Fail open
    return {
      allowed: true,
      current_count: 0,
      limit: RATE_LIMITS[tier].hourly_limit,
    };
  }
}

/**
 * Check daily L4 budget (user-specific)
 *
 * @param supabase - Supabase client
 * @param user_id - User ID
 * @param tier - User tier
 * @param video_duration_minutes - Video duration in minutes
 * @returns Budget check result
 */
export async function checkUserL4Budget(
  supabase: any,
  user_id: string,
  tier: string,
  video_duration_minutes: number
): Promise<{
  allowed: boolean;
  current_usage: number;
  limit: number;
  would_exceed: boolean;
}> {
  try {
    const today = new Date().toISOString().slice(0, 10); // "2025-10-10"
    const limits = RATE_LIMITS[tier];

    // Get current usage (don't increment yet - just check)
    const { data, error } = await supabase.rpc('get_rate_limit_count', {
      p_user_id: user_id,
      p_counter_type: 'daily_l4_user',
      p_window_key: today,
    });

    if (error) {
      console.error('User L4 budget check error:', error);
      // Fail closed (deny video processing) on error
      return {
        allowed: false,
        current_usage: 0,
        limit: limits.daily_l4_limit_minutes,
        would_exceed: true,
      };
    }

    const currentUsage = parseFloat(data || '0');
    const wouldExceed = currentUsage + video_duration_minutes > limits.daily_l4_limit_minutes;

    return {
      allowed: !wouldExceed,
      current_usage: currentUsage,
      limit: limits.daily_l4_limit_minutes,
      would_exceed: wouldExceed,
    };
  } catch (err) {
    console.error('User L4 budget error:', err);
    // Fail closed
    return {
      allowed: false,
      current_usage: 0,
      limit: RATE_LIMITS[tier].daily_l4_limit_minutes,
      would_exceed: true,
    };
  }
}

/**
 * Check global L4 budget (across all users)
 *
 * @param supabase - Supabase client
 * @param video_duration_minutes - Video duration in minutes
 * @returns Budget check result
 */
export async function checkGlobalL4Budget(
  supabase: any,
  video_duration_minutes: number
): Promise<{
  allowed: boolean;
  current_usage: number;
  limit: number;
  would_exceed: boolean;
}> {
  try {
    const today = new Date().toISOString().slice(0, 10); // "2025-10-10"

    // Get current global usage
    const { data, error } = await supabase.rpc('get_rate_limit_count', {
      p_user_id: GLOBAL_USER_ID,
      p_counter_type: 'daily_l4_global',
      p_window_key: today,
    });

    if (error) {
      console.error('Global L4 budget check error:', error);
      // Fail closed
      return {
        allowed: false,
        current_usage: 0,
        limit: GLOBAL_L4_DAILY_LIMIT_MINUTES,
        would_exceed: true,
      };
    }

    const currentUsage = parseFloat(data || '0');
    const wouldExceed = currentUsage + video_duration_minutes > GLOBAL_L4_DAILY_LIMIT_MINUTES;

    return {
      allowed: !wouldExceed,
      current_usage: currentUsage,
      limit: GLOBAL_L4_DAILY_LIMIT_MINUTES,
      would_exceed: wouldExceed,
    };
  } catch (err) {
    console.error('Global L4 budget error:', err);
    // Fail closed
    return {
      allowed: false,
      current_usage: 0,
      limit: GLOBAL_L4_DAILY_LIMIT_MINUTES,
      would_exceed: true,
    };
  }
}

/**
 * Reserve L4 budget (both user and global)
 *
 * Call this AFTER successful L4 extraction to increment counters
 *
 * @param supabase - Supabase client
 * @param user_id - User ID
 * @param video_duration_minutes - Video duration in minutes
 */
export async function reserveL4Budget(
  supabase: any,
  user_id: string,
  video_duration_minutes: number
): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Increment user counter
    await supabase.rpc('increment_rate_limit', {
      p_user_id: user_id,
      p_counter_type: 'daily_l4_user',
      p_window_key: today,
      p_increment: video_duration_minutes,
      p_ttl_seconds: 86400, // 24 hours
    });

    // Increment global counter
    await supabase.rpc('increment_rate_limit', {
      p_user_id: GLOBAL_USER_ID,
      p_counter_type: 'daily_l4_global',
      p_window_key: today,
      p_increment: video_duration_minutes,
      p_ttl_seconds: 86400, // 24 hours
    });

    console.log(`💰 Reserved ${video_duration_minutes.toFixed(2)} minutes of L4 budget`);
  } catch (err) {
    console.error('Failed to reserve L4 budget:', err);
    // Non-blocking - log error but continue
  }
}

/**
 * Release L4 budget (refund after failure)
 *
 * Call this when L4 extraction fails to refund reserved budget
 *
 * @param supabase - Supabase client
 * @param user_id - User ID
 * @param video_duration_minutes - Video duration in minutes to refund
 */
export async function releaseL4Budget(
  supabase: any,
  user_id: string,
  video_duration_minutes: number
): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Decrement user counter (negative increment)
    await supabase.rpc('increment_rate_limit', {
      p_user_id: user_id,
      p_counter_type: 'daily_l4_user',
      p_window_key: today,
      p_increment: -video_duration_minutes,  // Negative to decrement
      p_ttl_seconds: 86400, // 24 hours
    });

    // Decrement global counter
    await supabase.rpc('increment_rate_limit', {
      p_user_id: GLOBAL_USER_ID,
      p_counter_type: 'daily_l4_global',
      p_window_key: today,
      p_increment: -video_duration_minutes,
      p_ttl_seconds: 86400, // 24 hours
    });

    console.log(`💰 Released ${video_duration_minutes.toFixed(2)} minutes of L4 budget (refund)`);
  } catch (err) {
    console.error('Failed to release L4 budget:', err);
    // Non-blocking - log error but continue
  }
}

/**
 * Increment monthly quota
 *
 * Call this AFTER successful extraction
 *
 * @param supabase - Supabase client
 * @param user_id - User ID
 * @param cost_cents - Extraction cost in cents
 */
export async function incrementMonthlyQuota(
  supabase: any,
  user_id: string,
  cost_cents: number
): Promise<void> {
  try {
    await supabase.rpc('increment_monthly_quota', {
      p_user_id: user_id,
      p_cost_cents: cost_cents,
    });

    console.log(`📊 Incremented monthly quota (cost: ${cost_cents} cents)`);
  } catch (err) {
    console.error('Failed to increment monthly quota:', err);
    // Non-blocking
  }
}
