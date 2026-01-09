/**
 * Recipe Database Service
 *
 * Purpose: Browse and search the 200-recipe recipe_database (read-only)
 * Pattern: User explores → Saves to cook_cards → Appears in queue
 * Features: Category browsing, pantry match scoring, search
 */

import { supabase } from '../lib/supabase';
import { batchCalculatePantryMatch, type PantryMatchResult } from './pantryMatchService';

export interface RecipeDatabaseItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  difficulty: string | null;
  cook_time_minutes: number | null;
  prep_time_minutes: number | null;
  total_time_minutes: number | null;
  servings: number | null;
  image_url: string | null;
  video_url: string | null;
  source_url: string | null;
  creator_name: string | null;
  platform: string | null;
  is_published: boolean;
  times_saved: number;
  avg_pantry_match: number | null;
  created_at: string;

  // Computed fields
  pantry_match_percent: number | null;
  missing_ingredients_count: number | null;
}

export interface RecipesByCategory {
  [category: string]: RecipeDatabaseItem[];
}

/**
 * Get recipes by category with pantry matching
 *
 * This is the FAST path - loads one category at a time
 * Use this for progressive loading instead of loading all 200 recipes
 *
 * @param category - Category name (e.g., 'italian', 'mexican')
 * @param householdId - Household ID for pantry matching
 * @param limit - Max recipes to return (default: 10)
 * @returns Recipes sorted by pantry match (highest first)
 */
export async function getRecipesByCategory(
  category: string,
  householdId: string,
  limit: number = 10
): Promise<RecipeDatabaseItem[]> {
  try {
    console.log(`[RecipeDB] Loading category: ${category} (limit: ${limit})`);
    const startTime = Date.now();

    // Fetch recipes for this category
    // Fetch 2x limit to ensure we have enough after sorting by pantry match
    const { data: recipes, error } = await supabase
      .from('recipe_database')
      .select('*')
      .eq('category', category)
      .eq('is_published', true)
      .order('times_saved', { ascending: false })
      .limit(limit * 2);

    if (error) throw error;
    if (!recipes || recipes.length === 0) {
      console.log(`[RecipeDB] No recipes found for category: ${category}`);
      return [];
    }

    // Calculate pantry matches in batch (MUCH faster than N queries)
    const recipeIds = recipes.map(r => r.id);
    const pantryMatches = await batchCalculateRecipeDatabasePantryMatch(recipeIds, householdId);

    // Attach pantry match data
    const recipesWithMatch: RecipeDatabaseItem[] = recipes.map(recipe => ({
      ...recipe,
      pantry_match_percent: pantryMatches.get(recipe.id)?.matchPercent || 0,
      missing_ingredients_count: pantryMatches.get(recipe.id)?.missingIngredients.length || 0,
    }));

    // Sort by pantry match (best matches first)
    recipesWithMatch.sort((a, b) => {
      const matchDiff = (b.pantry_match_percent || 0) - (a.pantry_match_percent || 0);
      if (matchDiff !== 0) return matchDiff;

      // Tie-breaker: popularity (times_saved)
      return (b.times_saved || 0) - (a.times_saved || 0);
    });

    const result = recipesWithMatch.slice(0, limit);
    const elapsed = Date.now() - startTime;
    console.log(`[RecipeDB] Loaded ${result.length} recipes for ${category} in ${elapsed}ms`);

    return result;
  } catch (error) {
    console.error(`[RecipeDB] Error fetching ${category}:`, error);
    return [];
  }
}

/**
 * Get all categories with sample recipes for each
 * Used for building the category carousel view
 *
 * @param householdId - Household ID for pantry matching
 * @param recipesPerCategory - Recipes per category (default: 10)
 * @returns Object with categories as keys, recipe arrays as values
 */
