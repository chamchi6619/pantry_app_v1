# Complete Backend Flow: User Pastes Link → Cook Card

**Date:** 2025-10-10
**Purpose:** Step-by-step trace of EXACTLY what happens when a user inputs a recipe URL

---

## 📥 INPUT

User pastes URL: `https://www.youtube.com/watch?v=abc123`

Request body:
```json
{
  "url": "https://www.youtube.com/watch?v=abc123",
  "user_id": "uuid-1234",
  "household_id": "uuid-5678",
  "bypass_cache": false
}
```

---

## 🔄 EXECUTION FLOW

### STEP 1: Request Parsing & Validation
**File:** `extract-cook-card/index.ts:104-112`

```typescript
const body = await req.json();
const { url: rawUrl, user_id, household_id, bypass_cache } = body;

if (!rawUrl || !user_id) {
  return 400 error "Missing required fields"
}
```

**Output:** Validated request parameters

---

### STEP 2: URL Normalization
**File:** `extract-cook-card/index.ts:115`

```typescript
const url = normalizeRecipeURL(rawUrl);
// Removes tracking params, expands short URLs, mobile→desktop
```

**Example:**
- Input: `https://youtu.be/abc123?si=tracking_param`
- Output: `https://www.youtube.com/watch?v=abc123`

---

### STEP 3: Platform Detection
**File:** `extract-cook-card/index.ts:119`

```typescript
const platform = detectPlatform(url);
// Returns: 'youtube', 'instagram', 'tiktok', or 'web'
```

**Output:** `platform = 'youtube'`

---

### STEP 4: RATE LIMITING CHECKS (CRITICAL GATES)

#### STEP 4A: Check Monthly Quota
**File:** `extract-cook-card/index.ts:126-138`

```typescript
const quotaCheck = await checkMonthlyQuota(supabase, user_id);

// Database query:
SELECT * FROM user_quotas WHERE user_id = 'uuid-1234';

// If no record exists:
INSERT INTO user_quotas (user_id, tier, extractions_this_month, extraction_cost_cents)
VALUES ('uuid-1234', 'free', 0, 0);

// If record exists:
const allowed = quota.extractions_this_month < limits.monthly_limit;
// free: 10, pro: 500, pro_plus: 2000
```

**Decision Point:**
- ✅ **ALLOWED:** User has 5/10 extractions → Continue
- ❌ **DENIED:** User has 10/10 extractions → Return 200 with error message

**If DENIED:**
```json
{
  "error": "Monthly limit reached (10 extractions)",
  "fallback": "link_only",
  "quota_info": {
    "tier": "free",
    "used": 10,
    "limit": 10
  }
}
```
**STOP HERE** - Request ends

---

#### STEP 4B: Check Hourly Rate Limit
**File:** `extract-cook-card/index.ts:141-150`

```typescript
const rateLimitCheck = await checkHourlyRateLimit(supabase, user_id, tier);

// Atomic database operation:
CALL increment_rate_limit(
  p_user_id: 'uuid-1234',
  p_counter_type: 'hourly',
  p_window_key: '2025-10-10T14',  // Current hour
  p_increment: 1,
  p_ttl_seconds: 3600
);

// Returns current count after increment
const currentCount = 2;
const allowed = currentCount <= limits.hourly_limit;
// free: 2, pro: 10, pro_plus: 20
```

**Decision Point:**
- ✅ **ALLOWED:** User has 2/2 requests this hour → Continue
- ❌ **DENIED:** User has 3/2 requests this hour → Return 429

**If DENIED:**
```json
{
  "error": "Too many requests. Please try again later.",
  "retry_after_seconds": 3600,
  "current_count": 3,
  "limit": 2
}
```
**STOP HERE** - Request ends

---

### STEP 5: Platform Metadata Extraction (L0)
**File:** `extract-cook-card/index.ts:159-177`

```typescript
const platformMetadata = await fetchPlatformMetadata(url, platform);

// For YouTube:
const videoId = extractYouTubeVideoId(url); // "abc123"
const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=abc123&key=${YOUTUBE_API_KEY}`;

const response = await fetch(apiUrl);
const data = await response.json();

const metadata = {
  title: data.items[0].snippet.title,                    // "Easy Pasta Recipe"
  description: data.items[0].snippet.description,       // "Ingredients:\n1 lb pasta\n..."
  thumbnail_url: data.items[0].snippet.thumbnails.high.url,
  duration_seconds: parseISO8601Duration("PT5M30S"),    // 330 seconds
  creator_name: data.items[0].snippet.channelTitle,     // "Chef John"
  creator_handle: data.items[0].snippet.channelId,      // "UC..."
};
```

**Decision Point:**
- ✅ **SUCCESS:** Metadata fetched → Continue
- ❌ **FAILURE:** API error → Return 400 "Failed to fetch video metadata"

**If FAILURE:** **STOP HERE** - Request ends

---

### STEP 6: Cache Check
**File:** `extract-cook-card/index.ts:181-207`

```typescript
const cachedExtraction = bypass_cache ? null : await getCachedExtraction(
  supabase, url, title, description, undefined
);

// Compute cache key:
const version = EXTRACTION_VERSION; // e.g., "2"
const data = `${version}|${url}|${title}|${description}|`;
const inputHash = SHA256(data); // "a1b2c3..."

// Database query:
SELECT cook_card FROM cook_card_cache
WHERE input_hash = 'a1b2c3...'
  AND created_at > NOW() - INTERVAL '30 days';
```

**Decision Point:**
- ✅ **CACHE HIT:** Found cached extraction → Return immediately
- ❌ **CACHE MISS:** No cached extraction → Continue to extraction

**If CACHE HIT:**
```typescript
await logEvent(supabase, { event_type: "url_cached", cache_hit: true });
return Response({
  cook_card: cachedCookCard,
  requires_confirmation: false,
  cache_status: "cached"
});
```
**STOP HERE** - Request ends (most common path for popular URLs)

---

### STEP 7: Build Initial CookCard
**File:** `extract-cook-card/index.ts:214-242`

```typescript
const cookCard = {
  version: "1.0",
  source: {
    url: "https://www.youtube.com/watch?v=abc123",
    platform: "youtube",
    creator: {
      name: "Chef John",
      handle: "UC...",
      avatar_url: "https://i.ytimg.com/vi/abc123/hqdefault.jpg"
    }
  },
  title: "Easy Pasta Recipe",
  description: "Ingredients:\n1 lb pasta\n2 tbsp olive oil\n...",
  image_url: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
  instructions: { type: "link_only" },  // Will be updated if extracted
  ingredients: [],                       // Will be filled by extraction
  extraction: {
    method: "metadata",
    confidence: 0.0,
    version: "L0-platform-api",
    timestamp: "2025-10-10T14:23:45.123Z",
    cost_cents: 0
  }
};

