-- Additional fields for recipe collection and deduplication
-- Run this after the main schema

-- Add idempotency and tracking fields to recipes
ALTER TABLE recipes ADD COLUMN external_id TEXT;
ALTER TABLE recipes ADD COLUMN source_key TEXT;
ALTER TABLE recipes ADD COLUMN fingerprint TEXT;
ALTER TABLE recipes ADD COLUMN open_collection BOOLEAN DEFAULT 0;

-- Create indexes for efficient lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_external ON recipes(source_key, external_id);
CREATE INDEX IF NOT EXISTS idx_recipe_fingerprint ON recipes(fingerprint);

-- Add collection tracking to sources
ALTER TABLE sources ADD COLUMN collector_class TEXT;
ALTER TABLE sources ADD COLUMN last_collected TIMESTAMP;
ALTER TABLE sources ADD COLUMN instructions_allowed BOOLEAN DEFAULT 1;

-- Update existing source records with instructions_allowed
UPDATE sources
SET instructions_allowed = CASE
    WHEN license_code IN ('PUBLIC', 'CC0', 'CC-BY', 'CC-BY-SA', 'OGL', 'KOGL-1', 'GOJ-2') THEN 1
    ELSE 0
END
WHERE instructions_allowed IS NULL;