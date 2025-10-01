-- Production-ready fields and indexes
-- Run after add_collection_fields.sql

-- Add missing fields for production compliance
ALTER TABLE recipes ADD COLUMN required_count INTEGER;
ALTER TABLE recipes ADD COLUMN takedown BOOLEAN DEFAULT 0;
ALTER TABLE recipes ADD COLUMN image_licence_allowed BOOLEAN DEFAULT 0;
ALTER TABLE recipes ADD COLUMN title_orig TEXT;
ALTER TABLE recipes ADD COLUMN instructions_orig TEXT;
ALTER TABLE recipes ADD COLUMN lang TEXT DEFAULT 'en';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_rec_time ON recipes(total_time_min);
CREATE INDEX IF NOT EXISTS idx_rec_source ON recipes(source_key);
CREATE INDEX IF NOT EXISTS idx_rec_takedown ON recipes(takedown);
CREATE INDEX IF NOT EXISTS idx_rec_lang ON recipes(lang);

-- If using recipe_ingredients junction table
-- CREATE INDEX IF NOT EXISTS idx_ri_ing ON recipe_ingredients(ingredient_id);

-- Update required_count for existing recipes
UPDATE recipes
SET required_count = (
    SELECT COUNT(*)
    FROM (
        SELECT DISTINCT value
        FROM json_each(',' || ingredients_vec || ',')
        WHERE value != ''
    )
)
WHERE required_count IS NULL AND ingredients_vec IS NOT NULL;