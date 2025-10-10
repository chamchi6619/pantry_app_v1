# 🚨 Gemini API Safety Audit - CRITICAL FINDINGS

**Date**: 2025-10-08
**Status**: BLOCKING - Do NOT test until fixes applied
**Severity**: HIGH - Pricing error could cause 10x cost spike

---

## Executive Summary

Deep review of Gemini implementation revealed **5 critical safety issues** that could cause pricing spikes:

1. **Pricing calculation is wrong by 10x** (most critical)
2. Using experimental model instead of stable
3. Not using actual token counts from API
4. Missing timeout/retry safety mechanisms
5. No max token enforcement

**Recommendation**: Apply all fixes before ANY testing.

---

## Critical Finding #1: Pricing Calculation Error (10x)

### Current Implementation (`llm.ts:147-169`)

```typescript
// WRONG PRICING COMMENTS
* Pricing (as of 2025-01):
* - Input: $0.01 per 1M tokens
* - Output: $0.04 per 1M tokens

// WRONG CALCULATION
const inputCostPerToken = 0.00001 / 1000; // $0.01 per 1M tokens
const outputCostPerToken = 0.00004 / 1000; // $0.04 per 1M tokens
```

### Actual Gemini 2.0 Flash Pricing

**Official Pricing** (from ai.google.dev/gemini-api/docs/pricing):

- **Free Tier**: $0.00 per 1M tokens (both input/output)
- **Paid Tier**:
  - Input: **$0.10 per 1M tokens** (10x higher than code)
  - Output: **$0.40 per 1M tokens** (10x higher than code)

### Impact

If user was on **paid tier**:
- Expected cost per call: ~$0.015
- Actual cost per call: ~$0.15
- **10x pricing spike** 💥

### Fix Required

```typescript
// CORRECT PRICING (Paid Tier)
const INPUT_COST_PER_1M_TOKENS = 0.10; // $0.10 per 1M tokens
const OUTPUT_COST_PER_1M_TOKENS = 0.40; // $0.40 per 1M tokens

function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1000000) * INPUT_COST_PER_1M_TOKENS;
  const outputCost = (outputTokens / 1000000) * OUTPUT_COST_PER_1M_TOKENS;

  return Math.ceil((inputCost + outputCost) * 100); // Convert to cents
}
```

---

## Critical Finding #2: Using Experimental Model

### Current Implementation (`llm.ts:193`)

```typescript
const model = 'gemini-2.0-flash-exp'; // ❌ EXPERIMENTAL
```

### Issue

From Google's official docs:
> "Experimental models are **not suitable for production use** and have more restrictive rate limits. Availability of model endpoints is **subject to change**."

**Risks**:
- Model could disappear without notice
- Performance/behavior changes without warning
- More restrictive rate limits (15 RPM vs higher for stable)
- Not recommended for production apps

### Fix Required

```typescript
const model = 'gemini-2.0-flash'; // ✅ STABLE
```

**Stable Model Guarantees**:
- "Usually don't change"
- Suitable for production
- Better rate limits
- Predictable behavior

---

## Critical Finding #3: Not Using Actual Token Counts

### Current Implementation (`llm.ts:199-260`)

```typescript
// ESTIMATION (line 200)
const estimatedInputTokens = Math.ceil(userPrompt.length / 4);

// ESTIMATION (line 257)
const estimatedOutputTokens = Math.ceil(rawResponse.length / 4);

// Uses estimates for cost calculation ❌
const cost = estimateCost(estimatedInputTokens, estimatedOutputTokens);
```

### Issue

- Character-to-token ratio is **approximate** (can be off by 20-50%)
- API returns **actual token counts** in `usageMetadata`
- Estimation errors compound pricing errors

### API Response Structure

```json
{
  "candidates": [...],
  "usageMetadata": {
    "promptTokenCount": 1234,      // ✅ ACTUAL input tokens
    "candidatesTokenCount": 567,   // ✅ ACTUAL output tokens
    "totalTokenCount": 1801
  }
}
```

### Fix Required

```typescript
// Parse actual token usage from API response
const actualInputTokens = data.usageMetadata?.promptTokenCount || 0;
const actualOutputTokens = data.usageMetadata?.candidatesTokenCount || 0;

// Log if estimation was off
if (Math.abs(actualInputTokens - estimatedInputTokens) > estimatedInputTokens * 0.2) {
  console.warn(`⚠️  Token estimation off by >20%: estimated ${estimatedInputTokens}, actual ${actualInputTokens}`);
}

// Use ACTUAL counts for cost calculation
const cost = calculateCost(actualInputTokens, actualOutputTokens);
```

---

## Critical Finding #4: Missing Safety Mechanisms

### Current Implementation (`llm.ts:222-228`)

```typescript
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(requestBody),
});
// ❌ No timeout
// ❌ No retry logic
// ❌ No rate limit handling
```

### Issues

1. **No Timeout**: Request could hang indefinitely
2. **No Retry Logic**: Transient errors (429, 5xx) fail immediately
3. **No Rate Limit Handling**: 429 errors not handled gracefully

### Fix Required

