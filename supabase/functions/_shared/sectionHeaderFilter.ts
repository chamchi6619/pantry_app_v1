/**
 * Section Header Filter
 *
 * Purpose: Detect and filter out section headers that LLMs mistakenly
 * extract as ingredients
 *
 * Problem: Recipe text often has section headers like:
 * - "Sauce:"
 * - "For the garnish"
 * - "MARINADE"
 * - "Nuoc Cham"
 *
 * LLMs return these as ingredients, polluting the ingredient list.
 *
 * Example from testing:
 * - Video: Vietnamese Peanut Sauce recipe
 * - LLM returned: "Nuoc Cham" (it's a section header, not an ingredient)
 * - Impact: 15/26 ingredients were section headers
 *
 * This filter removes these false positives.
 */

/**
 * Known section header names (exact matches, case-insensitive)
 * Note: Using `let` instead of `const` to allow dynamic additions
 */
let KNOWN_SECTION_NAMES = [
  // Recipe sections (generic categories)
  'sauce',
  'marinade',
  'garnish',
  'dressing',
  'topping',
  'filling',
  'frosting',
  'glaze',
  'slurry',
  'coating',
  'batter',
  'crust',
  'base',

  // Structural sections (meta-headers)
  'ingredients',
  'instructions',
  'directions',
  'notes',
  'tips',
  'substitutions',
  'optional',
];

export interface FilterResult {
  is_section_header: boolean;
  reason?: string;
  pattern?: string;
}

/**
 * Detect if a text string is a section header
 *
 * @param text - Text to check (usually ingredient name)
 * @returns Filter result with detection reason
 */
export function isSectionHeader(text: string): FilterResult {
  if (!text) {
    return { is_section_header: false };
  }

  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Pattern 1: Ends with colon → "Sauce:", "Marinade:", "For the garnish:"
  if (/^[A-Za-z\s]+:$/.test(trimmed)) {
    return {
      is_section_header: true,
      reason: 'ends_with_colon',
      pattern: 'text:',
    };
  }

  // Pattern 2: "For the X" → "For the sauce", "For garnish", "For serving"
  if (/^for (the |a )?[a-z\s]+$/i.test(lower)) {
    return {
      is_section_header: true,
      reason: 'for_the_pattern',
      pattern: 'for the X',
    };
  }

  // Pattern 3: Known section names (exact match)
  if (KNOWN_SECTION_NAMES.includes(lower)) {
    return {
      is_section_header: true,
      reason: 'known_section_name',
      pattern: lower,
    };
  }

  // Pattern 4: ALL CAPS (likely header) → "SAUCE", "GARNISH", "MARINADE"
  // Exception: Short words like "OR", "TO" are not headers
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 2 && /^[A-Z\s]+$/.test(trimmed)) {
    return {
      is_section_header: true,
      reason: 'all_caps',
      pattern: 'ALL CAPS',
    };
  }

  // Pattern 5: Starts with "For" → "For decoration", "For serving"
  if (/^for\s/i.test(lower) && lower.split(/\s+/).length <= 3) {
    return {
      is_section_header: true,
      reason: 'starts_with_for',
      pattern: 'For X',
    };
  }

  // Pattern 6: Numbered sections → "1. Sauce", "2. Marinade"
  if (/^\d+\.\s*[A-Za-z\s]+$/.test(trimmed)) {
    return {
      is_section_header: true,
      reason: 'numbered_section',
      pattern: '1. Section',
    };
  }

  // Pattern 7: Parenthetical only → "(optional)", "(for garnish)"
  if (/^\([^)]+\)$/.test(trimmed)) {
    return {
      is_section_header: true,
      reason: 'parenthetical_only',
      pattern: '(text)',
    };
  }

  // Not a section header
  return { is_section_header: false };
}

/**
 * Filter ingredients array, removing section headers
 *
 * @param ingredients - Array of ingredient objects
 * @returns Filtered array + removed items for logging
 */
export function filterSectionHeaders<T extends { name: string }>(
  ingredients: T[]
): {
  filtered: T[];
  removed: Array<{ ingredient: T; reason: string; pattern?: string }>;
  stats: {
    total: number;
    kept: number;
    removed: number;
    removal_reasons: Record<string, number>;
  };
} {
  const filtered: T[] = [];
  const removed: Array<{ ingredient: T; reason: string; pattern?: string }> = [];
  const removalReasons: Record<string, number> = {};

  for (const ingredient of ingredients) {
    const result = isSectionHeader(ingredient.name);

    if (!result.is_section_header) {
      filtered.push(ingredient);
    } else {
      removed.push({
        ingredient,
        reason: result.reason || 'unknown',
        pattern: result.pattern,
      });

      // Track removal reasons for telemetry
      const reason = result.reason || 'unknown';
      removalReasons[reason] = (removalReasons[reason] || 0) + 1;
    }
  }

  return {
    filtered,
    removed,
    stats: {
      total: ingredients.length,
      kept: filtered.length,
      removed: removed.length,
      removal_reasons: removalReasons,
    },
  };
}

/**
 * Filter with logging (for debugging)
 *
 * @param ingredients - Ingredients to filter
 * @returns Filtered result with console logging
 */
export function filterSectionHeadersWithLogging<T extends { name: string }>(
  ingredients: T[]
): {
  filtered: T[];
  removed: Array<{ ingredient: T; reason: string; pattern?: string }>;
} {
  const result = filterSectionHeaders(ingredients);

  if (result.removed.length > 0) {
    console.log(
      `🚫 Section header filter removed ${result.removed.length}/${result.stats.total} items:`
    );
    result.removed.forEach((item, idx) => {
      console.log(
        `   ${idx + 1}. "${item.ingredient.name}" (${item.reason}: ${item.pattern || 'N/A'})`
      );
    });
  }

  return result;
}

/**
 * Check if text contains section header indicators
 * (useful for pre-filtering before LLM extraction)
 *
 * @param text - Full text to scan
 * @returns True if text contains section headers
 */
export function containsSectionHeaders(text: string): boolean {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  for (const line of lines) {
    const result = isSectionHeader(line);
    if (result.is_section_header) {
      return true;
    }
  }

  return false;
}

/**
 * Add section header to known list (for user feedback)
 *
 * Allows users to report false positives that we can add to the filter
 *
 * @param headerName - Section header to add
 */
export function addKnownSectionHeader(headerName: string): void {
  const normalized = headerName.toLowerCase().trim();
  if (!KNOWN_SECTION_NAMES.includes(normalized)) {
    KNOWN_SECTION_NAMES.push(normalized);
    console.log(`✅ Added "${normalized}" to known section headers`);
  }
}

/**
 * Get all known section header names (for debugging)
 */
export function getKnownSectionHeaders(): string[] {
  return [...KNOWN_SECTION_NAMES];
}
