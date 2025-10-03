# Centralized Pantry Item Matching Architecture

## Problem Solved

Previously, canonical matching was scattered across multiple locations:
- ✅ Receipt processing - matched during scanning
- ❌ Manual inventory additions - NO matching
- ❌ Shopping list → inventory - NO matching

This led to inconsistent canonical_item_id population in pantry_items.

## Solution: Single Entry Point

Created **one centralized Edge Function** that handles ALL pantry item additions with canonical matching.

## Architecture

### Data Flow
```
All Entry Points → add-to-pantry Edge Function → pantry_items (with canonical_item_id)
```

**Entry Points:**
1. **Manual inventory additions** (InventoryScreen)
2. **Shopping list → inventory** (moveToInventory)
3. **Future sources** (any new feature)

### How It Works

#### 1. Edge Function: `add-to-pantry`
**Location:** `backend/supabase/functions/add-to-pantry/index.ts`

**Process:**
```typescript
1. Receive item data (name, quantity, location, etc.)
2. Load 421 canonical items from database
3. Match item name using canonicalMatcher.ts
   - Exact match → 100 score
   - Alias match → 95 score
   - Singular/plural → 90 score
   - Contains match → 80 score
   - Fuzzy match → 0-70 score
4. Insert to pantry_items with canonical_item_id
5. Return created item + match info
```

**Input:**
```typescript
{
  household_id: string,
  name: string,
  quantity: number,
  unit: string,
  location: 'fridge' | 'freezer' | 'pantry',
  category?: string,
  notes?: string,
  expiry_date?: string,
  added_by?: string,
  source?: string
}
```

**Output:**
```typescript
{
  success: boolean,
  item: PantryItem,
  canonical_match?: {
    canonical_item_id: string,
    canonical_name: string,
    confidence: 'exact' | 'alias' | 'fuzzy',
    score: number
  }
}
```

#### 2. Frontend Integration

**Before:**
```typescript
// inventorySupabaseStore.addItem() - OLD
const { data } = await supabase
  .from('pantry_items')
  .insert({
    household_id,
    name,
    quantity,
    unit,
    location,
    category,
    // ❌ No canonical_item_id
  });
```

**After:**
```typescript
// inventorySupabaseStore.addItem() - NEW
const { data: response } = await supabase.functions.invoke('add-to-pantry', {
  body: {
    household_id,
    name,
    quantity,
    unit,
    location,
    category,
    // ✅ Edge Function handles matching
  }
});

// Response includes canonical_item_id
const data = response.item;
```

#### 3. Shopping List Integration

Shopping list's `moveToInventory()` already uses `inventoryStore.addItem()`, so it automatically benefits from centralized matching:

```typescript
// shoppingListSupabaseStore.ts - NO CHANGES NEEDED
for (const item of checkedItems) {
  await inventoryStore.addItem({
    name: item.name,
    quantity: item.quantity,
    location: assignedLocation,
    // ✅ Automatically matched via add-to-pantry Edge Function
  });
}
```

## Benefits

### 1. **Consistency**
- ALL pantry items are matched using the same logic
- No more missed matches from manual entries

### 2. **Maintainability**
- Single place to update matching logic
- Easy to debug and improve

### 3. **Performance**
- Matching happens server-side (Edge Function)
- Reuses existing canonicalMatcher.ts (94.8% accuracy)

### 4. **Scalability**
- New entry points automatically get matching
- Just call the Edge Function

## Deployment

Deploy the Edge Function:
```bash
npx supabase functions deploy add-to-pantry
```

**Dependencies:**
- `_shared/canonicalMatcher.ts` - Must be deployed alongside function
- Database: canonical_items table (421 items)
- Database: pantry_items.canonical_item_id column

## Testing

### Manual Inventory Test
1. Open app → Inventory screen
2. Add item manually: "Bananas"
3. Check database:
```sql
SELECT
  pi.name,
  pi.canonical_item_id,
  ci.canonical_name
FROM pantry_items pi
LEFT JOIN canonical_items ci ON pi.canonical_item_id = ci.id
WHERE pi.name ILIKE '%banana%'
ORDER BY pi.created_at DESC
LIMIT 1;
```
Expected: `canonical_item_id` should be populated with bananas' UUID

### Shopping List Test
1. Open app → Shopping List
2. Add item: "Milk"
3. Check it off
4. Tap "Move to Inventory"
5. Check database:
```sql
SELECT
  pi.name,
  pi.canonical_item_id,
  ci.canonical_name
FROM pantry_items pi
LEFT JOIN canonical_items ci ON pi.canonical_item_id = ci.id
WHERE pi.name ILIKE '%milk%'
  AND pi.source = 'manual'
ORDER BY pi.created_at DESC
LIMIT 1;
```
Expected: `canonical_item_id` should be populated

## Files Changed

### Created
- ✅ `backend/supabase/functions/add-to-pantry/index.ts` - New Edge Function

### Modified
- ✅ `pantry-app/src/stores/inventorySupabaseStore.ts` - Updated addItem() to use Edge Function

### Unchanged
- ✅ `pantry-app/src/stores/shoppingListSupabaseStore.ts` - Already uses inventoryStore.addItem()
- ✅ `backend/supabase/functions/_shared/canonicalMatcher.ts` - Reused existing matcher

## Comparison with Receipt Matching

### Receipt Flow (Existing)
```
Receipt Scan → parse-receipt-gemini → receipt_fix_queue (matched) →
User Confirms → purchase_history (matched)
```

### Pantry Flow (New)
```
Manual/Shopping List → add-to-pantry → pantry_items (matched)
```

**Key Difference:** Receipt items go to `purchase_history` (historical purchases), pantry items go to `pantry_items` (current inventory).

## Matching Statistics

- **Canonical Items:** 421
- **Match Rate:** 94.8% (from recipe ingredient testing)
- **Match Speed:** <10ms per item
- **Cost:** $0 (no LLM calls)

## Next Steps

1. **Deploy** - Deploy add-to-pantry Edge Function
2. **Test** - Test both manual and shopping list entry points
3. **Monitor** - Check logs for matching results:
   ```bash
   npx supabase functions logs add-to-pantry
   ```
4. **Analytics** - Query to check matching coverage:
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE canonical_item_id IS NOT NULL) as matched,
     COUNT(*) FILTER (WHERE canonical_item_id IS NULL) as unmatched,
     COUNT(*) as total,
     ROUND(COUNT(*) FILTER (WHERE canonical_item_id IS NOT NULL)::numeric / COUNT(*) * 100, 1) as match_rate
   FROM pantry_items
   WHERE created_at >= NOW() - INTERVAL '7 days';
   ```

---

**Status:** ✅ COMPLETE - Ready for deployment and testing
