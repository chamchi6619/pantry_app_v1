-- Add image metadata columns for attribution
-- Required for Unsplash API compliance

ALTER TABLE recipe_database
ADD COLUMN IF NOT EXISTS image_source TEXT, -- 'pexels' | 'unsplash' | 'ai_generated'
ADD COLUMN IF NOT EXISTS image_photographer TEXT,
ADD COLUMN IF NOT EXISTS image_photographer_url TEXT;

-- Add comments
COMMENT ON COLUMN recipe_database.image_source IS 'Source of recipe image: pexels, unsplash, or ai_generated';
COMMENT ON COLUMN recipe_database.image_photographer IS 'Photographer name for attribution (Unsplash requires this)';
COMMENT ON COLUMN recipe_database.image_photographer_url IS 'Link to photographer profile for attribution';
