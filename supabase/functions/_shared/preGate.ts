/**
 * Pre-Gate Logic
 *
 * Purpose: Save LLM costs by skipping extraction on sparse descriptions
 * that won't have ingredients anyway
 *
 * Cost Impact:
 * - Sparse videos (viral Shorts, IG stories): 60% of videos
 * - Cost per L3 call: ~1¢
 * - Pre-gate saves: ~$0.006/attempt on sparse videos
 *
 * Strategy: Check for ingredient signals BEFORE calling expensive LLM
 *
 * Decision Gate:
 * - IF description.length < 100 → SKIP L3 → Try secondary ladder
 * - IF no ingredient signals → SKIP L3 → Try secondary ladder
 * - ELSE → Proceed with L3
 */

export interface PreGateResult {
  should_skip_l3: boolean;
  reason?: string;
  signals_found?: string[];
  confidence_estimate?: number; // 0.0-1.0
}

/**
 * Check if text contains ingredient signals (quantities, units, structure)
 *
 * @param text - Text to analyze (description, caption)
 * @returns Array of signal types found
 */
export function detectIngredientSignals(text: string): string[] {
  const signals: string[] = [];

  // Signal 1: Quantity + unit patterns
  // Examples: "1 cup", "2 tbsp", "½ tsp", "3 cloves"
  if (/\d+\s*(cup|tbsp|tbs|tsp|oz|lb|lbs|g|kg|ml|l|clove|piece)/i.test(text)) {
    signals.push('quantity_unit');
  }

  // Signal 2: Fractions (unicode or ASCII)
  // Examples: "½", "¼", "¾", "1/2", "1/4"
  if (/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/.test(text) || /\d+\/\d+/.test(text)) {
    signals.push('fractions');
  }

  // Signal 3: List structure (bullets, dashes, checkboxes)
  // Examples: "▢", "•", "-", "*", "1.", "2."
  // Note: \d+\.\s requires whitespace to avoid matching decimals like "1.5"
  if (/[▢▣□☐•●○◦⦿⦾\-\*]|\d+\.\s/.test(text)) {
    signals.push('list_structure');
  }

  // Signal 4: Explicit ingredient keywords
  // Examples: "Ingredients:", "You'll need:", "Recipe:"
  if (/ingredient|recipe|you need|you'll need|you will need/i.test(text)) {
    signals.push('explicit_keywords');
  }

  // Signal 5: Quantity words
  // Examples: "pinch", "dash", "handful"
  if (/pinch|dash|handful|sprinkle/i.test(text)) {
    signals.push('quantity_words');
  }

  // Signal 6: Common ingredient words (high signal)
  const commonIngredients = [
    'flour', 'sugar', 'salt', 'pepper', 'butter', 'oil', 'egg',
    'milk', 'water', 'garlic', 'onion', 'tomato', 'cheese', 'chicken',
  ];
  const lowerText = text.toLowerCase();
  const foundIngredients = commonIngredients.filter(ing => lowerText.includes(ing));
  if (foundIngredients.length >= 2) {
    signals.push('common_ingredients');
  }

  return signals;
}

/**
 * Evaluate if L3 extraction should be skipped (pre-gate)
 *
 * @param description - Recipe description/caption
 * @returns Pre-gate decision with reason
 */
export function shouldSkipL3(description: string): PreGateResult {
  // Rule 1: Too short (likely just hashtags or social links)
  if (description.length < 100) {
    return {
      should_skip_l3: true,
      reason: 'description_too_short',
      confidence_estimate: 0.0,
    };
  }

  // Rule 2: No ingredient signals
  const signals = detectIngredientSignals(description);
  if (signals.length === 0) {
    return {
      should_skip_l3: true,
      reason: 'no_ingredient_signals',
      signals_found: [],
      confidence_estimate: 0.0,
    };
  }

  // Rule 3: Only weak signals (e.g., just common ingredient words, no structure)
  const hasStrongSignals = signals.some(s =>
    ['quantity_unit', 'fractions', 'list_structure', 'explicit_keywords'].includes(s)
  );

  if (!hasStrongSignals) {
    return {
      should_skip_l3: true,
      reason: 'only_weak_signals',
      signals_found: signals,
      confidence_estimate: 0.2,
    };
  }

  // Passed all gates - proceed with L3
  return {
    should_skip_l3: false,
    signals_found: signals,
    confidence_estimate: estimateConfidence(signals),
  };
}

/**
 * Estimate extraction confidence based on signals found
 *
 * @param signals - Array of signal types detected
 * @returns Confidence estimate (0.0-1.0)
 */
function estimateConfidence(signals: string[]): number {
  // Baseline: 0.4 (some signals present)
  let confidence = 0.4;

  // Strong signals boost
  if (signals.includes('quantity_unit')) confidence += 0.2;
  if (signals.includes('list_structure')) confidence += 0.2;
  if (signals.includes('explicit_keywords')) confidence += 0.1;
  if (signals.includes('fractions')) confidence += 0.1;

  // Cap at 0.9 (never guarantee 100% without extraction)
  return Math.min(confidence, 0.9);
}

/**
 * Check if description is too sparse for reliable extraction
 *
 * More nuanced than simple length check - looks at content quality
 *
 * @param description - Description text
 * @returns True if description is too sparse
 */
export function isSparseDescription(description: string): boolean {
  // Check 1: Length
  if (description.length < 100) return true;

  // Check 2: Mostly hashtags
  const words = description.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return true; // Empty description is sparse

  const hashtagCount = words.filter(w => w.startsWith('#')).length;
  if (hashtagCount / words.length > 0.5) return true;

  // Check 3: Mostly URLs/links
  const linkCount = (description.match(/https?:\/\/|www\./g) || []).length;
  if (linkCount >= 3) return true;

  // Check 4: Mostly emojis
  const emojiCount = (description.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
  if (emojiCount > description.length * 0.3) return true;

  return false;
}

/**
 * Get pre-gate statistics for telemetry
 *
 * @param description - Description text
 * @returns Detailed stats about pre-gate decision
 */
export function getPreGateStats(description: string): {
  description_length: number;
  signals_detected: string[];
  signal_count: number;
  is_sparse: boolean;
  decision: PreGateResult;
} {
  const signals = detectIngredientSignals(description);
  const decision = shouldSkipL3(description);

  return {
    description_length: description.length,
    signals_detected: signals,
    signal_count: signals.length,
    is_sparse: isSparseDescription(description),
    decision,
  };
}

/**
 * Format pre-gate decision for logging
 *
 * @param decision - Pre-gate result
 * @returns Human-readable log message
 */
export function formatPreGateDecision(decision: PreGateResult): string {
  if (decision.should_skip_l3) {
    return `⏭️  PRE-GATE SKIP: ${decision.reason} (confidence: ${(decision.confidence_estimate || 0).toFixed(2)})`;
  } else {
    return `✅ PRE-GATE PASS: ${decision.signals_found?.length || 0} signals detected (estimated confidence: ${(decision.confidence_estimate || 0).toFixed(2)})`;
  }
}

/**
 * Feature flag: Enable/disable pre-gate
 *
 * Useful for A/B testing or emergency fallback
 */
export function isPreGateEnabled(): boolean {
  const envFlag = Deno.env.get('ENABLE_PRE_GATE');
  if (envFlag !== undefined) {
    return envFlag.toLowerCase() === 'true';
  }
  // Default: enabled
  return true;
}
