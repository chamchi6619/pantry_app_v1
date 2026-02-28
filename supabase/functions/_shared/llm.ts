/**
 * LLM Extraction Module (Gemini 2.0 Flash)
 *
 * Purpose: Extract ingredients from recipe text using Gemini Flash
 *
 * Key constraints:
 * - NO pantry hints in prompt (prevent bias)
 * - Temperature 0.1 (deterministic)
 * - Max input 16000 chars (~4000 tokens)
 * - Max output 600 tokens
 * - JSON schema enforcement
 * - Robust parsing (strip code fences, fallback to [])
 * - Timeout: 30s
 * - Retry: 2 retries max with exponential backoff (CONSERVATIVE)
 *
 * Cost: ~$0.026 per extraction (paid tier), $0.00 (free tier)
 */

/**
 * Gemini 2.5 Flash Pricing (Paid Tier)
 *
 * Official pricing from ai.google.dev/gemini-api/docs/pricing (Jan 2026)
 * - Input (text/image/video): $0.30 per 1M tokens
 * - Input (audio): $1.00 per 1M tokens
 * - Output (including thinking tokens): $2.50 per 1M tokens
 *
 * Note: Same pricing as GEMINI_VISION_PRICING for 2.5 Flash
 * Free tier: $0.00 for both input/output
 */
const GEMINI_PRICING = {
  INPUT_PER_1M_TOKENS: 0.30,  // $0.30 per 1M tokens (Gemini 2.5 Flash)
  OUTPUT_PER_1M_TOKENS: 2.50, // $2.50 per 1M tokens (Gemini 2.5 Flash)
};

/**
 * Safety limits
 */
const MAX_INPUT_CHARS = 16000; // ~4000 tokens (leave headroom)
const MAX_OUTPUT_TOKENS = 2000; // Increased for recipes with many ingredients
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds
const MAX_RETRIES = 2; // Conservative: total 3 attempts max

/**
 * Raw ingredient from LLM (before normalization)
 *
 * UPDATED: Now requires evidence_phrase to prevent hallucinations
 */
export interface RawLLMIngredient {
  name: string;
  amount?: number | string;
  unit?: string;
  evidence_phrase?: string; // Required for evidence validation
}

/**
 * Structured instruction step from LLM
 */
export interface RawLLMInstructionStep {
  step_number: number;
  instruction: string;
  ingredients?: string[]; // Ingredients used in this step
  tip?: string; // Optional cooking tip
}

/**
 * LLM extraction result
 */
export interface LLMExtractionResult {
  ingredients: RawLLMIngredient[];
  instructions?: RawLLMInstructionStep[]; // Structured cooking steps
  confidence: number;
  cost_cents: number;
  model_version: string;
  raw_response?: string; // For debugging/auditing
  actual_input_tokens?: number;
  actual_output_tokens?: number;
}

/**
 * Build extraction prompt (no pantry hints)
 *
 * @param title - Recipe title
 * @param description - Recipe description/caption (up to 4000 chars)
 * @param platform - Source platform (youtube, instagram, tiktok, web)
 * @returns Formatted prompt for Gemini
 */
