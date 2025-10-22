-- Add xiaohongshu to platform check constraint
-- This allows the telemetry system to accept xiaohongshu platform events

-- Drop existing constraint
ALTER TABLE cook_card_ingress_events
DROP CONSTRAINT IF EXISTS cook_card_ingress_events_platform_check;

-- Add new constraint with xiaohongshu included
ALTER TABLE cook_card_ingress_events
ADD CONSTRAINT cook_card_ingress_events_platform_check
CHECK (platform IN ('youtube', 'instagram', 'tiktok', 'xiaohongshu', 'facebook', 'unknown'));