let extractionCost = 0;
const extractionStartTime = Date.now();
```

---

### STEP 8: Text Acquisition Ladder (L1 → L2 → L2.5)

#### STEP 8A: L1 - Description Text (FREE)
**File:** `extract-cook-card/index.ts:257-264`

```typescript
let sourceText = "";
let evidenceSource = "";

const description = "Ingredients:\n1 lb pasta\n2 tbsp olive oil\n4 cloves garlic\n...";
console.log(`📄 L1: Description length = ${description.length} chars`);

if (description.length >= 100) {
  sourceText = description;
  evidenceSource = 'description';
  console.log(`✅ L1: Using description as source text`);
}
```

**Decision Point:**
- ✅ **SUFFICIENT TEXT:** Description >= 100 chars → Use description, SKIP L2
- ❌ **INSUFFICIENT:** Description < 100 chars → Try L2 (comments)

**In our example:** Description is 200 chars → **sourceText = description**

---

#### STEP 8B: L2 - YouTube Comments (CONDITIONAL)
**File:** `extract-cook-card/index.ts:266-331`

**Trigger:** `!sourceText && platform === 'youtube'`

**In our example:** We have sourceText from L1, so **L2 is SKIPPED**

**If L1 had failed:**
```typescript
const commentResult = await fetchCommentsFromURL(url, 20);
// Fetches top 20 comments from YouTube

const candidates = filterToIngredientCandidates(commentResult.comments);
// Filters to comments with ingredient signals:
// - Contains numbers (quantities)
// - Contains food words (flour, butter, etc.)
// - Has bullet points or line breaks

const bestComment = findBestIngredientComment(candidates, 20);
// Scores each comment:
// - Length score
// - Bullet point score
// - Quantity score
// - Like count bonus

if (bestComment && bestComment.score >= 20) {
  sourceText = bestComment.comment.text;
  evidenceSource = 'youtube_comment';
  commentUsed = true;
  commentScore = bestComment.score;
}
```

**In our example:** **L2 SKIPPED**

---

#### STEP 8C: L2.5 - Transcript (SHORT-FORM ONLY)
**File:** `extract-cook-card/index.ts:333-364`

**Trigger:** `platform === 'youtube' && duration_seconds < 180 && sourceText.length < 200`

**In our example:**
- Duration: 330 seconds (> 180) → **L2.5 SKIPPED**
- Even if duration < 180, we have 200 chars from description → **L2.5 SKIPPED**

**If both conditions met:**
```typescript
const videoId = extractYouTubeVideoId(url);
const transcript = await fetchYouTubeTranscriptSafe(videoId, 3000);
// Uses YouTube transcript API with 3-second timeout

if (transcript.length > 0) {
  sourceText = description + '\n\nTranscript:\n' + transcript;
  evidenceSource = 'description+transcript';
}
```

**In our example:** **L2.5 SKIPPED**

---

### STEP 9: LLM Extraction - L3 (PAID)

**Current State:**
- `sourceText = "Ingredients:\n1 lb pasta\n2 tbsp olive oil\n4 cloves garlic\n..."`
- `evidenceSource = 'description'`
- `extractionCost = 0`

#### STEP 9A: Quality Gate Check
**File:** `extract-cook-card/index.ts:369-388`

```typescript
if (sourceText.length >= 50) {
  // Normalize unicode fractions
  sourceText = normalizeFractions(sourceText);
  // "½ cup" → "1/2 cup"

  // Check quality signals
  if (!hasRecipeQualitySignals(sourceText)) {
    console.log('⏭️  L3 skipped: No recipe quality signals detected');
    await logEvent(supabase, { event_type: "l3_gate_failed" });
    // SKIP L3 - don't waste money on non-recipe content
  }
}
```

**Quality Signal Check:**
```typescript
// extractionHelpers.ts:14
function hasRecipeQualitySignals(text: string): boolean {
  const lowerText = text.toLowerCase();

  // Ingredient patterns
  const hasIngredients = /\b(cup|tablespoon|teaspoon|tbsp|tsp|oz|lb|gram|kg)\b/.test(lowerText);

  // Food words
  const hasFoodWords = /\b(chicken|beef|pasta|flour|sugar|butter|egg|milk|cheese)\b/.test(lowerText);

  // Action verbs
  const hasActions = /\b(mix|stir|bake|cook|heat|add|combine|whisk)\b/.test(lowerText);

  return hasIngredients || (hasFoodWords && hasActions);
}
```

**Decision Point:**
- ✅ **HAS SIGNALS:** Contains ingredient/food patterns → Continue to L3
- ❌ **NO SIGNALS:** Doesn't look like a recipe → Skip L3, try L4

**In our example:** Description has "1 lb", "pasta", "olive oil" → **Quality gate PASSED**

---

#### STEP 9B: Budget Check (Legacy)
**File:** `extract-cook-card/index.ts:390-416`

```typescript
const budgetCheck = await checkExtractionBudget(supabase, user_id);

// This checks a SEPARATE daily budget (100 extractions/day)
// Different from monthly quota (which was already checked)

if (!budgetCheck.allowed) {
  return Response({
    error: "Extraction limit reached",
    fallback: "cook_card_lite",
    cook_card: cookCard
  });
}
```

**In our example:** User has 5/100 daily extractions → **Budget PASSED**

---

#### STEP 9C: Call Gemini LLM
**File:** `extract-cook-card/index.ts:418-419`

```typescript
const llmResult = await extractWithLLM(url, platform, cookCard, sourceText);
```

**Inside `extractWithLLM` (llm.ts:187-363):**

```typescript
// 1. Build prompt
const prompt = `Extract ingredients and instructions from this recipe text.

Source text:
"""
${sourceText}
"""

Return JSON with this structure:
{
  "ingredients": [
    {
      "name": "pasta",
      "amount": 1,
      "unit": "lb",
      "evidence_phrase": "1 lb pasta"
    }
  ],
  "instructions": [
    {
      "step_number": 1,
      "instruction": "Boil water",
      "ingredients": ["pasta"],
      "tip": null
    }
  ]
}

CRITICAL: Include evidence_phrase for every ingredient.
`;