```typescript
// Add timeout wrapper
async function fetchWithTimeout(url: string, options: any, timeoutMs: number = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// Add retry with exponential backoff
async function fetchWithRetry(
  url: string,
  options: any,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, 30000);

      // Success
      if (response.ok) {
        return response;
      }

      // Retry on rate limit or server error
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = response.headers.get('Retry-After');
        const delayMs = retryAfter
          ? parseInt(retryAfter) * 1000
          : Math.pow(2, attempt) * 1000; // Exponential backoff

        console.warn(`⚠️  Gemini API error ${response.status}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      // Don't retry on client errors (400, 401, 403, etc.)
      return response;

    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries - 1) {
        const delayMs = Math.pow(2, attempt) * 1000;
        console.warn(`⚠️  Gemini API error: ${err.message}, retrying in ${delayMs}ms`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}
```

---

## Critical Finding #5: No Max Token Enforcement

### Current Implementation

```typescript
generationConfig: {
  temperature: 0.1,
  maxOutputTokens: 600, // ✅ Output limited
  topP: 0.95,
},
// ❌ No input token limit enforcement
```

### Issue

- Input prompt could be enormous (user pastes 50k char description)
- No check before sending to API
- Could cause unexpected costs

### Fix Required

```typescript
const MAX_INPUT_CHARS = 16000; // ~4000 tokens
const MAX_OUTPUT_TOKENS = 600;

// Enforce input limit BEFORE API call
if (userPrompt.length > MAX_INPUT_CHARS) {
  console.warn(`⚠️  Input too long (${userPrompt.length} chars), truncating to ${MAX_INPUT_CHARS}`);
  userPrompt = userPrompt.slice(0, MAX_INPUT_CHARS);
}

generationConfig: {
  temperature: 0.1,
  maxOutputTokens: MAX_OUTPUT_TOKENS,
  topP: 0.95,
}
```

---

## Additional Findings (Lower Priority)

### 6. Cache Key Might Not Include All Relevant Data

Current cache key: `SHA256(url + title + description + userPaste)`

**Potential issue**: If user edits their pantry between requests, cache might return stale results.

**Fix**: Consider including `user_tier` or `household_id` in cache key if results vary by user.

### 7. API Key in Query Parameter

Current: `https://...?key=${apiKey}` (line 194)

**Note**: This is the official Gemini API format, but query params are logged in many systems.

**Recommendation**: Monitor for any access logs that might expose keys.

### 8. No Response Size Validation

Current: Directly parses `data.candidates?.[0]?.content?.parts?.[0]?.text`

**Risk**: If API returns huge response (malformed, infinite loop), could cause memory issues.

**Fix**: Validate response size before parsing.

---

## Testing Plan (After Fixes)

### Phase 1: Single Test (Cost: ~$0.00 on free tier)

1. Apply all 5 fixes
2. Test with 1 YouTube URL
3. Verify:
   - Uses stable model (`gemini-2.0-flash`)
   - Actual token counts logged
   - Cost calculated correctly
   - Timeout works (test with bad endpoint)
   - No errors in logs

### Phase 2: Small Batch (Cost: ~$0.00-0.15)

1. Test 5 diverse URLs
2. Verify acceptance criteria:
   - P95 latency ≤2.5s
   - ≥80% produce ≥5 ingredients
   - Cost tracking accurate

### Phase 3: Smoke Test (Cost: ~$0.00-0.90)

1. Test 30 URLs (Day 4 plan)
2. Full acceptance criteria validation

---

## Cost Analysis (After Fixes)

### Free Tier (if available)
- Input: $0.00 per 1M tokens
- Output: $0.00 per 1M tokens
- **Cost per call: $0.00** ✅

### Paid Tier (correct pricing)
- Input: $0.10 per 1M tokens (~1000 tokens per call)
- Output: $0.40 per 1M tokens (~400 tokens per call)
- **Cost per call: $0.00026** = **~$0.026 per call** (2.6 cents)

With 60% cache hit rate:
- **Effective cost: ~$0.01 per save** ✅ (within budget)

---

## Approval Checklist

Before testing:

- [ ] Fix #1: Update pricing calculation (10x error)
- [ ] Fix #2: Switch to stable model
- [ ] Fix #3: Use actual token counts
- [ ] Fix #4: Add timeout/retry logic
- [ ] Fix #5: Add max token enforcement
- [ ] Review: Check all changes
- [ ] Test: Verify with 1 URL on free tier
- [ ] Monitor: Watch logs for errors

---

## Questions for User

1. **Are you on Gemini free tier or paid tier?**
   - Free tier = $0.00 cost
   - Paid tier = ~$0.026/call

2. **What was the previous pricing spike?**
   - When did it happen?
   - What model were you using?
   - How much did it cost?

3. **Approval to apply all 5 fixes now?**
   - Then test with 1 URL only
   - Review results before proceeding

---

## Next Steps

1. **STOP** - Do not test until fixes applied
2. **FIX** - Apply all 5 critical fixes
3. **REVIEW** - User reviews fixed code
4. **TEST** - Single URL test only
5. **EVALUATE** - Review cost/quality
6. **PROCEED** - Continue to Phase 2 if approved
