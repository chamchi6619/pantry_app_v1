import { Recipe, RecipeScore, InventoryItem, RecipeIngredient, RecipeConfig } from '../types';
import { ingredientMatcher } from './ingredientMatcher';
import { ingredientParser } from './ingredientParser';
import { unitConverter } from './unitConverter';
import * as crypto from 'crypto';
import recipeConfigJson from '../config/recipeConfig.json';

export class RecipeScorer {
  private config: RecipeConfig;

  constructor(config?: RecipeConfig) {
    this.config = config || this.getDefaultConfig();
  }

  private getDefaultConfig(): RecipeConfig {
    // Load from config file instead of hardcoded values
    return {
      matching: {
        minConfidence: recipeConfigJson.matching.minConfidence || 0.60,
        aliasPenalty: recipeConfigJson.matching.aliasPenalty || 0.05,
        categoryBonus: recipeConfigJson.matching.categoryBonus || 0.1
      },
      scoring: {
        expiringWeight: recipeConfigJson.scoring.expiringWeight || 2.0,
        categoryWeights: recipeConfigJson.scoring.categoryWeights || {
          'quick': 1.2,
          'healthy': 1.1,
          'comfort': 1.0,
          'dessert': 0.8,
          'breakfast': 1.0,
          'lunch': 1.0,
          'dinner': 1.0
        }
      },
      cache: {
        ttlMinutes: recipeConfigJson.cache.ttlMinutes || 5,
        maxEntries: recipeConfigJson.cache.maxEntries || 100
      }
    };
  }

  scoreRecipe(recipe: Recipe, inventory: InventoryItem[]): RecipeScore {

    // Calculate inventory hash for caching
    const inventoryHash = this.hashInventory(inventory);

    // Match all ingredients
    const matchResults = this.matchAllIngredients(recipe, inventory);

    // Calculate expiring bonus
    const expiringBonus = this.calculateExpiringBonus(matchResults.matched, inventory);

    // Apply category weight
    const categoryWeight = this.config.scoring.categoryWeights[recipe.category] || 1.0;

    // Calculate base score (match percentage)
    const baseScore = matchResults.matchPercentage;

    // Calculate expiring score (weighted more heavily)
    const expiringScore = expiringBonus * this.config.scoring.expiringWeight;

    // Calculate total score
    const totalScore = (baseScore + expiringScore) * categoryWeight;

    return {
      recipe,
      totalScore: Math.min(100, totalScore), // Cap at 100
      expiringScore: expiringBonus,
      matchPercentage: matchResults.matchPercentage,
      availableIngredients: matchResults.matched.map(m => m.ingredient.recipeText),
      missingIngredients: matchResults.missing,
      expiringIngredients: matchResults.expiring,
      scoreBreakdown: {
        baseMatch: baseScore,
        expiringBonus: expiringBonus,
        categoryBonus: categoryWeight
      },
      debugInfo: {
        inventoryHash,
        matchedCount: matchResults.matchedCount,
        totalRequired: recipe.ingredients.length,
        expiringPoints: expiringBonus,
        categoryWeights: this.config.scoring.categoryWeights
      }
    };
  }

  private matchAllIngredients(
    recipe: Recipe,
    inventory: InventoryItem[]
  ): {
    matchPercentage: number;
    matchedCount: number;
    missing: string[];
    expiring: InventoryItem[];
    matched: Array<{ ingredient: RecipeIngredient; item: InventoryItem }>;
  } {
    const matched: Array<{ ingredient: RecipeIngredient; item: InventoryItem }> = [];
    const missing: string[] = [];
    const expiring: InventoryItem[] = [];
    const expiringSet = new Set<string>();

    for (const recipeIngredient of recipe.ingredients) {
      let foundMatch = false;

      // Parse the recipe ingredient if needed
      const parsed = recipeIngredient.parsed || ingredientParser.parse(recipeIngredient.recipeText);

      for (const inventoryItem of inventory) {
        // Try to match the ingredient
        const matchResult = ingredientMatcher.match(
          inventoryItem.name,
          parsed.ingredient
        );

        if (matchResult.confidence >= this.config.matching.minConfidence) {
          // Check if we have enough quantity
          if (this.hasEnoughQuantity(recipeIngredient, inventoryItem)) {
            matched.push({ ingredient: recipeIngredient, item: inventoryItem });
            foundMatch = true;

            // Check if this item is expiring
            if (this.isExpiring(inventoryItem)) {
              if (!expiringSet.has(inventoryItem.id)) {
                expiring.push(inventoryItem);
                expiringSet.add(inventoryItem.id);
              }
            }
            break;
          }
        }
      }

      if (!foundMatch) {
        missing.push(recipeIngredient.recipeText);
      }
    }

    const matchPercentage = (matched.length / recipe.ingredients.length) * 100;

    return {
      matchPercentage,
      matchedCount: matched.length,
      missing,
      expiring,
      matched
    };
  }