// 2. Call Gemini 2.0 Flash
const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';
const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2000,
      responseMimeType: 'application/json'
    }
  })
});

const data = await response.json();

// 3. Extract token counts
const inputTokens = data.usageMetadata.promptTokenCount;   // ~500
const outputTokens = data.usageMetadata.candidatesTokenCount; // ~300

// 4. Calculate cost
const costCents = (inputTokens * 0.00001 + outputTokens * 0.00005) / 0.01;
// Free tier pricing: $0.00001/input token, $0.00005/output token
// Cost ≈ 0.02 cents (very cheap)

// 5. Parse response
const rawResponse = data.candidates[0].content.parts[0].text;
const parsed = JSON.parse(rawResponse);

return {
  success: true,
  ingredients: parsed.ingredients,  // 8 ingredients
  instructions: parsed.instructions, // 5 steps
  confidence: 0.85,
  cost: 0.02  // cents
};
```

**Output:**
```typescript
llmResult = {
  success: true,
  ingredients: [
    { name: "pasta", amount: 1, unit: "lb", evidence_phrase: "1 lb pasta" },
    { name: "olive oil", amount: 2, unit: "tbsp", evidence_phrase: "2 tbsp olive oil" },
    { name: "garlic", amount: 4, unit: "clove", evidence_phrase: "4 cloves garlic" },
    { name: "parmesan cheese", amount: 0.5, unit: "cup", evidence_phrase: "1/2 cup parmesan" },
    { name: "salt", amount: null, unit: null, evidence_phrase: "salt to taste" },
    { name: "pepper", amount: null, unit: null, evidence_phrase: "pepper to taste" },
    { name: "basil", amount: 0.25, unit: "cup", evidence_phrase: "1/4 cup fresh basil" },
    { name: "lemon", amount: 1, unit: null, evidence_phrase: "1 lemon" }
  ],
  instructions: [
    { step_number: 1, instruction: "Boil salted water", ingredients: ["pasta", "salt"], tip: null },
    { step_number: 2, instruction: "Cook pasta until al dente", ingredients: ["pasta"], tip: "Reserve 1 cup pasta water" },
    { step_number: 3, instruction: "Heat olive oil and sauté garlic", ingredients: ["olive oil", "garlic"], tip: null },
    { step_number: 4, instruction: "Toss pasta with oil and garlic", ingredients: ["pasta"], tip: "Add pasta water to loosen" },
    { step_number: 5, instruction: "Add cheese, basil, lemon, season", ingredients: ["parmesan cheese", "basil", "lemon", "salt", "pepper"], tip: null }
  ],
  confidence: 0.85,
  cost: 0.02
}

extractionCost = 0.02;  // Updated
```

---

#### STEP 9D: Evidence Validation (CRITICAL ANTI-HALLUCINATION)
**File:** `extract-cook-card/index.ts:424-437`

```typescript
evidenceResult = filterByEvidence(llmResult.ingredients, sourceText);
```

**Inside `filterByEvidence` (evidenceValidation.ts:93-137):**

```typescript
for (const ingredient of llmResult.ingredients) {
  // Normalize both texts
  const normalizedSource = sourceText.toLowerCase().replace(/\s+/g, ' ').trim();
  const normalizedEvidence = ingredient.evidence_phrase.toLowerCase().replace(/\s+/g, ' ').trim();

  // Check if evidence phrase exists in source
  if (!normalizedSource.includes(normalizedEvidence)) {
    // REJECT ingredient - hallucination detected
    rejected.push({
      ingredient,
      reason: 'evidence_not_found_in_source'
    });
  } else {
    // ACCEPT ingredient
    validated.push(ingredient);
  }
}

return {
  validated: [pasta, olive oil, garlic, parmesan, salt, pepper, basil, lemon],  // All 8 passed
  rejected: [],
  stats: {
    total: 8,
    validated: 8,
    rejected: 0,
    rejection_reasons: {}
  }
};
```

**In our example:** All 8 ingredients have valid evidence phrases → **All validated**

**If LLM had hallucinated:**
```typescript
// Example hallucination:
llmResult.ingredients.push({
  name: "vodka",
  amount: 2,
  unit: "tbsp",
  evidence_phrase: "2 tbsp vodka"  // NOT in source text
});

// Evidence validation would reject:
rejected.push({
  ingredient: { name: "vodka", ... },
  reason: 'evidence_not_found_in_source'
});
```

---

#### STEP 9E: Section Header Filter
**File:** `extract-cook-card/index.ts:440-452`

```typescript
sectionResult = filterSectionHeaders(evidenceResult.validated);
```

**Inside `filterSectionHeaders` (sectionHeaderFilter.ts):**

```typescript
// Patterns that indicate meta-items (not actual ingredients):
const sectionPatterns = [
  /^for the (sauce|dressing|topping|crust|filling|marinade|glaze)$/i,
  /^optional$/i,
  /^garnish$/i,
  /^(ingredients|instructions|directions)$/i
];

for (const ingredient of validated) {
  if (sectionPatterns.some(pattern => pattern.test(ingredient.name))) {
    // REMOVE section header
    removed.push(ingredient);
  } else {
    // KEEP real ingredient
    filtered.push(ingredient);
  }
}

return {
  filtered: [pasta, olive oil, garlic, parmesan, salt, pepper, basil, lemon],  // All kept
  removed: [],
  stats: { total: 8, kept: 8, removed: 0 }
};
```

**In our example:** No section headers detected → **All ingredients kept**

---

#### STEP 9F: Section Grouping
**File:** `extract-cook-card/index.ts:455-457`

```typescript
const groupedIngredients = groupIngredientsBySections(sectionResult.filtered);
```

**This looks for patterns like:**
```
For the sauce:
- 2 tbsp olive oil
- 4 cloves garlic