export async function getAllCategoriesWithRecipes(
  householdId: string,
  recipesPerCategory: number = 10
): Promise<RecipesByCategory> {
  try {
    // Fetch all recipes grouped by category
    const { data: recipes, error } = await supabase
      .from('recipe_database')
      .select('*')
      .eq('is_published', true)
      .order('times_saved', { ascending: false });

    if (error) throw error;
    if (!recipes || recipes.length === 0) return {};

    // Calculate pantry matches for ALL recipes in one batch
    const recipeIds = recipes.map(r => r.id);
    console.log(`[RecipeDB] Batch calculating pantry matches for ${recipeIds.length} recipes...`);
    const pantryMatches = await batchCalculateRecipeDatabasePantryMatch(recipeIds, householdId);

    // Log sample of results for debugging
    const firstThreeIds = recipeIds.slice(0, 3);
    firstThreeIds.forEach(id => {
      const match = pantryMatches.get(id);
      console.log(`[RecipeDB] Sample match for ${id.substring(0, 8)}: ${match?.matchPercent}% (${match?.totalIngredients} ingredients, ${match?.missingIngredients.length} missing)`);
    });

    // Attach pantry match data
    const recipesWithMatch: RecipeDatabaseItem[] = recipes.map(recipe => {
      const match = pantryMatches.get(recipe.id);
      const pantry_match_percent = match?.matchPercent ?? 0;
      const missing_ingredients_count = match?.missingIngredients.length ?? 0;

      // Debug logging for recipes with no match
      if (pantry_match_percent === 0 && match) {
        console.log(`[RecipeDB] Recipe with 0% calculated match:`, {
          title: recipe.title,
          id: recipe.id.substring(0, 8),
          totalIngredients: match.totalIngredients,
          exactMatches: match.exactMatches.length,
          strongSubs: match.strongSubstitutions.length,
          weakSubs: match.weakSubstitutions.length,
        });
      }

      return {
        ...recipe,
        pantry_match_percent,
        missing_ingredients_count,
      };
    });

    // Group by category
    const byCategory: RecipesByCategory = {};
    recipesWithMatch.forEach(recipe => {
      if (!byCategory[recipe.category]) {
        byCategory[recipe.category] = [];
      }
      byCategory[recipe.category].push(recipe);
    });

    // Sort each category by pantry match and limit
    Object.keys(byCategory).forEach(category => {
      byCategory[category].sort((a, b) => {
        const matchDiff = (b.pantry_match_percent || 0) - (a.pantry_match_percent || 0);
        if (matchDiff !== 0) return matchDiff;
        return (b.times_saved || 0) - (a.times_saved || 0);
      });

      // Limit to top N recipes per category
      byCategory[category] = byCategory[category].slice(0, recipesPerCategory);
    });

    console.log(`[RecipeDB] Loaded ${Object.keys(byCategory).length} categories`);
    return byCategory;
  } catch (error) {
    console.error('[RecipeDB] Error loading categories:', error);
    return {};
  }
}

/**
 * Batch calculate pantry match for recipe_database recipes
 * Uses recipe_database_ingredients (not cook_card_ingredients)
 *
 * PERFORMANCE: Uses Postgres function instead of client-side calculation
 * - Old: 4 queries + 2700 JS comparisons (~3-5 seconds)
 * - New: 1 RPC call (~100-300ms)
 */
