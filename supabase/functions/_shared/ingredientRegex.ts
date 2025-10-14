/**
 * L2 Ingredient Parser - Regex-based extraction from creator text
 * PRD Reference: COOKCARD_PRD_V1.md Section 5 - Ingestion Ladder L2
 *
 * Extracts ingredients from YouTube video descriptions, Instagram captions,
 * TikTok video descriptions using pattern matching.
 *
 * Patterns detected:
 * - Structured: "1 cup flour", "2 tbsp butter", "1/2 tsp salt"
 * - Unstructured: "pinch of salt", "dash of pepper", "handful of nuts"
 * - Ranges: "1-2 cups flour", "3 to 4 cloves garlic"
 *
 * Confidence scoring:
 * - High (0.90-0.95): Strong patterns with quantity + unit + name
 * - Medium (0.70-0.85): Soft patterns (pinch, dash, to taste)
 * - Low (0.60-0.69): Weak patterns (single word after bullet)
 */

export interface ParsedIngredient {
  name: string;
  normalized_name?: string;
  amount?: number | string;
  unit?: string;
  preparation?: string;
  confidence: number;
  provenance: 'creator_text';
  sort_order: number;
  is_optional?: boolean;
}

// Common units (with variations)
const UNITS = [
  // Volume
  'cup', 'cups', 'c',
  'tablespoon', 'tablespoons', 'tbsp', 'tbs', 'T',
  'teaspoon', 'teaspoons', 'tsp', 'ts', 't',
  'fluid ounce', 'fluid ounces', 'fl oz', 'fl. oz.',
  'milliliter', 'milliliters', 'ml', 'mL',
  'liter', 'liters', 'l', 'L',
  'pint', 'pints', 'pt',
  'quart', 'quarts', 'qt',
  'gallon', 'gallons', 'gal',

  // Weight
  'ounce', 'ounces', 'oz',
  'pound', 'pounds', 'lb', 'lbs',
  'gram', 'grams', 'g',
  'kilogram', 'kilograms', 'kg',

  // Count
  'piece', 'pieces', 'pc',
  'clove', 'cloves',
  'can', 'cans',
  'package', 'packages', 'pkg',
  'stick', 'sticks',
  'slice', 'slices',
  'bag', 'bags',
  'bunch', 'bunches',
  'sprig', 'sprigs',
  'head', 'heads',
  'ear', 'ears',
  'stalk', 'stalks',
  'leaf', 'leaves',

  // Generic
  'pinch', 'pinches',
  'dash', 'dashes',
  'handful', 'handfuls',
];

// Build regex pattern for units (case-insensitive)
const UNIT_PATTERN = UNITS.join('|');

// Quantity patterns
// Matches: 1, 1.5, 1/2, 1 1/2, 1-2, 1 to 2, 1-1/2
const QTY_PATTERN = '(?:\\d+\\s*-\\s*\\d+|\\d+\\s+to\\s+\\d+|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+\\.\\d+|\\d+)';

// Bullet point indicators
const BULLET_PATTERN = '^[\\-•\\u2022\\*\\+]\\s*';

// Strong pattern: quantity + unit + ingredient name
// Example: "1 cup flour", "2 tbsp butter", "1/2 tsp salt"
const STRONG_PATTERN = new RegExp(
  `${BULLET_PATTERN}?(${QTY_PATTERN})\\s+(${UNIT_PATTERN})\\s+(?:of\\s+)?(.+)`,
  'i'
);

// Medium pattern: unit only (no quantity)
// Example: "cup of sugar", "tablespoon vanilla extract"
const MEDIUM_PATTERN = new RegExp(
  `${BULLET_PATTERN}?(${UNIT_PATTERN})\\s+(?:of\\s+)?(.+)`,
  'i'
);

// Soft pattern: qualitative amounts
// Example: "pinch of salt", "dash of pepper", "to taste"
const SOFT_WORDS = ['pinch', 'dash', 'handful', 'sprinkle', 'to taste', 'as needed', 'for serving', 'for garnish'];
const SOFT_PATTERN = new RegExp(
  `${BULLET_PATTERN}?(${SOFT_WORDS.join('|')})\\s+(?:of\\s+)?(.*)`,
  'i'
);

