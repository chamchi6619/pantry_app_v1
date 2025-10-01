import { Recipe, RecipeIngredient, InventoryItem as RecipeInventoryItem } from '../types';
import { ShoppingItem } from '../../../stores/shoppingListStore';
import { InventoryItem } from '../../../stores/inventoryStore';
import { ingredientMatcher } from './ingredientMatcher';
import { ingredientParser } from './ingredientParser';
import { unitConverter } from './unitConverter';
import { recipeScorer } from './recipeScorer';

export interface ShoppingListMergeResult {
  itemsToAdd: Omit<ShoppingItem, 'id' | 'checked' | 'addedAt'>[];
  itemsToUpdate: Array<{ id: string; updates: Partial<ShoppingItem> }>;
  totalItems: number;
  mergedItems: number;
  newItems: number;
}

export class ShoppingListMerger {
  /**
   * Calculate what ingredients are needed for a recipe based on current inventory
   */
  calculateNeededIngredients(
    recipe: Recipe,
    inventory: InventoryItem[]
  ): Array<{
    ingredient: RecipeIngredient;
    neededQuantity: number;
    neededUnit: string;
    canonicalId: string | null;
    displayName: string;
    category: string;
  }> {
    console.log('=== CALCULATE NEEDED INGREDIENTS ===');
    console.log('Recipe:', recipe.name);
    console.log('Recipe ingredients:', recipe.ingredients);
    console.log('Inventory count:', inventory.length);

    const needed = [];

    for (const recipeIngredient of recipe.ingredients) {
      const parsed = recipeIngredient.parsed || ingredientParser.parse(recipeIngredient.recipeText);
      console.log(`\nChecking ingredient: ${recipeIngredient.recipeText}`);
      console.log('Parsed:', parsed);

      // Find matching inventory items
      let totalAvailable = 0;
      let canonicalId: string | null = null;
      let matchedInventoryItem: InventoryItem | null = null;

      for (const invItem of inventory) {
        const matchResult = ingredientMatcher.match(invItem.name, parsed.ingredient);
        console.log(`  Matching against ${invItem.name}: confidence ${matchResult.confidence}`);

        if (matchResult.confidence >= 0.85) {
          canonicalId = matchResult.canonicalId;
          matchedInventoryItem = invItem;

          // Try to convert inventory quantity to recipe unit
          if (recipeIngredient.requiredUnit && invItem.unit) {
            const canonical = canonicalId ?
              ingredientMatcher.getCanonicalIngredient(canonicalId) : null;

            if (canonical) {
              const conversion = unitConverter.convert(
                invItem.quantity,
                invItem.unit,
                recipeIngredient.requiredUnit,
                canonical
              );

              if (conversion.success && conversion.value) {
                totalAvailable += conversion.value;
              } else if (invItem.unit === recipeIngredient.requiredUnit) {
                totalAvailable += invItem.quantity;
              }
            } else if (invItem.unit === recipeIngredient.requiredUnit) {
              totalAvailable += invItem.quantity;
            }
          } else {
            totalAvailable += invItem.quantity;
          }
        }
      }

      // Calculate how much more we need
      // Use requiredQuantity, or fall back to parsed quantity, or default to 1
      const requiredQuantity = recipeIngredient.requiredQuantity || parsed.quantity || 1;
      const neededQuantity = Math.max(0, requiredQuantity - totalAvailable);

      console.log(`  Required: ${requiredQuantity}, Available: ${totalAvailable}, Needed: ${neededQuantity}`);

      if (neededQuantity > 0) {
        // Get display name from canonical ingredient or parsed
        const canonical = canonicalId ?
          ingredientMatcher.getCanonicalIngredient(canonicalId) : null;

        const displayName = canonical?.displayName ||
                          this.titleCase(parsed.ingredient);

        const category = canonical?.category || 'Other';

        console.log(`  NEEDS TO BUY: ${displayName} (${neededQuantity} ${recipeIngredient.requiredUnit || 'unit'})`);

        needed.push({
          ingredient: recipeIngredient,
          neededQuantity,
          neededUnit: recipeIngredient.requiredUnit || 'unit',
          canonicalId,
          displayName,
          category: this.mapCategoryToShoppingCategory(category)
        });
      } else {
        console.log(`  Already have enough of ${parsed.ingredient}`);
      }
    }

    return needed;
  }

