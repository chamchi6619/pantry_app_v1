import { ingredientMatcher } from './ingredientMatcher';
import canonicalIngredients from '../data/canonicalIngredients.json';

export interface DebugMatchResult {
  inventoryItem: string;
  recipeIngredient: string;
  normalizedInventory: string;
  normalizedRecipe: string;
  matchMethod: string;
  confidence: number;
  canonicalId: string | null;
  debugPath: string[];
}

export class DebugIngredientMatcher {
  private canonicalMap = new Map<string, any>();

  constructor() {
    // Build canonical map
    Object.entries(canonicalIngredients).forEach(([id, ingredient]) => {
      this.canonicalMap.set(id, ingredient);
    });
  }

  debugMatch(inventoryName: string, recipeIngredient: string): DebugMatchResult {
    const result: DebugMatchResult = {
      inventoryItem: inventoryName,
      recipeIngredient: recipeIngredient,
      normalizedInventory: '',
      normalizedRecipe: '',
      matchMethod: 'none',
      confidence: 0,
      canonicalId: null,
      debugPath: []
    };

    // Step 1: Normalize
    const normalizeString = (str: string) => {
      return str
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/s$/, ''); // Remove trailing 's'
    };

    result.normalizedInventory = normalizeString(inventoryName);
    result.normalizedRecipe = normalizeString(recipeIngredient);
    result.debugPath.push(`Normalized: "${result.normalizedInventory}" vs "${result.normalizedRecipe}"`);

    // Step 2: Direct match
    if (result.normalizedInventory === result.normalizedRecipe) {
      result.matchMethod = 'direct';
      result.confidence = 1.0;
      result.debugPath.push('✓ Direct match!');
      return result;
    }

    // Step 3: Contains match
    if (result.normalizedInventory.includes(result.normalizedRecipe) ||
        result.normalizedRecipe.includes(result.normalizedInventory)) {
      result.matchMethod = 'contains';
      result.confidence = 0.9;
      result.debugPath.push('✓ Contains match!');
      return result;
    }

    // Step 4: Check canonical ingredients
    for (const [canonicalId, canonical] of this.canonicalMap.entries()) {
      const displayName = canonical.displayName.toLowerCase();
      const aliases = canonical.aliases || [];

      // Check display name
      if (result.normalizedInventory === displayName ||
          result.normalizedRecipe === displayName) {
        result.matchMethod = 'canonical_display';
        result.confidence = 0.95;
        result.canonicalId = canonicalId;
        result.debugPath.push(`✓ Canonical match: ${displayName}`);
        return result;
      }

      // Check aliases
      for (const alias of aliases) {
        const normalizedAlias = normalizeString(alias);
        if (result.normalizedInventory === normalizedAlias ||
            result.normalizedRecipe === normalizedAlias) {
          result.matchMethod = 'canonical_alias';
          result.confidence = 0.93;
          result.canonicalId = canonicalId;
          result.debugPath.push(`✓ Alias match: ${alias} → ${displayName}`);
          return result;
        }

        // Partial alias match
        if (result.normalizedInventory.includes(normalizedAlias) ||
            normalizedAlias.includes(result.normalizedInventory)) {
          result.matchMethod = 'canonical_partial';
          result.confidence = 0.85;
          result.canonicalId = canonicalId;
          result.debugPath.push(`✓ Partial alias match: ${alias}`);
          return result;
        }
      }
    }

    // Step 5: Word-level matching
    const invWords = result.normalizedInventory.split(' ');
    const recipeWords = result.normalizedRecipe.split(' ');
    const commonWords = invWords.filter(w => recipeWords.includes(w));

    if (commonWords.length > 0) {
      result.matchMethod = 'word_overlap';
      result.confidence = commonWords.length / Math.max(invWords.length, recipeWords.length);
      result.debugPath.push(`Word overlap: ${commonWords.join(', ')} (${Math.round(result.confidence * 100)}%)`);

      // Boost if key words match
      const keyWords = ['chicken', 'beef', 'milk', 'egg', 'flour', 'sugar', 'butter', 'oil'];
      if (commonWords.some(w => keyWords.includes(w))) {
        result.confidence = Math.min(result.confidence + 0.2, 1.0);
        result.debugPath.push('Key word boost applied');
      }
    }

    // Step 6: Fuzzy matching (Levenshtein)
    const levenshtein = (a: string, b: string): number => {
      const matrix = [];
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
    };

    const distance = levenshtein(result.normalizedInventory, result.normalizedRecipe);
    const maxLen = Math.max(result.normalizedInventory.length, result.normalizedRecipe.length);
    const fuzzyScore = 1 - (distance / maxLen);

    if (fuzzyScore > 0.7) {
      result.matchMethod = 'fuzzy';
      result.confidence = fuzzyScore;
      result.debugPath.push(`Fuzzy match: ${Math.round(fuzzyScore * 100)}% similar`);
    }

    if (result.confidence === 0) {
      result.debugPath.push('✗ No match found');
    }

    return result;
  }

  debugBatchMatch(inventory: string[], recipeIngredients: string[]): DebugMatchResult[][] {
    const results: DebugMatchResult[][] = [];

    for (const recipeIng of recipeIngredients) {
      const ingredientResults: DebugMatchResult[] = [];
      for (const invItem of inventory) {
        const match = this.debugMatch(invItem, recipeIng);
        ingredientResults.push(match);
      }
      // Sort by confidence
      ingredientResults.sort((a, b) => b.confidence - a.confidence);
      results.push(ingredientResults);
    }

    return results;
  }

  getMatchSummary(results: DebugMatchResult[][]): {
    matched: string[];
    missing: string[];
    lowConfidence: string[];
    summary: string;
  } {
    const matched: string[] = [];
    const missing: string[] = [];
    const lowConfidence: string[] = [];

    results.forEach((ingredientMatches, index) => {
      const bestMatch = ingredientMatches[0];
      if (bestMatch && bestMatch.confidence >= 0.85) {
        matched.push(`${bestMatch.recipeIngredient} ← ${bestMatch.inventoryItem} (${Math.round(bestMatch.confidence * 100)}%)`);
      } else if (bestMatch && bestMatch.confidence >= 0.5) {
        lowConfidence.push(`${bestMatch.recipeIngredient} ← ${bestMatch.inventoryItem} (${Math.round(bestMatch.confidence * 100)}%)`);
      } else {
        missing.push(bestMatch ? bestMatch.recipeIngredient : 'unknown');
      }
    });

    const summary = `
Matched (≥85%): ${matched.length}
Low Confidence (50-84%): ${lowConfidence.length}
Missing (<50%): ${missing.length}
    `.trim();

    return { matched, missing, lowConfidence, summary };
  }
}

export const debugMatcher = new DebugIngredientMatcher();