For the pasta:
- 1 lb pasta
```

**And adds `group` field to ingredients:**
```typescript
ingredients = [
  { name: "olive oil", group: "For the sauce" },
  { name: "garlic", group: "For the sauce" },
  { name: "pasta", group: "For the pasta" }
];
```

**In our example:** No section grouping in source → All ingredients have `group: undefined`

---

#### STEP 9G: Finalize L3 Ingredients
**File:** `extract-cook-card/index.ts:460-479`

```typescript
cookCard.ingredients = groupedIngredients.map(ing => ({
  ...ing,  // Includes: name, normalized_name, amount, unit, confidence, provenance, sort_order
  evidence_source: evidenceSource,  // "description"
  comment_score: commentScore,      // null (no comment used)
}));

// Update instructions
cookCard.instructions = {
  type: "steps",
  steps: llmResult.instructions  // 5 steps
};

cookCard.extraction.method = "llm_assisted";  // (or "llm_assisted_comment" if from comment)
cookCard.extraction.version = "L3-gemini-2.0-flash-evidence";
cookCard.extraction.evidence_source = "description";

console.log(`✅ L3: Final ${cookCard.ingredients.length} ingredients after validation`);
// "✅ L3: Final 8 ingredients after validation"
```

**Current State:**
```typescript
cookCard = {
  version: "1.0",
  source: { url, platform, creator },
  title: "Easy Pasta Recipe",
  description: "Ingredients:\n1 lb pasta\n...",
  image_url: "...",
  instructions: {
    type: "steps",
    steps: [
      { step_number: 1, instruction: "Boil salted water", ingredients: ["pasta", "salt"], tip: null },
      // ... 4 more steps
    ]
  },
  ingredients: [
    { name: "pasta", normalized_name: "pasta", amount: 1, unit: "lb", confidence: 0.85, provenance: "detected", sort_order: 0, evidence_phrase: "1 lb pasta", evidence_source: "description", comment_score: null, group: undefined },
    { name: "olive oil", normalized_name: "olive oil", amount: 2, unit: "tbsp", confidence: 0.85, provenance: "detected", sort_order: 1, evidence_phrase: "2 tbsp olive oil", evidence_source: "description", comment_score: null, group: undefined },
    // ... 6 more ingredients
  ],
  extraction: {
    method: "llm_assisted",
    confidence: 0.0,  // Will be calculated later
    version: "L3-gemini-2.0-flash-evidence",
    timestamp: "...",
    cost_cents: 0.02,
    evidence_source: "description"
  }
};

extractionCost = 0.02;
```

**L3 SUCCEEDED** → Skip L4 (only triggers when L3 fails)

---

### STEP 10: Video Vision Fallback - L4 (CONDITIONAL)

**Trigger:** `!cookCard || cookCard.ingredients.length === 0`

**File:** `extract-cook-card/index.ts:497-691`

**In our example:** We have 8 ingredients from L3 → **L4 is SKIPPED**

---

### **ALTERNATE PATH: What if L3 had failed?**

Let's trace what would happen if:
- Description was too short (< 100 chars)
- No comments found
- No transcript available
- Quality gate failed OR LLM returned 0 ingredients

**Example:** User pastes URL with description: "Watch me cook!"

#### L4 STEP 1: Platform Check
```typescript
if (platform !== 'youtube') {
  return Response({ error: "Could not extract ingredients", fallback: "cook_card_lite" });
}
```

**Decision:** ✅ Platform is YouTube → Continue

---

#### L4 STEP 2: Duration Check
```typescript
if (!duration_seconds || duration_seconds === 0) {
  return Response({ error: "Could not extract ingredients", fallback: "cook_card_lite" });
}
```

**Decision:** ✅ Duration is 330 seconds → Continue

---

#### L4 STEP 3: Global Budget Check
```typescript
const videoDurationMinutes = 330 / 60; // 5.5 minutes

const globalBudgetCheck = await checkGlobalL4Budget(supabase, 5.5);

// Database query:
SELECT count FROM rate_limits
WHERE user_id = '00000000-0000-0000-0000-000000000000'  // GLOBAL_USER_ID
  AND counter_type = 'daily_l4_global'
  AND window_key = '2025-10-10';

// Returns: current_usage = 350 minutes (out of 400 global limit)

const wouldExceed = 350 + 5.5 > 400;  // false
return { allowed: true, current_usage: 350, limit: 400 };
```

**Decision:** ✅ Global budget OK (355.5/400) → Continue

---

#### L4 STEP 4: User Budget Check
```typescript
const userBudgetCheck = await checkUserL4Budget(supabase, user_id, 'free', 5.5);

// Database query:
SELECT count FROM rate_limits
WHERE user_id = 'uuid-1234'
  AND counter_type = 'daily_l4_user'
  AND window_key = '2025-10-10';

// Returns: current_usage = 0 (user is on FREE tier with 0 minute limit)

const wouldExceed = 0 + 5.5 > 0;  // true!
return { allowed: false, current_usage: 0, limit: 0 };
```

**Decision:** ❌ **User budget EXCEEDED** (free tier has 0 L4 access)

**Return Response:**
```json
{
  "error": "Daily video processing limit reached. Upgrade to process more videos.",
  "fallback": "cook_card_lite",
  "cook_card": {
    "version": "1.0",
    "source": { "url": "...", "platform": "youtube", "creator": {...} },
    "title": "Easy Pasta Recipe",
    "description": "Watch me cook!",
    "image_url": "...",
    "instructions": { "type": "link_only" },
    "ingredients": [],
    "extraction": {
      "method": "metadata",
      "confidence": 0.0,
      "version": "L0-platform-api",
      "timestamp": "...",
      "cost_cents": 0
    }
  },
  "budget_info": {
    "current_usage": 0,
    "limit": 0,
    "tier": "free"
  }
}
```

**STOP HERE** - Free tier users cannot use L4

---

### **ALTERNATE PATH: Pro Tier User with L4 Access**

Let's say user is on PRO tier (30 min/day L4 budget), has used 25 minutes today.

#### L4 STEP 5: User Budget Check (Pro)
```typescript
const userBudgetCheck = await checkUserL4Budget(supabase, user_id, 'pro', 5.5);

// current_usage = 25, limit = 30
const wouldExceed = 25 + 5.5 > 30;  // true! (30.5 > 30)
return { allowed: false, current_usage: 25, limit: 30 };
```

**Decision:** ❌ **Would exceed budget** → DENIED

---

### **ALTERNATE PATH: Pro Tier User with Available Budget**

User is on PRO tier, has used 20 minutes today.

#### L4 STEP 6: Reserve Budget BEFORE API Call
```typescript
await reserveL4Budget(supabase, user_id, 5.5);

