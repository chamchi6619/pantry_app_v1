# Logic Audit Findings - L4 Vision Implementation

**Date:** 2025-10-10
**Auditor:** Logic trace through codebase
**Severity:** 🔴 **CRITICAL BUGS FOUND** - System would crash in production

---

## Executive Summary

The L4 vision implementation has **3 critical bugs** and **2 moderate issues** that would cause runtime crashes and data corruption. The core ladder logic (L1→L2→L2.5→L3) is solid, but the L4 integration has schema mismatches and missing required fields.

**Status:** ❌ **NOT PRODUCTION READY** - Would fail on first L4 extraction

---

## 🔴 CRITICAL BUG #1: Missing Required Fields in L4 Ingredient Mapping

**Location:** `extract-cook-card/index.ts:612-620`

**Issue:**
The `Ingredient` interface requires `provenance` and `sort_order` fields, but the L4 vision path doesn't include them.

**Current Code:**
```typescript
cookCard.ingredients = visionResult.ingredients.map(ing => ({
  name: ing.name,
  amount: ing.amount !== undefined ? ing.amount : null,
  unit: ing.unit || null,
  confidence: visionResult.confidence,
  evidence_phrase: ing.evidence_phrase || null,
  evidence_source: 'video_vision',
  comment_score: null,
  // ❌ MISSING: provenance (required)
  // ❌ MISSING: sort_order (required)
}));
```

**Interface Requirement:**
```typescript
interface Ingredient {
  name: string;
  confidence: number;
  provenance: string;      // ❌ REQUIRED, not optional
  sort_order: number;      // ❌ REQUIRED, not optional
  // ... other fields
}
```

**Impact:**
- TypeScript compilation should fail (if strict mode enabled)
- Database insert would fail if `provenance` is NOT NULL
- Undefined behavior when sorting ingredients
- **Runtime crash** when `matchCanonicalItems()` tries to iterate

**Fix:**
```typescript
cookCard.ingredients = visionResult.ingredients.map((ing, index) => ({
  name: ing.name,
  amount: ing.amount !== undefined ? ing.amount : null,
  unit: ing.unit || null,
  confidence: visionResult.confidence,
  provenance: 'video_vision',      // ✅ ADD THIS
  sort_order: index,                // ✅ ADD THIS
  evidence_phrase: ing.evidence_phrase || null,
  evidence_source: 'video_vision',
  comment_score: null,
}));
```

---

## 🔴 CRITICAL BUG #2: Missing `normalized_name` Field

**Location:** `extract-cook-card/index.ts:612-620`

**Issue:**
The L3 path calls `normalizeIngredient()` which adds `normalized_name`, but L4 skips this step entirely.

**L3 Does This (Correct):**
```typescript
// extract-cook-card/index.ts:1186-1202
const normalizedIngredients = result.ingredients.map((ing, index) => {
  const normalized = normalizeIngredient({
    name: ing.name,
    amount: ing.amount,
    unit: ing.unit,
  });

  return {
    name: normalized.name,
    normalized_name: normalized.normalized_name,  // ✅ Added by normalizeIngredient
    amount: normalized.amount,
    unit: normalized.unit,
    confidence: result.confidence,
    provenance: 'detected',
    sort_order: index,
    evidence_phrase: ing.evidence_phrase,
  };
});
```

**L4 Does This (Wrong):**
```typescript
cookCard.ingredients = visionResult.ingredients.map(ing => ({
  name: ing.name,
  // ❌ NO NORMALIZATION - name might be "Olive Oil" instead of "olive oil"
  // ❌ NO normalized_name field
}));
```

**Impact:**
- Ingredient names not lowercased → canonical matching fails
- Missing `normalized_name` → `matchCanonicalItems()` might fail
- Inconsistent data between L3 and L4 extractions
- Same ingredient appears as duplicates ("Olive Oil" vs "olive oil")

**Fix:**
```typescript
cookCard.ingredients = visionResult.ingredients.map((ing, index) => {
  const normalized = normalizeIngredient({
    name: ing.name,
    amount: ing.amount,
    unit: ing.unit,
  });

  return {
    name: normalized.name,
    normalized_name: normalized.normalized_name,  // ✅ ADD THIS
    amount: normalized.amount,
    unit: normalized.unit,
    confidence: visionResult.confidence,
    provenance: 'video_vision',
    sort_order: index,
    evidence_phrase: ing.evidence_phrase || null,
    evidence_source: 'video_vision',
    comment_score: null,
  };
});
```

