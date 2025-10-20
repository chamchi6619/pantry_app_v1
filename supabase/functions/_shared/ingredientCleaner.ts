/**
 * Ingredient Name Cleaner - ENHANCED
 *
 * Cleans ingredient names by stripping:
 * - Quantities and units ("1 tablespoon", "1/2 cup")
 * - Size modifiers ("large", "small", "medium")
 * - Preparation words ("chopped", "minced", "diced", "thinly sliced", "halved", "peeled")
 * - Purpose phrases ("for serving", "for garnish", "for drizzling", "divided")
 * - Trailing prep notes (", finely chopped", ", beaten")
 * - Form suffixes ("clove", "head", "bunch")
 * - Parenthetical notes ("(such as...)")
 * - Equipment references (filtered out entirely)
 *
 * Example:
 *   Input: "1 tablespoon olive oil"
 *   Output: "olive oil"
 *
 *   Input: "1 large egg, beaten"
 *   Output: "egg"
 *
 *   Input: "2 cups all purpose flour"
 *   Output: "all-purpose flour"
 *
 *   Input: "butter, divided"
 *   Output: "butter"
 *
 *   Input: "onions, thinly sliced"
 *   Output: "onion"
 */

// Equipment and non-food items to filter out completely
const EQUIPMENT_ITEMS = new Set([
  'parchment paper',
  'wax paper',
  'plastic wrap',
  'aluminum foil',
  'foil',
  'offset spatula',
  'spatula',
  'whisk',
  'bowl',
  'pan',
  'baking sheet',
  'baking pan',
  'loaf pan',
  'sheet pan',
  'ice cream maker',
  'blender',
  'food processor',
  'mixer',
  'slicer',
  'adjustable-blade slicer',
  'clean jars',
  'jars',
]);

export function cleanIngredientName(name: string): string {
  let cleaned = name.toLowerCase().trim();

  // Check if this is equipment (not an ingredient)
  if (EQUIPMENT_ITEMS.has(cleaned)) {
    return ''; // Return empty string to signal "not an ingredient"
  }

  // Fix malformed patterns: "1/ingredient" → "1 ingredient" → "ingredient"
  // Matches: "1/white wine" → "1 white wine", "2/tomatoes" → "2 tomatoes"
  // This preserves the space so subsequent number stripping works correctly
  cleaned = cleaned.replace(/^(\d+)\/+(?=[a-zA-Z])/, '$1 ');

  // Strip leading numbers and fractions with units
  // Matches: "1 tablespoon", "1/2 cup", "1 1/2 teaspoons", "2 pounds", "1 clove"
  cleaned = cleaned.replace(
    /^\d+[\d\s\/\-]*\s+(tablespoons?|tbsp|tbs|teaspoons?|tsp|cups?|c|pounds?|lbs?|lb|ounces?|oz|grams?|g|kg|piece|pieces|cloves?|whole|cans?|jars?|packages?|pkg)\s+(of\s+)?/i,
    ''
  );

  // Strip leading bare numbers (when no unit)
  // Matches: "1", "2", "3", "1/2" at start
  cleaned = cleaned.replace(/^\d+[\d\s\/\-]*\s+/, '');

  // Strip units that appear without numbers
  // Matches: "cans tomato puree" → "tomato puree"
  cleaned = cleaned.replace(
    /^(tablespoons?|tbsp|teaspoons?|tsp|cups?|pounds?|lbs?|ounces?|oz|grams?|g|cans?|jars?|packages?|pkg|handfuls?|pinch|dash)\s+/i,
    ''
  );

  // Strip size/quality modifiers at start AND end
  cleaned = cleaned.replace(
    /^(small|large|medium|big|tiny|whole|fresh|frozen|dried|raw|cooked|new|old|ripe|unripe|young|baby)\s+/,
    ''
  );

  // Strip preparation words at START (pre-quantity descriptions)
  // Matches: "thinly sliced onions", "halved strawberries", "peeled garlic"
  cleaned = cleaned.replace(
    /^(thinly\s+sliced|finely\s+chopped|roughly\s+chopped|coarsely\s+chopped|finely\s+diced|chopped|minced|diced|grated|sliced|shredded|crushed|halved|quartered|peeled|seeded|deseeded|trimmed|cleaned|cut)\s+/i,
    ''
  );

  // Strip common ingredient form suffixes (clove, head, bunch, stalk)
  // "garlic clove" → "garlic", "lettuce head" → "lettuce"
  cleaned = cleaned.replace(/\s+(cloves?|heads?|bunches?|stalks?|sprigs?|ears?)(,|$)/i, '$2');

  // Strip purpose phrases at END
  // Matches: "for serving", "for garnish", "for drizzling", "for sprinkling", "for topping", "to serve", "to taste", "as needed"
  cleaned = cleaned.replace(
    /\s+(for\s+(serving|garnish|garnishing|drizzling|sprinkling|topping|frying)|to\s+(serve|taste)|as\s+needed|if\s+desired|optional)(,|\s|$)/gi,
    ''
  );

  // Strip "divided" modifier (Bon Appetit style: "butter, divided")
  cleaned = cleaned.replace(/,?\s*divided\s*$/i, '');

  // Strip trailing preparation notes after comma
  // Matches: ", finely chopped", ", diced", ", minced", ", beaten", ", thinly sliced", ", halved", ", peeled"
  cleaned = cleaned.replace(
    /,\s*(thinly\s+sliced|finely\s+chopped|roughly\s+chopped|chopped|minced|diced|grated|sliced|shredded|crushed|halved|quartered|peeled|seeded|beaten|whisked|melted|softened|at\s+room\s+temperature|room\s+temperature)/i,
    ''
  );

  // Strip trailing prep/purpose descriptors after comma (general catch-all)
  cleaned = cleaned.replace(/,\s*[a-z\s]+$/i, '');

  // Strip parenthetical notes
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*/g, ' ');

  // Normalize hyphenated compound words
  // "all purpose flour" → "all-purpose flour"
  // Only do this for known compounds
  const HYPHENATED_COMPOUNDS: Record<string, string> = {
    'all purpose flour': 'all-purpose flour',
    'all purpose': 'all-purpose',
    'self rising flour': 'self-rising flour',
    'self rising': 'self-rising',
    'store bought': 'store-bought',
    'home made': 'homemade',
    'semi sweet': 'semi-sweet',
  };

  for (const [variant, canonical] of Object.entries(HYPHENATED_COMPOUNDS)) {
    if (cleaned === variant) {
      cleaned = canonical;
      break;
    }
  }

  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  // Final trim
  return cleaned.trim();
}
