/**
 * Evidence Phrase Validation
 *
 * Purpose: Prevent LLM hallucinations by requiring literal substring match
 *
 * Core Innovation: Every ingredient must have an "evidence_phrase" that exists
 * verbatim in the source text. If the evidence phrase can't be found, the
 * ingredient is rejected (fail-closed).
 *
 * Example:
 * - Source: "▢ ¼ cup peanut butter"
 * - Ingredient: {name: "peanut butter", evidence_phrase: "¼ cup peanut butter"}
 * - Validation: ✅ PASS (substring exists)
 *
 * - Source: "creamy pasta sauce"
 * - Ingredient: {name: "vodka", evidence_phrase: "vodka"}
 * - Validation: ❌ FAIL (substring doesn't exist → hallucination)
 */

export interface IngredientWithEvidence {
  name: string;
  amount?: number;
  unit?: string;
  evidence_phrase?: string; // Required for validation
  preparation?: string;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate that an ingredient's evidence phrase exists in the source text
 *
 * @param ingredient - Ingredient with evidence_phrase field
 * @param sourceText - Original source text (description, comment, etc.)
 * @returns Validation result with reason if rejected
 */
/**
 * Fully normalize text for evidence validation
 *
 * Handles:
 * - Unicode normalization (NFKC)
 * - Case normalization
 * - Whitespace normalization
 * - Zero-width character removal
 * - Decimal separator normalization
 * - Smart quote normalization
 * - Dash normalization
 * - Unicode fraction normalization
 *
 * @param text - Text to normalize
 * @returns Normalized text
 */
function fullyNormalizeText(text: string): string {
  // Unicode fraction map (same as extractionHelpers.ts)
  const fractionMap: Record<string, string> = {
    '½': '1/2', '¼': '1/4', '¾': '3/4',
    '⅓': '1/3', '⅔': '2/3',
    '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5',
    '⅙': '1/6', '⅚': '5/6',
    '⅐': '1/7',
    '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
    '⅑': '1/9', '⅒': '1/10'
  };

  let normalized = text
    // Unicode normalization (NFKC - Compatibility Decomposition + Canonical Composition)
    .normalize('NFKC')
    // Lowercase
    .toLowerCase()
    // Replace unicode fractions with ASCII equivalents
    .replace(/[½¼¾⅓⅔⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒]/g, (match) => fractionMap[match] || match)
    // Collapse whitespace (multiple spaces/tabs/newlines → single space)
    .replace(/\s+/g, ' ')
    // Remove zero-width characters (invisible chars that break matching)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Normalize decimal separators (European comma to period: 1,5 → 1.5)
    .replace(/(\d),(\d)/g, '$1.$2')
    // Smart quotes to straight quotes
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    // Em dash and en dash to hyphen
    .replace(/[—–]/g, '-')
    // Trim edges
    .trim();

  return normalized;
}

export function validateIngredientEvidence(
  ingredient: IngredientWithEvidence,
  sourceText: string
): ValidationResult {
  // Guard: Empty or null source text
  if (!sourceText || sourceText.trim() === '') {
    return {
      valid: false,
      reason: 'empty_source_text',
    };
  }

  // Rule 1: Evidence phrase is required
  if (!ingredient.evidence_phrase || ingredient.evidence_phrase.trim() === '') {
    return {
      valid: false,
      reason: 'missing_evidence_phrase',
    };
  }

  // Fully normalize both texts for robust matching
  const normalizedSource = fullyNormalizeText(sourceText);
  const normalizedEvidence = fullyNormalizeText(ingredient.evidence_phrase);

  // Rule 2: Evidence phrase must exist as substring in source
  if (!normalizedSource.includes(normalizedEvidence)) {
    return {
      valid: false,
      reason: 'evidence_not_found_in_source',
    };
  }

  // Passed all checks
  return { valid: true };
}

/**
 * Filter ingredients array, keeping only those with valid evidence
 *
 * @param ingredients - Array of ingredients with evidence_phrase
 * @param sourceText - Original source text
 * @returns Filtered array + rejection stats
 */
export function filterByEvidence(
  ingredients: IngredientWithEvidence[],
  sourceText: string
): {
  validated: IngredientWithEvidence[];
  rejected: Array<{ ingredient: IngredientWithEvidence; reason: string }>;
  stats: {
    total: number;
    validated: number;
    rejected: number;
    rejection_reasons: Record<string, number>;
  };
} {
  const validated: IngredientWithEvidence[] = [];
  const rejected: Array<{ ingredient: IngredientWithEvidence; reason: string }> = [];
  const rejectionReasons: Record<string, number> = {};

  for (const ingredient of ingredients) {
    const result = validateIngredientEvidence(ingredient, sourceText);

    if (result.valid) {
      validated.push(ingredient);
    } else {
      rejected.push({
        ingredient,
        reason: result.reason || 'unknown',
      });

      // Track rejection reasons for telemetry
      const reason = result.reason || 'unknown';
      rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
    }
  }

  return {
    validated,
    rejected,
    stats: {
      total: ingredients.length,
      validated: validated.length,
      rejected: rejected.length,
      rejection_reasons: rejectionReasons,
    },
  };
}

/**
 * Validate with detailed logging (for debugging)
 *
 * @param ingredient - Ingredient to validate
 * @param sourceText - Source text
 * @returns Validation result with detailed debug info
 */
export function validateWithLogging(
  ingredient: IngredientWithEvidence,
  sourceText: string
): ValidationResult & { debug?: any } {
  const result = validateIngredientEvidence(ingredient, sourceText);

  if (!result.valid) {
    console.warn(
      `⚠️  Evidence validation failed for "${ingredient.name}"\n` +
      `   Reason: ${result.reason}\n` +
      `   Evidence phrase: "${ingredient.evidence_phrase}"\n` +
      `   Source text (first 100 chars): "${sourceText.substring(0, 100)}..."`
    );

    return {
      ...result,
      debug: {
        ingredient_name: ingredient.name,
        evidence_phrase: ingredient.evidence_phrase,
        source_preview: sourceText.substring(0, 200),
      },
    };
  }

  return result;
}

/**
 * Fuzzy match for common typos (optional enhancement)
 *
 * This is a more lenient version that allows for minor differences:
 * - Smart quotes vs straight quotes
 * - Common unicode equivalents
 *
 * Use sparingly - prefer strict matching to avoid false positives
 */
export function validateIngredientEvidenceFuzzy(
  ingredient: IngredientWithEvidence,
  sourceText: string
): ValidationResult {
  if (!ingredient.evidence_phrase) {
    return {
      valid: false,
      reason: 'missing_evidence_phrase',
    };
  }

  // Apply fuzzy normalizations
  const fuzzyNormalize = (text: string): string => {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      // Smart quotes → straight quotes
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"')
      // Unicode fractions → ASCII
      .replace(/¼/g, '1/4')
      .replace(/½/g, '1/2')
      .replace(/¾/g, '3/4')
      // Em dash, en dash → hyphen
      .replace(/[—–]/g, '-');
  };

  const normalizedSource = fuzzyNormalize(sourceText);
  const normalizedEvidence = fuzzyNormalize(ingredient.evidence_phrase);

  if (!normalizedSource.includes(normalizedEvidence)) {
    return {
      valid: false,
      reason: 'evidence_not_found_in_source_fuzzy',
    };
  }

  return { valid: true };
}
