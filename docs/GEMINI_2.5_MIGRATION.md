# Gemini 2.0 → 2.5 Flash Migration Plan

**Created:** 2025-01-24
**Completed:** 2025-01-24
**Deadline:** ~~March 31, 2026~~ **March 3, 2026** (Updated by Google)
**Status:** ✅ MODEL MIGRATION COMPLETE | ⚠️ PRICING & OPTIMIZATION PENDING

---

## Background

Google is discontinuing Gemini 2.0 Flash and Gemini 2.0 Flash Lite on **March 31, 2026**.

**Affected models:**
- `gemini-2.0-flash` → Migrate to `gemini-2.5-flash`
- `gemini-2.0-flash-exp` → Migrate to `gemini-2.5-flash`
- `gemini-2.0-flash-lite` → Migrate to `gemini-2.5-flash-lite`

**Project affected:** `gen-lang-client-0115106148`

---

## API Compatibility Analysis

All features currently used are **fully compatible** with Gemini 2.5 Flash:

| Feature | Used In | Compatible |
|---------|---------|------------|
| `generationConfig.temperature` | All files | ✅ Yes |
| `generationConfig.maxOutputTokens` | All files | ✅ Yes |
| `generationConfig.topP` | llm.ts | ✅ Yes |
| `responseMimeType: 'application/json'` | Multiple | ✅ Yes |
| `responseSchema` (structured output) | parse-receipt-gemini | ✅ Yes |
| File API (video upload) | ytdlp-service | ✅ Yes |
| `usageMetadata` token counts | llm.ts | ✅ Yes |

**Response format:** No changes expected. Same structure:
```javascript
data.candidates[0].content.parts[0].text
data.usageMetadata.promptTokenCount
data.usageMetadata.candidatesTokenCount
```

---

## Files Requiring Changes

### Priority 1: Production Edge Functions (CRITICAL)

These are deployed and actively serving users.

| File | Current Model | Line(s) | Action |
|------|---------------|---------|--------|
| `supabase/functions/_shared/llm.ts` | `gemini-2.0-flash` | 438, 623 | Change to `gemini-2.5-flash` |
| `supabase/functions/clean-ingredients/index.ts` | `gemini-2.0-flash-exp` | 162 | Change to `gemini-2.5-flash` |
| `supabase/functions/clean-canonical-items/index.ts` | `gemini-2.0-flash-exp` | 96 | Change to `gemini-2.5-flash` |
| `supabase/functions/generate-meal-plan/index.ts` | `gemini-2.0-flash-exp` | 164, 277 | Change to `gemini-2.5-flash` |
| `backend/supabase/functions/parse-receipt-gemini/index.ts` | `gemini-2.0-flash-exp` | 193 | Change to `gemini-2.5-flash` |

### Priority 2: Version Labels (Logging/Tracking)

These are version strings stored in database for tracking purposes.

| File | Current String | Line(s) | Action |
|------|----------------|---------|--------|
| `supabase/functions/extract-cook-card/index.ts` | `L4-gemini-2.0-flash-vision-v89-natural` | 849, 2324 | Update to `gemini-2.5` |
| `supabase/functions/extract-cook-card/index.ts` | `L3-gemini-2.0-flash-evidence` | 1155, 1693, 1928 | Update to `gemini-2.5` |
| `supabase/functions/extract-cook-card/index.ts` | `L3.2-blog-gemini-2.0-flash` | 1351 | Update to `gemini-2.5` |
| `supabase/functions/extract-cook-card/index.ts` | `vision_model: 'gemini-2.0-flash'` | 2409 | Update to `gemini-2.5-flash` |
| `backend/supabase/functions/parse-receipt-gemini/index.ts` | `gemini-2.0-flash-normalized` | 275, 349 | Update to `gemini-2.5` |

### Priority 3: Backend Python (If Still Used)

