# L3 Gemini Flash Implementation Specification

**Status:** Ready for Review
**Date:** 2025-10-08
**Approval Required Before Coding**

---

## 1. Overview

**Goal:** Implement L3 LLM extraction (Gemini Flash) for both Track 1 (user import) and Track 2 (YouTube search).

**Key Constraints:**
- ✅ No pantry hints in prompt (prevent bias)
- ✅ No L2 pre-filter (skip straight to L3 when needed)
- ✅ Track 1 priority (build user-import first)
- ✅ Hybrid YouTube strategy (curated 20 + search option)
- ✅ 30-day TTL cache (consistent, no immutable detection)
- ✅ Pro tier cap 1000/mo (prevent abuse)
- ⚠️ **NO GEMINI TESTING WITHOUT EXPLICIT APPROVAL**

---

## 2. Files to Create

### 2.1 `supabase/functions/_shared/llm.ts`
**Purpose:** Gemini Flash client with JSON hardening

**Exports:**
```typescript
export interface LLMExtractionResult {
  ingredients: Ingredient[];
  confidence: number;
  cost_cents: number;
  model_version: string;
}

export async function extractIngredientsWithGemini(
  title: string,
  description: string,
  platform: string
): Promise<LLMExtractionResult>
```

**Implementation Notes:**
- Model: `gemini-2.0-flash-exp` (cheapest, fastest)
- Temperature: 0.1 (deterministic)
- Max tokens: 600
- JSON schema enforcement
- Robust parsing (strip code fences, fallback to `[]`)
- Cost tracking: ~$0.01-0.02 per call

---

### 2.2 `supabase/functions/_shared/normalize.ts`
**Purpose:** Unit and quantity normalization

**Exports:**
```typescript
export function normalizeUnit(unit: string): string | null
export function normalizeAmount(amount: string | number): number | null
```

**Normalization Rules:**
- Fractions: `½` → `0.5`, `1 1/2` → `1.5`
- Ranges: `1-2` → `1.5` (midpoint), `to taste` → `null`
- Units: `tbsp` → `tablespoon`, `c` → `cup` (singular form)

---

### 2.3 `supabase/functions/_shared/cache.ts`
**Purpose:** Input-hash based caching (NOT just URL)

**Why:** Same URL + different input text (user paste) = different extractions

**Exports:**
```typescript
export async function getCachedExtraction(
  supabase: any,
  url: string,
  title: string,
  description: string,
  userPaste?: string
): Promise<CachedResult | null>

export async function setCachedExtraction(
  supabase: any,
  url: string,
  inputHash: string,
  cookCard: CookCard,
  cost: number
): Promise<void>

export async function computeInputHash(
  url: string,
  title: string,
  description: string,
  userPaste?: string
): Promise<string>
```

**Cache Key:**
```
SHA256(url + title + description + userPaste)
```

**TTL:** 30 days (consistent for all URLs)

---

## 3. Files to Modify

### 3.1 `supabase/functions/extract-cook-card/index.ts`

**Changes:**

1. **Import new modules:**
```typescript
import { extractIngredientsWithGemini } from "../_shared/llm.ts";
import { normalizeUnit, normalizeAmount } from "../_shared/normalize.ts";
import { getCachedExtraction, setCachedExtraction, computeInputHash } from "../_shared/cache.ts";
```

2. **Update cache logic (lines 95-112):**
   - Replace `checkCache(supabase, url)` with `getCachedExtraction(supabase, url, title, description, userPaste)`
   - Use `input_hash` instead of just `source_url`