function buildExtractionPrompt(
  title: string,
  description: string,
  platform: string
): string {
  const truncatedDescription = description.slice(0, 4000);

  return `Title: "${title}"
Platform: ${platform}
Description:
"""
${truncatedDescription}
"""

Extract ingredients AND cooking instructions from the Description above.

Expected output format:
{
  "ingredients": [
    {"name":"pasta","amount":1,"unit":"lb","evidence_phrase":"1 lb pasta"},
    {"name":"vodka","amount":0.5,"unit":"cup","evidence_phrase":"½ cup vodka"},
    {"name":"heavy cream","evidence_phrase":"heavy cream"}
  ],
  "instructions": [
    {
      "step_number": 1,
      "instruction": "Chop the well-fermented kimchi into small pieces.",
      "ingredients": ["kimchi"],
      "tip": "Using well-fermented kimchi will bring a deeper flavor to the dish."
    },
    {
      "step_number": 2,
      "instruction": "Fry the pork in vegetable oil until cooked through.",
      "ingredients": ["pork", "vegetable oil"],
      "tip": "Ensure the pork is cut into small, even pieces for quick cooking."
    }
  ]
}

CRITICAL RULES FOR INGREDIENTS:
1. Include "evidence_phrase" for EVERY ingredient - the exact text snippet from Description
2. Never infer or guess - only extract what's explicitly stated
3. Treat section headers (e.g., "Sauce:", "Garnish:") as labels, NOT ingredients
4. Use singular unit names (cup, tablespoon, teaspoon, not cups, tablespoons, teaspoons)
5. Omit amount/unit if not explicitly present in text

CRITICAL RULES FOR INSTRUCTIONS:
1. Extract step-by-step cooking instructions in order
2. For each step, list which ingredients from the ingredients list are used (by name only)
3. Include helpful cooking tips when explicitly mentioned in the source
4. Number steps sequentially starting from 1
5. If no clear instructions found, return empty array []

Example with section headers:
Source: "▢ ¼ cup peanut butter\n▢ Sauce:\n▢ 2 tbsp soy sauce\n\n1. Mix peanut butter with soy sauce."
Output: {
  "ingredients": [
    {"name":"peanut butter","amount":0.25,"unit":"cup","evidence_phrase":"¼ cup peanut butter"},
    {"name":"soy sauce","amount":2,"unit":"tbsp","evidence_phrase":"2 tbsp soy sauce"}
  ],
  "instructions": [
    {"step_number": 1, "instruction": "Mix peanut butter with soy sauce.", "ingredients": ["peanut butter", "soy sauce"]}
  ]
}`;
}

/**
 * Parse LLM JSON response (robust parsing)
 *
 * Handles:
 * - Code fences: ```json\n{...}\n```
 * - Markdown formatting
 * - Malformed JSON
 * - Both old array format and new object format
 *
 * @param rawResponse - Raw text response from LLM
 * @returns Parsed extraction result
 */
function parseLLMResponse(rawResponse: string): {
  ingredients: RawLLMIngredient[];
  instructions: RawLLMInstructionStep[];
} {
  try {
    let cleaned = rawResponse.trim();

    // Strip code fences
    cleaned = cleaned.replace(/^```(?:json)?\n?/i, '');
    cleaned = cleaned.replace(/\n?```$/i, '');
    cleaned = cleaned.trim();

    // Parse JSON
    const parsed = JSON.parse(cleaned);

    // Handle old format (array of ingredients only)
    if (Array.isArray(parsed)) {
      console.log('   📋 Old format detected (array only), parsing ingredients');
      const ingredients: RawLLMIngredient[] = [];
      for (const item of parsed) {
        if (typeof item === 'object' && item !== null && typeof item.name === 'string') {
          ingredients.push({
            name: item.name,
            amount: item.amount !== undefined ? item.amount : undefined,
            unit: item.unit !== undefined ? item.unit : undefined,
            evidence_phrase: item.evidence_phrase !== undefined ? item.evidence_phrase : undefined,
          });
        }
      }
      return { ingredients, instructions: [] };
    }

    // Handle new format (object with ingredients + instructions)
    if (typeof parsed === 'object' && parsed !== null) {
      console.log('   📋 New format detected (object with ingredients + instructions)');

      const ingredients: RawLLMIngredient[] = [];
      const instructions: RawLLMInstructionStep[] = [];

      // Parse ingredients
      if (Array.isArray(parsed.ingredients)) {
        for (const item of parsed.ingredients) {
          if (typeof item === 'object' && item !== null && typeof item.name === 'string') {
            ingredients.push({
              name: item.name,
              amount: item.amount !== undefined ? item.amount : undefined,
              unit: item.unit !== undefined ? item.unit : undefined,
              evidence_phrase: item.evidence_phrase !== undefined ? item.evidence_phrase : undefined,
            });
          }
        }
      }

      // Parse instructions
      if (Array.isArray(parsed.instructions)) {
        for (const item of parsed.instructions) {
          if (typeof item === 'object' && item !== null &&
              typeof item.step_number === 'number' &&
              typeof item.instruction === 'string') {
            instructions.push({
              step_number: item.step_number,
              instruction: item.instruction,
              ingredients: Array.isArray(item.ingredients) ? item.ingredients : undefined,
              tip: typeof item.tip === 'string' ? item.tip : undefined,
            });
          }
        }
      }

      return { ingredients, instructions };
    }

    console.warn('LLM response is neither array nor object, returning empty');
    return { ingredients: [], instructions: [] };
  } catch (err) {
    console.error('Failed to parse LLM response:', err);
    console.error('Raw response:', rawResponse.substring(0, 200));
    return { ingredients: [], instructions: [] };
  }
}

