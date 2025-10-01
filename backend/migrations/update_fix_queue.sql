-- Update Fix Queue table to support learning features

-- Add columns for tracking corrections
ALTER TABLE fix_queue ADD COLUMN IF NOT EXISTS corrected_name TEXT;
ALTER TABLE fix_queue ADD COLUMN IF NOT EXISTS corrected_qty REAL;
ALTER TABLE fix_queue ADD COLUMN IF NOT EXISTS corrected_unit TEXT;
ALTER TABLE fix_queue ADD COLUMN IF NOT EXISTS corrected_category TEXT;
ALTER TABLE fix_queue ADD COLUMN IF NOT EXISTS corrected_price REAL;

-- Add tracking columns
ALTER TABLE fix_queue ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE fix_queue ADD COLUMN IF NOT EXISTS correction_types TEXT[];
ALTER TABLE fix_queue ADD COLUMN IF NOT EXISTS price_diff REAL;
ALTER TABLE fix_queue ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE fix_queue ADD COLUMN IF NOT EXISTS merged_with TEXT;  -- ID of item merged with

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_fix_queue_resolved ON fix_queue(resolved, resolved_at);
CREATE INDEX IF NOT EXISTS idx_fix_queue_household ON fix_queue(household_id) WHERE household_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fix_queue_merchant ON fix_queue(merchant) WHERE merchant IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fix_queue_raw_text ON fix_queue(raw_text);

-- Create correction metrics table for analytics
CREATE TABLE IF NOT EXISTS correction_metrics (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    household_id TEXT NOT NULL,
    merchant TEXT,
    receipt_id TEXT,
    correction_types TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Indexes for analytics
    INDEX idx_correction_metrics_household (household_id),
    INDEX idx_correction_metrics_merchant (merchant),
    INDEX idx_correction_metrics_date (created_at)
);

-- Create automation suggestions table
CREATE TABLE IF NOT EXISTS automation_suggestions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

    -- Suggestion details
    suggestion_type TEXT NOT NULL,  -- 'name_mapping', 'category_mapping', etc.
    from_pattern TEXT NOT NULL,
    to_pattern TEXT NOT NULL,
    category TEXT,

    -- Confidence and metrics
    confidence REAL DEFAULT 0.5,
    occurrence_count INTEGER DEFAULT 0,
    household_count INTEGER DEFAULT 0,

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
    applied_at TIMESTAMP WITH TIME ZONE,
    applied_by TEXT,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique constraint to prevent duplicates
    CONSTRAINT unique_suggestion UNIQUE (suggestion_type, from_pattern, to_pattern)
);

CREATE INDEX idx_suggestions_status ON automation_suggestions(status);
CREATE INDEX idx_suggestions_confidence ON automation_suggestions(confidence DESC);

-- Function to calculate correction statistics
CREATE OR REPLACE FUNCTION get_correction_stats(
    p_household_id TEXT DEFAULT NULL,
    p_merchant TEXT DEFAULT NULL,
    p_days_back INTEGER DEFAULT 30
) RETURNS TABLE (
    total_corrections BIGINT,
    unique_items BIGINT,
    name_corrections BIGINT,
    quantity_corrections BIGINT,
    category_corrections BIGINT,
    avg_confidence_improvement REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) as total_corrections,
        COUNT(DISTINCT raw_text) as unique_items,
        COUNT(CASE WHEN corrected_name IS NOT NULL THEN 1 END) as name_corrections,
        COUNT(CASE WHEN corrected_qty IS NOT NULL THEN 1 END) as quantity_corrections,
        COUNT(CASE WHEN corrected_category IS NOT NULL THEN 1 END) as category_corrections,
        AVG(CASE WHEN confidence IS NOT NULL THEN confidence ELSE 0 END) as avg_confidence_improvement
    FROM fix_queue
    WHERE resolved = true
    AND resolved_at > NOW() - INTERVAL '1 day' * p_days_back
    AND (p_household_id IS NULL OR household_id = p_household_id)
    AND (p_merchant IS NULL OR merchant = p_merchant);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update resolved_at timestamp
CREATE OR REPLACE FUNCTION update_resolved_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.resolved = true AND OLD.resolved = false THEN
        NEW.resolved_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fix_queue_resolved_trigger
BEFORE UPDATE ON fix_queue
FOR EACH ROW
EXECUTE FUNCTION update_resolved_timestamp();