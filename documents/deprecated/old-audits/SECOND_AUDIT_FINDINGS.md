# Second Logic Audit Findings

**Date:** 2025-10-10
**Status:** 🔴 **1 CRITICAL BUG FOUND** - Monthly quota bypass

---

## Executive Summary

After fixing the first round of bugs, I found **1 remaining critical bug** that allows users to bypass monthly quota limits when L4 vision is used.

**Impact:** Free tier users could make unlimited L4 extractions (expensive!) without hitting quota limits.

---

## 🔴 CRITICAL BUG: Monthly Quota Not Incremented for L4

**Location:** `extract-cook-card/index.ts:480` (only called in L3 block)

**Issue:**
`incrementMonthlyQuota()` is only called when L3 succeeds (line 480), but NOT when L4 succeeds. This means L4 extractions don't count toward monthly limits.

**Current Flow:**

```typescript
// L3 Success Path
if (llmResult.success && llmResult.ingredients.length > 0) {
  // ... process ingredients
  await incrementMonthlyQuota(supabase, user_id, extractionCost);  // ✅ LINE 480
  // ... continue
}

// L4 Trigger
if (!cookCard || cookCard.ingredients.length === 0) {
  // ... L4 vision extraction
  if (visionResult.success) {
    // ... process ingredients
    // ❌ NO incrementMonthlyQuota() call!
    // Continue to finalization
  }
}

// Finalization (both L3 and L4 reach here)
const avgConfidence = ...;
await setCachedExtraction(...);
await logEvent(..., "extraction_completed");
return response;
```

**Attack Scenario:**

1. Free tier user has 10/10 monthly limit used
2. User pastes YouTube video with minimal description
3. L1→L2→L2.5→L3 all fail (no text)
4. L4 vision triggers
5. L4 succeeds, extracts ingredients
6. Monthly quota is NOT incremented (still shows 10/10)
7. User can repeat infinitely, bypassing quota

**Cost Impact:**

- Free tier: 10 legit extractions (~$0.008) + unlimited L4 (~$0.003 each)
- 100 L4 extractions = $0.30 cost, $0 revenue (should be blocked at 10)
- **Potential loss: Unlimited**

---

## Root Cause Analysis

### Why This Happened

The `incrementMonthlyQuota` call was added inside the L3 success block (line 480) as part of the original implementation. When L4 was added later, it was placed AFTER the L3 block, so it skips the quota increment.

### Code Structure

```
try {
  // L3 Block
  if (sourceText.length >= 50) {
    const llmResult = await extractWithLLM(...);

    if (llmResult.success) {
      // ... process
      await incrementMonthlyQuota(...);  // ✅ HERE for L3
    }
  }
} catch (err) {
  // handle error
}

// L4 Block (OUTSIDE try-catch, AFTER L3)
if (!cookCard || cookCard.ingredients.length === 0) {
  // ... L4 logic
  if (visionResult.success) {
    // ... process
    // ❌ NO incrementMonthlyQuota() call
  }
}

// Finalization (both paths reach here)
```

The L4 block is a sibling to the L3 block, not nested inside it, so it never hits line 480.

---

## ✅ CORRECT IMPLEMENTATIONS (Not Bugs)

### 1. Budget Reservation (Fixed Previously)
```typescript
// L4 reserves budget BEFORE API call
await reserveL4Budget(supabase, user_id, videoDurationMinutes);

try {
  visionResult = await extractFromVideoVision(...);
  if (!visionResult.success) {
    await releaseL4Budget(...);  // Refund on failure
  }
} catch (err) {
  await releaseL4Budget(...);  // Refund on error
}
```
✅ This is correct - no race condition.

### 2. Ingredient Schema (Fixed Previously)
```typescript
cookCard.ingredients = visionResult.ingredients.map((ing, index) => {
  const normalized = normalizeIngredient({...});
  return {
    name: normalized.name,
    normalized_name: normalized.normalized_name,
    provenance: 'video_vision',
    sort_order: index,
    // ... all required fields
  };
});
```
✅ This is correct - all required fields present.

### 3. Division by Zero Check
```typescript
const avgConfidence =
  cookCard.ingredients.reduce((sum, ing) => sum + ing.confidence, 0) /
  cookCard.ingredients.length;
```

**Analysis:**
- Line 500: `if (!cookCard || cookCard.ingredients.length === 0)` enters L4
- Line 644: L4 success sets `cookCard.ingredients = visionResult.ingredients.map(...)`
- Line 611: L4 failure checks `visionResult.ingredients.length === 0` and returns early
- Therefore, line 697 is only reached when `ingredients.length > 0`

✅ This is safe - no division by zero possible.

### 4. L4 Refund Logic
```typescript
if (!visionResult.success || visionResult.ingredients.length === 0) {
  await releaseL4Budget(supabase, user_id, videoDurationMinutes);
  return fallbackResponse;  // Early return
}
```
✅ Correct - budget refunded on failure before returning.

---

## 🎯 FIX REQUIRED

### Add Monthly Quota Increment After Finalization

**Option A: Move to Finalization Block (Recommended)**

```typescript
// After line 711 (after setCachedExtraction)
await setCachedExtraction(supabase, url, inputHash, cookCard, extractionCost);

// NEW: Increment monthly quota for all successful extractions
await incrementMonthlyQuota(supabase, user_id, extractionCost);

// Step 7: Log extraction completed event
await logEvent(supabase, {
```