/**
 * Calculate extraction confidence based on ingredient count and LLM response
 *
 * Heuristics:
 * - 0 ingredients = 0.0
 * - 1-2 ingredients = 0.60
 * - 3-4 ingredients = 0.75
 * - 5+ ingredients = 0.85
 *
 * @param ingredients - Parsed ingredients
 * @returns Confidence score (0.0 - 1.0)
 */
function calculateExtractionConfidence(ingredients: RawLLMIngredient[]): number {
  const count = ingredients.length;

  if (count === 0) return 0.0;
  if (count <= 2) return 0.60;
  if (count <= 4) return 0.75;
  return 0.85; // 5+ ingredients
}

/**
 * Calculate extraction cost using ACTUAL token counts
 *
 * Uses official Gemini 2.0 Flash pricing:
 * - Input: $0.10 per 1M tokens
 * - Output: $0.40 per 1M tokens
 *
 * @param inputTokens - Actual input tokens from API response
 * @param outputTokens - Actual output tokens from API response
 * @param inputPricePerMillion - Optional custom input price (defaults to 2.0 Flash pricing)
 * @param outputPricePerMillion - Optional custom output price (defaults to 2.0 Flash pricing)
 * @returns Cost in cents (rounded up)
 */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  inputPricePerMillion: number = GEMINI_PRICING.INPUT_PER_1M_TOKENS,
  outputPricePerMillion: number = GEMINI_PRICING.OUTPUT_PER_1M_TOKENS
): number {
  const inputCost = (inputTokens / 1000000) * inputPricePerMillion;
  const outputCost = (outputTokens / 1000000) * outputPricePerMillion;

  return Math.ceil((inputCost + outputCost) * 100); // Convert to cents, round up
}

/**
 * Fetch with timeout wrapper
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds
 * @returns Response
 */
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