// Database operations (ATOMIC):
CALL increment_rate_limit(
  p_user_id: 'uuid-1234',
  p_counter_type: 'daily_l4_user',
  p_window_key: '2025-10-10',
  p_increment: 5.5
);
// User counter: 20 → 25.5

CALL increment_rate_limit(
  p_user_id: '00000000-0000-0000-0000-000000000000',
  p_counter_type: 'daily_l4_global',
  p_window_key: '2025-10-10',
  p_increment: 5.5
);
// Global counter: 350 → 355.5

console.log(`💰 Reserved 5.50 minutes of L4 budget`);
```

**Budget is now RESERVED** - even if API call fails, budget is held until refunded

---

#### L4 STEP 7: Call Gemini Vision API
```typescript
try {
  visionResult = await extractFromVideoVision(url, title, duration_seconds, false);
  extractionCost += visionResult.cost_cents;
} catch (err) {
  // REFUND budget on error
  await releaseL4Budget(supabase, user_id, 5.5);
  throw err;
}
```

**Inside `extractFromVideoVision` (llm.ts:598-794):**

```typescript
// 1. Check API key
const apiKey = Deno.env.get('L4_GEMINI_VISION');
if (!apiKey) {
  return { success: false, error: 'L4_GEMINI_VISION not set' };
}

// 2. Determine resolution (low for videos > 2 min)
const mediaResolution = duration_seconds > 120 ? 'low' : 'default';
// 330 seconds > 120 → 'low'

// 3. Estimate token cost
const tokensPerSecond = mediaResolution === 'low' ? 100 : 300;
const estimatedVideoTokens = 330 * 100; // 33,000 tokens

console.log(`🎥 L4 Vision: 330s video, low res`);
console.log(`💰 Estimated: 33000 tokens, ~$0.0099`);

// 4. Build request
const requestBody = {
  contents: [{
    parts: [
      { fileData: { fileUri: "https://www.youtube.com/watch?v=abc123" } },
      { text: "Watch this cooking video and extract ingredients and instructions..." }
    ]
  }],
  generationConfig: {
    temperature: 0.1,
    maxOutputTokens: 2000,
    responseMimeType: 'application/json',
    videoConfig: { fps: 1 }  // Low resolution: 1 frame/second
  }
};

// 5. Call Gemini 2.5 Flash
const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(requestBody)
});

const data = await response.json();

// 6. Extract actual token counts
const actualInputTokens = data.usageMetadata.promptTokenCount;   // 35,234
const actualOutputTokens = data.usageMetadata.candidatesTokenCount; // 412

// 7. Calculate ACTUAL cost
const actualCostCents = (
  (actualInputTokens * 0.30 / 1_000_000) +  // $0.30 per 1M input tokens
  (actualOutputTokens * 2.50 / 1_000_000)    // $2.50 per 1M output tokens
) * 100;
// = (35234 * 0.0000003 + 412 * 0.0000025) * 100
// = (0.0105702 + 0.001030) * 100
// = 0.0116002 * 100
// ≈ 1.16 cents

console.log(`📊 Actual tokens: 35234 in, 412 out`);

// 8. Parse response
const rawResponse = data.candidates[0].content.parts[0].text;
const parsed = JSON.parse(rawResponse);

// 9. Calculate confidence
const confidence = parsed.ingredients.length <= 2 ? 0.75 :
                  parsed.ingredients.length <= 4 ? 0.85 : 0.90;
// 6 ingredients → 0.85

console.log(`✅ L4 Vision: 6 ingredients, 4 steps (confidence: 0.85, cost: 1.16¢)`);

return {
  success: true,
  ingredients: [
    { name: "pasta", amount: 1, unit: "lb", evidence_phrase: "one pound of pasta" },
    { name: "olive oil", amount: 2, unit: "tbsp", evidence_phrase: "two tablespoons olive oil" },
    { name: "garlic", amount: 4, unit: "clove", evidence_phrase: "four cloves of garlic" },
    { name: "parmesan cheese", amount: 0.5, unit: "cup", evidence_phrase: "half cup parmesan" },
    { name: "basil", amount: 0.25, unit: "cup", evidence_phrase: "quarter cup fresh basil" },
    { name: "lemon", amount: 1, unit: null, evidence_phrase: "one lemon" }
  ],
  instructions: [
    { step_number: 1, instruction: "Boil pasta in salted water", ingredients: ["pasta"], tip: null },
    { step_number: 2, instruction: "Sauté garlic in olive oil", ingredients: ["garlic", "olive oil"], tip: "Don't burn the garlic" },
    { step_number: 3, instruction: "Toss pasta with garlic oil", ingredients: ["pasta"], tip: null },
    { step_number: 4, instruction: "Add cheese, basil, and lemon juice", ingredients: ["parmesan cheese", "basil", "lemon"], tip: null }
  ],
  confidence: 0.85,
  cost_cents: 1.16,
  model_version: 'gemini-2.5-flash',
  media_resolution: 'low',
  duration_seconds: 330,
  actual_input_tokens: 35234,
  actual_output_tokens: 412
};
```

**Back in main flow:**

```typescript
extractionCost += visionResult.cost_cents;  // 0 + 1.16 = 1.16

// Check if successful
if (!visionResult.success || visionResult.ingredients.length === 0) {
  // REFUND budget on failure
  await releaseL4Budget(supabase, user_id, 5.5);
  return Response({ error: "Could not extract ingredients", fallback: "cook_card_lite" });
}

// SUCCESS!
console.log(`✅ L4 Vision: Extracted 6 ingredients`);
```

---

#### L4 STEP 8: Normalize L4 Ingredients
```typescript
cookCard.ingredients = visionResult.ingredients.map((ing, index) => {
  // Normalize ingredient (same as L3)
  const normalized = normalizeIngredient({
    name: ing.name,
    amount: ing.amount,
    unit: ing.unit
  });

  return {
    name: normalized.name,                      // "pasta"
    normalized_name: normalized.normalized_name, // "pasta"
    amount: normalized.amount,                  // 1
    unit: normalized.unit,                      // "lb"
    confidence: visionResult.confidence,        // 0.85
    provenance: 'video_vision',                 // ✅ Required field
    sort_order: index,                          // ✅ Required field
    evidence_phrase: ing.evidence_phrase,       // "one pound of pasta"
    evidence_source: 'video_vision',
    comment_score: null,
    group: undefined
  };
});