**Pros:**
- Single place for quota increment
- Works for both L3 and L4
- Works for any future extraction methods

**Cons:**
- None

**Option B: Add to L4 Success Block**

```typescript
// After line 691 (after l4_vision_success event)
await logEvent(supabase, {
  user_id,
  household_id,
  event_type: "l4_vision_success",
  // ...
});

// NEW: Increment monthly quota
await incrementMonthlyQuota(supabase, user_id, extractionCost);

// Continue to finalization
```

**Pros:**
- Symmetrical with L3 (line 480)

**Cons:**
- Duplicate code
- Have to remember for future extraction methods

### Recommended Fix: Option A

Move the `incrementMonthlyQuota` call to the finalization block (after caching, before telemetry). This ensures ALL successful extractions increment the quota, regardless of method.

---

## 📊 Impact Assessment

### Before Fix

| User Action | L3 Result | L4 Result | Quota Incremented? | Monthly Count |
|-------------|-----------|-----------|-------------------|---------------|
| Extract with description | Success | N/A | ✅ Yes | +1 |
| Extract without description | Fail | Success | ❌ NO | +0 |
| Extract without description | Fail | Fail | N/A | +0 |

### After Fix

| User Action | L3 Result | L4 Result | Quota Incremented? | Monthly Count |
|-------------|-----------|-----------|-------------------|---------------|
| Extract with description | Success | N/A | ✅ Yes | +1 |
| Extract without description | Fail | Success | ✅ Yes | +1 |
| Extract without description | Fail | Fail | N/A | +0 |

---

## 🧪 Test Plan

### Verify Monthly Quota Increment

```sql
-- Before test
SELECT extractions_this_month FROM user_quotas WHERE user_id = '<test_user>';
-- Returns: 0

-- Test L3 extraction (with description)
-- Make API request with URL that has good description

SELECT extractions_this_month FROM user_quotas WHERE user_id = '<test_user>';
-- Expected: 1 ✅

-- Test L4 extraction (without description)
-- Make API request with URL that has no description, triggers L4

SELECT extractions_this_month FROM user_quotas WHERE user_id = '<test_user>';
-- Expected: 2 ✅ (CURRENTLY BROKEN - would still show 1)
```

### Verify Free Tier Quota Enforcement

```bash
# Set user to free tier with 10/10 used
UPDATE user_quotas
SET extractions_this_month = 10, tier = 'free'
WHERE user_id = '<test_user>';

# Try L4 extraction
curl -X POST ... <video_with_no_description>

# Expected: 429 or quota exceeded error
# Currently: ❌ Would succeed (bypass)
```

---

## 🔍 Additional Observations (Not Bugs)

### 1. extractionCost Tracking

```typescript
// L3 adds cost
extractionCost += llmResult.cost;

// L4 adds cost
extractionCost += visionResult.cost_cents;

// Finalization sets cost
cookCard.extraction.cost_cents = extractionCost;
```

✅ This is correct - cumulative cost tracking works fine.

### 2. Cache Invalidation

```typescript
const inputHash = await computeInputHash(url, title, description, undefined);
```

The cache key includes `EXTRACTION_VERSION` from `cache.ts`, which was added in the first fix.

✅ This is correct - cache will invalidate when version bumped.

### 3. Telemetry Coverage

```typescript
ladder_path: cookCard.extraction.method === 'video_vision' ? 'L4' :
              evidenceSource === 'description' ? 'L1→L3' :
              evidenceSource === 'youtube_comment' ? 'L2→L3' :
              evidenceSource === 'description+transcript' ? 'L2.5→L3' : 'L3',
```

✅ This is correct - covers all paths including L4.

### 4. Error Handling

```typescript
} catch (err) {
  await releaseL4Budget(supabase, user_id, videoDurationMinutes);
  throw err;  // Re-throws to outer catch
}

// Outer catch (line 770)
} catch (err) {
  console.error("❌ Extraction error:", err);
  return new Response(
    JSON.stringify({ error: err.message }),
    { status: 500, headers: { "Content-Type": "application/json" } }
  );
}
```

✅ This is correct - errors are caught, budget refunded, and proper error response returned.

---

## ✅ FINAL VERDICT

**Current Implementation:** 🔴 **NOT PRODUCTION READY**

**Reason:** Monthly quota bypass for L4 extractions

**After Fix:** 🟢 **PRODUCTION READY**

**Estimated Fix Time:** 5 minutes (1 line move)

**Risk Level:**
- **Before Fix:** CRITICAL - Users can bypass quota limits, causing unlimited cost overruns
- **After Fix:** LOW - All quotas properly enforced

---

## 📝 Summary

The implementation is **99% correct**. The only remaining issue is a single missing function call that allows quota bypass for L4 extractions. This is a critical security/cost issue but trivial to fix.

**All other logic is solid:**
- ✅ Rate limiting works
- ✅ Budget reservation works (with optimistic locking)
- ✅ Ingredient schema is complete
- ✅ Normalization is applied
- ✅ No division by zero
- ✅ Error handling is robust
- ✅ Telemetry is comprehensive

**Fix and ship!**