/**
 * Fetch with retry logic (CONSERVATIVE)
 *
 * Retry strategy:
 * - Max 2 retries (3 total attempts)
 * - Only retry on: 429 (rate limit), 500/502/503/504 (server errors)
 * - Exponential backoff: 1s, 2s, 4s
 * - Respect Retry-After header if present
 * - NO retry on 4xx errors (except 429)
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @returns Response
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, REQUEST_TIMEOUT_MS);

      // Success - return immediately
      if (response.ok) {
        if (attempt > 0) {
          console.log(`✅ Retry succeeded on attempt ${attempt + 1}`);
        }
        return response;
      }

      // Check if we should retry
      const shouldRetry =
        (response.status === 429 || response.status >= 500) &&
        attempt < MAX_RETRIES;

      if (!shouldRetry) {
        // Don't retry - return the error response
        return response;
      }

      // Calculate retry delay
      const retryAfterHeader = response.headers.get('Retry-After');
      let delayMs: number;

      if (retryAfterHeader) {
        // Respect Retry-After header (in seconds)
        delayMs = parseInt(retryAfterHeader, 10) * 1000;
        console.warn(`⚠️  Rate limited (429), Retry-After: ${retryAfterHeader}s`);
      } else {
        // Exponential backoff: 1s, 2s, 4s
        delayMs = Math.pow(2, attempt) * 1000;
      }

      // Cap maximum delay at 10 seconds
      delayMs = Math.min(delayMs, 10000);

      console.warn(
        `⚠️  Gemini API ${response.status} error, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES + 1})`
      );

      await new Promise(resolve => setTimeout(resolve, delayMs));

    } catch (err) {
      lastError = err as Error;

      // Check if we should retry
      const shouldRetry = attempt < MAX_RETRIES;

      if (!shouldRetry) {
        // Out of retries - throw error
        throw lastError;
      }

      // Retry on network errors
      const delayMs = Math.pow(2, attempt) * 1000;
      console.warn(
        `⚠️  Network error: ${lastError.message}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES + 1})`
      );

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // Should never reach here, but just in case
  throw lastError || new Error('Max retries exceeded');
}

/**
 * Extract ingredients using Gemini 2.5 Flash
 *
 * Safety mechanisms:
 * - Uses stable model (gemini-2.5-flash)
 * - 30s timeout per request
 * - Max 2 retries with exponential backoff
 * - Input size enforcement (16000 chars max)
 * - Actual token count tracking
 * - Correct pricing calculation
 *
 * @param title - Recipe title
 * @param description - Recipe description/caption
 * @param platform - Source platform
 * @returns Extraction result with ingredients, confidence, cost
 */
export async function extractIngredientsWithGemini(
  title: string,
  description: string,
  platform: string
): Promise<LLMExtractionResult> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable not set');
  }

  // Use Gemini 2.5 Flash (migrated from 2.0 - Jan 2025)
  const model = 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Build prompt
  let userPrompt = buildExtractionPrompt(title, description, platform);

  // Enforce input size limit
  const systemPrompt = 'You are a recipe ingredient extractor. Return ONLY a JSON array of ingredients with evidence phrases. Never invent data. If amounts are not explicitly present, omit them. ALWAYS include "evidence_phrase" for every ingredient.\n\n';
  const fullPrompt = systemPrompt + userPrompt;

  if (fullPrompt.length > MAX_INPUT_CHARS) {
    console.warn(
      `⚠️  Input too long (${fullPrompt.length} chars), truncating to ${MAX_INPUT_CHARS}`
    );
    const allowedUserPromptChars = MAX_INPUT_CHARS - systemPrompt.length;
    userPrompt = userPrompt.slice(0, allowedUserPromptChars);
  }

  // Estimate input tokens (rough: 4 chars = 1 token)
  const estimatedInputTokens = Math.ceil(fullPrompt.length / 4);

  console.log(`🤖 Calling Gemini (${model}) - Est. input tokens: ${estimatedInputTokens}`);

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: systemPrompt + userPrompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      topP: 0.95,
    },
    thinkingConfig: {
      thinkingBudget: 0,
    },
  };

  // Make API call with retry logic
  const response = await fetchWithRetry(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gemini API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = await response.json();

  // Extract ACTUAL token counts from API response
  const actualInputTokens = data.usageMetadata?.promptTokenCount || 0;
  const actualOutputTokens = data.usageMetadata?.candidatesTokenCount || 0;

  // Log if estimation was significantly off (>20%)
  if (actualInputTokens > 0) {
    const estimationError = Math.abs(actualInputTokens - estimatedInputTokens) / actualInputTokens;
    if (estimationError > 0.2) {
      console.warn(
        `⚠️  Token estimation off by ${(estimationError * 100).toFixed(1)}%: estimated ${estimatedInputTokens}, actual ${actualInputTokens}`
      );
    }
  }

  // Extract text response
  const rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!rawResponse) {
    console.warn('Gemini returned empty response');
    return {
      ingredients: [],
      confidence: 0.0,
      cost_cents: 0,
      model_version: model,
      raw_response: JSON.stringify(data),
      actual_input_tokens: actualInputTokens,
      actual_output_tokens: actualOutputTokens,
    };
  }

  console.log(`📝 Gemini response length: ${rawResponse.length} chars`);
  console.log(`📝 Gemini raw response: "${rawResponse}"`);

  // Parse ingredients and instructions
  const parsed = parseLLMResponse(rawResponse);
  const confidence = calculateExtractionConfidence(parsed.ingredients);

  // Calculate cost using ACTUAL token counts
  const cost = calculateCost(actualInputTokens, actualOutputTokens);

  console.log(
    `✅ Extracted ${parsed.ingredients.length} ingredients, ${parsed.instructions.length} instruction steps ` +
    `(confidence: ${confidence.toFixed(2)}, tokens: ${actualInputTokens}→${actualOutputTokens}, cost: ${cost}¢)`
  );

  return {
    ingredients: parsed.ingredients,
    instructions: parsed.instructions,
    confidence,
    cost_cents: cost,
    model_version: model,
    raw_response: rawResponse,
    actual_input_tokens: actualInputTokens,
    actual_output_tokens: actualOutputTokens,
  };
}