cookCard.instructions = {
  type: "steps",
  steps: visionResult.instructions
};

cookCard.extraction.method = "video_vision";
cookCard.extraction.version = "L4-gemini-2.5-flash-vision";

await logEvent(supabase, {
  event_type: "l4_vision_success",
  ingredients_count: 6,
  cost_cents: 1.16,
  duration_seconds: 330,
  media_resolution: 'low'
});
```

**Current State:**
```typescript
cookCard = {
  // ... source, title, description
  ingredients: [
    { name: "pasta", normalized_name: "pasta", amount: 1, unit: "lb", confidence: 0.85, provenance: "video_vision", sort_order: 0, evidence_phrase: "one pound of pasta", evidence_source: "video_vision" },
    // ... 5 more ingredients
  ],
  instructions: { type: "steps", steps: [...4 steps...] },
  extraction: {
    method: "video_vision",
    confidence: 0.0,  // Will be calculated
    version: "L4-gemini-2.5-flash-vision",
    timestamp: "...",
    cost_cents: 1.16
  }
};

extractionCost = 1.16;
```

**Budget Status:**
- User budget: 25.5/30 (reserved, not refunded - success)
- Global budget: 355.5/400 (reserved, not refunded - success)

---

### STEP 11: Finalization (ALL PATHS CONVERGE HERE)

**Back to our original example (L3 success):**

#### STEP 11A: Calculate Average Confidence
**File:** `extract-cook-card/index.ts:693-700`

```typescript
const avgConfidence =
  cookCard.ingredients.reduce((sum, ing) => sum + ing.confidence, 0) /
  cookCard.ingredients.length;
// (0.85 * 8) / 8 = 0.85

cookCard.extraction.confidence = avgConfidence;  // 0.85
cookCard.extraction.cost_cents = extractionCost;  // 0.02
cookCard.extraction.timestamp = new Date().toISOString();

const extractionLatency = Date.now() - extractionStartTime;
// ~2500ms (2.5 seconds for L3 path)
```

---

#### STEP 11B: Match Canonical Items
**File:** `extract-cook-card/index.ts:703-704`

```typescript
cookCard.ingredients = await matchCanonicalItems(supabase, cookCard.ingredients);
```

**Inside `matchCanonicalItems`:**

```typescript
// For each ingredient, query canonical_items table
for (const ingredient of cookCard.ingredients) {
  const { data: matches } = await supabase
    .from('canonical_items')
    .select('*')
    .ilike('name', `%${ingredient.normalized_name}%`)
    .limit(1);

  if (matches && matches.length > 0) {
    ingredient.canonical_item_id = matches[0].id;
  }
}

// Database queries:
// SELECT * FROM canonical_items WHERE name ILIKE '%pasta%' LIMIT 1;
//   → Returns: { id: 'uuid-pasta', name: 'pasta', category: 'grain' }

// SELECT * FROM canonical_items WHERE name ILIKE '%olive oil%' LIMIT 1;
//   → Returns: { id: 'uuid-olive-oil', name: 'olive oil', category: 'oil' }

// ... 6 more queries
```

**Output:**
```typescript
cookCard.ingredients = [
  { name: "pasta", canonical_item_id: "uuid-pasta", ... },
  { name: "olive oil", canonical_item_id: "uuid-olive-oil", ... },
  { name: "garlic", canonical_item_id: "uuid-garlic", ... },
  { name: "parmesan cheese", canonical_item_id: "uuid-parmesan", ... },
  { name: "salt", canonical_item_id: "uuid-salt", ... },
  { name: "pepper", canonical_item_id: "uuid-pepper", ... },
  { name: "basil", canonical_item_id: "uuid-basil", ... },
  { name: "lemon", canonical_item_id: "uuid-lemon", ... }
];
```

**Purpose:** Links extracted ingredients to user's pantry items for availability matching

---

#### STEP 11C: Cache the Extraction
**File:** `extract-cook-card/index.ts:706-708`

```typescript
const inputHash = await computeInputHash(url, title, description, undefined);
// SHA256("2|https://www.youtube.com/watch?v=abc123|Easy Pasta Recipe|Ingredients:...")
// → "a1b2c3d4e5f6..."

await setCachedExtraction(supabase, url, inputHash, cookCard, extractionCost);
```

**Database Operation:**
```sql
INSERT INTO cook_card_cache (
  url,
  input_hash,
  cook_card,
  cost_cents,
  created_at,
  expires_at
) VALUES (
  'https://www.youtube.com/watch?v=abc123',
  'a1b2c3d4e5f6...',
  '{"version":"1.0","source":{...},"ingredients":[...]}',  -- Full cook card JSON
  0.02,
  NOW(),
  NOW() + INTERVAL '30 days'
);
```

**Purpose:** Next user who pastes this URL will get instant cache hit (no extraction needed)

---

#### STEP 11D: Increment Monthly Quota (CRITICAL)
**File:** `extract-cook-card/index.ts:710-711`

```typescript
await incrementMonthlyQuota(supabase, user_id, extractionCost);
```

**Database Operation:**
```typescript
// rateLimiting.ts:398
await supabase.rpc('increment_monthly_quota', {
  p_user_id: 'uuid-1234',
  p_cost_cents: 0.02
});

// Postgres function:
UPDATE user_quotas
SET
  extractions_this_month = extractions_this_month + 1,
  extraction_cost_cents = extraction_cost_cents + 0.02
WHERE user_id = 'uuid-1234';

