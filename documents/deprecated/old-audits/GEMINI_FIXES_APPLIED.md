# ✅ Gemini Safety Fixes Applied

**Date**: 2025-10-08
**Status**: Ready for testing
**File Modified**: `supabase/functions/_shared/llm.ts`

---

## Summary

All 5 critical safety issues have been fixed. The implementation is now rock-solid and ready for careful testing.

---

## Fixes Applied

### ✅ Fix #1: Corrected Pricing Calculation (10x error)

**Before** (WRONG):
```typescript
const inputCostPerToken = 0.00001 / 1000; // $0.01 per 1M tokens ❌
const outputCostPerToken = 0.00004 / 1000; // $0.04 per 1M tokens ❌
```

**After** (CORRECT):
```typescript
const GEMINI_PRICING = {
  INPUT_PER_1M_TOKENS: 0.10,  // $0.10 per 1M tokens ✅
  OUTPUT_PER_1M_TOKENS: 0.40, // $0.40 per 1M tokens ✅
};

function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1000000) * GEMINI_PRICING.INPUT_PER_1M_TOKENS;
  const outputCost = (outputTokens / 1000000) * GEMINI_PRICING.OUTPUT_PER_1M_TOKENS;
  return Math.ceil((inputCost + outputCost) * 100);
}
```

**Impact**: Prevents 10x cost tracking errors in paid tier.

---

### ✅ Fix #2: Switched to Stable Model

**Before**:
```typescript
const model = 'gemini-2.0-flash-exp'; // ❌ Experimental
```

**After**:
```typescript
const model = 'gemini-2.0-flash'; // ✅ Stable
```

**Impact**:
- Production-ready model (not experimental)
- Stable behavior and availability
- Better rate limits

---

### ✅ Fix #3: Using Actual Token Counts from API

**Before** (estimation only):
```typescript
const estimatedInputTokens = Math.ceil(userPrompt.length / 4);
const estimatedOutputTokens = Math.ceil(rawResponse.length / 4);
const cost = estimateCost(estimatedInputTokens, estimatedOutputTokens); // ❌
```

**After** (actual counts):
```typescript
// Extract ACTUAL token counts from API response
const actualInputTokens = data.usageMetadata?.promptTokenCount || 0;
const actualOutputTokens = data.usageMetadata?.candidatesTokenCount || 0;

// Log if estimation was significantly off (>20%)
if (actualInputTokens > 0) {
  const estimationError = Math.abs(actualInputTokens - estimatedInputTokens) / actualInputTokens;
  if (estimationError > 0.2) {
    console.warn(
      `⚠️  Token estimation off by ${(estimationError * 100).toFixed(1)}%: ` +
      `estimated ${estimatedInputTokens}, actual ${actualInputTokens}`
    );
  }
}

// Use ACTUAL counts for cost calculation ✅
const cost = calculateCost(actualInputTokens, actualOutputTokens);
```

**Impact**:
- Accurate cost tracking
- Visibility into estimation errors
- Better debugging

---

### ✅ Fix #4: Added Timeout and Retry Safety (CONSERVATIVE)

**Before** (no safety):
```typescript
const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(requestBody),
}); // ❌ No timeout, no retry
```

**After** (safe):
```typescript
// Timeout wrapper (30s max)
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
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
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw err;
  }
}

// Conservative retry logic
async function fetchWithRetry(
  url: string,
  options: RequestInit
): Promise<Response> {
  // Max 2 retries (3 total attempts)
  // Only retry on: 429 (rate limit), 500/502/503/504 (server errors)
  // Exponential backoff: 1s, 2s, 4s
  // Respect Retry-After header if present
  // NO retry on 4xx errors (except 429)

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, REQUEST_TIMEOUT_MS);

      if (response.ok) {
        return response;
      }

      // Only retry on specific errors
      const shouldRetry =
        (response.status === 429 || response.status >= 500) &&
        attempt < MAX_RETRIES;

      if (!shouldRetry) {
        return response; // Don't retry on 4xx (except 429)
      }

      // Exponential backoff with Retry-After header support
      const retryAfterHeader = response.headers.get('Retry-After');
      let delayMs = retryAfterHeader
        ? parseInt(retryAfterHeader, 10) * 1000
        : Math.pow(2, attempt) * 1000;

      delayMs = Math.min(delayMs, 10000); // Cap at 10s

      await new Promise(resolve => setTimeout(resolve, delayMs));
    } catch (err) {
      // Retry on network errors
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      } else {
        throw err;
      }
    }
  }
}

// Use in API call
const response = await fetchWithRetry(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(requestBody),
}); // ✅ Safe with timeout + retry
```

**Conservative Retry Strategy**:
- **Total attempts**: 3 (initial + 2 retries)
- **Retry only on**: 429, 500, 502, 503, 504
- **Backoff**: 1s → 2s → 4s (capped at 10s)
- **Respects** `Retry-After` header
- **NO retry** on 4xx errors (except 429)