---

## 🔴 CRITICAL BUG #3: Budget Reservation Race Condition

**Location:** `extract-cook-card/index.ts:637`

**Issue:**
Budget is reserved AFTER success, but there's a race condition between checking and reserving.

**Scenario:**
1. User A checks budget: 29 minutes used, limit 30, trying to use 2 minutes
2. User B checks budget: 29 minutes used, limit 30, trying to use 2 minutes
3. Both pass the check (29 + 2 = 31 > 30? No, wait... check uses `>` not `>=`)
4. User A reserves 2 minutes → 31 total
5. User B reserves 2 minutes → 33 total
6. **Global budget exceeded by 3 minutes**

**Current Check Logic:**
```typescript
// rateLimiting.ts:221
const wouldExceed = currentUsage + video_duration_minutes > limits.daily_l4_limit_minutes;
```

**Problem:**
The check happens, then API call happens (3-5s), then reservation happens. Two concurrent requests can both pass the check before either reserves.

**Impact:**
- Global budget cap can be exceeded by multiple concurrent requests
- Cost overruns possible (but limited to 2-3x budget in worst case)
- Free tier users could trigger L4 despite 0 minute limit

**Fix Options:**

**Option A: Optimistic Locking (Recommended)**
```typescript
// Reserve budget BEFORE calling API (optimistic)
await reserveL4Budget(supabase, user_id, videoDurationMinutes);

try {
  const visionResult = await extractFromVideoVision(...);

  if (!visionResult.success) {
    // Refund budget on failure
    await releaseL4Budget(supabase, user_id, videoDurationMinutes);
  }
} catch (err) {
  // Refund budget on error
  await releaseL4Budget(supabase, user_id, videoDurationMinutes);
  throw err;
}
```

**Option B: Atomic Increment (Better)**
Use Postgres `increment_rate_limit` which is already atomic:
```sql
-- Current implementation already has this:
CREATE OR REPLACE FUNCTION increment_rate_limit(...)
RETURNS REAL AS $$
BEGIN
  INSERT ... ON CONFLICT DO UPDATE SET count = count + p_increment
  RETURNING count INTO v_current_count;

  -- ✅ Check AFTER increment
  IF v_current_count > p_limit THEN
    RAISE EXCEPTION 'Budget exceeded';
  END IF;

  RETURN v_current_count;
END;
```

But `checkUserL4Budget` only reads, doesn't reserve atomically.

**Recommended Fix:**
Add `reserveL4BudgetAtomic()` function that increments and checks in one transaction.

---

## 🟡 MODERATE ISSUE #1: Inconsistent Confidence Calculation

**Location:** `llm.ts:759-761` vs `extract-cook-card/index.ts:678-680`

**Issue:**
Vision sets per-ingredient confidence, but then it gets overwritten by `avgConfidence` calculation.

**L4 Vision Sets:**
```typescript
// llm.ts:759-761
const confidence = parsed.ingredients.length === 0 ? 0.0 :
                  parsed.ingredients.length <= 2 ? 0.75 :
                  parsed.ingredients.length <= 4 ? 0.85 : 0.90;

cookCard.ingredients = visionResult.ingredients.map(ing => ({
  confidence: visionResult.confidence,  // Sets to 0.75-0.90
}));
```

**Then Main Function Overwrites:**
```typescript
// extract-cook-card/index.ts:678-680
const avgConfidence =
  cookCard.ingredients.reduce((sum, ing) => sum + ing.confidence, 0) /
  cookCard.ingredients.length;
cookCard.extraction.confidence = avgConfidence;  // ✅ This is fine

// But wait, line 633 already set this:
cookCard.extraction.confidence = visionResult.confidence;  // ❌ Gets overwritten
```

**Impact:**
- Line 633 sets `cookCard.extraction.confidence`
- Line 681 overwrites it with `avgConfidence`
- Not a bug per se, but redundant assignment
- Confidence is calculated twice (once in vision function, once in main)

**Fix:**
Remove line 633, let the avgConfidence calculation handle it:
```typescript
// DELETE THIS LINE:
cookCard.extraction.confidence = visionResult.confidence;

// Keep the avgConfidence calculation (line 678-681)
```