/**
 * Gemini 2.5 Flash Vision Pricing
 *
 * Official pricing from ai.google.dev/gemini-api/docs/pricing
 * - Input (text + video): $0.30 per 1M tokens
 * - Output: $2.50 per 1M tokens
 *
 * Video token estimation:
 * - Low resolution: ~100 tokens per second
 * - Default resolution: ~300 tokens per second
 */
const GEMINI_VISION_PRICING = {
  INPUT_PER_1M_TOKENS: 0.30,   // $0.30 per 1M tokens
  OUTPUT_PER_1M_TOKENS: 2.50,  // $2.50 per 1M tokens
  TOKENS_PER_SECOND_LOW: 100,  // Low resolution
  TOKENS_PER_SECOND_DEFAULT: 300, // Default resolution
};

/**
 * L4 Vision Extraction Result
 */
export interface VisionExtractionResult {
  success: boolean;
  ingredients: RawLLMIngredient[];
  instructions: RawLLMInstructionStep[];
  confidence: number;
  cost_cents: number;
  model_version: string;
  media_resolution: 'low' | 'default';
  duration_seconds: number;
  actual_input_tokens?: number;
  actual_output_tokens?: number;
  error?: string;
}

/**
 * Extract ingredients from YouTube video using Gemini 2.5 Flash Vision
 *
 * L4 Video Vision Fallback - when text-based extraction fails
 *
 * @param youtubeUrl - Full YouTube URL (supports direct URL passing to Gemini)
 * @param title - Video title
 * @param durationSeconds - Video duration in seconds
 * @param useHighResolution - Use default resolution instead of low (more expensive)
 * @param instructionsOnly - Only extract instructions (when ingredients already available from L3)
 * @returns Vision extraction result
 */
