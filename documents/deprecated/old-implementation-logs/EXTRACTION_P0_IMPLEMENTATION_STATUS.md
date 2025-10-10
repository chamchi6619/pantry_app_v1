# Extraction Flow P0 Implementation Status

## ✅ COMPLETED (P0)

### 1. YouTube Comments API with Relevance Scoring
**Status:** ✅ DONE
**Files Modified:**
- `supabase/functions/_shared/commentHarvester.ts`
  - Changed `maxResults` default from 20 → 50
  - Already using `order='relevance'`
  - Already has `likeCount` weighting in scoring

**Result:** Comments API properly configured with relevance ordering and increased coverage.

---

### 2. Cache Key with Extraction Version
**Status:** ✅ DONE
**Files Modified:**
- `supabase/functions/_shared/cache.ts`
  - Added `EXTRACTION_VERSION = "1.0.0"` constant
  - Updated `computeInputHash()` to include version in hash
  - Cache invalidates automatically when version bumped

**Usage:** Bump `EXTRACTION_VERSION` to `"1.0.1"` when you change:
- LLM prompts
- Evidence validation logic
- Section header filtering
- Any extraction algorithm

---

### 3. Helper Utilities Created
**Status:** ✅ DONE
**New File:** `supabase/functions/_shared/extractionHelpers.ts`

**Functions Added:**
1. `hasRecipeQualitySignals(text)` - Detect if text worth sending to LLM
2. `normalizeFractions(text)` - Convert unicode fractions (½ → 0.5)
3. `groupIngredientsBySections(ingredients)` - Parse section headers into groups
4. `fetchYouTubeTranscriptSafe(videoId)` - Timeout-protected transcript fetch
5. `isTranscriptExtractionEnabled()` - Feature flag check

---

## ⏳ REMAINING (P0 - Critical)

### 4. Quality Signals Gate Before L3
**Status:** ⏳ TODO
**Location:** `supabase/functions/extract-cook-card/index.ts` (Step 5, before LLM call)

**Implementation:**
```typescript
// Import at top
import { hasRecipeQualitySignals } from '../_shared/extractionHelpers.ts';

// Before L3 (line ~330):
if (sourceText.length >= 50) {
  // NEW: Check quality signals
  if (!hasRecipeQualitySignals(sourceText)) {
    console.log('⏭️  L3 skipped: No recipe quality signals detected');

    await logEvent(supabase, {
      user_id,
      household_id,
      event_type: "l3_gate_failed",
      reason: "no_quality_signals",
      text_length: sourceText.length,
    });

    // Skip to L4 or fallback
  } else {
    // Proceed with L3 extraction
    const llmResult = await extractWithLLM(...);
  }
}
```

**Impact:** Saves $0.00005 per useless extraction (spam, pure praise, etc.)

---

### 5. Transcript Timeout & Feature Flag
**Status:** ⏳ TODO
**Location:** `supabase/functions/extract-cook-card/index.ts` (Step 4.4, L2.5)

**Implementation:**
```typescript
// Import at top
import { fetchYouTubeTranscriptSafe } from '../_shared/extractionHelpers.ts';

// Replace current transcript fetch (line ~298-325):
if (platform === 'youtube' && duration_seconds < 180 && sourceText.length < 200) {
  console.log(`📹 L2.5: Short-form video (${duration_seconds}s), fetching transcript...`);

  const videoId = extractYouTubeVideoId(url);
  if (videoId) {
    const transcript = await fetchYouTubeTranscriptSafe(videoId, 3000); // 3s timeout

    if (transcript.length > 0) {
      sourceText = description + '\n\nTranscript:\n' + transcript;
      evidenceSource = 'description+transcript';
      console.log(`   ✅ L2.5: Transcript added (total: ${sourceText.length} chars)`);

      await logEvent(supabase, {
        user_id,
        household_id,
        event_type: "l2.5_transcript_found",
        transcript_length: transcript.length,
        total_length: sourceText.length,
      });
    } else {
      console.log('   ⚠️ L2.5: No transcript available');
    }
  }
}
```

**Environment Variable:**
```bash
ENABLE_TRANSCRIPT_EXTRACTION=true  # Set to false to disable
```

---

### 6. Section Header Grouping
**Status:** ⏳ TODO
**Location:** `supabase/functions/extract-cook-card/index.ts` (Step 5, after evidence validation)