// Before: { extractions_this_month: 5, extraction_cost_cents: 0.10 }
// After:  { extractions_this_month: 6, extraction_cost_cents: 0.12 }
```

**This runs for BOTH L3 and L4 extractions** ✅ (Fixed in second audit)

---

#### STEP 11E: Log Telemetry
**File:** `extract-cook-card/index.ts:713-759`

```typescript
await logEvent(supabase, {
  user_id: 'uuid-1234',
  household_id: 'uuid-5678',
  event_type: "extraction_completed",
  extraction_method: "llm_assisted",  // or "video_vision"
  extraction_confidence: 0.85,
  extraction_cost_cents: 0.02,        // or 1.16 for L4
  input_hash: "a1b2c3d4e5f6...",
  ingredients_count: 8,
  extraction_latency_ms: 2500,
  cache_hit: false,

  // Path tracking
  ladder_path: "L1→L3",  // or "L4" for vision
  evidence_source: "description",  // or "video_vision"

  // Comment tracking
  comment_used: false,
  comment_score: null,

  // Quality metrics
  ingredients_rejected_no_evidence: 0,
  ingredients_rejected_section_header: 0,

  // Source text
  source_text_length: 200,

  // Vision tracking
  vision_used: false,  // or true for L4
  vision_model: null,  // or "gemini-2.5-flash"
  vision_duration_seconds: null  // or 330
});
```

**Database Operation:**
```sql
INSERT INTO events (
  user_id,
  household_id,
  event_type,
  event_data,
  created_at
) VALUES (
  'uuid-1234',
  'uuid-5678',
  'extraction_completed',
  '{"extraction_method":"llm_assisted","extraction_confidence":0.85,...}',
  NOW()
);
```

**Purpose:** Analytics, monitoring, debugging, cost tracking

---

### STEP 12: Return Response
**File:** `extract-cook-card/index.ts:761-768`

```typescript
return new Response(
  JSON.stringify({
    cook_card: cookCard,
    requires_confirmation: avgConfidence < 0.8,  // false (0.85 >= 0.8)
    cache_status: "cached"
  }),
  { status: 200, headers: { "Content-Type": "application/json" } }
);
```

---

## 📤 OUTPUT

```json
{
  "cook_card": {
    "version": "1.0",
    "source": {
      "url": "https://www.youtube.com/watch?v=abc123",
      "platform": "youtube",
      "creator": {
        "name": "Chef John",
        "handle": "UC...",
        "avatar_url": "https://i.ytimg.com/vi/abc123/hqdefault.jpg"
      }
    },
    "title": "Easy Pasta Recipe",
    "description": "Ingredients:\n1 lb pasta\n2 tbsp olive oil\n...",
    "image_url": "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    "prep_time_minutes": null,
    "cook_time_minutes": null,
    "total_time_minutes": null,
    "servings": null,
    "instructions": {
      "type": "steps",
      "steps": [
        {
          "step_number": 1,
          "instruction": "Boil salted water",
          "ingredients": ["pasta", "salt"],
          "tip": null
        },
        {
          "step_number": 2,
          "instruction": "Cook pasta until al dente",
          "ingredients": ["pasta"],
          "tip": "Reserve 1 cup pasta water"
        },
        {
          "step_number": 3,
          "instruction": "Heat olive oil and sauté garlic",
          "ingredients": ["olive oil", "garlic"],
          "tip": null
        },
        {
          "step_number": 4,
          "instruction": "Toss pasta with oil and garlic",
          "ingredients": ["pasta"],
          "tip": "Add pasta water to loosen"
        },
        {
          "step_number": 5,
          "instruction": "Add cheese, basil, lemon, season",
          "ingredients": ["parmesan cheese", "basil", "lemon", "salt", "pepper"],
          "tip": null
        }
      ]
    },
    "ingredients": [
      {
        "name": "pasta",
        "normalized_name": "pasta",
        "canonical_item_id": "uuid-pasta",
        "amount": 1,
        "unit": "lb",
        "confidence": 0.85,
        "provenance": "detected",
        "sort_order": 0,
        "evidence_phrase": "1 lb pasta",
        "evidence_source": "description",
        "comment_score": null,
        "group": null
      },
      {
        "name": "olive oil",
        "normalized_name": "olive oil",
        "canonical_item_id": "uuid-olive-oil",
        "amount": 2,
        "unit": "tbsp",
        "confidence": 0.85,
        "provenance": "detected",
        "sort_order": 1,
        "evidence_phrase": "2 tbsp olive oil",
        "evidence_source": "description",
        "comment_score": null,
        "group": null
      },
      {
        "name": "garlic",
        "normalized_name": "garlic",
        "canonical_item_id": "uuid-garlic",
        "amount": 4,
        "unit": "clove",
        "confidence": 0.85,
        "provenance": "detected",
        "sort_order": 2,
        "evidence_phrase": "4 cloves garlic",
        "evidence_source": "description",
        "comment_score": null,
        "group": null
      },
      {
        "name": "parmesan cheese",
        "normalized_name": "parmesan cheese",
        "canonical_item_id": "uuid-parmesan",
        "amount": 0.5,
        "unit": "cup",
        "confidence": 0.85,
        "provenance": "detected",
        "sort_order": 3,
        "evidence_phrase": "1/2 cup parmesan",
        "evidence_source": "description",
        "comment_score": null,
        "group": null
      },
      {
        "name": "salt",
        "normalized_name": "salt",
        "canonical_item_id": "uuid-salt",
        "amount": null,
        "unit": null,
        "confidence": 0.85,
        "provenance": "detected",
        "sort_order": 4,
        "evidence_phrase": "salt to taste",
        "evidence_source": "description",
        "comment_score": null,
        "group": null
      },
      {
        "name": "pepper",
        "normalized_name": "pepper",
        "canonical_item_id": "uuid-pepper",
        "amount": null,
        "unit": null,
        "confidence": 0.85,
        "provenance": "detected",
        "sort_order": 5,
        "evidence_phrase": "pepper to taste",
        "evidence_source": "description",
        "comment_score": null,
        "group": null
      },
      {
        "name": "basil",
        "normalized_name": "basil",
        "canonical_item_id": "uuid-basil",
        "amount": 0.25,
        "unit": "cup",
        "confidence": 0.85,
        "provenance": "detected",
        "sort_order": 6,
        "evidence_phrase": "1/4 cup fresh basil",
        "evidence_source": "description",
        "comment_score": null,
        "group": null
      },
      {
        "name": "lemon",
        "normalized_name": "lemon",
        "canonical_item_id": "uuid-lemon",
        "amount": 1,
        "unit": null,
        "confidence": 0.85,
        "provenance": "detected",
        "sort_order": 7,
        "evidence_phrase": "1 lemon",
        "evidence_source": "description",
        "comment_score": null,
        "group": null
      }
    ],
    "extraction": {
      "method": "llm_assisted",
      "confidence": 0.85,
      "version": "L3-gemini-2.0-flash-evidence",
      "timestamp": "2025-10-10T14:23:47.623Z",
      "cost_cents": 0.02,
      "evidence_source": "description"
    }
  },
  "requires_confirmation": false,
  "cache_status": "cached"
}
```

---

## 📊 FINAL STATE

### Database Updates

**user_quotas table:**
```sql
-- Before:
user_id: uuid-1234, tier: free, extractions_this_month: 5, extraction_cost_cents: 0.10