**Impact**:
- Prevents hanging requests
- Handles transient failures gracefully
- Won't cause retry storms (conservative limits)

---

### ✅ Fix #5: Added Max Input Token Enforcement

**Before** (no limit):
```typescript
const userPrompt = buildExtractionPrompt(title, description, platform);
// ❌ No check - could send huge prompts
```

**After** (enforced):
```typescript
const MAX_INPUT_CHARS = 16000; // ~4000 tokens (leave headroom)
const systemPrompt = 'You are a recipe ingredient extractor...';
const fullPrompt = systemPrompt + userPrompt;

if (fullPrompt.length > MAX_INPUT_CHARS) {
  console.warn(
    `⚠️  Input too long (${fullPrompt.length} chars), truncating to ${MAX_INPUT_CHARS}`
  );
  const allowedUserPromptChars = MAX_INPUT_CHARS - systemPrompt.length;
  userPrompt = userPrompt.slice(0, allowedUserPromptChars);
} // ✅ Enforced limit
```

**Impact**:
- Prevents unexpected costs from huge inputs
- Logs when truncation occurs
- Predictable token usage

---

## Configuration Summary

```typescript
// Pricing (Paid Tier)
const GEMINI_PRICING = {
  INPUT_PER_1M_TOKENS: 0.10,  // $0.10 per 1M tokens
  OUTPUT_PER_1M_TOKENS: 0.40, // $0.40 per 1M tokens
};

// Safety Limits
const MAX_INPUT_CHARS = 16000;      // ~4000 tokens
const MAX_OUTPUT_TOKENS = 600;
const REQUEST_TIMEOUT_MS = 30000;   // 30 seconds
const MAX_RETRIES = 2;              // 3 total attempts

// Model
const model = 'gemini-2.0-flash';   // Stable (not experimental)
```

---

## Expected Costs (Paid Tier)

### Per Extraction (typical)
- Input: ~1000 tokens × $0.10/1M = $0.0001
- Output: ~400 tokens × $0.40/1M = $0.00016
- **Total: ~$0.00026** (0.026 cents)

### With Rounding (worst case)
- Rounds up to nearest cent
- **Max: 1 cent per extraction**

### With 60% Cache Hit Rate
- Cache hits: $0.00 (no API call)
- Cache misses: ~1 cent
- **Effective: ~0.4 cents per save**

---

## Testing Plan

### 1 URL Test (Next Step)
- Cost: ~1 cent max
- Verify all 5 fixes work correctly
- Check actual token counts logged
- Review cost calculation

### 5 URL Test (After approval)
- Cost: ~5 cents max
- Test diverse platforms (YouTube, Instagram, TikTok, web)
- Measure quality, latency, cost

### 30 URL Test (Day 4)
- Cost: ~30 cents max
- Full acceptance criteria validation

---

## Retry Logic Safety Review

**Why this is safe:**

1. **Conservative limits**: Only 2 retries (3 total attempts)
2. **Smart retry conditions**:
   - Only retries on server errors (5xx) and rate limits (429)
   - NO retry on client errors (4xx except 429)
3. **Exponential backoff**: 1s → 2s → 4s (prevents thundering herd)
4. **Respects Retry-After**: Uses server's suggested delay
5. **Timeout protection**: 30s max per attempt (90s total worst case)
6. **Cap on backoff**: Max 10s delay (prevents infinite waits)

**What won't cause retry storms:**
- 400 Bad Request → NO retry ✅
- 401 Unauthorized → NO retry ✅
- 403 Forbidden → NO retry ✅
- 404 Not Found → NO retry ✅
- 429 Rate Limit → Retry with backoff ✅ (this is correct)
- 500 Internal Server Error → Retry (transient) ✅
- Network timeout → Retry (transient) ✅

---

## Verification Checklist

Before testing:

- [x] Pricing calculation uses correct values ($0.10/$0.40)
- [x] Uses stable model (gemini-2.0-flash)
- [x] Extracts actual token counts from API response
- [x] Uses actual counts for cost calculation
- [x] Timeout wrapper implemented (30s)
- [x] Retry logic conservative (2 max retries)
- [x] Retry only on 429/5xx
- [x] Exponential backoff implemented
- [x] Respects Retry-After header
- [x] Input size enforcement (16000 chars)
- [x] Output size limit (600 tokens)
- [x] Logs token usage and costs

---

## Next Steps

1. **Review this file** - Confirm all fixes are correct
2. **Test with 1 URL** - Verify everything works
3. **Check logs** - Confirm actual token counts logged
4. **Review costs** - Ensure calculation is accurate
5. **Proceed to 5 URLs** - If 1 URL test passes

---

## Questions?

If anything looks wrong or you want changes:
1. Point out the issue
2. I'll fix immediately
3. Re-test with 1 URL

Ready to test when you approve! 🚀
