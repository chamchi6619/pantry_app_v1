-- Migration: Populate Substitution Rules
-- Context: Enable pantry matching with ingredient substitutions
-- Purpose: Add common ingredient substitution pairs for meal planning
-- Date: 2025-10-26
--
-- Strategy: Insert substitution rules only if both canonical items exist
-- This allows the migration to succeed even if some items haven't been added yet

-- =============================================================================
-- HELPER FUNCTION: Safe Substitution Rule Insert
-- =============================================================================

CREATE OR REPLACE FUNCTION insert_substitution_if_exists(
  item_a_name TEXT,
  item_b_name TEXT,
  sub_rationale TEXT,
  sub_ratio NUMERIC DEFAULT 1.0,
  sub_category TEXT DEFAULT NULL,
  is_bidirectional BOOLEAN DEFAULT TRUE
) RETURNS VOID AS $$
DECLARE
  item_a_id UUID;
  item_b_id UUID;
BEGIN
  -- Get IDs for both items
  SELECT id INTO item_a_id FROM canonical_items WHERE canonical_name = item_a_name;
  SELECT id INTO item_b_id FROM canonical_items WHERE canonical_name = item_b_name;

  -- Only insert if both items exist
  IF item_a_id IS NOT NULL AND item_b_id IS NOT NULL THEN
    INSERT INTO substitution_rules (
      canonical_item_a,
      canonical_item_b,
      rationale,
      ratio,
      category,
      bidirectional
    ) VALUES (
      item_a_id,
      item_b_id,
      sub_rationale,
      sub_ratio,
      sub_category,
      is_bidirectional
    )
    ON CONFLICT DO NOTHING; -- Skip if already exists

    RAISE NOTICE 'Added: % ↔ %', item_a_name, item_b_name;
  ELSE
    RAISE NOTICE 'Skipped (items not found): % ↔ %', item_a_name, item_b_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- DAIRY SUBSTITUTIONS
-- =============================================================================

SELECT insert_substitution_if_exists('butter', 'margarine', 'Equal fat content, similar texture', 1.0, 'dairy', TRUE);
SELECT insert_substitution_if_exists('butter', 'vegetable oil', 'Use 75% oil for baking', 0.75, 'dairy', FALSE);
SELECT insert_substitution_if_exists('butter', 'coconut oil', 'Similar fat content, adds slight coconut flavor', 1.0, 'dairy', TRUE);
SELECT insert_substitution_if_exists('milk', 'almond milk', 'Plant-based alternative', 1.0, 'dairy', TRUE);
SELECT insert_substitution_if_exists('milk', 'soy milk', 'Plant-based alternative, similar protein', 1.0, 'dairy', TRUE);
SELECT insert_substitution_if_exists('milk', 'oat milk', 'Plant-based alternative, creamy texture', 1.0, 'dairy', TRUE);
SELECT insert_substitution_if_exists('heavy cream', 'half and half', 'Lower fat content, less rich', 1.0, 'dairy', FALSE);
SELECT insert_substitution_if_exists('heavy cream', 'coconut cream', 'Dairy-free alternative, rich texture', 1.0, 'dairy', TRUE);
SELECT insert_substitution_if_exists('sour cream', 'greek yogurt', 'Similar tang and texture, healthier', 1.0, 'dairy', TRUE);
SELECT insert_substitution_if_exists('cream cheese', 'ricotta cheese', 'Similar texture, milder flavor', 1.0, 'dairy', FALSE);
SELECT insert_substitution_if_exists('cheddar cheese', 'colby cheese', 'Similar flavor profile', 1.0, 'dairy', TRUE);

-- =============================================================================
-- PROTEIN SUBSTITUTIONS
-- =============================================================================

SELECT insert_substitution_if_exists('chicken breast', 'turkey breast', 'Similar lean protein', 1.0, 'protein', TRUE);
SELECT insert_substitution_if_exists('chicken thighs', 'chicken breast', 'Leaner but less juicy', 1.0, 'protein', FALSE);
SELECT insert_substitution_if_exists('ground beef', 'ground turkey', 'Leaner alternative', 1.0, 'protein', TRUE);
SELECT insert_substitution_if_exists('ground beef', 'ground pork', 'Similar fat content', 1.0, 'protein', TRUE);
SELECT insert_substitution_if_exists('bacon', 'turkey bacon', 'Lower fat alternative', 1.0, 'protein', TRUE);
SELECT insert_substitution_if_exists('pork chop', 'chicken breast', 'Leaner white meat alternative', 1.0, 'protein', FALSE);
SELECT insert_substitution_if_exists('beef steak', 'pork steak', 'Similar texture and cooking method', 1.0, 'protein', TRUE);
SELECT insert_substitution_if_exists('eggs', 'egg whites', 'No yolk, lower cholesterol', 2.0, 'protein', FALSE);

-- =============================================================================
-- BAKING SUBSTITUTIONS
-- =============================================================================

SELECT insert_substitution_if_exists('all-purpose flour', 'bread flour', 'Higher protein content, chewier texture', 1.0, 'baking', TRUE);
SELECT insert_substitution_if_exists('all-purpose flour', 'cake flour', 'Lower protein, more tender', 1.0, 'baking', FALSE);
SELECT insert_substitution_if_exists('white sugar', 'brown sugar', 'Adds molasses flavor and moisture', 1.0, 'baking', TRUE);
SELECT insert_substitution_if_exists('white sugar', 'honey', 'Liquid sweetener, reduce other liquids by 25%', 0.75, 'baking', FALSE);
SELECT insert_substitution_if_exists('white sugar', 'maple syrup', 'Liquid sweetener with distinct flavor', 0.75, 'baking', FALSE);
SELECT insert_substitution_if_exists('baking powder', 'baking soda', 'Use 1/4 amount with acid (lemon juice)', 0.25, 'baking', FALSE);
SELECT insert_substitution_if_exists('vanilla extract', 'vanilla bean', 'More intense flavor, use 1 bean per 1 tsp extract', 1.0, 'baking', FALSE);