-- After:
user_id: uuid-1234, tier: free, extractions_this_month: 6, extraction_cost_cents: 0.12
```

**rate_limits table (hourly):**
```sql
-- New row:
user_id: uuid-1234, counter_type: 'hourly', window_key: '2025-10-10T14', count: 2, expires_at: '2025-10-10T15:00:00'
```

**cook_card_cache table:**
```sql
-- New row:
url: 'https://www.youtube.com/watch?v=abc123'
input_hash: 'a1b2c3d4e5f6...'
cook_card: {...full JSON...}
cost_cents: 0.02
created_at: '2025-10-10T14:23:47'
expires_at: '2025-11-09T14:23:47'  -- 30 days
```

**events table:**
```sql
-- Multiple new rows:
1. event_type: 'extraction_completed', event_data: {...}
```

### Cost Tracking

- **User charged:** 0.02 cents
- **Actual Gemini cost:** ~0.005 cents (very cheap for text)
- **Extraction latency:** ~2.5 seconds
- **Cache duration:** 30 days

### User Experience

- **Next user with same URL:** Instant response (cache hit)
- **User quota:** 6/10 extractions used
- **Confidence:** 85% (no confirmation needed)
- **All ingredients linked to pantry:** Yes (canonical matching)

---

## 🔀 DECISION TREE SUMMARY

```
User pastes URL
  │
  ├─→ Validate request ──→ Missing fields? → 400 error ✖
  │
  ├─→ Normalize URL
  │
  ├─→ Detect platform
  │
  ├─→ Check monthly quota ──→ Exceeded? → Return quota error ✖
  │
  ├─→ Check hourly rate ──→ Exceeded? → Return 429 error ✖
  │
  ├─→ Fetch metadata ──→ Failed? → Return 400 error ✖
  │
  ├─→ Check cache ──→ Hit? → Return cached cook card ✓
  │
  ├─→ Build cookCard
  │
  ├─→ L1: Description
  │     ├─→ >= 100 chars? → Use description → Skip L2, L2.5
  │     └─→ < 100 chars? → Try L2
  │
  ├─→ L2: Comments (YouTube only, if L1 failed)
  │     ├─→ Found good comment? → Use comment
  │     └─→ No comment? → Try L2.5
  │
  ├─→ L2.5: Transcript (YouTube, <180s, if L1+L2 failed)
  │     ├─→ Found transcript? → Combine with description
  │     └─→ No transcript? → Continue with what we have
  │
  ├─→ L3: LLM Extraction
  │     ├─→ sourceText < 50 chars? → Skip L3 → Try L4
  │     ├─→ No quality signals? → Skip L3 → Try L4
  │     ├─→ Budget exceeded? → Return error ✖
  │     ├─→ Call Gemini → Parse → Validate evidence → Filter sections
  │     ├─→ Got ingredients? → Use L3 → Skip L4
  │     └─→ No ingredients? → Try L4
  │
  ├─→ L4: Video Vision (if L3 failed)
  │     ├─→ Not YouTube? → Return error ✖
  │     ├─→ No duration? → Return error ✖
  │     ├─→ Global budget exceeded? → Return error ✖
  │     ├─→ User budget exceeded? → Return error ✖
  │     ├─→ Reserve budget
  │     ├─→ Call Gemini Vision
  │     ├─→ Success? → Use L4 ingredients
  │     └─→ Failed? → Refund budget → Return error ✖
  │
  ├─→ Finalization (L3 or L4 succeeded)
  │     ├─→ Calculate confidence
  │     ├─→ Match canonical items
  │     ├─→ Cache extraction
  │     ├─→ Increment monthly quota ✅
  │     └─→ Log telemetry
  │
  └─→ Return cook card ✓
```

---

## ⏱️ PERFORMANCE METRICS

### L1→L3 Path (Most Common - Good Description)
- **Metadata fetch:** ~500ms
- **Cache check:** ~50ms
- **Gemini LLM call:** ~1500ms
- **Evidence validation:** ~50ms
- **Canonical matching:** ~400ms
- **Cache write + telemetry:** ~200ms
- **Total:** ~2.7 seconds

### L4 Path (No Description - Vision Fallback)
- **Metadata fetch:** ~500ms
- **Cache check:** ~50ms
- **Budget checks:** ~100ms
- **Gemini Vision call:** ~4000ms (longer - processes video)
- **Canonical matching:** ~400ms
- **Cache write + telemetry:** ~200ms
- **Total:** ~5.3 seconds

### Cache Hit (Second User, Same URL)
- **Metadata fetch:** ~500ms
- **Cache check:** ~50ms
- **Return cached:** ~10ms
- **Total:** ~560ms (5x faster!)

---

## 💰 COST BREAKDOWN

### L1→L3 Path (Text)
- **YouTube API:** Free (within quota)
- **Gemini 2.0 Flash:** ~0.005 cents
- **Database ops:** Negligible
- **Total:** ~0.02 cents (tracked)

### L4 Path (Vision)
- **YouTube API:** Free
- **Gemini 2.5 Flash Vision:** ~1.16 cents (5.5 min video, low res)
- **Database ops:** Negligible
- **Total:** ~1.16 cents (tracked)

### Free Tier Economics
- **Monthly limit:** 10 extractions
- **Average cost:** 0.02 cents (L3)
- **Monthly cost per user:** ~$0.002 (0.2 cents)
- **Acceptable for free tier:** Yes ✅

---

## 🎯 KEY INSIGHTS

1. **Most requests are cache hits** (popular recipes extracted once)
2. **L1→L3 is most common path** (YouTube descriptions usually have ingredients)
3. **L4 is expensive** (free tier blocked, pro tier limited to 30 min/day)
4. **Evidence validation prevents hallucinations** (critical anti-hallucination measure)
5. **Optimistic locking prevents budget overruns** (race condition eliminated)
6. **Monthly quota tracks ALL successful extractions** (L3 and L4)

---

**END OF TRACE**