| File | Current Model | Line(s) | Action |
|------|---------------|---------|--------|
| `backend/app/services/gemini_parser.py` | `gemini-2.0-flash` | 74-78 | Update model list |
| `backend/app/api/gemini_test.py` | `gemini-2.0-flash` | 65-66, 264 | Update model list |

### No Changes Needed

| File | Reason |
|------|--------|
| `ytdlp-service/index.js` | Uses File API only (model-agnostic) |
| `scripts/fix_failed_recipes.cjs` | Already uses `gemini-2.5-flash` |
| `scripts/debug_gemini.cjs` | Already uses `gemini-2.5-flash` |
| `scripts/generate_recipes.cjs` | Already uses `gemini-2.5-flash` |
| Documentation files (*.md) | Reference only, no code |

---

## Migration Steps

### Phase 1: Preparation (Before Migration)

- [ ] Review Gemini 2.5 Flash pricing and update cost calculations if needed
- [ ] Test Gemini 2.5 Flash API with sample requests
- [ ] Ensure all Edge Functions are backed up

### Phase 2: Staging Test

- [ ] Create feature branch `feature/gemini-2.5-migration`
- [ ] Update ONE Edge Function (recommend: `clean-canonical-items`)
- [ ] Deploy to staging/development environment
- [ ] Run test cases:
  - [ ] Recipe extraction (social media URL)
  - [ ] Recipe extraction (traditional URL)
  - [ ] Receipt parsing
  - [ ] Canonical matching

### Phase 3: Production Rollout

- [ ] Update `supabase/functions/_shared/llm.ts`
- [ ] Deploy and monitor for 24 hours
- [ ] Update remaining Edge Functions one by one:
  - [ ] `clean-ingredients/index.ts`
  - [ ] `clean-canonical-items/index.ts`
  - [ ] `generate-meal-plan/index.ts`
  - [ ] `parse-receipt-gemini/index.ts`
  - [ ] `extract-cook-card/index.ts` (version labels)
- [ ] Update backend Python files (if still in use)
- [ ] Update documentation

### Phase 4: Verification

- [ ] Monitor error rates for 1 week
- [ ] Compare extraction quality with 2.0 baseline
- [ ] Verify cost tracking is accurate
- [ ] Update this document with completion status

---

## Code Changes Reference

### llm.ts (Line 438)
```typescript
// Before
const model = 'gemini-2.0-flash';

// After
const model = 'gemini-2.5-flash';
```

### llm.ts (Line 623)
```typescript
// Before
const model = 'gemini-2.0-flash';

// After
const model = 'gemini-2.5-flash';
```

### clean-ingredients/index.ts (Line 162)
```typescript
// Before
`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`

// After
`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
```

### clean-canonical-items/index.ts (Line 96)
```typescript
// Before
`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`

// After
`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
```

### generate-meal-plan/index.ts (Lines 164, 277)
```typescript
// Before
model: "gemini-2.0-flash-exp",

// After
model: "gemini-2.5-flash",
```

### parse-receipt-gemini/index.ts (Line 193)
```typescript
// Before
`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`

// After
`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`
```