export async function extractFromVideoVision(
  youtubeUrl: string,
  title: string,
  durationSeconds: number,
  useHighResolution: boolean = false,
  instructionsOnly: boolean = false
): Promise<VisionExtractionResult> {
  // Try both case variations of L4_Gemini_vision, then fallback to GEMINI_API_KEY
  const apiKey = Deno.env.get('L4_Gemini_vision') || Deno.env.get('L4_GEMINI_VISION') || Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return {
      success: false,
      ingredients: [],
      instructions: [],
      confidence: 0.0,
      cost_cents: 0,
      model_version: 'gemini-2.5-flash',
      media_resolution: 'low',
      duration_seconds: durationSeconds,
      error: 'L4_Gemini_vision, L4_GEMINI_VISION, or GEMINI_API_KEY environment variable not set',
    };
  }

  // Use Gemini 2.5 Flash for vision (migrated from 2.0 - Jan 2025)
  const model = 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Determine media resolution
  // Low res for videos > 2 minutes to save tokens
  const mediaResolution: 'low' | 'default' = useHighResolution ? 'default' :
    (durationSeconds > 120 ? 'low' : 'default');

  // Estimate token cost BEFORE calling API
  const tokensPerSecond = mediaResolution === 'low'
    ? GEMINI_VISION_PRICING.TOKENS_PER_SECOND_LOW
    : GEMINI_VISION_PRICING.TOKENS_PER_SECOND_DEFAULT;
  const estimatedVideoTokens = Math.ceil(durationSeconds * tokensPerSecond);
  const estimatedOutputTokens = 500; // Typical response size
  const estimatedCostCents = Math.ceil(
    ((estimatedVideoTokens * GEMINI_VISION_PRICING.INPUT_PER_1M_TOKENS) +
     (estimatedOutputTokens * GEMINI_VISION_PRICING.OUTPUT_PER_1M_TOKENS)) / 10000
  );

  console.log(`🎥 L4 Vision: ${durationSeconds}s video, ${mediaResolution} res, instructionsOnly=${instructionsOnly}`);
  console.log(`💰 Estimated: ${estimatedVideoTokens} tokens, ~$${(estimatedCostCents / 100).toFixed(4)}`);

  const prompt = instructionsOnly
    ? `Watch this cooking video and extract ONLY the step-by-step cooking instructions.

IMPORTANT: Do NOT extract ingredients. Only extract instructions.

Return as JSON:
{
  "instructions": [
    {"step_number": 1, "instruction": "detailed, natural cooking instruction"}
  ]
}

Instructions should be:
- Natural and friendly (like a chef teaching you)
- Detailed with context (e.g., "Cut the well-fermented kimchi into smaller pieces" not "Cut kimchi")
- Include important details: times, temperatures, visual cues, doneness
- Complete sentences with articles (the/a) and descriptive words
- Listen to what the person says and capture their teaching style`
    : `Watch this cooking video and tell me:

1. What ingredients are mentioned or shown?
2. What are the step-by-step cooking instructions?

Return as JSON:
{
  "ingredients": [
    {"name": "ingredient name", "amount": number or null, "unit": "unit" or null}
  ],
  "instructions": [
    {"step_number": 1, "instruction": "detailed, natural cooking instruction"}
  ]
}

Instructions should be:
- Natural and friendly (like a chef teaching you)
- Detailed with context (e.g., "Fry the pork in a pan with vegetable oil until it's fully cooked" not "Fry pork")
- Include important details: times, temperatures, visual cues, doneness
- Complete sentences with articles (the/a) and descriptive words
- Capture the natural flow of how someone would explain cooking

For ingredients:
- List ALL ingredients you see or hear
- Use singular units (cup not cups)
- Include amounts when visible or mentioned`;

  // Determine if input is a YouTube URL or File API URI
  const isFileApiUri = youtubeUrl.startsWith('https://generativelanguage.googleapis.com/v1beta/files/');

  const requestBody = {
    contents: [
      {
        parts: [
          {
            fileData: isFileApiUri ? {
              mimeType: 'video/mp4',
              fileUri: youtubeUrl, // File API URI for uploaded videos
            } : {
              fileUri: youtubeUrl, // Direct YouTube URL
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4000, // Increased from 2000 to prevent truncation
      topP: 0.95,
      responseMimeType: 'application/json', // Force JSON response
    },
    thinkingConfig: {
      thinkingBudget: 0,
    },
  };

  try {
    console.log(`🤖 Calling Gemini Vision (${model}, ${mediaResolution} res)...`);
    console.log(`🔧 Request body:`, JSON.stringify(requestBody, null, 2));

    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`✅ Got response from Gemini Vision API: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Gemini Vision API error: ${response.status} - ${errorText}`);
      return {
        success: false,
        ingredients: [],
        instructions: [],
        confidence: 0.0,
        cost_cents: 0,
        model_version: model,
        media_resolution: mediaResolution,
        duration_seconds: durationSeconds,
        error: `API error: ${response.status}`,
      };
    }

    const data = await response.json();

    // Extract ACTUAL token counts
    const actualInputTokens = data.usageMetadata?.promptTokenCount || 0;
    const actualOutputTokens = data.usageMetadata?.candidatesTokenCount || 0;

    console.log(`📊 Actual tokens: ${actualInputTokens} in, ${actualOutputTokens} out`);

    // Extract text response
    const rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log(`🔧 Vision raw response:`, rawResponse || '(empty)');

    if (!rawResponse) {
      console.warn('⚠️  Gemini Vision returned empty response');
      console.log(`🔧 Full API response:`, JSON.stringify(data, null, 2));
      return {
        success: false,
        ingredients: [],
        instructions: [],
        confidence: 0.0,
        cost_cents: 0,
        model_version: model,
        media_resolution: mediaResolution,
        duration_seconds: durationSeconds,
        actual_input_tokens: actualInputTokens,
        actual_output_tokens: actualOutputTokens,
        error: 'Empty response from API',
      };
    }

    console.log(`📝 Vision raw response (first 500 chars): ${rawResponse.substring(0, 500)}...`);
    console.log(`📝 Vision raw response (FULL):`, rawResponse);
    console.log(`🔧 DEBUG v89: Full API response data:`, JSON.stringify(data, null, 2));

    // Parse JSON response
    const parsed = parseLLMResponse(rawResponse);
    console.log(`🔧 DEBUG: Parsed result - ingredients: ${parsed.ingredients.length}, instructions: ${parsed.instructions.length}`);

    // Calculate actual cost using vision pricing
    const actualCostCents = calculateCost(
      actualInputTokens,
      actualOutputTokens,
      GEMINI_VISION_PRICING.INPUT_PER_1M_TOKENS,
      GEMINI_VISION_PRICING.OUTPUT_PER_1M_TOKENS
    );

    // Vision extractions are generally more reliable (saw the video)
    const confidence = parsed.ingredients.length === 0 ? 0.0 :
                      parsed.ingredients.length <= 2 ? 0.75 :
                      parsed.ingredients.length <= 4 ? 0.85 : 0.90;

    console.log(
      `✅ L4 Vision: ${parsed.ingredients.length} ingredients, ${parsed.instructions.length} steps ` +
      `(confidence: ${confidence.toFixed(2)}, cost: ${actualCostCents}¢)`
    );

    // When instructionsOnly=true, success depends on instructions, not ingredients
    const success = instructionsOnly
      ? parsed.instructions.length > 0
      : parsed.ingredients.length > 0;

    return {
      success,
      ingredients: parsed.ingredients,
      instructions: parsed.instructions,
      confidence,
      cost_cents: actualCostCents,
      model_version: model,
      media_resolution: mediaResolution,
      duration_seconds: durationSeconds,
      actual_input_tokens: actualInputTokens,
      actual_output_tokens: actualOutputTokens,
    };
  } catch (err) {
    console.error('❌ L4 Vision extraction error:', err);
    return {
      success: false,
      ingredients: [],
      instructions: [],
      confidence: 0.0,
      cost_cents: 0,
      model_version: model,
      media_resolution: mediaResolution,
      duration_seconds: durationSeconds,
      error: (err as Error).message,
    };
  }
}

/**
 * Mock extraction for testing (no API call)
 *
 * Use this for unit tests and development without incurring costs.
 *
 * @param title - Recipe title
 * @param description - Recipe description
 * @returns Mock extraction result
 */
export function mockExtraction(
  title: string,
  description: string
): LLMExtractionResult {
  // Simple mock: extract anything that looks like an ingredient
  const mockIngredients: RawLLMIngredient[] = [
    { name: 'pasta', amount: 1, unit: 'lb' },
    { name: 'olive oil', amount: 2, unit: 'tablespoon' },
    { name: 'garlic', amount: 3, unit: 'clove' },
    { name: 'salt' },
  ];

  return {
    ingredients: mockIngredients,
    confidence: 0.85,
    cost_cents: 0, // No cost for mock
    model_version: 'mock',
    raw_response: JSON.stringify(mockIngredients),
    actual_input_tokens: 0,
    actual_output_tokens: 0,
  };
}
