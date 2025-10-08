/**
 * Supabase Recipes Hook
 * Fetches and transforms v5.2 RuleChef recipes from Supabase
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Recipe } from '../types';
import { DatabaseRecipeWithIngredients } from '../types/database';
import { transformDatabaseRecipes } from '../utils/recipeTransformer';

interface UseSupabaseRecipesOptions {
  category?: string;
  limit?: number;
  enabled?: boolean;
}

export function useSupabaseRecipes(options: UseSupabaseRecipesOptions = {}) {
  const { category, limit = 50, enabled = true } = options;

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchRecipes = async () => {
    try {
      setLoading(true);
      setError(null);

      // Step 1: Fetch recipes ONLY (no join) - much faster
      let query = supabase
        .from('recipes')
        .select('*')
        .eq('author', 'RuleChef v5.2')
        .eq('is_public', true);

      // Apply category filtering at SQL level (performance optimization)
      if (category && category !== 'all') {
        switch (category) {
          case 'dessert':
            query = query.contains('course', ['dessert']);
            break;
          case 'breakfast':
            query = query.contains('meal_type', ['breakfast']);
            break;
          case 'lunch':
            query = query.contains('meal_type', ['lunch']);
            break;
          case 'dinner':
            query = query.contains('meal_type', ['dinner']);
            break;
          case 'quick':
            query = query.lte('total_time_minutes', 30);
            break;
          case 'healthy':
            // Match vegan OR vegetarian in dietary_tags
            query = query.or('dietary_tags.cs.{vegan},dietary_tags.cs.{vegetarian}');
            break;
          case 'comfort':
            // Comfort food: not dessert, not quick, hearty meals
            query = query
              .not('course', 'cs', '{dessert}')
              .gt('total_time_minutes', 30);
            break;
          // Default: no filter (show all)
        }
      }

      // Order by creation date (most recent first)
      // TODO: Add favorites_count when available
      query = query.order('created_at', { ascending: false }).limit(limit);

      const { data: recipesData, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      if (!recipesData || recipesData.length === 0) {
        setRecipes([]);
        return;
      }

      // Step 2: Fetch ingredients for these specific recipes (batch query)
      const recipeIds = recipesData.map(r => r.id);
      const { data: ingredientsData, error: ingredientsError } = await supabase
        .from('recipe_ingredients')
        .select('*')
        .in('recipe_id', recipeIds)
        .order('sort_order', { ascending: true });

      if (ingredientsError) throw ingredientsError;

      // Step 3: Merge ingredients with recipes
      const recipesWithIngredients = recipesData.map(recipe => ({
        ...recipe,
        ingredients: ingredientsData?.filter(ing => ing.recipe_id === recipe.id) || []
      }));

      // Transform to app format
      const transformedRecipes = transformDatabaseRecipes(recipesWithIngredients as DatabaseRecipeWithIngredients[]);
      setRecipes(transformedRecipes);
    } catch (err) {
      console.error('Error fetching recipes:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (enabled) {
      fetchRecipes();
    }
  }, [category, limit, enabled]);

  return {
    recipes,
    loading,
    error,
    refetch: fetchRecipes
  };
}