### gemini_parser.py (Lines 74-78)
```python
# Before
model_names = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash',
    ...
]

# After
model_names = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-1.5-flash',  # Fallback
    ...
]
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| API response format change | Low | High | Same API structure confirmed |
| Quality/accuracy regression | Medium | Medium | Test with sample data before rollout |
| Pricing changes | Low | Low | Review pricing docs, update cost tracking |
| Rate limit changes | Low | Low | Monitor after deployment |
| Downtime during migration | Low | Medium | Roll out one function at a time |

---

## Rollback Plan

If issues occur after migration:

1. Revert the specific Edge Function to previous version
2. Deploy immediately using Supabase CLI:
   ```bash
   supabase functions deploy <function-name>
   ```
3. Investigate issue in development environment
4. Fix and re-deploy when ready

---

## Timeline

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| Migration plan created | Jan 24, 2025 | ✅ Done |
| Code migration complete | Jan 24, 2025 | ✅ Done |
| Edge Functions deployment | TBD | Pending |
| Production verification | TBD | Pending |

## Files Changed (Jan 24, 2025)

All code files have been updated. The following changes were made:

### Production Edge Functions
- `supabase/functions/_shared/llm.ts` - Lines 438, 623: `gemini-2.0-flash` → `gemini-2.5-flash`
- `supabase/functions/clean-ingredients/index.ts` - Line 162: `gemini-2.0-flash-exp` → `gemini-2.5-flash`
- `supabase/functions/clean-canonical-items/index.ts` - Line 96: `gemini-2.0-flash-exp` → `gemini-2.5-flash`
- `supabase/functions/generate-meal-plan/index.ts` - Lines 164, 277: `gemini-2.0-flash-exp` → `gemini-2.5-flash`
- `supabase/functions/extract-cook-card/index.ts` - Version labels and vision_model updated

### Backend Functions
- `backend/supabase/functions/parse-receipt-gemini/index.ts` - API endpoint and method labels updated
- `backend/app/services/gemini_parser.py` - Model fallback list updated
- `backend/app/api/gemini_test.py` - Test model lists updated

### Test Scripts
- `scripts/test_vision_models.js` - Updated to compare 2.5 vs 2.5-lite
- `scripts/test_gemini_quality.js` - Updated to compare 2.5 vs 2.5-lite

**Next Step:** Deploy Edge Functions to Supabase to activate the changes.

---

## References

- [Google AI Studio Deprecation Notice](https://ai.google.dev/)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini 2.5 Flash Thinking Documentation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/thinking)
- [Supabase Edge Functions Deployment](https://supabase.com/docs/guides/functions)

---

## Post-Migration Audit (Jan 29, 2026)

### Critical Issues Found

#### Issue 1: Pricing Constant Not Updated (CRITICAL)

The model was migrated from `gemini-2.0-flash` to `gemini-2.5-flash`, but the **pricing constant was NOT updated**.

**File:** `supabase/functions/_shared/llm.ts` (lines 20-31)

```typescript
// WRONG - Still says "Gemini 2.0 Flash Pricing"!
const GEMINI_PRICING = {
  INPUT_PER_1M_TOKENS: 0.10,  // ❌ Should be $0.30
  OUTPUT_PER_1M_TOKENS: 0.40, // ❌ Should be $2.50
};
```

**Official Gemini 2.5 Flash Pricing (as of Jan 2026):**

| Model | Input (text/image/video) | Input (audio) | Output (incl. thinking) |
|-------|--------------------------|---------------|-------------------------|
| **Gemini 2.5 Flash** | **$0.30 / 1M** | $1.00 / 1M | **$2.50 / 1M** |
| Gemini 2.5 Flash-Lite | $0.10 / 1M | $0.30 / 1M | $0.40 / 1M |
| Gemini 2.0 Flash (deprecated) | $0.10 / 1M | $0.70 / 1M | $0.40 / 1M |

**Impact:** L3 text extraction cost tracking is **underreporting by ~3-6x**. The Vision pricing constant IS correct ($0.30/$2.50).

**Fix Required:**
```typescript
const GEMINI_PRICING = {
  INPUT_PER_1M_TOKENS: 0.30,  // $0.30 per 1M tokens (2.5 Flash)
  OUTPUT_PER_1M_TOKENS: 2.50, // $2.50 per 1M tokens (2.5 Flash)
};
```

#### Issue 2: Thinking Tokens Enabled by Default

Gemini 2.5 Flash has **thinking enabled by default**. The model automatically decides how much to think based on task complexity. The code does NOT set `thinkingBudget: 0` to disable it.

**Impact:** Every Gemini API call may include 1,000-5,000 thinking tokens in the output count (billed at $2.50/1M). For simple JSON extraction tasks, thinking is likely unnecessary overhead.

**Potential Fix:** Add `thinkingConfig: { thinkingBudget: 0 }` to disable thinking for structured extraction tasks:
```typescript
generationConfig: {
  temperature: 0.1,
  maxOutputTokens: MAX_OUTPUT_TOKENS,
  topP: 0.95,
  thinkingConfig: { thinkingBudget: 0 }, // Disable thinking for extraction
},
```

#### Issue 3: Step 6.5 Cost Not Tracked

**File:** `supabase/functions/extract-cook-card/index.ts` (line 2182)

The transcript extraction Gemini call in Step 6.5 returns `cost_cents` but it's never added to `extractionCost`:
```typescript
const transcriptExtraction = await extractIngredientsWithGemini(title, transcript, platform);
transcriptIngredients = transcriptExtraction.ingredients;
// ❌ Missing: extractionCost += transcriptExtraction.cost_cents;
```

Compare to line 2207 where ASR cost IS tracked:
```typescript
extractionCost += asrExtraction.cost_cents; // ✅ Tracked
```

---

## Corrected Cost Analysis

### Per-Call Costs (with correct pricing)

| Call Type | Input Tokens | Output Tokens | No Thinking | With ~2000 Thinking |
|-----------|--------------|---------------|-------------|---------------------|
| L3 Text (typical) | ~2,000 | ~500 | ~0.19¢ → ceil → **1¢** | ~0.69¢ → ceil → **1¢** |
| L3 Text (max) | ~4,000 | ~2,000 | ~0.62¢ → ceil → **1¢** | ~1.62¢ → ceil → **2¢** |
| L4 Vision (60s video) | ~6,500 | ~2,000 | ~0.70¢ → ceil → **1¢** | ~1.20¢ → ceil → **2¢** |
| L4 Vision (120s video) | ~12,500 | ~2,000 | ~0.88¢ → ceil → **1¢** | ~1.63¢ → ceil → **2¢** |

**Note:** Due to `Math.ceil`, most calls round to 1-2¢. But with thinking tokens, costs can exceed the 1¢ boundary more often.

### Worst-Case Costs Per Platform

| Scenario | Gemini Calls | Corrected Estimate |
|----------|--------------|-------------------|
| YouTube, L3 early return | 1 text | 1-2¢ |
| YouTube, L3 + L3.5 (transcript redo) | 2 text | 2-4¢ |
| YouTube, L3 + L3.2 blog | 2 text | 2-4¢ |
| YouTube, L3 + L3.5 + L5.5 Vision | 2 text + 1 vision | 4-8¢ |
| TikTok short-form, Vision-first success | 1 vision | 1-2¢ |
| TikTok, 4A fails → Step 6 (double Vision) | 2 vision + text | 5-10¢ |

---

## Extraction Redundancies Found

A detailed audit of `extract-cook-card/index.ts` identified the following redundant or duplicate operations:

### Redundancy 1: Duplicate YouTube Comment Fetching

**Locations:**
- Line 937: `fetchCommentsFromURL(url, 20)` — L2 ingredient scoring
- Line 1260: `fetchCommentsFromURL(url, 5)` — L3.2 blog URL check
- Line 1867: `fetchCommentsFromURL(url, 20)` — Step 6 long video fallback

**Issue:** Comments from L2 are not cached, so L3.2 makes a separate API call. The Step 6 fallback has a guard (`commentUsed` check) but still re-fetches if L2 found no suitable comment.

**Impact:** +500ms latency per duplicate fetch (YouTube Data API, no $ cost).

**Fix:** Cache comments from L2 and reuse in L3.2 and Step 6.

### Redundancy 2: L3 + L3.5 Transcript Duplicate (MOST COMMON)

**Path:**
1. L2.5 adds transcript to sourceText: `description + '\n\nTranscript:\n' + transcript`
2. L3 processes combined text → extracts ingredients, may miss instructions
3. L3.5 sends **just the transcript** to Gemini again

**Issue:** The transcript is sent to Gemini twice — first as part of combined text in L3, then alone in L3.5. The L3.5 call is unlikely to extract instructions if L3 already failed.

**Impact:** +1-2¢ and +2s latency for every YouTube short-form video where L3 got ingredients but no instructions.

**Fix:** Skip L3.5 if L3's sourceText already included the transcript.

### Redundancy 3: Double Vision Upload (Step 4A → Step 6)

**Path:** (TikTok/Instagram/Xiaohongshu/Facebook only)
1. Step 4A Vision-first: Upload video → Gemini Vision → <3 ingredients → delete file
2. Text extraction fails
3. Step 6: Upload **same video again** → **same** Gemini Vision call → delete file

**Issue:** Same video processed twice with same model and prompt. Second call unlikely to produce different results.

**Impact:** +0.67-1.3¢ and +5-10s for upload + Vision call.

**Fix:** If Step 4A Vision failed with <3 ingredients, don't retry Vision in Step 6 with same parameters. Either skip or use different parameters (e.g., higher resolution).

### Redundancy 4: Xiaohongshu Photo Post Double L3

**Path:**
1. Step 5 L3: Process description → 0 ingredients
2. Step 6 Xiaohongshu branch: Process **same description** again

**Issue:** Identical Gemini call on identical text.

**Impact:** +1-2¢ wasted (rare case).

**Fix:** Track that L3 already ran on this text; skip re-processing in Step 6.

---

## Streamlining Plan

### Phase 1: Fix Critical Issues (Required)

| Task | File | Change |
|------|------|--------|
| Update `GEMINI_PRICING` constant | `llm.ts:28-31` | Change to $0.30/$2.50 |
| Fix Step 6.5 cost tracking | `index.ts:2182` | Add `extractionCost += transcriptExtraction.cost_cents;` |
| Update deprecation deadline | This doc | ~~March 31~~ → March 3, 2026 |

### Phase 2: Eliminate Redundancies

| Redundancy | Fix | Estimated Savings |
|------------|-----|-------------------|
| Duplicate comment fetch | Cache comments from L2, reuse in L3.2/Step 6 | ~500ms-1s latency |
| L3 + L3.5 transcript redo | Add flag `transcriptAlreadyProcessedInL3`, skip L3.5 if true | 1-2¢ per YouTube short |
| Double Vision (4A → Step 6) | Add flag `visionAlreadyAttempted`, skip Step 6 Vision if 4A tried | 0.67-1.3¢ + 5-10s latency |
| Xiaohongshu double L3 | Track `l3AlreadyRan`, skip Step 6 L3 if true | 1-2¢ (rare) |

### Phase 3: Optional Optimizations

| Optimization | Impact | Complexity |
|--------------|--------|------------|
| Disable thinking tokens for extraction | Reduce output tokens by 50-80% | Low |
| Consider Gemini 2.5 Flash-Lite for simple L3 | 3x cheaper ($0.10/$0.40 vs $0.30/$2.50) | Medium |
| Batch API for non-urgent extractions | 50% discount | High |

---

## Implementation Checklist

### Immediate (Phase 1)
- [ ] Fix `GEMINI_PRICING` constant in `llm.ts`
- [ ] Fix Step 6.5 cost tracking in `index.ts`
- [ ] Deploy updated Edge Functions

### Short-Term (Phase 2)
- [ ] Add `cachedComments` variable, reuse across L2/L3.2/Step 6
- [ ] Add `transcriptProcessedInL3` flag to skip redundant L3.5
- [ ] Add `visionAttempted` flag to prevent double Vision
- [ ] Add `l3RanOnDescription` flag to prevent Xiaohongshu double L3
- [ ] Test all extraction paths
- [ ] Deploy and monitor

### Optional (Phase 3)
- [ ] Evaluate `thinkingBudget: 0` impact on extraction quality
- [ ] Benchmark Gemini 2.5 Flash-Lite for L3 text extraction
- [ ] Investigate Batch API for background extractions
