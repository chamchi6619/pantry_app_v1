// Simple, fast matching for recipes - prioritizes performance over perfect accuracy

export interface MatchResult {
  isAvailable: boolean;
  reason: 'exact' | 'substring' | 'token' | 'none';
  confidence: number; // 0-1 scale
}

// Match a single ingredient against inventory items
export function matchIngredientToInventory(
  ingredientNorm: string,
  inventoryNorms: string[]
): MatchResult {
  if (!ingredientNorm || inventoryNorms.length === 0) {
    return { isAvailable: false, reason: 'none', confidence: 0 };
  }

  // Exact match
  for (const invNorm of inventoryNorms) {
    if (!invNorm) continue;
    if (ingredientNorm === invNorm) {
      return { isAvailable: true, reason: 'exact', confidence: 1.0 };
    }
  }

  // Substring match (one contains the other)
  for (const invNorm of inventoryNorms) {
    if (!invNorm) continue;
    if (ingredientNorm.includes(invNorm) || invNorm.includes(ingredientNorm)) {
      // Higher confidence if the match is a larger portion of the string
      const confidence = Math.min(ingredientNorm.length, invNorm.length) /
                        Math.max(ingredientNorm.length, invNorm.length);
      return { isAvailable: true, reason: 'substring', confidence: Math.max(0.7, confidence) };
    }
  }

  // Token overlap (at least one meaningful shared word)
  const ingTokens = new Set(ingredientNorm.split(/\s+/).filter(t => t.length >= 3));
  if (ingTokens.size > 0) {
    for (const invNorm of inventoryNorms) {
      if (!invNorm) continue;
      const invTokens = invNorm.split(/\s+/).filter(t => t.length >= 3);
      const hasShared = invTokens.some(t => ingTokens.has(t));
      if (hasShared) {
        return { isAvailable: true, reason: 'token', confidence: 0.5 };
      }
    }
  }

  return { isAvailable: false, reason: 'none', confidence: 0 };
}

// Compute match percentage for a recipe (presence-based, not quantity)
export function computeRecipeMatchPercentage(
  ingredientNorms: string[],
  inventoryNorms: string[]
): number {
  if (ingredientNorms.length === 0) return 100;
  if (inventoryNorms.length === 0) return 0;

  let availableCount = 0;
  for (const ingNorm of ingredientNorms) {
    const match = matchIngredientToInventory(ingNorm, inventoryNorms);
    if (match.isAvailable) {
      availableCount++;
    }
  }

  return Math.round((availableCount / ingredientNorms.length) * 100);
}

// Group ingredients into available and missing
export function groupIngredientsByAvailability(
  ingredients: Array<{ id: string; normalized: string; original: string }>,
  inventoryNorms: string[]
): {
  available: typeof ingredients;
  missing: typeof ingredients;
} {
  const available: typeof ingredients = [];
  const missing: typeof ingredients = [];

  for (const ingredient of ingredients) {
    const match = matchIngredientToInventory(ingredient.normalized, inventoryNorms);
    if (match.isAvailable) {
      available.push(ingredient);
    } else {
      missing.push(ingredient);
    }
  }

  return { available, missing };
}

// Simple memo cache for recipe matches
const matchCache = new Map<string, number>();
let cacheVersion = 0;

export function invalidateMatchCache(): void {
  cacheVersion++;
  if (matchCache.size > 500) {
    matchCache.clear();
  }
}

export function getCachedRecipeMatch(
  recipeId: string,
  ingredientNorms: string[],
  inventoryNorms: string[],
  invVersion: number
): number {
  const cacheKey = `${recipeId}_v${invVersion}_${cacheVersion}`;

  if (matchCache.has(cacheKey)) {
    return matchCache.get(cacheKey)!;
  }

  const percentage = computeRecipeMatchPercentage(ingredientNorms, inventoryNorms);
  matchCache.set(cacheKey, percentage);

  return percentage;
}