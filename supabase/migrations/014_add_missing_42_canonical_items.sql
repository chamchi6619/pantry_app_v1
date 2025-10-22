-- Migration: Add 42 missing canonical ingredients
-- Adds specialty items identified through comprehensive global cuisine research
-- Categories: grains (10), condiments (7), produce (7), dairy (7), spices (4), fats_oils (4), other (2), protein (1)

-- ============================================================
-- GRAINS (10) - Legumes & Noodles
-- ============================================================

INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('green lentils', 'grains', ARRAY[]::text[]),
('brown lentils', 'grains', ARRAY[]::text[]),
('split peas', 'grains', ARRAY['yellow split peas', 'green split peas']),
('navy beans', 'grains', ARRAY[]::text[]),
('black-eyed peas', 'grains', ARRAY['black eyed beans']),
('udon noodles', 'grains', ARRAY['udon']),
('soba noodles', 'grains', ARRAY['soba', 'buckwheat noodles']),
('glass noodles', 'grains', ARRAY['cellophane noodles', 'bean thread noodles']),
('vital wheat gluten', 'grains', ARRAY[]::text[]),
('arrowroot', 'grains', ARRAY['arrowroot powder', 'arrowroot starch']);

-- ============================================================
-- CONDIMENTS (7)
-- ============================================================

INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('cane vinegar', 'condiments', ARRAY['coconut vinegar']),
('chili oil', 'condiments', ARRAY['chili crisp', 'chiu chow chili oil']),
('achiote paste', 'condiments', ARRAY['annatto paste']),
('peppermint extract', 'condiments', ARRAY[]::text[]),
('turbinado sugar', 'condiments', ARRAY['raw sugar']),
('tabasco', 'condiments', ARRAY['tabasco sauce']),
('caesar dressing', 'condiments', ARRAY[]::text[]);

-- ============================================================
-- PRODUCE (7)
-- ============================================================

INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('water chestnuts', 'produce', ARRAY[]::text[]),
('dried shiitake mushrooms', 'produce', ARRAY['dried shiitake']),
('nopales', 'produce', ARRAY['cactus paddles']),
('dried porcini mushrooms', 'produce', ARRAY['porcini']),
('sun-dried tomatoes', 'produce', ARRAY[]::text[]),
('radicchio', 'produce', ARRAY[]::text[]),
('endive', 'produce', ARRAY[]::text[]);

-- ============================================================
-- DAIRY (7) - Cheese & Plant Milks
-- ============================================================

INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('camembert', 'dairy', ARRAY['camembert cheese']),
('pecorino romano', 'dairy', ARRAY['pecorino']),
('mascarpone', 'dairy', ARRAY[]::text[]),
('fontina', 'dairy', ARRAY['fontina cheese']),
('oat milk', 'dairy', ARRAY[]::text[]),
('almond milk', 'dairy', ARRAY[]::text[]),
('cashew milk', 'dairy', ARRAY[]::text[]);

-- ============================================================
-- SPICES (4)
-- ============================================================

INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('celery seeds', 'spices', ARRAY[]::text[]),
('ancho chiles', 'spices', ARRAY['dried ancho peppers']),
('pasilla chiles', 'spices', ARRAY['dried pasilla peppers']),
('herbes de provence', 'spices', ARRAY[]::text[]);

-- ============================================================
-- FATS_OILS (4)
-- ============================================================

INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('lard', 'fats_oils', ARRAY[]::text[]),
('truffle oil', 'fats_oils', ARRAY[]::text[]),
('walnut oil', 'fats_oils', ARRAY[]::text[]),
('grapeseed oil', 'fats_oils', ARRAY[]::text[]);

-- ============================================================
-- OTHER (2)
-- ============================================================

INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('xanthan gum', 'other', ARRAY[]::text[]),
('white chocolate', 'other', ARRAY[]::text[]);

-- ============================================================
-- PROTEIN (1)
-- ============================================================

INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('guanciale', 'protein', ARRAY[]::text[]);

-- ============================================================
-- Summary: Added 42 canonical items
-- New total: 833 + 42 = 875 canonical items
-- Coverage improvement: Adds support for specialty international ingredients
-- ============================================================