-- =============================================================================
-- VEGETABLE SUBSTITUTIONS
-- =============================================================================

SELECT insert_substitution_if_exists('onion', 'shallot', 'Milder, sweeter flavor', 1.0, 'vegetables', TRUE);
SELECT insert_substitution_if_exists('red onion', 'yellow onion', 'Similar flavor, less sweetness', 1.0, 'vegetables', TRUE);
SELECT insert_substitution_if_exists('bell pepper', 'poblano pepper', 'Similar texture, mild heat', 1.0, 'vegetables', FALSE);
SELECT insert_substitution_if_exists('zucchini', 'yellow squash', 'Similar texture and flavor', 1.0, 'vegetables', TRUE);
SELECT insert_substitution_if_exists('spinach', 'kale', 'Heartier texture, slightly bitter', 1.0, 'vegetables', TRUE);
SELECT insert_substitution_if_exists('tomato', 'canned tomatoes', 'Use 1 can per 4 fresh tomatoes', 0.25, 'vegetables', FALSE);
SELECT insert_substitution_if_exists('fresh herbs', 'dried herbs', 'Use 1/3 amount of dried', 0.33, 'vegetables', FALSE);

-- =============================================================================
-- HERB & SPICE SUBSTITUTIONS
-- =============================================================================

SELECT insert_substitution_if_exists('basil', 'oregano', 'Similar Italian herb profile', 1.0, 'herbs', FALSE);
SELECT insert_substitution_if_exists('cilantro', 'parsley', 'Milder flavor, no soapy taste', 1.0, 'herbs', FALSE);
SELECT insert_substitution_if_exists('thyme', 'rosemary', 'Stronger flavor, use less', 0.75, 'herbs', FALSE);
SELECT insert_substitution_if_exists('garlic powder', 'fresh garlic', 'Use 1 clove per 1/8 tsp powder', 8.0, 'herbs', FALSE);
SELECT insert_substitution_if_exists('ginger', 'ginger powder', 'Use 1/4 amount of powder', 0.25, 'herbs', FALSE);

-- =============================================================================
-- OIL & FAT SUBSTITUTIONS
-- =============================================================================

SELECT insert_substitution_if_exists('olive oil', 'vegetable oil', 'Neutral flavor', 1.0, 'oils', TRUE);
SELECT insert_substitution_if_exists('olive oil', 'canola oil', 'Neutral flavor, higher smoke point', 1.0, 'oils', TRUE);
SELECT insert_substitution_if_exists('sesame oil', 'peanut oil', 'Similar nutty flavor', 1.0, 'oils', FALSE);
SELECT insert_substitution_if_exists('vegetable oil', 'canola oil', 'Very similar properties', 1.0, 'oils', TRUE);

-- =============================================================================
-- GRAIN & PASTA SUBSTITUTIONS
-- =============================================================================

SELECT insert_substitution_if_exists('white rice', 'brown rice', 'Nuttier flavor, longer cooking time', 1.0, 'grains', TRUE);
SELECT insert_substitution_if_exists('pasta', 'rice noodles', 'Gluten-free alternative', 1.0, 'grains', FALSE);
SELECT insert_substitution_if_exists('breadcrumbs', 'panko', 'Crispier coating', 1.0, 'grains', TRUE);
SELECT insert_substitution_if_exists('quinoa', 'couscous', 'Similar texture, not gluten-free', 1.0, 'grains', FALSE);

-- =============================================================================
-- SAUCE & CONDIMENT SUBSTITUTIONS
-- =============================================================================

SELECT insert_substitution_if_exists('soy sauce', 'tamari', 'Gluten-free alternative', 1.0, 'sauces', TRUE);
SELECT insert_substitution_if_exists('soy sauce', 'worcestershire sauce', 'Different flavor profile, umami boost', 1.0, 'sauces', FALSE);
SELECT insert_substitution_if_exists('mayonnaise', 'greek yogurt', 'Healthier alternative, tangy', 1.0, 'sauces', FALSE);
SELECT insert_substitution_if_exists('ketchup', 'tomato paste', 'More concentrated, add sugar', 0.5, 'sauces', FALSE);

-- =============================================================================
-- CLEANUP & VERIFICATION
-- =============================================================================

-- Drop the helper function (no longer needed)
DROP FUNCTION IF EXISTS insert_substitution_if_exists;

-- Verification
DO $$
DECLARE
  rule_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO rule_count FROM substitution_rules;

  RAISE NOTICE '══════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Migration 018 complete';
  RAISE NOTICE '   Total substitution rules: %', rule_count;
  RAISE NOTICE '══════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Categories populated:';
  RAISE NOTICE '  • Dairy (butter, milk, cream, cheese)';
  RAISE NOTICE '  • Protein (chicken, beef, pork, turkey)';
  RAISE NOTICE '  • Baking (flour, sugar, leaveners)';
  RAISE NOTICE '  • Vegetables (onions, peppers, greens)';
  RAISE NOTICE '  • Herbs & Spices';
  RAISE NOTICE '  • Oils & Fats';
  RAISE NOTICE '  • Grains & Pasta';
  RAISE NOTICE '  • Sauces & Condiments';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Apply both migrations: supabase db push';
  RAISE NOTICE '  2. Build pantryMatchService.ts';
  RAISE NOTICE '  3. Build meal planning UI';
  RAISE NOTICE '══════════════════════════════════════════════════════';
END $$;