  private hasEnoughQuantity(
    recipeIngredient: RecipeIngredient,
    inventoryItem: InventoryItem
  ): boolean {
    // If no quantity required, assume we have enough
    if (!recipeIngredient.requiredQuantity) {
      return true;
    }

    // If inventory has no quantity, assume it's not enough
    if (!inventoryItem.quantity) {
      return false;
    }

    // Try to convert units if they're different
    if (recipeIngredient.requiredUnit !== inventoryItem.unit) {
      // Get canonical ingredient for conversion
      const canonicalId = inventoryItem.canonicalId ||
                         ingredientMatcher.match(inventoryItem.name, inventoryItem.name).canonicalId;

      if (!canonicalId) {
        // Can't convert without knowing the ingredient
        return inventoryItem.quantity >= recipeIngredient.requiredQuantity;
      }

      const canonical = ingredientMatcher.getCanonicalIngredient(canonicalId);
      if (!canonical) {
        return inventoryItem.quantity >= recipeIngredient.requiredQuantity;
      }

      const conversionResult = unitConverter.convert(
        inventoryItem.quantity,
        inventoryItem.unit,
        recipeIngredient.requiredUnit,
        canonical
      );

      if (conversionResult.success && conversionResult.value) {
        return conversionResult.value >= recipeIngredient.requiredQuantity;
      }
    }

    // Same units, direct comparison
    return inventoryItem.quantity >= recipeIngredient.requiredQuantity;
  }

  private calculateExpiringBonus(
    matched: Array<{ ingredient: RecipeIngredient; item: InventoryItem }>,
    inventory: InventoryItem[]
  ): number {
    let totalBonus = 0;

    for (const match of matched) {
      const expirationScore = this.getExpirationScore(match.item);
      totalBonus += expirationScore;
    }

    return totalBonus;
  }

  private isExpiring(item: InventoryItem): boolean {
    if (!item.expirationDate) {
      return false;
    }

    const daysUntilExpiry = this.getDaysUntilExpiry(item.expirationDate);
    return daysUntilExpiry <= 7;
  }

  private getExpirationScore(item: InventoryItem): number {
    if (!item.expirationDate) {
      return 0;
    }

    const daysUntilExpiry = this.getDaysUntilExpiry(item.expirationDate);

    // Expiration tiers
    if (daysUntilExpiry <= 1) return 10;  // Critical
    if (daysUntilExpiry <= 3) return 5;   // Urgent
    if (daysUntilExpiry <= 7) return 2;   // Soon
    return 0;  // Later
  }

  private getDaysUntilExpiry(expirationDate: Date): number {
    const now = new Date();
    const expiry = new Date(expirationDate);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  hashInventory(items: InventoryItem[]): string {
    // Sort by ID for consistency
    const sorted = items
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(item => `${item.id}:${item.quantity}:${item.unit}`)
      .join('|');

    // Simple hash function for React Native (no crypto module)
    return this.simpleHash(sorted);
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).substring(0, 8);
  }

  // Score multiple recipes and return sorted results
  scoreRecipes(recipes: Recipe[], inventory: InventoryItem[]): RecipeScore[] {
    const scores = recipes.map(recipe => this.scoreRecipe(recipe, inventory));

    // Sort by total score (descending)
    return scores.sort((a, b) => b.totalScore - a.totalScore);
  }

  // Get recipes that use expiring ingredients
  getExpiringRecipes(recipes: Recipe[], inventory: InventoryItem[]): RecipeScore[] {
    const scores = this.scoreRecipes(recipes, inventory);

    // Filter to only recipes with expiring ingredients
    return scores.filter(score => score.expiringScore > 0);
  }

  // Get recipes by match percentage threshold
  getMatchingRecipes(
    recipes: Recipe[],
    inventory: InventoryItem[],
    minMatchPercentage: number = 50
  ): RecipeScore[] {
    const scores = this.scoreRecipes(recipes, inventory);

    // Filter by match percentage
    return scores.filter(score => score.matchPercentage >= minMatchPercentage);
  }

  // Update configuration
  updateConfig(config: Partial<RecipeConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      matching: {
        ...this.config.matching,
        ...(config.matching || {})
      },
      scoring: {
        ...this.config.scoring,
        ...(config.scoring || {}),
        categoryWeights: {
          ...this.config.scoring.categoryWeights,
          ...(config.scoring?.categoryWeights || {})
        }
      },
      cache: {
        ...this.config.cache,
        ...(config.cache || {})
      }
    };
  }
}

export const recipeScorer = new RecipeScorer();