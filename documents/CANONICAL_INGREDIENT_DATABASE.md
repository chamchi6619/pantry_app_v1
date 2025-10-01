# Canonical Ingredient Database Architecture

**Status**: Proposed (Not Yet Implemented)
**Date**: 2025-10-01
**Context**: Receipt parsing with Gemini 2.0 Flash now includes AI normalization, but users still face inventory fragmentation due to naming variations.

---

## Problem Statement

When users scan receipts over time, the same product gets multiple inventory entries due to naming variations:

- Receipt 1: "ORG MLK WHL GAL" → User corrects to → "Organic Whole Milk"
- Receipt 2: "ORGANIC MILK" → User corrects to → "Organic Milk"
- Receipt 3: "WHL MLK ORG" → User corrects to → "Whole Organic Milk"

**Result**: 3 separate inventory entries for the same product, leading to:
- Inaccurate inventory counts
- Redundant manual corrections
- Poor user experience

---

## Solution: Personal Learning Database

Build a **household-specific canonical ingredient catalog** that:
1. Learns from user corrections over time
2. Auto-matches known items to skip Fix Queue
3. Uses fuzzy matching to detect duplicates
4. Handles cross-store naming variations

---

## Architecture

### Option 1: Static USDA Database ❌
**Rejected**: Too rigid, doesn't handle brands, store-specific abbreviations, or user preferences.

### Option 2: Collaborative Global Database ❌
**Rejected**: Too complex, privacy concerns, requires moderation, doesn't respect personal naming preferences.

### Option 3: Personal Learning Database ✅
**Recommended**: Household-specific, learns from user behavior, respects privacy, scales with usage.

---

## Database Schema

### Table 1: `household_ingredients`
Stores the canonical catalog of ingredients per household.

```sql
CREATE TABLE household_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id),
  canonical_name TEXT NOT NULL,  -- User's preferred name
  brand TEXT,                     -- Optional brand info
  category TEXT NOT NULL,         -- dairy, produce, meat, etc.
  unit TEXT,                      -- Default unit (gallon, lb, piece)
  average_price_cents INT,        -- For price anomaly detection
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  purchase_count INT DEFAULT 1,   -- How many times purchased
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, canonical_name, brand)
);

CREATE INDEX idx_household_ingredients_lookup
ON household_ingredients(household_id, canonical_name);

CREATE INDEX idx_household_ingredients_category
ON household_ingredients(household_id, category);
```

### Table 2: `household_ingredient_mappings`
Maps raw receipt text to canonical ingredient IDs.

```sql
CREATE TABLE household_ingredient_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id),
  raw_text TEXT NOT NULL,         -- Original from receipt (e.g., "ORG MLK WHL")
  ingredient_id UUID NOT NULL REFERENCES household_ingredients(id),
  confidence FLOAT DEFAULT 1.0,   -- How confident in this mapping
  source TEXT DEFAULT 'user',     -- 'user', 'fuzzy_match', 'exact_match'
  times_seen INT DEFAULT 1,       -- Reinforcement learning
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, raw_text)
);

CREATE INDEX idx_mappings_lookup
ON household_ingredient_mappings(household_id, raw_text);

CREATE INDEX idx_mappings_ingredient
ON household_ingredient_mappings(ingredient_id);
```

### Table 3: `merged_ingredients`
Tracks merge history for duplicate resolution.

```sql
CREATE TABLE merged_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id),
  merged_from_id UUID NOT NULL,   -- Old ingredient that was merged
  merged_into_id UUID NOT NULL REFERENCES household_ingredients(id),
  merged_at TIMESTAMPTZ DEFAULT NOW(),
  merged_by UUID REFERENCES users(id)
);
```

---

## Flow Diagrams

### First Time Encounter
```
Receipt Item: "ORG MLK WHL GAL"
   ↓
Gemini Normalizes: "Organic Whole Milk Gallon"
   ↓
Check Mappings: raw_text = "ORG MLK WHL GAL"
   ↓
❌ No Match Found
   ↓
Show in Fix Queue
   ↓
User Confirms: "Organic Whole Milk"
   ↓
1. Create household_ingredients entry
2. Create household_ingredient_mappings entry
3. Add to purchase_history with ingredient_id
4. Add to inventory
```