async function batchCalculateRecipeDatabasePantryMatch(
  recipeIds: string[],
  householdId: string
): Promise<Map<string, PantryMatchResult>> {
  const results = new Map<string, PantryMatchResult>();

  if (recipeIds.length === 0) return results;

  console.log(`[PantryMatch] Starting batch calculation for ${recipeIds.length} recipes (backend)`);
  const startTime = Date.now();

  try {
    // Call Postgres function to calculate all matches in one query
    const { data, error } = await supabase.rpc('calculate_pantry_matches_batch', {
      p_household_id: householdId,
      p_recipe_ids: recipeIds,
    });

    if (error) throw error;

    // Convert results to Map format
    // Note: We only get basic stats from the backend (not ingredient lists)
    // If we need detailed ingredient lists later, we can add another query
    if (data && Array.isArray(data)) {
      data.forEach((row: any) => {
        const totalIngredients = row.total_ingredients || 0;
        const exactMatchCount = row.exact_matches || 0;
        const missingCount = totalIngredients - exactMatchCount;

        // Create a placeholder array with the right length for missing ingredients
        // This allows .length to work correctly without fetching actual ingredient names
        const missingPlaceholder = new Array(missingCount).fill('');

        results.set(row.recipe_id, {
          matchPercent: row.match_percent || 0,
          exactMatches: [], // Not returned by backend function (saves bandwidth)
          strongSubstitutions: [], // Backend currently only does exact match
          weakSubstitutions: [], // Backend currently only does exact match
          missingIngredients: missingPlaceholder, // Placeholder array for .length
          totalIngredients: totalIngredients,
        });
      });
    }

    const elapsed = Date.now() - startTime;
    console.log(`[PantryMatch] Calculated ${results.size}/${recipeIds.length} matches in ${elapsed}ms (backend)`);

    // Fill in missing recipes with 0% match
    recipeIds.forEach(id => {
      if (!results.has(id)) {
        results.set(id, {
          matchPercent: 0,
          exactMatches: [],
          strongSubstitutions: [],
          weakSubstitutions: [],
          missingIngredients: [],
          totalIngredients: 0,
        });
      }
    });

    return results;
  } catch (error) {
    console.error('[RecipeDB] Error in batch pantry match:', error);
    // Return empty results
    recipeIds.forEach(id => {
      results.set(id, {
        matchPercent: 0,
        exactMatches: [],
        strongSubstitutions: [],
        weakSubstitutions: [],
        missingIngredients: [],
        totalIngredients: 0,
      });
    });
    return results;
  }
}

/**
 * Search recipes across all categories
 */
export async function searchRecipes(
  query: string,
  householdId: string,
  limit: number = 20
): Promise<RecipeDatabaseItem[]> {
  try {
    const { data: recipes, error } = await supabase
      .from('recipe_database')
      .select('*')
      .eq('is_published', true)
      .or(`title.ilike.%${query}%,description.ilike.%${query}%,category.ilike.%${query}%`)
      .order('times_saved', { ascending: false })
      .limit(limit);

    if (error) throw error;
    if (!recipes || recipes.length === 0) return [];

    // Calculate pantry matches
    const recipeIds = recipes.map(r => r.id);
    const pantryMatches = await batchCalculateRecipeDatabasePantryMatch(recipeIds, householdId);

    const recipesWithMatch: RecipeDatabaseItem[] = recipes.map(recipe => ({
      ...recipe,
      pantry_match_percent: pantryMatches.get(recipe.id)?.matchPercent || 0,
      missing_ingredients_count: pantryMatches.get(recipe.id)?.missingIngredients.length || 0,
    }));

    // Sort by pantry match
    recipesWithMatch.sort((a, b) =>
      (b.pantry_match_percent || 0) - (a.pantry_match_percent || 0)
    );

    return recipesWithMatch;
  } catch (error) {
    console.error('[RecipeDB] Error searching:', error);
    return [];
  }
}

/**
 * Get recipe details with ingredients
 */
export async function getRecipeDetails(recipeId: string, householdId: string) {
  try {
    const { data: recipe, error } = await supabase
      .from('recipe_database')
      .select(`
        *,
        ingredients:recipe_database_ingredients(*)
      `)
      .eq('id', recipeId)
      .single();

    if (error) throw error;

    // Calculate pantry match
    const pantryMatches = await batchCalculateRecipeDatabasePantryMatch([recipeId], householdId);
    const match = pantryMatches.get(recipeId);

    return {
      ...recipe,
      pantry_match_percent: match?.matchPercent || 0,
      missing_ingredients_count: match?.missingIngredients.length || 0,
      pantry_match_details: match,
    };
  } catch (error) {
    console.error('[RecipeDB] Error fetching recipe details:', error);
    throw error;
  }
}
