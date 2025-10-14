/**
 * Ingredient Normalization Utilities
 *
 * Purpose: Standardize units, amounts, and quantities from LLM extractions
 *
 * Key functions:
 * - normalizeUnit: Convert unit variants to canonical singular form
 * - normalizeAmount: Parse fractions, ranges, and text amounts to numbers
 */

/**
 * Unit mappings: variant → canonical singular form
 */
const UNIT_MAPPINGS: Record<string, string> = {
  // Volume
  'cup': 'cup',
  'cups': 'cup',
  'c': 'cup',
  'C': 'cup',

  'tablespoon': 'tablespoon',
  'tablespoons': 'tablespoon',
  'tbsp': 'tablespoon',
  'tbs': 'tablespoon',
  'T': 'tablespoon',

  'teaspoon': 'teaspoon',
  'teaspoons': 'teaspoon',
  'tsp': 'teaspoon',
  'ts': 'teaspoon',
  't': 'teaspoon',

  'fluid ounce': 'fluid_ounce',
  'fluid ounces': 'fluid_ounce',
  'fl oz': 'fluid_ounce',
  'fl. oz': 'fluid_ounce',

  'milliliter': 'milliliter',
  'milliliters': 'milliliter',
  'ml': 'milliliter',
  'mL': 'milliliter',

  'liter': 'liter',
  'liters': 'liter',
  'l': 'liter',
  'L': 'liter',

  'pint': 'pint',
  'pints': 'pint',
  'pt': 'pint',

  'quart': 'quart',
  'quarts': 'quart',
  'qt': 'quart',

  'gallon': 'gallon',
  'gallons': 'gallon',
  'gal': 'gallon',

  // Weight
  'ounce': 'ounce',
  'ounces': 'ounce',
  'oz': 'ounce',

  'pound': 'pound',
  'pounds': 'pound',
  'lb': 'pound',
  'lbs': 'pound',

  'gram': 'gram',
  'grams': 'gram',
  'g': 'gram',
  'gr': 'gram',

  'kilogram': 'kilogram',
  'kilograms': 'kilogram',
  'kg': 'kilogram',

  // Imprecise
  'pinch': 'pinch',
  'pinches': 'pinch',

  'dash': 'dash',
  'dashes': 'dash',

  'handful': 'handful',
  'handfuls': 'handful',

  'sprinkle': 'sprinkle',
  'sprinkles': 'sprinkle',

  // Count
  'piece': 'piece',
  'pieces': 'piece',
  'pc': 'piece',
  'pcs': 'piece',

  'clove': 'clove',
  'cloves': 'clove',

  'can': 'can',
  'cans': 'can',

  'jar': 'jar',
  'jars': 'jar',

  'package': 'package',
  'packages': 'package',
  'pkg': 'package',

  'bunch': 'bunch',
  'bunches': 'bunch',

  'slice': 'slice',
  'slices': 'slice',

  'whole': 'whole',

  // Special
  'to taste': null,
  'as needed': null,
  'as desired': null,
  'optional': null,
};

/**
 * Normalize unit to canonical singular form
 *
 * @param unit - Raw unit string from LLM or user input
 * @returns Canonical unit (singular) or null if imprecise/omitted
 *
 * @example
 * normalizeUnit('cups') // 'cup'
 * normalizeUnit('tbsp') // 'tablespoon'
 * normalizeUnit('to taste') // null
 */
export function normalizeUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;

  const normalized = unit.toLowerCase().trim();

  // Direct mapping
  if (normalized in UNIT_MAPPINGS) {
    return UNIT_MAPPINGS[normalized];
  }

  // Fallback: return as-is (lowercase)
  return normalized;
}

/**
 * Normalize amount to a single number
 *
 * Handles:
 * - Fractions: "1/2", "½" → 0.5
 * - Mixed numbers: "1 1/2" → 1.5
 * - Ranges: "1-2", "1 to 2" → 1.5 (midpoint)
 * - Imprecise: "to taste", "as needed" → null
 *
 * @param amount - Raw amount from LLM (string or number)
 * @returns Normalized number or null if imprecise/omitted
 *
 * @example
 * normalizeAmount('1/2') // 0.5
 * normalizeAmount('1 1/2') // 1.5
 * normalizeAmount('1-2') // 1.5
 * normalizeAmount('to taste') // null
 */
export function normalizeAmount(amount: string | number | null | undefined): number | null {
  if (amount === null || amount === undefined) return null;

  // Already a number
  if (typeof amount === 'number') {
    return amount > 0 ? amount : null;
  }

  const str = amount.toString().toLowerCase().trim();

  // Imprecise amounts
  const imprecisePatterns = [
    'to taste',
    'as needed',
    'as desired',
    'optional',
    'pinch',
    'dash',
    'handful',
    'sprinkle',
  ];

  for (const pattern of imprecisePatterns) {
    if (str.includes(pattern)) {
      return null;
    }
  }

  // Unicode fractions
  const unicodeFractions: Record<string, number> = {
    '¼': 0.25,
    '½': 0.5,
    '¾': 0.75,
    '⅐': 1/7,
    '⅑': 1/9,
    '⅒': 0.1,
    '⅓': 1/3,
    '⅔': 2/3,
    '⅕': 0.2,
    '⅖': 0.4,
    '⅗': 0.6,
    '⅘': 0.8,
    '⅙': 1/6,
    '⅚': 5/6,
    '⅛': 0.125,
    '⅜': 0.375,
    '⅝': 0.625,
    '⅞': 0.875,
  };

  for (const [char, value] of Object.entries(unicodeFractions)) {
    if (str.includes(char)) {
      // Mixed number: "1½" → 1 + 0.5
      const beforeFraction = str.substring(0, str.indexOf(char)).trim();
      const whole = beforeFraction ? parseFloat(beforeFraction) : 0;
      return (isNaN(whole) ? 0 : whole) + value;
    }
  }

  // Ranges: "1-2", "1 to 2", "1–2" (en dash)
  const rangeMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    const lower = parseFloat(rangeMatch[1]);
    const upper = parseFloat(rangeMatch[2]);
    return (lower + upper) / 2; // Midpoint
  }

  // Mixed numbers: "1 1/2", "2 3/4"
  const mixedMatch = str.match(/(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const numerator = parseInt(mixedMatch[2], 10);
    const denominator = parseInt(mixedMatch[3], 10);
    return whole + (numerator / denominator);
  }

  // Simple fractions: "1/2", "3/4"
  const fractionMatch = str.match(/(\d+)\s*\/\s*(\d+)/);
  if (fractionMatch) {
    const numerator = parseInt(fractionMatch[1], 10);
    const denominator = parseInt(fractionMatch[2], 10);
    return numerator / denominator;
  }

  // Decimal or integer
  const num = parseFloat(str);
  if (!isNaN(num) && num > 0) {
    return num;
  }

  // Couldn't parse
  return null;
}

/**
 * Normalize ingredient name (lowercase, trim whitespace)
 */
export function normalizeIngredientName(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Full ingredient normalization
 *
 * Applies all normalization rules to an ingredient object
 */
export interface RawIngredient {
  name: string;
  amount?: string | number | null;
  unit?: string | null;
  preparation?: string;
}

export interface NormalizedIngredient {
  name: string;
  normalized_name: string;
  amount: number | null;
  unit: string | null;
  preparation?: string;
}

export function normalizeIngredient(raw: RawIngredient): NormalizedIngredient {
  return {
    name: raw.name,
    normalized_name: normalizeIngredientName(raw.name),
    amount: normalizeAmount(raw.amount),
    unit: normalizeUnit(raw.unit),
    preparation: raw.preparation,
  };
}
