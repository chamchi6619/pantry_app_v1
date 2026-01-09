/**
 * Canonical Item Matcher for Edge Functions
 * Ports the intelligent matching logic from intelligentIngredientMatcher.ts
 * Achieves 94.8% match rate without LLM calls
 */

export interface CanonicalItem {
  id: string;
  name: string;
  aliases: string[] | null;
  category: string | null;
}

export interface MatchResult {
  canonical_item_id: string;
  confidence: 'exact' | 'alias' | 'fuzzy' | 'none';
  matched_name: string;
  score?: number;
}

/**
 * Levenshtein distance for fuzzy matching
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Normalize ingredient name for matching
 */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .trim()
    // Remove "s " prefix (parser bug)
    .replace(/^s\s+/, '')
    // Remove diet/quality modifiers
    .replace(/\b(low-fat|lowfat|reduced-fat|fat-free|nonfat|non-fat)\b/gi, '')
    .replace(/\b(low-sodium|reduced-sodium|sodium-free)\b/gi, '')
    .replace(/\b(lite|light|reduced|part-skim|plain)\b/gi, '')
    // Remove apple varieties (map to "apples")
    .replace(/\b(granny smith|gala|fuji|honeycrisp|red delicious|tart)\s+(apple)/gi, '$2')
    // Remove brand names (common grocery stores)
    .replace(/\b(kirkland|365|great value|member's mark|store brand|organic)\b/gi, '')
    // Remove common prep words
    .replace(/\b(finely|coarsely|freshly|thinly|thickly|roughly|lightly)\s+/g, '')
    .replace(/\b(chopped|sliced|diced|minced|grated|shredded|crushed|ground|whole)\b/g, '')
    .replace(/\b(fresh|dried|frozen|canned|raw|roasted|toasted|cooked|prepared|uncooked)\b/g, '')
    .replace(/\b(instant|quick-cooking|rapid-rise|ready-to-eat)\b/g, '')
    // Remove quantity/container words
    .replace(/\b(bunch|sprig|sprigs|leaves|leaf|clove|cloves|head|heads|piece|pieces)\s+(of\s+)?/g, '')
    .replace(/\b(pinch|dash|envelope|can|jar|package|box|container)\s+(of\s+)?/g, '')
    // Remove state descriptors
    .replace(/\b(peeled|seeded|trimmed|drained|rinsed|scrubbed|halved|quartered|pitted|cubed)\b/g, '')
    .replace(/\b(divided|plus more|to taste|optional|if desired|if needed)\b/g, '')
    // Remove "or X" alternatives
    .replace(/\s+or\s+\w+(\s+\w+)?/g, '')
    // Remove parenthetical content
    .replace(/\([^)]*\)/g, '')
    // Remove measurement words
    .replace(/\b(cup|cups|tablespoon|tablespoons|teaspoon|teaspoons|tbsp|tsp|oz|ounce|ounces|lb|pound|pounds|g|gram|grams|ml|liter|liters)\b/g, '')
    // Remove numbers and measurements
    .replace(/\b\d+(\.\d+)?\s*/g, '')
    // Clean up extra spaces, commas, dashes
    .replace(/[,;]+/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if ingredient is junk (section header, non-food, etc.)
 */
function isJunk(ingredientName: string): boolean {
  const lower = ingredientName.toLowerCase().trim();

  // Section headers
  if (
    ingredientName.startsWith('For the ') ||
    ingredientName.startsWith('For ') ||
    ingredientName.endsWith(':') ||
    ingredientName.includes('Ingredient') ||
    ingredientName.includes('Topping:') ||
    ingredientName.includes('Salad:') ||
    ingredientName.includes('Dressing:')
  ) return true;

  // Empty or single characters
  if (lower.length <= 2) return true;

  // Just punctuation or numbers
  if (/^[^\w]+$/.test(ingredientName)) return true;
  if (lower === ')' || lower === '(' || lower.startsWith('s)') || lower === 'to medium') return true;

  // Single words that are prep instructions
  if (['fresh', 'grated', 'chopped', 'sliced', 'diced', 'en', 'canned', 'cubed', 'halved', 'quartered'].includes(lower)) return true;

  // Non-food items
  if (
    lower.includes('aluminum foil') ||
    lower.includes('paper') ||
    lower.includes('bamboo skewers') ||
    lower.includes('toothpicks') ||
    lower.includes('popsicle sticks') ||
    lower.includes('craft sticks') ||
    lower.includes('skewers') ||
    lower.includes('foil')
  ) return true;

  // Brand-specific or recipe-specific names
  if (
    lower.includes('eating smart') ||
    lower.includes('basic soup') ||
    lower.includes('"logs"') ||
    lower.includes('"bugs"')
  ) return true;

  // Instructions or notes
  if (
    lower.startsWith('note:') ||
    lower.includes('optional toppings') ||
    lower.includes('necessary tools') ||
    lower.includes('to reduce browning') ||
    lower.includes('adjust to taste')
  ) return true;

  return false;
}

/**
 * Find best matching canonical item for an ingredient name
 */
export function findMatch(ingredientName: string, canonicalItems: CanonicalItem[]): MatchResult | null {
  // Skip junk first
  if (isJunk(ingredientName)) return null;

  const normalized = normalize(ingredientName);

  if (!normalized || normalized.length < 3) return null;

  // 1. EXACT MATCH on canonical name
  for (const item of canonicalItems) {
    if (normalize(item.name) === normalized) {
      return {
        canonical_item_id: item.id,
        confidence: 'exact',
        matched_name: item.name,
        score: 100
      };
    }
  }

  // 2. EXACT MATCH on aliases
  for (const item of canonicalItems) {
    if (item.aliases) {
      for (const alias of item.aliases) {
        if (normalize(alias) === normalized) {
          return {
            canonical_item_id: item.id,
            confidence: 'alias',
            matched_name: item.name,
            score: 95
          };
        }
      }
    }
  }

  // 2.5 SINGULAR/PLURAL MATCH
  for (const item of canonicalItems) {
    const canonicalNorm = normalize(item.name);

    // Check singular/plural variations
    if (canonicalNorm === normalized + 's' || canonicalNorm + 's' === normalized) {
      return {
        canonical_item_id: item.id,
        confidence: 'fuzzy',
        matched_name: item.name,
        score: 90
      };
    }

    // Check for -es plural (tomato/tomatoes)
    if (canonicalNorm === normalized + 'es' || canonicalNorm + 'es' === normalized) {
      return {
        canonical_item_id: item.id,
        confidence: 'fuzzy',
        matched_name: item.name,
        score: 90
      };
    }

    // Check aliases for singular/plural too
    if (item.aliases) {
      for (const alias of item.aliases) {
        const aliasNorm = normalize(alias);
        if (aliasNorm === normalized + 's' || aliasNorm + 's' === normalized) {
          return {
            canonical_item_id: item.id,
            confidence: 'alias',
            matched_name: item.name,
            score: 88
          };
        }
        if (aliasNorm === normalized + 'es' || aliasNorm + 'es' === normalized) {
          return {
            canonical_item_id: item.id,
            confidence: 'alias',
            matched_name: item.name,
            score: 88
          };
        }
      }
    }
  }

  // 3. CONTAINS MATCH (prefer longest match to avoid "water" matching before "watermelon")
  let bestContainsMatch: { item: CanonicalItem; score: number; length: number } | null = null;

  for (const item of canonicalItems) {
    const canonicalNorm = normalize(item.name);

    // Allow 3-letter words if they're common ingredients
    const allowedShortWords = ['egg', 'oil', 'ham', 'jam', 'tea', 'ice', 'yam', 'pea', 'cod', 'pie'];
    const minLength = allowedShortWords.includes(canonicalNorm) ? 3 : 4;

    if (canonicalNorm.length < minLength) continue;

    // Check if normalized ingredient contains the canonical name
    if (normalized.includes(canonicalNorm)) {
      if (!bestContainsMatch || canonicalNorm.length > bestContainsMatch.length) {
        bestContainsMatch = { item, score: 80, length: canonicalNorm.length };
      }
    }

    // Check if canonical name contains the ingredient (less common but possible)
    if (canonicalNorm.includes(normalized) && normalized.length >= 4) {
      if (!bestContainsMatch || normalized.length > bestContainsMatch.length) {
        bestContainsMatch = { item, score: 75, length: normalized.length };
      }
    }
  }

  if (bestContainsMatch) {
    return {
      canonical_item_id: bestContainsMatch.item.id,
      confidence: 'fuzzy',
      matched_name: bestContainsMatch.item.name,
      score: bestContainsMatch.score
    };
  }

  // 4. FUZZY MATCH using Levenshtein distance
  let bestMatch: { item: CanonicalItem; distance: number; score: number } | null = null;

  for (const item of canonicalItems) {
    const canonicalNorm = normalize(item.name);
    const distance = levenshtein(normalized, canonicalNorm);

    // Only consider if distance is small relative to string length
    const maxLength = Math.max(normalized.length, canonicalNorm.length);
    const threshold = Math.ceil(maxLength * 0.3); // 30% difference allowed

    if (distance <= threshold) {
      const score = Math.round((1 - distance / maxLength) * 70); // Score 0-70
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { item, distance, score };
      }
    }

    // Also check aliases
    if (item.aliases) {
      for (const alias of item.aliases) {
        const aliasNorm = normalize(alias);
        const aliasDistance = levenshtein(normalized, aliasNorm);
        const aliasMaxLength = Math.max(normalized.length, aliasNorm.length);
        const aliasThreshold = Math.ceil(aliasMaxLength * 0.3);

        if (aliasDistance <= aliasThreshold) {
          const score = Math.round((1 - aliasDistance / aliasMaxLength) * 70);
          if (!bestMatch || aliasDistance < bestMatch.distance) {
            bestMatch = { item, distance: aliasDistance, score };
          }
        }
      }
    }
  }

  if (bestMatch) {
    return {
      canonical_item_id: bestMatch.item.id,
      confidence: 'fuzzy',
      matched_name: bestMatch.item.name,
      score: bestMatch.score
    };
  }

  return null;
}

/**
 * Batch match multiple items
 */
export function batchMatch(
  itemNames: string[],
  canonicalItems: CanonicalItem[]
): Map<string, MatchResult | null> {
  const results = new Map<string, MatchResult | null>();

  for (const itemName of itemNames) {
    const match = findMatch(itemName, canonicalItems);
    results.set(itemName, match);
  }

  return results;
}