**Implementation:**
```typescript
// Import at top
import { groupIngredientsBySections } from '../_shared/extractionHelpers.ts';

// After section header filter (line ~383-395):
const sectionResult = filterSectionHeaders(evidenceResult.validated);

// NEW: Group ingredients by sections
const groupedIngredients = groupIngredientsBySections(sectionResult.filtered);

console.log(`   📂 Section grouping: ${groupedIngredients.filter(i => i.group).length} ingredients assigned to groups`);

// Update cook card
cookCard.ingredients = groupedIngredients.map(ing => ({
  ...ing,
  evidence_source: evidenceSource,
  comment_score: commentScore,
}));
```

**Result:** "For the sauce:" becomes a `group` field instead of being rejected.

---

### 7. Bud get Caps with Rate Limiting
**Status:** ⏳ TODO (REQUIRES REDIS SETUP)
**Location:** Multiple

**Redis Setup Needed:**
```typescript
// Need to add Redis client setup
import { createClient } from 'https://esm.sh/@upstash/redis';

const redis = createClient({
  url: Deno.env.get('UPSTASH_REDIS_URL'),
  token: Deno.env.get('UPSTASH_REDIS_TOKEN'),
});
```

**Implementation Points:**

**A. Monthly Quota Check (line ~100, after parse request):**
```typescript
// Check user's monthly quota
const { data: userQuota } = await supabase
  .from('user_quotas')
  .select('extractions_this_month, tier')
  .eq('user_id', user_id)
  .single();

const limits = {
  free: 10,
  pro: 500,
  pro_plus: 2000,
};

if (userQuota.extractions_this_month >= limits[userQuota.tier]) {
  return new Response(JSON.stringify({
    error: "Monthly extraction limit reached",
    fallback: "link_only",
    cook_card: null,
  }), { status: 200 });
}
```

**B. Hourly Rate Limit (line ~100):**
```typescript
// Check hourly rate limit (Redis)
const currentHour = new Date().toISOString().slice(0, 13); // "2025-10-10T11"
const hourlyKey = `rate_limit:${user_id}:${currentHour}`;
const hourlyCount = await redis.get(hourlyKey) || 0;

const hourlyLimits = { free: 2, pro: 10, pro_plus: 20 };

if (hourlyCount >= hourlyLimits[userQuota.tier]) {
  return new Response(JSON.stringify({
    error: "Hourly rate limit exceeded",
    fallback: "link_only",
    retry_after: 3600,
  }), { status: 429 });
}

// Increment counter
await redis.incr(hourlyKey);
await redis.expire(hourlyKey, 3600); // 1 hour TTL
```

**C. Daily L4 Budget (before vision call):**
```typescript
// Check global L4 budget
const today = new Date().toISOString().slice(0, 10); // "2025-10-10"
const globalL4Key = `l4_budget:global:${today}`;
const dailyL4Used = parseFloat(await redis.get(globalL4Key) || '0');

if (dailyL4Used + videoDurationMinutes > 400) {
  console.error('❌ Global L4 budget exceeded (400 minutes/day)');
  return fallbackResponse;
}

// Check user L4 budget
const userL4Key = `l4_budget:${user_id}:${today}`;
const userL4Used = parseFloat(await redis.get(userL4Key) || '0');
const userL4Limit = userQuota.tier === 'pro' ? 30 : 60;

if (userL4Used + videoDurationMinutes > userL4Limit) {
  console.error('❌ User L4 budget exceeded');
  return fallbackResponse;
}

// After successful L4 call:
await redis.incrbyfloat(globalL4Key, videoDurationMinutes);
await redis.incrbyfloat(userL4Key, videoDurationMinutes);
await redis.expire(globalL4Key, 86400); // 24h TTL
await redis.expire(userL4Key, 86400);
```

---

### 8. Vision Guardrails (L4 Implementation)
**Status:** ⏳ TODO (MAJOR FEATURE)
**Location:** `supabase/functions/extract-cook-card/index.ts` (New Step 6)

