-- Rate Limiting Tables and Functions
-- Purpose: Postgres-based rate limiting for extraction requests
-- No Redis needed - uses Postgres atomic operations

-- ============================================================
-- TABLE: user_quotas
-- ============================================================
-- Tracks monthly extraction quotas per user
CREATE TABLE IF NOT EXISTS user_quotas (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'pro_plus')),
  extractions_this_month INTEGER DEFAULT 0 CHECK (extractions_this_month >= 0),
  extraction_cost_cents INTEGER DEFAULT 0 CHECK (extraction_cost_cents >= 0),
  month_started_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quota lookups
CREATE INDEX IF NOT EXISTS idx_user_quotas_lookup ON user_quotas(user_id, tier);

-- ============================================================
-- TABLE: rate_limit_counters
-- ============================================================
-- Tracks rate limit counters with automatic expiration
-- Types: 'hourly', 'daily_l4_user', 'daily_l4_global'
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  counter_type TEXT NOT NULL CHECK (counter_type IN ('hourly', 'daily_l4_user', 'daily_l4_global')),
  window_key TEXT NOT NULL, -- '2025-10-10T14' for hourly, '2025-10-10' for daily
  count REAL DEFAULT 0 CHECK (count >= 0), -- REAL allows decimals for video minutes
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, counter_type, window_key)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup
  ON rate_limit_counters(user_id, counter_type, window_key, expires_at)
  WHERE expires_at > NOW();

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_rate_limit_expires
  ON rate_limit_counters(expires_at);

-- ============================================================
-- FUNCTION: increment_rate_limit
-- ============================================================
-- Atomically increment a rate limit counter
-- Returns current count after increment
CREATE OR REPLACE FUNCTION increment_rate_limit(
  p_user_id UUID,
  p_counter_type TEXT,
  p_window_key TEXT,
  p_increment REAL DEFAULT 1,
  p_ttl_seconds INTEGER DEFAULT 3600
)
RETURNS REAL AS $$
DECLARE
  v_current_count REAL;
BEGIN
  -- Upsert counter with atomic increment
  INSERT INTO rate_limit_counters (
    user_id,
    counter_type,
    window_key,
    count,
    expires_at
  )
  VALUES (
    p_user_id,
    p_counter_type,
    p_window_key,
    p_increment,
    NOW() + (p_ttl_seconds || ' seconds')::INTERVAL
  )
  ON CONFLICT (user_id, counter_type, window_key)
  DO UPDATE SET
    count = rate_limit_counters.count + p_increment,
    expires_at = CASE
      -- Reset counter if expired
      WHEN rate_limit_counters.expires_at < NOW() THEN
        NOW() + (p_ttl_seconds || ' seconds')::INTERVAL
      -- Keep existing expiration
      ELSE
        rate_limit_counters.expires_at
    END
  RETURNING count INTO v_current_count;

  RETURN v_current_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: get_rate_limit_count
-- ============================================================
-- Get current count for a rate limit counter (without incrementing)
CREATE OR REPLACE FUNCTION get_rate_limit_count(
  p_user_id UUID,
  p_counter_type TEXT,
  p_window_key TEXT
)
RETURNS REAL AS $$
DECLARE
  v_count REAL;
BEGIN
  SELECT count INTO v_count
  FROM rate_limit_counters
  WHERE user_id = p_user_id
    AND counter_type = p_counter_type
    AND window_key = p_window_key
    AND expires_at > NOW();

  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: reset_monthly_quotas
-- ============================================================
-- Reset all users' monthly quotas (run on 1st of each month)
CREATE OR REPLACE FUNCTION reset_monthly_quotas()
RETURNS void AS $$
BEGIN
  UPDATE user_quotas
  SET
    extractions_this_month = 0,
    extraction_cost_cents = 0,
    month_started_at = NOW(),
    updated_at = NOW();

  RAISE NOTICE 'Reset monthly quotas for all users';
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: cleanup_expired_rate_limits
-- ============================================================
-- Delete expired rate limit counters (run daily)
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM rate_limit_counters
  WHERE expires_at < NOW();

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RAISE NOTICE 'Cleaned up % expired rate limit counters', v_deleted_count;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: increment_monthly_quota
-- ============================================================
-- Increment user's monthly extraction count and cost
CREATE OR REPLACE FUNCTION increment_monthly_quota(
  p_user_id UUID,
  p_cost_cents INTEGER DEFAULT 0
)
RETURNS void AS $$
BEGIN
  INSERT INTO user_quotas (user_id, extractions_this_month, extraction_cost_cents)
  VALUES (p_user_id, 1, p_cost_cents)
  ON CONFLICT (user_id)
  DO UPDATE SET
    extractions_this_month = user_quotas.extractions_this_month + 1,
    extraction_cost_cents = user_quotas.extraction_cost_cents + p_cost_cents,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- SEED DATA
-- ============================================================
-- Create special UUID for global counters
DO $$
BEGIN
  -- Insert special user for global rate limits
  -- UUID: 00000000-0000-0000-0000-000000000000
  IF NOT EXISTS (
    SELECT 1 FROM user_quotas
    WHERE user_id = '00000000-0000-0000-0000-000000000000'
  ) THEN
    INSERT INTO user_quotas (user_id, tier, extractions_this_month)
    VALUES ('00000000-0000-0000-0000-000000000000', 'free', 0);
  END IF;
END $$;

-- ============================================================
-- POLICIES (RLS)
-- ============================================================
-- Enable RLS
ALTER TABLE user_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;

-- Users can read their own quotas
CREATE POLICY user_quotas_select_own ON user_quotas
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything
CREATE POLICY user_quotas_service_all ON user_quotas
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY rate_limit_counters_service_all ON rate_limit_counters
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- SCHEDULED JOBS (pg_cron if available, otherwise manual)
-- ============================================================
-- Note: Supabase doesn't have pg_cron by default
-- You'll need to call these manually or via a cron job

-- Daily cleanup at 3am UTC
-- SELECT cron.schedule('cleanup-rate-limits', '0 3 * * *', 'SELECT cleanup_expired_rate_limits()');

-- Monthly reset on 1st at midnight UTC
-- SELECT cron.schedule('reset-monthly-quotas', '0 0 1 * *', 'SELECT reset_monthly_quotas()');

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON TABLE user_quotas IS 'Monthly extraction quotas per user tier';
COMMENT ON TABLE rate_limit_counters IS 'Rate limit counters with automatic expiration';
COMMENT ON FUNCTION increment_rate_limit IS 'Atomically increment a rate limit counter';
COMMENT ON FUNCTION get_rate_limit_count IS 'Get current count without incrementing';
COMMENT ON FUNCTION reset_monthly_quotas IS 'Reset all monthly quotas (run on 1st of month)';
COMMENT ON FUNCTION cleanup_expired_rate_limits IS 'Delete expired counters (run daily)';
COMMENT ON FUNCTION increment_monthly_quota IS 'Increment user monthly extraction count and cost';
