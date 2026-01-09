-- ============================================================================
-- Cooking Queue System
-- Purpose: Netflix/Spotify-style recipe curation (not calendar scheduling)
-- Pattern: Dynamic carousel sorted by what you can make RIGHT NOW
-- ============================================================================

-- Create cooking_queue table
CREATE TABLE IF NOT EXISTS cooking_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  household_id uuid REFERENCES households(id) ON DELETE CASCADE NOT NULL,
  cook_card_id uuid REFERENCES cook_cards(id) ON DELETE CASCADE NOT NULL,

  -- Queue status (Spotify pattern: in playlist → playing → played)
  status text DEFAULT 'queued' CHECK (status IN ('queued', 'cooking', 'cooked', 'skipped')),
  added_at timestamp with time zone DEFAULT now() NOT NULL,
  added_by text DEFAULT 'user' CHECK (added_by IN ('user', 'ai_suggested')),

  -- Pantry match (cached for sorting, recalculated when pantry changes)
  pantry_match_percent int,
  missing_ingredients_count int,
  urgency_score int DEFAULT 0,

  -- Completion tracking
  cooked_at timestamp with time zone,
  rating int CHECK (rating >= 1 AND rating <= 5),
  user_notes text,

  -- Timestamps
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,

  -- Prevent duplicate recipes in same user's active queue
  UNIQUE(household_id, cook_card_id, status)
);

-- Indexes for Netflix-style sorting (by pantry match, recency, etc.)
CREATE INDEX idx_cooking_queue_household_status ON cooking_queue(household_id, status);
CREATE INDEX idx_cooking_queue_sort_ready ON cooking_queue(household_id, pantry_match_percent DESC, added_at DESC)
  WHERE status = 'queued' AND pantry_match_percent >= 90;
CREATE INDEX idx_cooking_queue_sort_almost ON cooking_queue(household_id, pantry_match_percent DESC, added_at DESC)
  WHERE status = 'queued' AND pantry_match_percent >= 60 AND pantry_match_percent < 90;
CREATE INDEX idx_cooking_queue_sort_shopping ON cooking_queue(household_id, pantry_match_percent DESC, added_at DESC)
  WHERE status = 'queued' AND pantry_match_percent < 60;
CREATE INDEX idx_cooking_queue_cook_card ON cooking_queue(cook_card_id);

-- RLS Policies
ALTER TABLE cooking_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY cooking_queue_select ON cooking_queue
  FOR SELECT USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY cooking_queue_insert ON cooking_queue
  FOR INSERT WITH CHECK (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );

CREATE POLICY cooking_queue_update ON cooking_queue
  FOR UPDATE USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY cooking_queue_delete ON cooking_queue
  FOR DELETE USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- Trigger to update updated_at
CREATE TRIGGER cooking_queue_updated_at
  BEFORE UPDATE ON cooking_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE cooking_queue IS 'Spotify/Netflix-style recipe queue - dynamically sorted by what you can make now';
COMMENT ON COLUMN cooking_queue.status IS 'Lifecycle: queued (in playlist) → cooking (playing) → cooked (played) or skipped (removed)';
COMMENT ON COLUMN cooking_queue.pantry_match_percent IS 'Cached match % for sorting - like Netflix relevance score';
COMMENT ON COLUMN cooking_queue.added_by IS 'user = manually added, ai_suggested = algorithmic recommendation';

-- Migration tracking
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cooking_queue') THEN
    RAISE NOTICE '✅ cooking_queue table created successfully';
  END IF;
END $$;