3. **Implement L3 function (lines 473-479):**
```typescript
async function extractWithLLM(url: string, platform: string, cookCard: CookCard) {
  try {
    // Fetch description based on platform
    let description = "";
    if (platform === "youtube") {
      description = await fetchYouTubeDescription(url);
    } else if (platform === "instagram") {
      // TODO: Instagram Graph API
      description = cookCard.description || "";
    } else if (platform === "tiktok") {
      // TODO: TikTok API
      description = cookCard.description || "";
    }

    // Call Gemini
    const result = await extractIngredientsWithGemini(
      cookCard.title,
      description,
      platform
    );

    // Normalize units/amounts
    const normalizedIngredients = result.ingredients.map(ing => ({
      ...ing,
      amount: normalizeAmount(ing.amount),
      unit: normalizeUnit(ing.unit),
    }));

    return {
      success: true,
      ingredients: normalizedIngredients,
      cost: result.cost_cents,
    };
  } catch (err) {
    console.error("L3 extraction error:", err);
    return { success: false, ingredients: [], cost: 0 };
  }
}
```

4. **Update cacheExtraction (lines 520-546):**
   - Replace `hashURL(url)` with `computeInputHash(url, title, description)`
   - Use `setCachedExtraction(...)`

---

### 3.2 Add Budget Caps

**New table:** `user_extraction_limits`

```sql
CREATE TABLE user_extraction_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  tier TEXT NOT NULL DEFAULT 'free', -- 'free' | 'pro' | 'pro_plus'
  monthly_limit INTEGER NOT NULL DEFAULT 5,
  current_month_count INTEGER NOT NULL DEFAULT 0,
  month_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_reset_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Logic:**
- Free: 5 LLM calls/month
- Pro: 1000 LLM calls/month
- Pro Plus: 5000 LLM calls/month
- Rate limit: 50 LLM calls/hour per user

**Implementation:**
- Check limits before `extractWithLLM()`
- If exceeded, return fallback: Cook Card Lite + manual paste prompt
- Increment counter after successful extraction

---

### 3.3 Extend Telemetry

**Add to `cook_card_events` table:**
```sql
ALTER TABLE cook_card_events ADD COLUMN extraction_method TEXT;
ALTER TABLE cook_card_events ADD COLUMN extraction_confidence NUMERIC;
ALTER TABLE cook_card_events ADD COLUMN extraction_cost_cents INTEGER;
ALTER TABLE cook_card_events ADD COLUMN input_hash TEXT;
```

**Events to log:**
- `extraction_started` - Before L3 call
- `extraction_completed` - After successful extraction
- `extraction_failed` - After failed extraction
- `budget_exceeded` - When user hits limit

---

## 4. L3 Prompt Design

**System Instruction:**
```
You are a recipe ingredient extractor.
Return ONLY a JSON array of ingredients.
Never invent data. If amounts are not explicitly present, omit them.
```

**User Content:**
```
Title: "${title}"
Platform: "${platform}"
Description:
"""
${description.slice(0, 4000)}
"""

Expected output format:
[
  {"name":"pasta","amount":1,"unit":"lb"},
  {"name":"vodka","amount":0.5,"unit":"cup"},
  {"name":"heavy cream"}
]