// Loose pattern: bullet + single/multi-word ingredient
// Example: "- salt", "- black pepper", "- fresh basil leaves"
const LOOSE_PATTERN = new RegExp(
  `${BULLET_PATTERN}([a-zA-Z][a-zA-Z\\s,']+)$`,
  'i'
);

// Noise patterns to skip (links, promotions, instructions)
const NOISE_PATTERNS = [
  /http(s)?:\/\//i,
  /subscribe/i,
  /sponsor/i,
  /discount/i,
  /code/i,
  /shop\s?the/i,
  /link\s?in\s?bio/i,
  /check\s?out/i,
  /follow\s?me/i,
  /instagram/i,
  /tiktok/i,
  /youtube/i,
  /watch\s?my/i,
  /full\s?recipe/i,
  /step\s?\d+/i,
  /^\d+\.\s/i, // Numbered instructions (1. Preheat oven...)
];

/**
 * Parse ingredient list from creator text (description, caption, etc.)
 */
export function parseIngredientsFromText(text: string): ParsedIngredient[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const ingredients: ParsedIngredient[] = [];
  let sortOrder = 0;

  for (const line of lines) {
    // Skip noise (links, promotions, instructions)
    if (NOISE_PATTERNS.some(rx => rx.test(line))) {
      continue;
    }

    // Skip very long lines (likely instructions, not ingredients)
    if (line.length > 150) {
      continue;
    }

    // Try strong pattern first (quantity + unit + name)
    let match = STRONG_PATTERN.exec(line);
    if (match) {
      const [, quantity, unit, name] = match;
      ingredients.push({
        name: cleanName(name),
        amount: parseQuantity(quantity),
        unit: normalizeUnit(unit),
        confidence: 0.92,
        provenance: 'creator_text',
        sort_order: sortOrder++,
      });
      continue;
    }

    // Try medium pattern (unit + name, no quantity)
    match = MEDIUM_PATTERN.exec(line);
    if (match) {
      const [, unit, name] = match;
      ingredients.push({
        name: cleanName(name),
        unit: normalizeUnit(unit),
        confidence: 0.80,
        provenance: 'creator_text',
        sort_order: sortOrder++,
      });
      continue;
    }

    // Try soft pattern (pinch, dash, to taste)
    match = SOFT_PATTERN.exec(line);
    if (match) {
      const [, qualifier, name] = match;
      const ingredientName = name.trim() || qualifier; // "to taste" might not have a following name
      ingredients.push({
        name: cleanName(ingredientName),
        amount: qualifier.toLowerCase(), // "pinch", "dash", "to taste"
        confidence: 0.75,
        provenance: 'creator_text',
        sort_order: sortOrder++,
        is_optional: qualifier.toLowerCase().includes('to taste') || qualifier.toLowerCase().includes('for garnish'),
      });
      continue;
    }

    // Try loose pattern (bullet + ingredient name)
    match = LOOSE_PATTERN.exec(line);
    if (match) {
      const [, name] = match;
      const cleaned = cleanName(name);

      // Only accept if it looks like a real ingredient (not too short, not too long)
      if (cleaned.length >= 3 && cleaned.length <= 50 && !cleaned.match(/^\d+$/)) {
        ingredients.push({
          name: cleaned,
          confidence: 0.65,
          provenance: 'creator_text',
          sort_order: sortOrder++,
        });
      }
    }
  }

  return deduplicateIngredients(ingredients);
}

/**
 * Clean ingredient name
 * - Remove trailing punctuation
 * - Trim whitespace
 * - Lowercase for normalization
 */
function cleanName(name: string): string {
  return name
    .replace(/[,;.!?]+$/g, '') // Remove trailing punctuation
    .replace(/\s{2,}/g, ' ') // Collapse multiple spaces
    .replace(/\(.*?\)/g, '') // Remove parenthetical notes
    .trim()
    .toLowerCase();
}