  /**
   * Merge recipe ingredients into existing shopping list
   */
  mergeRecipeIngredients(
    recipe: Recipe,
    inventory: InventoryItem[],
    existingList: ShoppingItem[]
  ): ShoppingListMergeResult {
    const needed = this.calculateNeededIngredients(recipe, inventory);

    const itemsToAdd: Omit<ShoppingItem, 'id' | 'checked' | 'addedAt'>[] = [];
    const itemsToUpdate: Array<{ id: string; updates: Partial<ShoppingItem> }> = [];
    let mergedItems = 0;
    let newItems = 0;

    for (const item of needed) {
      // Try to find existing item with same canonical ID
      const existing = this.findExistingItem(item, existingList);

      if (existing) {
        // Intelligently merge quantities based on units
        const mergedQty = this.mergeQuantitiesIntelligently(
          existing.quantity || 1,
          existing.unit || 'item',
          item.neededQuantity,
          item.neededUnit
        );

        itemsToUpdate.push({
          id: existing.id,
          updates: {
            quantity: mergedQty.quantity,
            unit: mergedQty.unit,
            notes: this.mergeNotes(existing.notes, `For: ${recipe.name}`)
          }
        });
        mergedItems++;
      } else {
        // Add new item with proper quantity and unit
        const normalizedQty = this.normalizeQuantityForShopping(
          item.neededQuantity,
          item.neededUnit
        );

        itemsToAdd.push({
          name: item.displayName,
          quantity: normalizedQty.quantity,
          unit: normalizedQty.unit,
          category: item.category,
          notes: `For: ${recipe.name}`
        });
        newItems++;
      }
    }

    console.log('=== MERGE RESULT ===');
    console.log('Total needed:', needed.length);
    console.log('Items to add:', itemsToAdd.length, itemsToAdd);
    console.log('Items to update:', itemsToUpdate.length);
    console.log('New items:', newItems);
    console.log('Merged items:', mergedItems);

    return {
      itemsToAdd,
      itemsToUpdate,
      totalItems: needed.length,
      mergedItems,
      newItems
    };
  }

  /**
   * Find existing shopping list item that matches the needed ingredient
   */
  private findExistingItem(
    needed: {
      canonicalId: string | null;
      displayName: string;
    },
    existingList: ShoppingItem[]
  ): ShoppingItem | undefined {
    // First try exact canonical match
    if (needed.canonicalId) {
      for (const item of existingList) {
        // Strip quantity info from name (e.g., "Beef (500g)" -> "Beef")
        const itemNameClean = item.name.replace(/\s*\([^)]+\)\s*$/, '').trim();
        const matchResult = ingredientMatcher.match(itemNameClean, itemNameClean);
        if (matchResult.canonicalId === needed.canonicalId) {
          return item;
        }
      }
    }