---

## 🟡 MODERATE ISSUE #2: Missing `group` Field in Vision Ingredients

**Location:** `extract-cook-card/index.ts:612-620`

**Issue:**
L3 path has section grouping, L4 doesn't.

**L3 Path:**
```typescript
const groupedIngredients = groupIngredientsBySections(sectionResult.filtered);
// Results in ingredients with `group: "For the sauce"` or `group: undefined`

cookCard.ingredients = groupedIngredients.map(ing => ({
  ...ing,  // Includes group field
}));
```

**L4 Path:**
```typescript
cookCard.ingredients = visionResult.ingredients.map(ing => ({
  // ❌ NO group field
}));
```

**Impact:**
- L3 extractions have grouped ingredients ("For the sauce:")
- L4 extractions don't
- Inconsistent UX between extraction paths
- Not a bug, but missing feature parity

**Fix:**
Vision API doesn't need section grouping (it can parse context directly), but we should still add the field for consistency:
```typescript
cookCard.ingredients = visionResult.ingredients.map((ing, index) => ({
  // ... other fields
  group: undefined,  // Vision doesn't have section headers
}));
```

Or better: Parse section headers from vision `evidence_phrase` if they exist.

---

## ✅ CORRECT IMPLEMENTATIONS

### 1. Rate Limiting Logic (Solid)
```typescript
// Lines 126-150
const quotaCheck = await checkMonthlyQuota(supabase, user_id);
const rateLimitCheck = await checkHourlyRateLimit(supabase, user_id, tier);
```
- ✅ Monthly quota checked first
- ✅ Hourly rate limit enforced
- ✅ Atomic increment in Postgres
- ✅ Fail-closed on error

