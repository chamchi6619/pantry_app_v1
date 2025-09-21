import { MatchResult, MatchReason, CanonicalIngredient } from '../types';
import canonicalIngredientsData from '../data/canonicalIngredients.json';

export class IngredientMatcher {
  private canonicalIngredients: Record<string, CanonicalIngredient>;
  private aliasToCanonical: Record<string, string>;
  private categoryIndex: Record<string, string[]>;

  constructor() {
    this.canonicalIngredients = canonicalIngredientsData as Record<string, CanonicalIngredient>;
    this.aliasToCanonical = {};
    this.categoryIndex = {};

    // Build alias index and category index
    this.buildIndices();
  }

  private buildIndices(): void {
    for (const [id, ingredient] of Object.entries(this.canonicalIngredients)) {
      // Build alias index
      for (const alias of ingredient.aliases) {
        this.aliasToCanonical[this.normalize(alias)] = id;
      }

      // Build category index
      if (!this.categoryIndex[ingredient.category]) {
        this.categoryIndex[ingredient.category] = [];
      }
      this.categoryIndex[ingredient.category].push(id);
    }
  }

  match(inventoryItem: string, recipeIngredient: string): MatchResult {
    const debugPath: string[] = [];

    // Step 1: Normalize both strings
    const normInv = this.normalize(inventoryItem);
    const normRecipe = this.normalize(recipeIngredient);

    debugPath.push(`normalized: "${normInv}" vs "${normRecipe}"`);

    // Step 2: Check exact canonical match
    if (this.isCanonical(normInv) && normInv === normRecipe) {
      debugPath.push(`exact canonical match: ${normInv}`);
      return {
        canonicalId: normInv,
        confidence: 1.0,
        matchReason: MatchReason.EXACT,
        debugPath
      };
    }

    // Also check if they're both canonical and match
    const invCanonical = this.findCanonicalId(normInv);
    const recipeCanonical = this.findCanonicalId(normRecipe);

    if (invCanonical && recipeCanonical && invCanonical === recipeCanonical) {
      debugPath.push(`both resolve to canonical: ${invCanonical}`);
      return {
        canonicalId: invCanonical,
        confidence: 1.0,
        matchReason: MatchReason.EXACT,
        debugPath
      };
    }

    // Step 3: Check alias matches
    const aliasMatch = this.checkAliases(normInv, normRecipe);
    if (aliasMatch) {
      debugPath.push(`alias match: "${normInv}" → ${aliasMatch}`);
      return {
        canonicalId: aliasMatch,
        confidence: 0.95,
        matchReason: MatchReason.ALIAS,
        debugPath
      };
    }

    // Step 4: Check for partial word matches
    const partialMatch = this.checkPartialMatch(normInv, normRecipe);
    if (partialMatch && partialMatch.confidence >= 0.6) {
      debugPath.push(`partial match: ${partialMatch.confidence.toFixed(2)}`);
      return {
        canonicalId: partialMatch.canonicalId,
        confidence: partialMatch.confidence,
        matchReason: MatchReason.FUZZY,
        debugPath
      };
    }

    // Step 5: Category-based fuzzy match (Levenshtein ≥ 0.60)
    const categoryMatch = this.checkCategoryMatch(normInv, normRecipe);
    if (categoryMatch && categoryMatch.confidence >= 0.60) {
      debugPath.push(`category match: ${categoryMatch.category}, L=${categoryMatch.score.toFixed(2)}`);
      return {
        canonicalId: categoryMatch.id,
        confidence: categoryMatch.confidence,
        matchReason: MatchReason.CATEGORY,
        debugPath
      };
    }

    // Step 6: Cross-category fuzzy match (Levenshtein ≥ 0.60)
    const fuzzyMatch = this.fuzzyMatch(normInv, normRecipe);
    if (fuzzyMatch && fuzzyMatch.score >= 0.60) {
      debugPath.push(`fuzzy match: L=${fuzzyMatch.score.toFixed(2)}`);
      return {
        canonicalId: fuzzyMatch.id,
        confidence: fuzzyMatch.score,
        matchReason: MatchReason.FUZZY,
        debugPath
      };
    }

    // No match found
    debugPath.push('no match found');
    return {
      canonicalId: null,
      confidence: 0,
      matchReason: MatchReason.NO_MATCH,
      debugPath
    };
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .trim()
      // Remove common words
      .replace(/\b(fresh|frozen|dried|canned|organic|large|small|medium)\b/g, '')
      // Remove brand names (simple heuristic)
      .replace(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g, '')
      // Remove punctuation
      .replace(/[^\w\s]/g, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isCanonical(id: string): boolean {
    return id in this.canonicalIngredients;
  }

  private findCanonicalId(text: string): string | null {
    // Check if it's already canonical
    if (this.isCanonical(text)) {
      return text;
    }

    // Check display names
    for (const [id, ingredient] of Object.entries(this.canonicalIngredients)) {
      if (this.normalize(ingredient.displayName) === text) {
        return id;
      }
    }

    return null;
  }

  private checkAliases(normInv: string, normRecipe: string): string | null {
    // Check if inventory item has an alias match
    const invAlias = this.aliasToCanonical[normInv];
    const recipeAlias = this.aliasToCanonical[normRecipe];

    // If both map to same canonical, it's a match
    if (invAlias && recipeAlias && invAlias === recipeAlias) {
      return invAlias;
    }

    // Check if one is canonical and the other is its alias
    if (invAlias && this.normalize(this.canonicalIngredients[invAlias].displayName) === normRecipe) {
      return invAlias;
    }

    if (recipeAlias && this.normalize(this.canonicalIngredients[recipeAlias].displayName) === normInv) {
      return recipeAlias;
    }

    // Check if inventory matches any alias of recipe's canonical
    if (recipeAlias) {
      const recipeCanonical = this.canonicalIngredients[recipeAlias];
      for (const alias of recipeCanonical.aliases) {
        if (this.normalize(alias) === normInv) {
          return recipeAlias;
        }
      }
    }

    // Check if recipe matches any alias of inventory's canonical
    if (invAlias) {
      const invCanonical = this.canonicalIngredients[invAlias];
      for (const alias of invCanonical.aliases) {
        if (this.normalize(alias) === normRecipe) {
          return invAlias;
        }
      }
    }

    return null;
  }

  private checkCategoryMatch(
    normInv: string,
    normRecipe: string
  ): { id: string; confidence: number; score: number; category: string } | null {
    // Find categories for both items
    const invCategory = this.findCategory(normInv);
    const recipeCategory = this.findCategory(normRecipe);

    if (!invCategory || !recipeCategory || invCategory !== recipeCategory) {
      return null;
    }

    // Search within the same category
    const categoryIngredients = this.categoryIndex[invCategory];
    let bestMatch: { id: string; score: number } | null = null;

    for (const id of categoryIngredients) {
      const ingredient = this.canonicalIngredients[id];

      // Check against display name
      const displayScore = this.levenshteinSimilarity(
        normInv,
        this.normalize(ingredient.displayName)
      );

      if (displayScore >= 0.60) {
        if (!bestMatch || displayScore > bestMatch.score) {
          bestMatch = { id, score: displayScore };
        }
      }

      // Check against aliases
      for (const alias of ingredient.aliases) {
        const aliasScore = this.levenshteinSimilarity(normInv, this.normalize(alias));
        if (aliasScore >= 0.60) {
          if (!bestMatch || aliasScore > bestMatch.score) {
            bestMatch = { id, score: aliasScore };
          }
        }
      }
    }

    if (bestMatch) {
      return {
        id: bestMatch.id,
        confidence: bestMatch.score,
        score: bestMatch.score,
        category: invCategory
      };
    }

    return null;
  }

  private fuzzyMatch(
    normInv: string,
    normRecipe: string
  ): { id: string; score: number } | null {
    let bestMatch: { id: string; score: number } | null = null;

    for (const [id, ingredient] of Object.entries(this.canonicalIngredients)) {
      // Check against display name
      const displayScore = this.levenshteinSimilarity(
        normInv,
        this.normalize(ingredient.displayName)
      );

      if (displayScore >= 0.60) {
        if (!bestMatch || displayScore > bestMatch.score) {
          bestMatch = { id, score: displayScore };
        }
      }

      // Check against aliases
      for (const alias of ingredient.aliases) {
        const aliasScore = this.levenshteinSimilarity(normInv, this.normalize(alias));
        if (aliasScore >= 0.60) {
          if (!bestMatch || aliasScore > bestMatch.score) {
            bestMatch = { id, score: aliasScore };
          }
        }
      }
    }

    return bestMatch;
  }

  private findCategory(text: string): string | null {
    // First check if it's a canonical ingredient
    const canonicalId = this.findCanonicalId(text);
    if (canonicalId) {
      return this.canonicalIngredients[canonicalId].category;
    }

    // Check aliases
    const aliasId = this.aliasToCanonical[text];
    if (aliasId) {
      return this.canonicalIngredients[aliasId].category;
    }

    // Try to find best matching category through fuzzy search
    let bestMatch: { category: string; score: number } | null = null;

    for (const [id, ingredient] of Object.entries(this.canonicalIngredients)) {
      const score = this.levenshteinSimilarity(text, this.normalize(ingredient.displayName));
      if (score >= 0.7) {
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { category: ingredient.category, score };
        }
      }
    }

    return bestMatch?.category || null;
  }

  private levenshteinSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0.0;

    const matrix: number[][] = [];

    // Initialize first column and row
    for (let i = 0; i <= s1.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= s2.length; j++) {
      matrix[0][j] = j;
    }

    // Calculate Levenshtein distance
    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // deletion
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    const distance = matrix[s1.length][s2.length];
    const maxLength = Math.max(s1.length, s2.length);

    return 1 - (distance / maxLength);
  }

