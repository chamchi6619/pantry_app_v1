/**
 * Shopping List Service
 *
 * Purpose: Manage shopping list operations
 * Used by: ExploreRecipesScreenSupabase, CookCardScreen
 */

import { supabase } from '../lib/supabase';

export interface ShoppingListItem {
  id?: string;
  name: string;
  quantity?: number;
  unit?: string;
  category?: string;
  recipe_id?: string;
  recipe_name?: string;
}

export interface IngredientToAdd {
  name: string;
  is_optional?: boolean;
}

/**
 * Add ingredients to shopping list
 *
 * @param ingredients - Array of ingredient objects or names to add
 * @param householdId - Household ID
 * @param recipeId - Optional recipe ID (for tracking)
 * @param recipeName - Optional recipe name (for display)
 * @returns Number of items added
 */
export async function addIngredientsToShoppingList(
  ingredients: (string | IngredientToAdd)[],
  householdId: string,
  recipeId?: string,
  recipeName?: string
): Promise<{ added: number; duplicates: number }> {
  try {
    if (!ingredients || ingredients.length === 0) {
      return { added: 0, duplicates: 0 };
    }

    // Get or create active shopping list for household
    let { data: lists, error: listsError } = await supabase
      .from('shopping_lists')
      .select('id')
      .eq('household_id', householdId)
      .eq('is_active', true)
      .limit(1);

    if (listsError) throw listsError;

    let listId: string;

    if (!lists || lists.length === 0) {
      // Create new shopping list
      const { data: newList, error: createError } = await supabase
        .from('shopping_lists')
        .insert({
          household_id: householdId,
          title: 'Shopping List',
          is_active: true,
        })
        .select('id')
        .single();

      if (createError) throw createError;
      listId = newList.id;
    } else {
      listId = lists[0].id;
    }

    // Get existing items to avoid duplicates
    const { data: existingItems, error: existingError } = await supabase
      .from('shopping_list_items')
      .select('name')
      .eq('list_id', listId)
      .eq('checked', false); // Only check unchecked items

    if (existingError) throw existingError;

    // Filter out duplicates (case-insensitive)
    const existingNames = new Set(
      (existingItems || []).map(item => item.name.toLowerCase().trim())
    );

    // Normalize ingredients to objects
    const ingredientObjects: IngredientToAdd[] = ingredients.map(ing =>
      typeof ing === 'string' ? { name: ing } : ing
    );

    const newIngredients = ingredientObjects.filter(
      ing => !existingNames.has(ing.name.toLowerCase().trim())
    );

    const duplicates = ingredients.length - newIngredients.length;

    if (newIngredients.length === 0) {
      return { added: 0, duplicates };
    }

    // Insert new items (use 'checked' column - 'status' is auto-generated)
    // NOTE: canonical matching happens later when items are moved to inventory
    const itemsToInsert = newIngredients.map(ing => ({
      list_id: listId,
      name: ing.name.trim(),  // Preserve exact ingredient text from recipe
      quantity: 1,
      unit: 'item',
      category: null,
      checked: false,  // Database auto-generates 'status' from this boolean
      recipe_id: recipeId || null,
      recipe_name: recipeName || null,
    }));

    const { error: insertError } = await supabase
      .from('shopping_list_items')
      .insert(itemsToInsert);

    if (insertError) throw insertError;

    console.log(`✅ Added ${newIngredients.length} items to shopping list (${duplicates} duplicates skipped)`);

    return { added: newIngredients.length, duplicates };
  } catch (error) {
    console.error('Failed to add ingredients to shopping list:', error);
    throw error;
  }
}

/**
 * Add a single ingredient with quantity/unit
 *
 * @param item - Shopping list item
 * @param householdId - Household ID
 * @returns Added item ID
 */
export async function addItemToShoppingList(
  item: ShoppingListItem,
  householdId: string
): Promise<string> {
  try {
    // Get or create active shopping list
    let { data: lists, error: listsError } = await supabase
      .from('shopping_lists')
      .select('id')
      .eq('household_id', householdId)
      .eq('is_active', true)
      .limit(1);

    if (listsError) throw listsError;

    let listId: string;

    if (!lists || lists.length === 0) {
      const { data: newList, error: createError } = await supabase
        .from('shopping_lists')
        .insert({
          household_id: householdId,
          title: 'Shopping List',
          is_active: true,
        })
        .select('id')
        .single();

      if (createError) throw createError;
      listId = newList.id;
    } else {
      listId = lists[0].id;
    }

    // Insert item
    const { data, error } = await supabase
      .from('shopping_list_items')
      .insert({
        list_id: listId,
        name: item.name.trim(),
        quantity: item.quantity || 1,
        unit: item.unit || 'item',
        category: item.category || null,
        checked: false,  // Database auto-generates 'status' from this boolean
        recipe_id: item.recipe_id || null,
        recipe_name: item.recipe_name || null,
      })
      .select('id')
      .single();

    if (error) throw error;

    return data.id;
  } catch (error) {
    console.error('Failed to add item to shopping list:', error);
    throw error;
  }
}

/**
 * Add all ingredients from a cook card to shopping list
 * Useful for meal planning - adds all ingredients from a recipe
 *
 * @param cookCardId - Cook card ID
 * @param householdId - Household ID
 * @param userId - User ID (for tracking)
 * @returns Number of items added and duplicates skipped
 */
export async function addRecipeIngredientsToShoppingList(
  cookCardId: string,
  householdId: string,
  userId: string
): Promise<{ added: number; duplicates: number }> {
  try {
    // Fetch cook card details for recipe name
    const { data: cookCard, error: cookCardError } = await supabase
      .from('cook_cards')
      .select('title')
      .eq('id', cookCardId)
      .single();

    if (cookCardError) throw cookCardError;

    // Fetch ingredients for this cook card
    const { data: ingredients, error: ingredientsError } = await supabase
      .from('cook_card_ingredients')
      .select('ingredient_name, amount, unit')
      .eq('cook_card_id', cookCardId);

    if (ingredientsError) throw ingredientsError;

    if (!ingredients || ingredients.length === 0) {
      console.warn(`No ingredients found for cook card ${cookCardId}`);
      return { added: 0, duplicates: 0 };
    }

    // Format ingredient names with quantities
    const ingredientNames = ingredients.map(ing => {
      if (ing.amount && ing.unit) {
        return `${ing.ingredient_name} (${ing.amount} ${ing.unit})`;
      } else if (ing.amount) {
        return `${ing.ingredient_name} (${ing.amount})`;
      }
      return ing.ingredient_name;
    });

    // Add to shopping list using existing function
    return await addIngredientsToShoppingList(
      ingredientNames,
      householdId,
      cookCardId, // recipe_id
      cookCard.title // recipe_name
    );
  } catch (error) {
    console.error('Failed to add recipe ingredients to shopping list:', error);
    throw error;
  }
}