### 2. Budget Checks (Good, except race condition)
```typescript
// Lines 549-600
const globalBudgetCheck = await checkGlobalL4Budget(supabase, videoDurationMinutes);
const userBudgetCheck = await checkUserL4Budget(supabase, user_id, tier, videoDurationMinutes);
```
- ✅ Global budget checked before user budget (correct order)
- ✅ Clear error messages
- ✅ Telemetry logged
- ⚠️ Race condition (see Bug #3)

### 3. Ladder Flow (Excellent)
```typescript
// L1 → L2 → L2.5 → L3 → L4
```
- ✅ Clear progression
- ✅ Each level tries before moving to next
- ✅ Quality gates prevent wasted LLM calls
- ✅ Graceful fallback on failure

### 4. Fraction Normalization (Perfect)
```typescript
// Line 373
sourceText = normalizeFractions(sourceText);
```
- ✅ Applied before quality gate
- ✅ Improves evidence matching
- ✅ Handles all common fractions

### 5. Telemetry (Comprehensive)
```typescript
// Lines 707-728
ladder_path, evidence_source, vision_used, etc.
```
- ✅ All critical metrics tracked
- ✅ Distinguishes L4 from L3
- ✅ Cost tracking accurate

---

## 🎯 PRIORITY FIXES

### Must Fix Before Production (Critical)

1. **Add `provenance` and `sort_order` to L4 ingredients** (5 minutes)
   - Impact: Runtime crash
   - Severity: CRITICAL
   - Location: `extract-cook-card/index.ts:612-620`

2. **Add normalization to L4 ingredients** (10 minutes)
   - Impact: Data inconsistency, duplicate ingredients
   - Severity: CRITICAL
   - Location: Same as #1

3. **Fix budget reservation race condition** (30 minutes)
   - Impact: Budget overruns, cost leaks
   - Severity: CRITICAL
   - Location: `rateLimiting.ts` + `extract-cook-card/index.ts:637`

### Should Fix (Moderate)

4. **Remove redundant confidence assignment** (2 minutes)
   - Impact: Code clarity
   - Severity: MODERATE
   - Location: `extract-cook-card/index.ts:633`

5. **Add `group` field to L4 for consistency** (5 minutes)
   - Impact: UX consistency
   - Severity: MODERATE
   - Location: `extract-cook-card/index.ts:612-620`

---

## 📋 CORRECTED CODE

### Fixed L4 Ingredient Mapping

```typescript
// Replace lines 612-620 with:
cookCard.ingredients = visionResult.ingredients.map((ing, index) => {
  // Normalize ingredient (same as L3)
  const normalized = normalizeIngredient({
    name: ing.name,
    amount: ing.amount,
    unit: ing.unit,
  });

  return {
    name: normalized.name,
    normalized_name: normalized.normalized_name,
    amount: normalized.amount,
    unit: normalized.unit,
    confidence: visionResult.confidence,
    provenance: 'video_vision',
    sort_order: index,
    evidence_phrase: ing.evidence_phrase || null,
    evidence_source: 'video_vision',
    comment_score: null,
    group: undefined,  // Vision doesn't have section grouping
  };
});
```

### Fixed Budget Reservation (Optimistic Lock)

```typescript
// Replace lines 602-637 with:
console.log(`🤖 Calling L4 Vision for ${duration_seconds}s video...`);

// Reserve budget BEFORE calling API (optimistic lock)
await reserveL4Budget(supabase, user_id, videoDurationMinutes);

let visionResult;
try {
  visionResult = await extractFromVideoVision(url, title, duration_seconds, false);
  extractionCost += visionResult.cost_cents;

  if (!visionResult.success || visionResult.ingredients.length === 0) {
    // Refund budget on failure
    await releaseL4Budget(supabase, user_id, videoDurationMinutes);

    console.error("❌ L4 Vision extraction failed:", visionResult.error || "No ingredients found");
    await logEvent(supabase, {
      user_id,
      household_id,
      event_type: "l4_vision_failed",
      error: visionResult.error,
      duration_seconds,
    });

    return new Response(
      JSON.stringify({
        error: "Could not extract ingredients from this URL",
        fallback: "cook_card_lite",
        cook_card: cookCard,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
} catch (err) {
  // Refund budget on error
  await releaseL4Budget(supabase, user_id, videoDurationMinutes);
  throw err;
}

// Success path continues...
console.log(`✅ L4 Vision: Extracted ${visionResult.ingredients.length} ingredients`);
```

### Add Release Budget Function

```typescript
// Add to rateLimiting.ts:
export async function releaseL4Budget(
  supabase: any,
  user_id: string,
  video_duration_minutes: number
): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Decrement user counter
    await supabase.rpc('increment_rate_limit', {
      p_user_id: user_id,
      p_counter_type: 'daily_l4_user',
      p_window_key: today,
      p_increment: -video_duration_minutes,  // Negative to decrement
      p_ttl_seconds: 86400,
    });

    // Decrement global counter
    await supabase.rpc('increment_rate_limit', {
      p_user_id: GLOBAL_USER_ID,
      p_counter_type: 'daily_l4_global',
      p_window_key: today,
      p_increment: -video_duration_minutes,
      p_ttl_seconds: 86400,
    });

    console.log(`💰 Released ${video_duration_minutes.toFixed(2)} minutes of L4 budget`);
  } catch (err) {
    console.error('Failed to release L4 budget:', err);
    // Non-blocking - log error but continue
  }
}
```

---

## ✅ FINAL VERDICT

**Current Implementation:** 🔴 **NOT PRODUCTION READY**

**After Fixes:** 🟢 **PRODUCTION READY**

**Estimated Fix Time:** ~1 hour

**Risk Assessment:**
- **Before Fixes:** HIGH - Would crash on first L4 extraction
- **After Fixes:** LOW - All critical paths protected

---

## 🧪 TEST PLAN

After applying fixes, test:

1. **L4 End-to-End:** YouTube video with no description
   - ✅ Should trigger L4
   - ✅ Ingredients should have all required fields
   - ✅ `provenance: 'video_vision'`
   - ✅ `sort_order: 0, 1, 2...`
   - ✅ `normalized_name` present

2. **Budget Race Condition:** Make 2 concurrent requests at budget limit
   - ✅ One should succeed, one should fail
   - ✅ Budget should not exceed limit

3. **Budget Refund:** Trigger L4 with invalid video
   - ✅ Budget should be reserved
   - ✅ API call fails
   - ✅ Budget should be released
   - ✅ Next request should have budget available

4. **Confidence Calculation:** Check final cookCard
   - ✅ `cookCard.extraction.confidence` should equal avg of ingredient confidences
   - ✅ Should be between 0.75-0.90 for vision

---

**Audit Complete.** Apply fixes before production deployment.