  // Helper method to get canonical ingredient by ID
  getCanonicalIngredient(id: string): CanonicalIngredient | null {
    return this.canonicalIngredients[id] || null;
  }

  // Helper method to get all canonical ingredients
  getAllCanonicalIngredients(): CanonicalIngredient[] {
    return Object.values(this.canonicalIngredients);
  }

  // Helper method to search ingredients by category
  getIngredientsByCategory(category: string): CanonicalIngredient[] {
    const ids = this.categoryIndex[category] || [];
    return ids.map(id => this.canonicalIngredients[id]);
  }

  private checkPartialMatch(normInv: string, normRecipe: string): { canonicalId: string | null; confidence: number } | null {
    // Check if one contains the other
    if (normInv.includes(normRecipe) || normRecipe.includes(normInv)) {
      // Try to find the canonical ingredient
      const invCanonical = this.findCanonicalId(normInv);
      const recipeCanonical = this.findCanonicalId(normRecipe);

      return {
        canonicalId: invCanonical || recipeCanonical,
        confidence: 0.75
      };
    }

    // Check word overlap
    const invWords = normInv.split(' ');
    const recipeWords = normRecipe.split(' ');
    const commonWords = invWords.filter(w => recipeWords.includes(w) && w.length > 2);

    if (commonWords.length > 0) {
      const confidence = commonWords.length / Math.max(invWords.length, recipeWords.length);
      if (confidence >= 0.5) {
        const invCanonical = this.findCanonicalId(normInv);
        const recipeCanonical = this.findCanonicalId(normRecipe);

        return {
          canonicalId: invCanonical || recipeCanonical,
          confidence: confidence + 0.2 // Boost for word matches
        };
      }
    }

    return null;
  }
}

export const ingredientMatcher = new IngredientMatcher();