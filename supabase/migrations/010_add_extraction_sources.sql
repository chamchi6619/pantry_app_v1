-- Migration 010: Add Extraction Sources Tracking
-- Purpose: Track which text sources were used during Cook Card extraction
-- Date: 2025-10-08
--
-- Sources can include:
-- - 'schema_org' (Schema.org Recipe JSON-LD markup)
-- - 'html_description' (Platform-specific embedded JSON)
-- - 'opengraph' (OpenGraph metadata)
-- - 'youtube_api' (YouTube Data API fallback)
-- - 'instagram_caption' (Instagram caption text)
-- - 'tiktok_embedded_json' (TikTok description)

-- Add extraction_sources column to cook_cards
ALTER TABLE cook_cards
ADD COLUMN IF NOT EXISTS extraction_sources TEXT[];

-- Create GIN index for efficient array queries
CREATE INDEX IF NOT EXISTS idx_cook_cards_extraction_sources
ON cook_cards USING GIN(extraction_sources);

-- Add comments for documentation
COMMENT ON COLUMN cook_cards.extraction_sources IS 'Array of text sources used during extraction (schema_org, html_description, opengraph, etc.)';

-- Example queries enabled by this migration:
-- 1. Find all Cook Cards extracted using Schema.org:
--    SELECT * FROM cook_cards WHERE 'schema_org' = ANY(extraction_sources);
--
-- 2. Count extractions by source:
--    SELECT unnest(extraction_sources) as source, COUNT(*)
--    FROM cook_cards
--    GROUP BY source
--    ORDER BY count DESC;
--
-- 3. Find extractions using multiple sources (high quality):
--    SELECT * FROM cook_cards WHERE array_length(extraction_sources, 1) > 2;
--
-- 4. Find extractions that fell back to API only (low quality):
--    SELECT * FROM cook_cards WHERE extraction_sources = ARRAY['youtube_api'];