### Second Time Encounter (Exact Match)
```
Receipt Item: "ORG MLK WHL GAL"
   ↓
Gemini Normalizes: "Organic Whole Milk Gallon"
   ↓
Check Mappings: raw_text = "ORG MLK WHL GAL"
   ↓
✅ EXACT MATCH FOUND → ingredient_id = abc-123
   ↓
SKIP Fix Queue (auto-accept)
   ↓
1. Update last_seen_at, times_seen++
2. Add to purchase_history with ingredient_id
3. Add to inventory (auto-increment quantity if exists)
```

### Third Time Encounter (Fuzzy Match)
```
Receipt Item: "ORGANIC MILK WHL"  ← NEW variation
   ↓
Gemini Normalizes: "Organic Whole Milk"
   ↓
Check Mappings: raw_text = "ORGANIC MILK WHL"
   ↓
❌ No Exact Match
   ↓
Fuzzy Match Against canonical_name in household_ingredients
   ↓
✅ 85% match to "Organic Whole Milk" (ingredient_id = abc-123)
   ↓
Show in Fix Queue with pre-filled: "Organic Whole Milk"
   ↓
User Confirms (or edits)
   ↓
1. Create NEW mapping: "ORGANIC MILK WHL" → abc-123
2. Update last_seen_at on ingredient
3. Add to purchase_history with ingredient_id
4. Add to inventory
```

---

## Fuzzy Matching Algorithm

Uses **token-based Jaccard similarity**:

```typescript
function calculateSimilarity(str1: string, str2: string): number {
  // Normalize
  const normalize = (s: string) =>
    s.toLowerCase()
     .replace(/[^a-z0-9\s]/g, '')
     .split(/\s+/)
     .filter(t => t.length > 0);

  const tokens1 = new Set(normalize(str1));
  const tokens2 = new Set(normalize(str2));

  // Jaccard similarity: |A ∩ B| / |A ∪ B|
  const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);

  return intersection.size / union.size;
}

// Examples:
calculateSimilarity("Organic Whole Milk", "Whole Organic Milk")  // 1.0
calculateSimilarity("Organic Whole Milk", "Organic Milk")        // 0.67
calculateSimilarity("Organic Whole Milk", "Almond Milk")         // 0.33
```

**Thresholds**:
- `>= 0.90`: Auto-accept (exact match)
- `0.65 - 0.89`: Show in Fix Queue with pre-fill + duplicate warning
- `< 0.65`: Treat as new item

---

## Duplicate Detection Strategy

### Problem: User Inconsistency Across Stores
- Safeway receipt: "Kikkoman Soy Sauce" → User names it "Soy Sauce"
- Costco receipt: "Kikkoman Soy Sauce 64oz" → User names it "Kikkoman Brand Soy Sauce"
- Result: 2 inventory entries for same product

### Solution 1: Inline Duplicate Warning in Fix Queue
When user is editing an item, run real-time similarity check:

```typescript
// In FixQueueScreen when user edits item name
const existingIngredients = await fetchHouseholdIngredients(householdId);

for (const existing of existingIngredients) {
  const similarity = calculateSimilarity(userInputName, existing.canonical_name);

  if (similarity > 0.65 && similarity < 0.95) {
    // Show badge: "⚠️ Similar to existing: Soy Sauce"
    // Tap → Modal with 3 options:
    //   1. Use "Soy Sauce" (updates mapping, no new entry)
    //   2. Keep "Kikkoman Brand Soy Sauce" (creates new)
    //   3. Merge & Rename (consolidates both)
  }
}
```

**UX**: Non-blocking warning badge that user can tap to review.

### Solution 2: Post-Receipt Duplicate Review
After user confirms all items in Fix Queue, show a summary screen highlighting potential duplicates:

```
🔍 Duplicate Check

We found similar items in your pantry:

┌─────────────────────────────────────┐
│ New: "Kikkoman Brand Soy Sauce"    │
│ Existing: "Soy Sauce"              │
│                                     │
│ [Use Existing] [Keep Both]         │
└─────────────────────────────────────┘

[Confirm All] [Review Individually]
```

