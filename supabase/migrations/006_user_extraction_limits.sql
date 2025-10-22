-- Migration: User Extraction Limits (Budget Caps)
-- Date: 2025-10-08
-- Purpose: Track LLM extraction usage per user, enforce tier limits

-- User extraction limits table
CREATE TABLE IF NOT EXISTS user_extraction_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'pro_plus')),
  monthly_limit INTEGER NOT NULL DEFAULT 5,
  current_month_count INTEGER NOT NULL DEFAULT 0,
  hourly_limit INTEGER NOT NULL DEFAULT 50, -- Rate limiting: max 50/hour
  current_hour_count INTEGER NOT NULL DEFAULT 0,
  month_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  hour_start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reset_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_extraction_limits ENABLE ROW LEVEL SECURITY;

-- RLS policies (users can only read/update their own limits)
CREATE POLICY "Users can view own extraction limits"
  ON user_extraction_limits
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own extraction limits"
  ON user_extraction_limits
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can insert/update (for edge functions)
CREATE POLICY "Service role can manage extraction limits"
  ON user_extraction_limits
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to reset monthly count on new month
CREATE OR REPLACE FUNCTION reset_monthly_extraction_count()
RETURNS TRIGGER AS $$
BEGIN
  -- If current month has changed, reset count
  IF NEW.month_start_date < CURRENT_DATE - INTERVAL '1 month' THEN
    NEW.current_month_count := 0;
    NEW.month_start_date := CURRENT_DATE;
    NEW.last_reset_at := NOW();
  END IF;

  -- If current hour has changed, reset hourly count
  IF NEW.hour_start_time < NOW() - INTERVAL '1 hour' THEN
    NEW.current_hour_count := 0;
    NEW.hour_start_time := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-reset counts on read
CREATE TRIGGER reset_extraction_counts_on_update
  BEFORE UPDATE ON user_extraction_limits
  FOR EACH ROW
  EXECUTE FUNCTION reset_monthly_extraction_count();

-- Tier limits reference (for documentation)
COMMENT ON TABLE user_extraction_limits IS 'Tracks LLM extraction usage per user. Tier limits: free=5/mo, pro=1000/mo, pro_plus=5000/mo. Rate limit: 50/hour for all tiers.';

-- Index for fast lookups
CREATE INDEX idx_user_extraction_limits_user_id ON user_extraction_limits(user_id);
CREATE INDEX idx_user_extraction_limits_tier ON user_extraction_limits(tier);

-- Function to increment extraction counts (called from edge functions)
CREATE OR REPLACE FUNCTION increment_extraction_counts(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE user_extraction_limits
  SET
    current_month_count = current_month_count + 1,
    current_hour_count = current_hour_count + 1,
    updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