/**
 * Parse quantity string into number or range
 * Examples:
 * - "1" → 1
 * - "1.5" → 1.5
 * - "1/2" → 0.5
 * - "1 1/2" → 1.5
 * - "1-2" → "1-2" (keep as range)
 * - "1 to 2" → "1-2"
 */
function parseQuantity(qty: string): number | string {
  qty = qty.trim();

  // Range: "1-2" or "1 to 2"
  if (qty.includes('-') || qty.toLowerCase().includes('to')) {
    const parts = qty.split(/\s*-\s*|\s+to\s+/i);
    return `${parts[0]}-${parts[1]}`; // Normalize to "X-Y" format
  }

  // Mixed fraction: "1 1/2"
  const mixedMatch = qty.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const numerator = parseInt(mixedMatch[2], 10);
    const denominator = parseInt(mixedMatch[3], 10);
    return whole + numerator / denominator;
  }

  // Fraction: "1/2"
  const fractionMatch = qty.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const numerator = parseInt(fractionMatch[1], 10);
    const denominator = parseInt(fractionMatch[2], 10);
    return numerator / denominator;
  }

  // Decimal: "1.5"
  const decimal = parseFloat(qty);
  if (!isNaN(decimal)) {
    return decimal;
  }

  // Fallback: return as-is
  return qty;
}

/**
 * Normalize unit variations to canonical form
 * Examples:
 * - "tbsp" → "tablespoon"
 * - "tsp" → "teaspoon"
 * - "c" → "cup"
 * - "oz" → "ounce"
 */
function normalizeUnit(unit: string): string {
  const normalized = unit.toLowerCase().trim();

  const unitMap: Record<string, string> = {
    // Volume
    'c': 'cup',
    'tbsp': 'tablespoon',
    'tbs': 'tablespoon',
    'T': 'tablespoon',
    'tsp': 'teaspoon',
    'ts': 'teaspoon',
    't': 'teaspoon',
    'fl oz': 'fluid ounce',
    'fl. oz.': 'fluid ounce',
    'ml': 'milliliter',
    'mL': 'milliliter',
    'l': 'liter',
    'L': 'liter',
    'pt': 'pint',
    'qt': 'quart',
    'gal': 'gallon',

    // Weight
    'oz': 'ounce',
    'lb': 'pound',
    'lbs': 'pound',
    'g': 'gram',
    'kg': 'kilogram',

    // Count
    'pc': 'piece',
    'pkg': 'package',
  };

  return unitMap[normalized] || normalized;
}

/**
 * Deduplicate ingredients by normalized name
 * Keep the ingredient with highest confidence
 */
function deduplicateIngredients(ingredients: ParsedIngredient[]): ParsedIngredient[] {
  const seen = new Map<string, ParsedIngredient>();

  for (const ingredient of ingredients) {
    const key = ingredient.name;
    const existing = seen.get(key);

    if (!existing || ingredient.confidence > existing.confidence) {
      seen.set(key, ingredient);
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Calculate average confidence across all ingredients
 */
export function calculateAverageConfidence(ingredients: ParsedIngredient[]): number {
  if (ingredients.length === 0) return 0;
  const sum = ingredients.reduce((acc, ing) => acc + ing.confidence, 0);
  return sum / ingredients.length;
}

/**
 * Check if extraction quality meets threshold for Rich Paste UX
 * Decision gate: ≥50% of videos produce ≥5 ingredients with avg_conf ≥0.70
 */
export function meetsRichPasteThreshold(ingredients: ParsedIngredient[]): {
  meets: boolean;
  reason: string;
  avgConfidence: number;
} {
  const avgConfidence = calculateAverageConfidence(ingredients);

  if (ingredients.length < 5) {
    return {
      meets: false,
      reason: `Only ${ingredients.length} ingredients found (need ≥5)`,
      avgConfidence,
    };
  }

  if (avgConfidence < 0.70) {
    return {
      meets: false,
      reason: `Average confidence ${avgConfidence.toFixed(2)} too low (need ≥0.70)`,
      avgConfidence,
    };
  }

  return {
    meets: true,
    reason: `${ingredients.length} ingredients with ${avgConfidence.toFixed(2)} avg confidence`,
    avgConfidence,
  };
}