### Solution 3: Weekly Smart Merge Suggestions
Background job analyzes catalog and suggests merges:

```sql
-- Find ingredients with high similarity and overlapping usage
SELECT
  a.id as ingredient_a,
  b.id as ingredient_b,
  a.canonical_name as name_a,
  b.canonical_name as name_b,
  similarity(a.canonical_name, b.canonical_name) as similarity_score,
  COUNT(DISTINCT pa.receipt_id) as receipts_with_a,
  COUNT(DISTINCT pb.receipt_id) as receipts_with_b
FROM household_ingredients a
CROSS JOIN household_ingredients b
LEFT JOIN household_ingredient_mappings ma ON ma.ingredient_id = a.id
LEFT JOIN purchase_history pa ON pa.mapped_ingredient_id = a.id
LEFT JOIN household_ingredient_mappings mb ON mb.ingredient_id = b.id
LEFT JOIN purchase_history pb ON pb.mapped_ingredient_id = b.id
WHERE
  a.household_id = b.household_id
  AND a.id < b.id
  AND similarity(a.canonical_name, b.canonical_name) > 0.65
  AND a.category = b.category
GROUP BY a.id, b.id
HAVING COUNT(DISTINCT pa.receipt_id) > 2
ORDER BY similarity_score DESC;
```

**UX**: Push notification → "Smart Cleanup" screen with side-by-side comparison and merge options.

### Context-Aware Thresholds
Adjust duplicate detection based on context:

```typescript
function shouldWarnDuplicate(similarity: number, context: {
  sameStore: boolean,
  sameBrand: boolean,
  sameCategory: boolean
}): boolean {
  // Lower threshold for same store (more likely same product)
  if (context.sameStore && similarity > 0.60) return true;

  // Higher threshold for different stores (intentional differentiation)
  if (!context.sameStore && similarity > 0.75) return true;

  // Brand presence increases confidence
  if (context.sameBrand && similarity > 0.65) return true;

  return false;
}
```

---

## Updated Flow with Duplicate Detection

```
1. RECEIPT SCAN
   • Gemini: "KIK SOY SNC 15 OZ" → "Kikkoman Soy Sauce 15oz"
      ↓
2. FIX QUEUE (inline duplicate detection)
   • User sees: "Kikkoman Soy Sauce 15oz"
   • Badge: "⚠️ Similar to Soy Sauce"
   • User taps → Choose: Use/Create/Merge
      ↓
3. BATCH DUPLICATE REVIEW (optional)
   • Show all potential duplicates from this receipt
   • Bulk actions: Use Existing / Keep Both
      ↓
4. CONFIRM → ADD TO INVENTORY
      ↓
5. WEEKLY SMART CLEANUP (background)
   • Detect duplicates across entire catalog
   • Push notification: "3 duplicates found"
   • User reviews and merges
```

---

## Implementation Phases

### Phase 1: Core Tables & Basic Mapping
**Goal**: Create schema and basic exact-match functionality.

**Tasks**:
1. Create `household_ingredients` table
2. Create `household_ingredient_mappings` table
3. Modify `purchase_history` to add `mapped_ingredient_id` foreign key
4. Update Fix Queue confirmation logic to:
   - Check for exact raw_text match
   - Create ingredient + mapping on first encounter
   - Auto-accept on exact match

**Outcome**: Exact matches skip Fix Queue.

### Phase 2: Fuzzy Matching & Pre-fill
**Goal**: Add fuzzy matching to pre-fill Fix Queue.

**Tasks**:
1. Implement `calculateSimilarity()` function
2. On Fix Queue load, run fuzzy match against `household_ingredients`
3. If similarity >= 0.65, pre-fill with matching canonical_name
4. Show confidence badge: "85% match to Organic Milk"

**Outcome**: Users see smart suggestions, reducing corrections.

### Phase 3: Duplicate Detection
**Goal**: Warn users about potential duplicates.

**Tasks**:
1. Add inline duplicate warning in Fix Queue
2. Create `DuplicateReviewScreen` component
3. Implement post-receipt duplicate batch review
4. Add "Merge" action to combine ingredients