Rules:
- Extract ingredients only (no instructions, no commentary)
- Use singular unit names (cup, tablespoon, teaspoon, not cups, tablespoons, teaspoons)
- Omit amount/unit if not explicitly present in text
- Return empty array [] if no ingredients found
- Never invent amounts
```

**No pantry hints** - extraction is objective

---

## 5. Hybrid YouTube Strategy (Track 2)

**Phase 1 (Week 1):** Track 1 only (user import)
- Users paste YouTube links manually
- L3 extraction on-demand

**Phase 2 (Week 2):** Add curated 20 videos
- Pre-extract 20 "hero recipes" from trusted channels
- Cache with 90-day TTL
- Display in "Recommended" section

**Phase 3 (Week 3+):** Add YouTube search
- User's pantry → generate search query (e.g., "chicken pasta recipe")
- Real-time YouTube API search
- Extract on-demand when user taps video
- Measure usage: curated vs search

**Decision Gate:** If >70% users prefer search, expand curated library. If <30%, remove search and keep curated only.

---

## 6. Acceptance Criteria

**Performance:**
- [ ] P95 extraction latency ≤ 2.5s (cache miss)
- [ ] P95 extraction latency ≤ 200ms (cache hit)

**Quality:**
- [ ] ≥80% of saves produce ≥5 ingredients OR require ≤2 confirm taps
- [ ] Average confidence ≥0.70 for L3 extractions

**Economics:**
- [ ] Rolling 14-day avg cost/save ≤ $0.015
- [ ] LLM calls/URL < 0.4 (cache hit rate >60%)
- [ ] No single user exceeds tier limit

**Telemetry:**
- [ ] 100% of saves have extraction_level, ingredients_count, avg_confidence, cache_hit
- [ ] Budget exceeded events logged correctly

**Compliance:**
- [ ] No scraped HTML/media (API metadata + user-supplied text only)
- [ ] No disabled buttons - only show CTA when ≥1 confirmed ingredient

---

## 7. Testing Strategy (Pre-Approval Required)

**Unit Tests (No Gemini calls):**
- ✅ `normalize.ts` - Test unit/amount normalization
- ✅ `cache.ts` - Test input hash computation
- ✅ JSON parsing edge cases (malformed, code fences, empty)

**Integration Tests (Requires Approval):**
- ⚠️ `llm.ts` - Test Gemini extraction with 5 sample URLs
- ⚠️ End-to-end extraction flow

**Smoke Test (Requires Approval):**
- ⚠️ 30 diverse links (YT/IG/TikTok) - measure metrics

---

## 8. Rollout Plan

**Day 1:**
- Implement `llm.ts`, `normalize.ts`, `cache.ts` (NO Gemini calls)
- Unit tests for normalization and caching
- Code review

**Day 2:**
- Integrate L3 into `extract-cook-card/index.ts`
- Add budget caps table + logic
- Extend telemetry schema

**Day 3:**
- **APPROVAL CHECKPOINT** - Request permission to test Gemini
- Run 5 test extractions (if approved)
- Fix bugs, tune prompt

**Day 4:**
- Smoke test 30 URLs (if approved)
- Measure acceptance criteria
- Document results

**Day 5:**
- Polish, fix long-tail bugs
- Go/No-Go check
- Update PROJECT_STATUS.md with results

---

## 9. Cost Analysis

**Gemini 2.0 Flash Pricing (as of 2025-01):**
- Input: $0.01 per 1M tokens (~$0.00001 per 1K tokens)
- Output: $0.04 per 1M tokens (~$0.00004 per 1K tokens)

**Typical Extraction:**
- Input: ~1000 tokens (title + description)
- Output: ~400 tokens (ingredient JSON)
- Cost: ~$0.026 per extraction

**With 60% cache hit:**
- Effective cost: ~$0.01-0.015 per save
- 100 users × 20 saves/mo × $0.015 = $30/mo
- 1000 users × 20 saves/mo × $0.015 = $300/mo

**Within budget:** $0.015/save target ✅

---

## 10. Open Questions

1. **Should we add a "paste more text" field for thin extractions?**
   - **Recommendation:** Defer to post-MVP. Ship without it, measure how often extractions are thin (<3 ingredients), then add if needed.

2. **Instagram/TikTok API access?**
   - **Status:** Not provisioned yet.
   - **Fallback:** Use oEmbed metadata only (L1), show manual paste prompt for ingredients.

3. **Canonical matching enhancement?**
   - **Current:** 421 items, simple string matching
   - **Recommendation:** Acceptable for MVP. Add vector search in Week 3+ if confidence scores are low.

4. **Error handling for Gemini API failures?**
   - **Strategy:** Retry once with exponential backoff (1s), then fail-closed with Cook Card Lite.

---

## 11. Next Steps

**Awaiting Approval:**
- [ ] Review this spec
- [ ] Confirm design decisions
- [ ] Approve Day 1-2 implementation (no Gemini calls)
- [ ] Schedule Day 3 approval checkpoint for Gemini testing

**After Approval:**
- Proceed with Day 1 implementation (llm.ts structure, normalize.ts, cache.ts)
- NO Gemini API calls until explicit approval

---

**Ready to proceed?** Please confirm:
1. Spec looks good
2. Approve Day 1-2 work (no Gemini testing)
3. Any changes needed before I start coding