**This is the biggest remaining task.** Requires:
1. Gemini SDK setup for vision
2. Pre-cost estimation logic
3. Budget checks (depends on #7)
4. YouTube URL direct processing
5. Structured output schema
6. Token counting

**Estimated Implementation:** 200-300 lines of new code

**Placeholder:**
```typescript
// STEP 6: VIDEO VISION FALLBACK (L4)
if (!cookCard || cookCard.ingredients.length === 0) {
  if (platform === 'youtube') {
    // Budget checks (from #7)
    // Estimate cost
    // Call Gemini 2.5 Flash with YouTube URL
    // Parse structured response
    // Update cookCard
  }
}
```

---

### 9. Enhanced Telemetry Logging
**Status:** ⏳ TODO
**Location:** Throughout `supabase/functions/extract-cook-card/index.ts`

**Fields to Add to Final `extraction_completed` Event:**
```typescript
await logEvent(supabase, {
  user_id,
  household_id,
  event_type: "extraction_completed",

  // Path tracking
  ladder_path: "L1→L3",  // or "L2→L3", "L4", etc.
  extraction_method: cookCard.extraction.method,
  evidence_source: evidenceSource,

  // Tokens & cost
  tokens_in: llmResult.tokens_in || null,
  tokens_out: llmResult.tokens_out || null,
  cost_cents: extractionCost,

  // Cache
  cache_status: "miss",

  // Comments (if used)
  comment_used: commentUsed,
  comment_id: bestComment?.comment.id || null,
  comment_score: commentScore,

  // Quality metrics
  ingredients_count: cookCard.ingredients.length,
  ingredients_rejected_no_evidence: evidenceResult.rejected.length,
  ingredients_rejected_section_header: sectionResult.removed.length,
  extraction_confidence: avgConfidence,

  // Vision (if used)
  vision_used: false,  // TODO: Update when L4 implemented
  vision_model: null,
  vision_media_resolution: null,
  vision_duration_seconds: null,

  // Performance
  extraction_latency_ms: Date.now() - extractionStartTime,

  // Input
  url_hash: await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url)),
  source_text_length: sourceText.length,
  source_text_hash: await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceText)),
});
```

---

## 📊 Implementation Priority

### Can Ship Now (MVP):
1. ✅ Comments API (done)
2. ✅ Cache versioning (done)
3. ✅ Helper utilities (done)
4. Quality signals gate (30 min)
5. Transcript timeout (15 min)
6. Section grouping (15 min)
7. Enhanced telemetry (30 min)

**Total:** ~90 minutes to MVP-ready

### Requires Infrastructure (Block until Redis setup):
7. Budget caps & rate limiting
8. Vision guardrails (L4)

---

## 🚀 Deployment Checklist

### Environment Variables to Add:
```bash
# Feature flags
ENABLE_TRANSCRIPT_EXTRACTION=true

# Redis (for rate limiting)
UPSTASH_REDIS_URL=https://...
UPSTASH_REDIS_TOKEN=...

# Gemini (for L4 vision)
GEMINI_API_KEY=...  # Already have this
```

### Database Tables to Verify:
- `user_quotas` table with:
  - `user_id`
  - `tier` (free | pro | pro_plus)
  - `extractions_this_month`
  - `extraction_cost_cents`

### Testing Plan:
1. Test L1 → L3 (description-based)
2. Test L2 → L3 (comment-based)
3. Test L2.5 → L3 (transcript-based)
4. Test quality gate rejection (spam text)
5. Test section grouping ("For the sauce:")
6. Test cache invalidation (bump version)
7. Test rate limiting (Redis)
8. Test L4 vision fallback (after implementation)

---

## Next Steps

**Immediate (Can do now):**
1. Add quality signals gate to extraction flow
2. Replace transcript fetch with safe version
3. Add section grouping after evidence validation
4. Enhance telemetry logging
5. Deploy and test

**Blocked (Need setup first):**
6. Set up Upstash Redis account
7. Add Redis env vars to Supabase
8. Implement budget caps
9. Implement L4 vision fallback
10. Full integration testing

---

## Files Modified Summary

### ✅ Completed:
- `supabase/functions/_shared/commentHarvester.ts`
- `supabase/functions/_shared/cache.ts`
- `supabase/functions/_shared/extractionHelpers.ts` (NEW)

### ⏳ Need Updates:
- `supabase/functions/extract-cook-card/index.ts` (main changes)
- `supabase/functions/_shared/llm.ts` (add token counting for telemetry)

---

**Last Updated:** 2025-10-10
**Status:** 30% complete (P0 items), ready to continue