**Outcome**: Prevents duplicate inventory entries.

### Phase 4: Smart Cleanup & Analytics
**Goal**: Proactive maintenance and insights.

**Tasks**:
1. Create weekly background job for duplicate detection
2. Build "Smart Cleanup" screen with merge suggestions
3. Add `merged_ingredients` table for audit trail
4. Show analytics: "You've purchased Organic Milk 12 times ($4.99 avg)"

**Outcome**: Long-term catalog health and user insights.

---

## Cost Analysis

### Without Personal Database
- Every receipt: Full Gemini parse + user corrections
- Cost per receipt: $0.000204 (11 items)
- 50 receipts/year: **$0.0102/year**

### With Personal Database (After 6 Months)
- Exact matches: No Gemini (just OCR + lookup)
- Fuzzy matches: Gemini + pre-fill (faster user correction)
- New items: Full Gemini parse

**Estimated Savings**:
- Month 1-2: 0% savings (building catalog)
- Month 3-6: 30% savings (common items auto-match)
- Month 7+: 60% savings (most items auto-match)

**Long-term cost**: ~$0.004/year after 6 months = **94% reduction**

---

## Edge Cases

### Case 1: Brand vs Generic
- "Kikkoman Soy Sauce" vs "Soy Sauce"
- **Solution**: Store `brand` field separately, use context-aware similarity

### Case 2: Size Variations
- "Milk Gallon" vs "Milk Half Gallon"
- **Solution**: Don't treat as duplicates if size differs significantly

### Case 3: Intentional Variations
- "Organic Milk" vs "Regular Milk"
- **Solution**: Allow "Keep Both" in duplicate warnings

### Case 4: Seasonal Products
- "Pumpkin Spice Latte" appears only in fall
- **Solution**: Track `last_seen_at`, archive old mappings after 18 months

### Case 5: Store-Specific Names
- Costco: "Kirkland Organic Milk"
- Safeway: "O Organics Milk"
- **Solution**: Cross-store fuzzy matching with higher threshold (0.75+)

---

## User Experience Goals

1. **Progressive Enhancement**: Works immediately (Gemini), gets better over time (learning)
2. **Non-Intrusive**: Warnings and suggestions, not forced actions
3. **Respectful of Intent**: Allow "Keep Both" for intentional variations
4. **Transparent**: Show why system made a suggestion ("85% match to...")
5. **Correctable**: Easy to merge/split/rename ingredients

---

## Alternative Approaches Considered

### A. Use Gemini for Every Deduplication
**Pros**: No local catalog needed
**Cons**: Expensive ($0.0002 per check), slow, requires network
**Verdict**: ❌ Not sustainable at scale

### B. Use USDA Database as Seed
**Pros**: Rich nutrition data, standardized names
**Cons**: Doesn't handle brands, store-specific terms, user preferences
**Verdict**: 🤔 Could be used as fallback for new users

### C. Community-Shared Mappings
**Pros**: Faster learning, benefits all users
**Cons**: Privacy concerns, regional variations, spam/moderation
**Verdict**: 🤔 Could be opt-in feature in future

---

## Success Metrics

**Short-term (3 months)**:
- % of receipts with at least 1 auto-accepted item
- Average Fix Queue review time per item
- User satisfaction with suggestions

**Long-term (12 months)**:
- % of items auto-accepted (target: 60%+)
- Gemini API cost reduction (target: 80%+)
- Inventory duplicate rate (target: <5%)
- User retention in receipt scanning feature

---

## Next Steps (When Ready)

1. Review and approve architecture
2. Implement Phase 1 (core tables + exact matching)
3. Test with real receipts for 2 weeks
4. Gather user feedback
5. Proceed with Phase 2 (fuzzy matching)
6. Monitor performance and costs
7. Iterate based on user behavior

---

## Notes

- **Privacy**: All data is household-scoped, no cross-household sharing
- **Offline**: Exact matches work offline, fuzzy matching requires network
- **Performance**: Fuzzy matching on 1000 ingredients takes ~100ms on mobile
- **Storage**: ~1KB per ingredient, 10KB per 100 ingredients = negligible

---

**Status**: Ready for implementation when prioritized.