    // Then try fuzzy match on display name
    for (const item of existingList) {
      // Strip quantity info from name for better matching
      const itemNameClean = item.name.replace(/\s*\([^)]+\)\s*$/, '').trim();
      const matchResult = ingredientMatcher.match(itemNameClean, needed.displayName);
      if (matchResult.confidence >= 0.9) {
        return item;
      }
    }

    // Also try simple case-insensitive match as fallback
    const neededLower = needed.displayName.toLowerCase();
    for (const item of existingList) {
      const itemNameClean = item.name.replace(/\s*\([^)]+\)\s*$/, '').trim().toLowerCase();
      if (itemNameClean === neededLower) {
        return item;
      }
    }

    return undefined;
  }

  /**
   * Merge quantities, converting units if necessary
   */
  private mergeQuantities(
    existing: ShoppingItem,
    additionalQuantity: number,
    additionalUnit: string,
    canonicalId: string | null
  ): { quantity: number; unit: string } {
    // If units match, simply add
    if (existing.unit === additionalUnit) {
      return {
        quantity: existing.quantity + additionalQuantity,
        unit: existing.unit
      };
    }

    // Try to convert to common unit
    if (canonicalId) {
      const canonical = ingredientMatcher.getCanonicalIngredient(canonicalId);
      if (canonical) {
        // Try to convert additional quantity to existing unit
        const conversion = unitConverter.convert(
          additionalQuantity,
          additionalUnit,
          existing.unit,
          canonical
        );

        if (conversion.success && conversion.value) {
          return {
            quantity: existing.quantity + conversion.value,
            unit: existing.unit
          };
        }

        // Try to convert existing to additional unit
        const reverseConversion = unitConverter.convert(
          existing.quantity,
          existing.unit,
          additionalUnit,
          canonical
        );

        if (reverseConversion.success && reverseConversion.value) {
          return {
            quantity: reverseConversion.value + additionalQuantity,
            unit: additionalUnit
          };
        }
      }
    }

    // If conversion fails, keep larger unit and approximate
    // This is a fallback - ideally all conversions should work
    return {
      quantity: existing.quantity + additionalQuantity,
      unit: `${existing.unit}+${additionalUnit}`
    };
  }

  /**
   * Merge notes, avoiding duplicates
   */
  private mergeNotes(existingNotes: string | undefined, newNote: string): string {
    if (!existingNotes) {
      return newNote;
    }

    // Check if note already contains this recipe
    if (existingNotes.includes(newNote)) {
      return existingNotes;
    }

    return `${existingNotes}; ${newNote}`;
  }

  /**
   * Map recipe categories to shopping categories
   */
  private mapCategoryToShoppingCategory(recipeCategory: string): string {
    const categoryMap: Record<string, string> = {
      'meat': 'Meat & Seafood',
      'fish': 'Meat & Seafood',
      'produce': 'Produce',
      'herbs': 'Produce',
      'dairy': 'Dairy',
      'grains': 'Bakery & Bread',
      'baking': 'Baking',
      'condiments': 'Condiments',
      'spices': 'Spices & Seasonings',
      'canned': 'Canned & Jarred',
      'nuts': 'Snacks & Nuts',
      'seeds': 'Snacks & Nuts'
    };

    return categoryMap[recipeCategory.toLowerCase()] || 'Other';
  }

  /**
   * Convert string to title case
   */
  /**
   * Intelligently merge quantities, converting and summing units
   */
  private mergeQuantitiesIntelligently(
    existingQty: number,
    existingUnit: string,
    additionalQty: number,
    additionalUnit: string
  ): { quantity: number; unit: string } {
    console.log(`=== MERGE QUANTITIES ===`);
    console.log(`Existing: ${existingQty} ${existingUnit}`);
    console.log(`Additional: ${additionalQty} ${additionalUnit}`);

    // Handle countable items (pieces, items, etc.)
    if (this.isCountableUnit(existingUnit) && this.isCountableUnit(additionalUnit)) {
      const result = {
        quantity: existingQty + additionalQty,  // Fixed: removed (|| 1) fallback
        unit: existingUnit
      };
      console.log(`Countable merge result: ${result.quantity} ${result.unit}`);
      return result;
    }

    // Try to convert to same unit system
    const converted = this.convertToSameUnit(
      existingQty,
      existingUnit,
      additionalQty,
      additionalUnit
    );

    // Normalize to user-friendly units
    return this.normalizeQuantityForShopping(converted.quantity, converted.unit);
  }

  /**
   * Convert quantities to the same unit system for addition
   */
  private convertToSameUnit(
    qty1: number,
    unit1: string,
    qty2: number,
    unit2: string
  ): { quantity: number; unit: string } {
    // Simple conversion table
    const conversions: Record<string, number> = {
      // Weight - everything to grams
      'g': 1,
      'gram': 1,
      'grams': 1,
      'kg': 1000,
      'kilogram': 1000,
      'kilograms': 1000,
      'oz': 28.35,
      'ounce': 28.35,
      'ounces': 28.35,
      'lb': 453.592,
      'pound': 453.592,
      'pounds': 453.592,
      'lbs': 453.592,

      // Volume - everything to ml
      'ml': 1,
      'milliliter': 1,
      'milliliters': 1,
      'l': 1000,
      'liter': 1000,
      'liters': 1000,
      'cup': 240,
      'cups': 240,
      'tbsp': 15,
      'tablespoon': 15,
      'tablespoons': 15,
      'tsp': 5,
      'teaspoon': 5,
      'teaspoons': 5,
    };

    const unit1Lower = unit1.toLowerCase();
    const unit2Lower = unit2.toLowerCase();

    // If both units are in our conversion table
    if (conversions[unit1Lower] && conversions[unit2Lower]) {
      // Convert both to base unit
      const base1 = qty1 * conversions[unit1Lower];
      const base2 = qty2 * conversions[unit2Lower];
      const total = base1 + base2;

      // Determine if weight or volume
      const isWeight = ['g', 'gram', 'grams', 'kg', 'oz', 'lb'].some(u =>
        unit1Lower.includes(u) || unit2Lower.includes(u)
      );

      return {
        quantity: total,
        unit: isWeight ? 'g' : 'ml'
      };
    }

    // If units don't match and can't convert, just add the quantities
    // This handles units like "cloves", "sprigs", etc. that aren't in our conversion table
    return {
      quantity: qty1 + qty2,
      unit: unit1
    };
  }

  /**
   * Normalize quantities to user-friendly units
   */
  private normalizeQuantityForShopping(
    quantity: number,
    unit: string
  ): { quantity: number; unit: string } {
    const unitLower = unit.toLowerCase();

    // Weight conversions
    if (unitLower === 'g' || unitLower === 'grams') {
      if (quantity >= 1000) {
        return { quantity: parseFloat((quantity / 1000).toFixed(2)), unit: 'kg' };
      }
      return { quantity: Math.round(quantity), unit: 'g' };
    }

    // Volume conversions
    if (unitLower === 'ml' || unitLower === 'milliliters') {
      if (quantity >= 1000) {
        return { quantity: parseFloat((quantity / 1000).toFixed(2)), unit: 'L' };
      }
      return { quantity: Math.round(quantity), unit: 'ml' };
    }

    // Ounces to pounds
    if (unitLower === 'oz' || unitLower === 'ounces') {
      if (quantity >= 16) {
        return { quantity: parseFloat((quantity / 16).toFixed(2)), unit: 'lb' };
      }
      return { quantity: Math.round(quantity), unit: 'oz' };
    }

    // For countable items or unknown units, round to whole numbers
    if (this.isCountableUnit(unit) || !quantity) {
      return {
        quantity: Math.ceil(quantity || 1),
        unit: unit || 'item'
      };
    }

    return { quantity: parseFloat(quantity.toFixed(2)), unit };
  }

  /**
   * Check if unit is countable (pieces, items, etc.)
   */
  private isCountableUnit(unit: string): boolean {
    const countable = ['item', 'items', 'piece', 'pieces', 'can', 'cans',
                       'bottle', 'bottles', 'package', 'packages', 'bunch',
                       'bunches', 'head', 'heads', 'clove', 'cloves'];
    return countable.includes(unit.toLowerCase());
  }

  private titleCase(str: string): string {
    return str.replace(/\w\S*/g, (txt) => {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
  }

  /**
   * Get shopping list for multiple recipes
   */
  getMergedShoppingListForRecipes(
    recipes: Recipe[],
    inventory: InventoryItem[],
    existingList: ShoppingItem[] = []
  ): ShoppingListMergeResult {
    let totalItemsToAdd: Omit<ShoppingItem, 'id' | 'checked' | 'addedAt'>[] = [];
    let totalItemsToUpdate: Array<{ id: string; updates: Partial<ShoppingItem> }> = [];
    let totalMerged = 0;
    let totalNew = 0;
    let totalItems = 0;

    // Process each recipe
    for (const recipe of recipes) {
      const result = this.mergeRecipeIngredients(recipe, inventory, [
        ...existingList,
        ...totalItemsToAdd.map(item => ({
          ...item,
          id: `temp-${Math.random()}`,
          checked: false,
          addedAt: new Date().toISOString()
        }))
      ]);

      totalItemsToAdd = [...totalItemsToAdd, ...result.itemsToAdd];
      totalItemsToUpdate = [...totalItemsToUpdate, ...result.itemsToUpdate];
      totalMerged += result.mergedItems;
      totalNew += result.newItems;
      totalItems += result.totalItems;
    }

    return {
      itemsToAdd: totalItemsToAdd,
      itemsToUpdate: totalItemsToUpdate,
      totalItems,
      mergedItems: totalMerged,
      newItems: totalNew
    };
  }

  /**
   * Check if an item from shopping list exists in inventory
   */
  isItemInInventory(shoppingItem: ShoppingItem, inventory: InventoryItem[]): boolean {
    for (const invItem of inventory) {
      const matchResult = ingredientMatcher.match(invItem.name, shoppingItem.name);
      if (matchResult.confidence >= 0.85) {
        // Check if we have enough quantity
        if (invItem.quantity >= shoppingItem.quantity) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Convert missing ingredients from a recipe to shopping items
   */
  convertMissingToShoppingItems(
    recipe: Recipe,
    missingIngredients: string[]
  ): Omit<ShoppingItem, 'id' | 'checked' | 'addedAt'>[] {
    const items: Omit<ShoppingItem, 'id' | 'checked' | 'addedAt'>[] = [];

    for (const missingText of missingIngredients) {
      // Parse the ingredient text
      const parsed = ingredientParser.parse(missingText);

      // Try to find canonical match
      const matchResult = ingredientMatcher.match(parsed.ingredient, parsed.ingredient);
      const canonical = matchResult.canonicalId ?
        ingredientMatcher.getCanonicalIngredient(matchResult.canonicalId) : null;

      const displayName = canonical?.displayName || this.titleCase(parsed.ingredient);
      const category = canonical?.category || 'Other';

      items.push({
        name: displayName,
        quantity: parsed.quantity || 1,
        unit: parsed.unit || 'unit',
        category: this.mapCategoryToShoppingCategory(category),
        notes: `For ${recipe.name}`,
        canonicalId: matchResult.canonicalId
      });
    }

    return items;
  }

  /**
   * Smart suggestion for missing ingredients based on common substitutions
   */
  suggestSubstitutions(
    missingIngredient: string
  ): Array<{ substitute: string; confidence: number }> {
    const substitutions: Record<string, string[]> = {
      'butter': ['margarine', 'coconut oil', 'vegetable oil'],
      'milk': ['almond milk', 'soy milk', 'oat milk', 'coconut milk'],
      'eggs': ['flax eggs', 'chia eggs', 'applesauce', 'mashed banana'],
      'sour_cream': ['greek yogurt', 'yogurt', 'cream cheese'],
      'heavy_cream': ['milk + butter', 'half and half', 'coconut cream'],
      'all_purpose_flour': ['whole wheat flour', 'bread flour', 'cake flour'],
      'sugar': ['honey', 'maple syrup', 'agave nectar'],
      'brown_sugar': ['white sugar + molasses', 'coconut sugar']
    };

    const suggestions: Array<{ substitute: string; confidence: number }> = [];

    // Find canonical ID for missing ingredient
    const matchResult = ingredientMatcher.match(missingIngredient, missingIngredient);
    const canonicalId = matchResult.canonicalId;

    if (canonicalId && substitutions[canonicalId]) {
      for (const substitute of substitutions[canonicalId]) {
        suggestions.push({
          substitute,
          confidence: 0.8
        });
      }
    }

    return suggestions;
  }
}

export const shoppingListMerger = new ShoppingListMerger();