-- Migration: Add 57 world cuisine ingredients (Tier 1, 2, 3)
-- Comprehensive global coverage: Caribbean, West African, Peruvian, Indian, Asian, European, Latin American
-- Priority tiers: 7 critical + 15 important + 35 authenticity items
-- New total: 875 + 57 = 932 canonical items

-- ============================================================
-- TIER 1: ABSOLUTELY CRITICAL (7 items) - Daily essentials
-- ============================================================

-- Fresh Herbs (Mediterranean/Indian staples)
INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('flat-leaf parsley', 'produce', ARRAY['italian parsley', 'fresh parsley']),
('fresh mint', 'produce', ARRAY['spearmint', 'mint leaves']);

-- Essential Flours (Indian/Brazilian staples)
INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('atta flour', 'grains', ARRAY['chapati flour', 'whole wheat atta']),
('manioc flour', 'grains', ARRAY['cassava flour', 'farofa']);

-- Protein (Asian essential)
INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('fried tofu', 'protein', ARRAY['aburaage', 'tofu puffs']);

-- West African Essentials
INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('suya spice', 'spices', ARRAY['yaji spice']),
('dawadawa', 'condiments', ARRAY['iru', 'ogiri', 'fermented locust beans']);

-- ============================================================
-- TIER 2: HIGHLY IMPORTANT (15 items) - Cuisine-defining
-- ============================================================

-- Caribbean/Peruvian Fresh Produce
INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('culantro', 'produce', ARRAY['recao', 'mexican coriander', 'long coriander']),
('aji dulce', 'produce', ARRAY['aji cachucha', 'sweet peppers']),
('aji rocoto', 'produce', ARRAY['rocoto pepper']),
('african yam', 'produce', ARRAY['true yam', 'dioscorea']);

-- African Leafy Greens
INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('amaranth leaves', 'produce', ARRAY['callaloo greens']),
('bitter leaf', 'produce', ARRAY['vernonia']),
('cassava leaves', 'produce', ARRAY['manioc leaves']);

-- Asian Curry Pastes & Condiments
INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('thai red curry paste', 'condiments', ARRAY['red curry paste']),
('thai yellow curry paste', 'condiments', ARRAY['yellow curry paste']),
('mint chutney', 'condiments', ARRAY['green chutney', 'cilantro mint chutney']),
('coconut chutney', 'condiments', ARRAY[]::text[]);

-- Sweeteners & Specialty Condiments
INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('grape molasses', 'condiments', ARRAY['petimezi']),
('dulce de leche', 'condiments', ARRAY[]::text[]),
('pickled turnips', 'condiments', ARRAY['torshi left']);

-- African Protein
INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('dried crayfish', 'protein', ARRAY['african dried shrimp']);

-- ============================================================
-- TIER 3: IMPORTANT FOR AUTHENTICITY (35 items)
-- ============================================================

-- Preserved & Fresh Produce (14 items)
INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('pickled beets', 'produce', ARRAY[]::text[]),
('wild mushrooms', 'produce', ARRAY['fresh mushrooms']),
('hearts of palm', 'produce', ARRAY['palmito']),
('shiso leaves', 'produce', ARRAY['perilla leaves']),
('dried mango', 'produce', ARRAY[]::text[]),
('dried pineapple', 'produce', ARRAY[]::text[]),
('dried blueberries', 'produce', ARRAY[]::text[]),
('dried cherries', 'produce', ARRAY[]::text[]),
('dried apples', 'produce', ARRAY[]::text[]),
('dried pears', 'produce', ARRAY[]::text[]),
('banana chips', 'produce', ARRAY[]::text[]),
('jackfruit', 'produce', ARRAY['young jackfruit', 'green jackfruit']),
('kohlrabi', 'produce', ARRAY['german turnip']),
('chayote', 'produce', ARRAY['christophine', 'cho cho']);

-- Specialty Grains & Flours (8 items)
INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('00 flour', 'grains', ARRAY['doppio zero', 'pasta flour']),
('rye flour', 'grains', ARRAY[]::text[]),
('durum wheat flour', 'grains', ARRAY[]::text[]),
('arepa flour', 'grains', ARRAY['masarepa', 'precooked corn flour']),
('fonio', 'grains', ARRAY[]::text[]),
('sticky rice', 'grains', ARRAY['glutinous rice', 'sweet rice']),
('bomba rice', 'grains', ARRAY['paella rice']),
('adzuki beans', 'grains', ARRAY['azuki beans', 'red beans']);

-- Specialty Vinegars & Sweeteners (5 items)
INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('date vinegar', 'condiments', ARRAY[]::text[]),
('palm vinegar', 'condiments', ARRAY[]::text[]),
('rice syrup', 'condiments', ARRAY['brown rice syrup']),
('birch syrup', 'condiments', ARRAY[]::text[]),
('stevia', 'condiments', ARRAY['stevia extract']);

-- Regional Spices (4 items)
INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('grains of selim', 'spices', ARRAY['kani pepper', 'african pepper']),
('piment d\'espelette', 'spices', ARRAY['espelette pepper']),
('korarima', 'spices', ARRAY['ethiopian cardamom']),
('annatto seeds', 'spices', ARRAY['achiote seeds']);

-- Cured Meats (2 items)
INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('jamón ibérico', 'protein', ARRAY['iberico ham']),
('smoked salmon', 'protein', ARRAY['lox']);

-- Specialty Items (2 items)
INSERT INTO canonical_items (canonical_name, category, aliases) VALUES
('banana leaves', 'other', ARRAY[]::text[]),
('brazil nuts', 'nuts_seeds', ARRAY[]::text[]);

-- ============================================================
-- Summary: Added 57 canonical items across all priority tiers
-- Tier 1 (Critical): 7 items - daily essentials
-- Tier 2 (Important): 15 items - cuisine-defining
-- Tier 3 (Authenticity): 35 items - specialty/regional
--
-- New total: 875 + 57 = 932 canonical items
-- Coverage: Comprehensive global cuisine support
-- Regions: Caribbean, West African, Peruvian, Indian, Southeast Asian,
--          European, Latin American, Mediterranean, Middle Eastern
-- ============================================================
