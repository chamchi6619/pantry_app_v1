-- Fix Decimal Quantities Migration
-- Allows decimal quantities for weight-based items (bananas 2.75 lb, milk 1.5 gal)
-- Date: 2025-10-01

-- Update pantry_items to support decimal quantities
ALTER TABLE IF EXISTS pantry_items
  ALTER COLUMN quantity TYPE NUMERIC USING quantity::numeric;

-- Update receipt_fix_queue to support decimal quantities
ALTER TABLE IF EXISTS receipt_fix_queue
  ALTER COLUMN quantity TYPE NUMERIC USING quantity::numeric;

-- Update purchase_history to support decimal quantities
ALTER TABLE IF EXISTS purchase_history
  ALTER COLUMN quantity TYPE NUMERIC USING quantity::numeric;

-- No need to update existing data - NUMERIC accepts integers just fine
-- 3 apples will remain 3, 2.75 lb bananas will work as 2.75

COMMENT ON COLUMN pantry_items.quantity IS 'Supports decimals for weight/volume items (2.75 lb) and integers for countable items (3 pieces)';
COMMENT ON COLUMN receipt_fix_queue.quantity IS 'Supports decimals from receipt parsing (bananas by weight, bulk items)';
COMMENT ON COLUMN purchase_history.quantity IS 'Supports decimals for accurate spending tracking';
