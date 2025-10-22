/**
 * Personalized Recommendation Engine
 *
 * Matches user's saved recipes (cook_cards) to their pantry items
 * and surfaces forgotten recipes based on:
 * - Ingredient match percentage
 * - Expiring ingredients
 * - Cooking history
 * - Recipe ratings
 *
 * Cost: $0.00 per recommendation (database queries only)
 */

import { supabase } from '../lib/supabase';

export interface RecipeRecommendation {
  cook_card: any; // Full cook card with ingredients
  match_score: number; // 0-1 (weighted score)
  completeness: number; // 0-1 (% of ingredients in pantry)
  missing_ingredients: Ingredient[];
  have_ingredients: Ingredient[];
  priority_reasons: string[]; // ["uses_expiring_item", "never_cooked", "high_match", "highly_rated"]
}

interface Ingredient {
  id: string;
  ingredient_name: string;
  amount?: number;
  unit?: string;
  canonical_item_id?: string;
}

interface PantryItem {
  canonical_item_id: string;
  purchase_date?: string;
  expiry_date?: string;
}

/**
 * Get personalized recipe recommendations based on user's pantry
 */
export async function getPersonalizedRecommendations(
  userId: string,
  householdId: string,
  limit: number = 10
): Promise<RecipeRecommendation[]> {
  try {
    console.log('🎯 Getting personalized recommendations for user:', userId);

    // 1. Get user's pantry items
    const { data: pantryItems, error: pantryError } = await supabase
      .from('pantry_items')
      .select('canonical_item_id, purchase_date, expiry_date')
      .eq('household_id', householdId)
      .eq('status', 'active');

    if (pantryError) {
      console.error('Error fetching pantry:', pantryError);
      return [];
    }

    const pantryItemIds = pantryItems?.map(p => p.canonical_item_id).filter(Boolean) || [];

    if (pantryItemIds.length === 0) {
      console.log('📭 No pantry items found');
      return [];
    }

    console.log('📦 Found', pantryItemIds.length, 'pantry items');

    // 2. Get user's saved recipes with ingredients
    const { data: recipes, error: recipesError } = await supabase
      .from('cook_cards')
      .select(`
        *,
        ingredients:cook_card_ingredients(
          id,
          ingredient_name,
          amount,
          unit,
          canonical_item_id
        )
      `)
      .eq('user_id', userId)
      .eq('is_archived', false);

    if (recipesError) {
      console.error('Error fetching recipes:', recipesError);
      return [];
    }

    if (!recipes || recipes.length === 0) {
      console.log('📭 No saved recipes found');
      return [];
    }

    console.log('📚 Found', recipes.length, 'saved recipes');

    // 3. Get meal history (what user cooked recently)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    let recentMeals: any[] = [];
    const { data: mealsData, error: mealsError } = await supabase
      .from('meal_history')
      .select('cook_card_id, cooked_at, rating')
      .eq('user_id', userId)
      .gte('cooked_at', fourteenDaysAgo.toISOString())
      .order('cooked_at', { ascending: false });

    if (mealsError) {
      console.warn('Error fetching meal history:', mealsError);
      recentMeals = []; // Explicit fallback
    } else {
      recentMeals = mealsData || [];
    }

    const recentCookCardIds = recentMeals.map(m => m.cook_card_id);

    // Build rating map from meal history (use latest rating per recipe)
    const ratingMap = new Map<string, number>();
    if (recentMeals.length > 0) {
      // Already sorted by cooked_at DESC, so first occurrence is latest
      for (const meal of recentMeals) {
        if (meal.rating && !ratingMap.has(meal.cook_card_id)) {
          ratingMap.set(meal.cook_card_id, meal.rating); // First (latest) wins
        }
      }
    }

    console.log('🍳 Found', recentCookCardIds.length, 'recent meals');

    // 4. Score each recipe
    const scored: RecipeRecommendation[] = recipes
      .map(recipe => {
        const ingredients: Ingredient[] = Array.isArray(recipe.ingredients)
          ? recipe.ingredients
          : [];
        const totalIngredients = ingredients.length;

        if (totalIngredients === 0) {
          return null; // Skip recipes with no ingredients
        }

        // Calculate completeness (% of ingredients in pantry)
        const haveIngredients = ingredients.filter(ing =>
          ing.canonical_item_id && pantryItemIds.includes(ing.canonical_item_id)
        );
        const completeness = haveIngredients.length / totalIngredients;

        // Calculate missing ingredients
        const missingIngredients = ingredients.filter(ing =>
          !ing.canonical_item_id || !pantryItemIds.includes(ing.canonical_item_id)
        );

        // Priority scoring - MULTIPLICATIVE to prevent score overflow
        let matchScore = completeness; // Base score: 0-1
        const priorityReasons: string[] = [];

        // Helper: Normalize date to midnight local time
        const normalizeDate = (dateStr: string): Date => {
          const date = new Date(dateStr + 'T00:00:00');
          return date;
        };

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Boost: Uses expiring ingredient (within 3 days)
        const usesExpiringItem = ingredients.some(ing => {
          const pantryItem = pantryItems?.find(p => p.canonical_item_id === ing.canonical_item_id);
          if (!pantryItem?.expiry_date) return false;

          const expiryDate = normalizeDate(pantryItem.expiry_date);
          const daysUntilExpiry = Math.floor(
            (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          );
          return daysUntilExpiry >= 0 && daysUntilExpiry <= 3;
        });

        if (usesExpiringItem) {
          matchScore *= 1.3; // 30% boost (multiplicative)
          priorityReasons.push('uses_expiring_item');
        }

        // Boost: Uses ingredient purchased 3+ days ago (prevent waste)
        const usesOlderItem = ingredients.some(ing => {
          const pantryItem = pantryItems?.find(p => p.canonical_item_id === ing.canonical_item_id);
          if (!pantryItem?.purchase_date) return false;

          const purchaseDate = normalizeDate(pantryItem.purchase_date);
          const daysSincePurchase = Math.floor(
            (today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          return daysSincePurchase >= 3;
        });

        if (usesOlderItem) {
          matchScore *= 1.15; // 15% boost (multiplicative)
          priorityReasons.push('uses_older_ingredient');
        }

        // Boost: Never cooked before
        if (!recentCookCardIds.includes(recipe.id)) {
          matchScore *= 1.05; // 5% boost (multiplicative)
          priorityReasons.push('never_cooked');
        }

        // Penalty: Cooked recently (prevent repetition)
        // Check both: top 5 recent meals OR cooked in last 7 days
        const sevenDaysAgo = today.getTime() - 7 * 24 * 60 * 60 * 1000;
        const cookedInTopFive = recentCookCardIds.slice(0, 5).includes(recipe.id);
        const cookedInLastWeek = recentMeals?.some(m =>
          m.cook_card_id === recipe.id &&
          new Date(m.cooked_at).getTime() > sevenDaysAgo
        ) || false;
        const cookedRecently = cookedInTopFive || cookedInLastWeek;

        if (cookedRecently) {
          matchScore *= 0.5; // 50% penalty (multiplicative)
          priorityReasons.push('cooked_recently');
        }

        // Boost: Highly rated (from meal history)
        const userRating = ratingMap.get(recipe.id);
        if (userRating && userRating >= 4) {
          matchScore *= 1.2; // 20% boost (multiplicative)
          priorityReasons.push('highly_rated');
        } else if (userRating && userRating <= 2) {
          matchScore *= 0.7; // 30% penalty (multiplicative)
          priorityReasons.push('rated_low');
        }

        // High match bonus
        if (completeness >= 0.9) {
          priorityReasons.push('high_match');
        }

        return {
          cook_card: recipe,
          match_score: Math.max(0, Math.min(1, matchScore)), // Clamp 0-1
          completeness,
          missing_ingredients: missingIngredients,
          have_ingredients: haveIngredients,
          priority_reasons: priorityReasons,
        };
      })
      .filter((item): item is RecipeRecommendation => item !== null);

    // 5. Sort by match score and return top N
    const sorted = scored.sort((a, b) => b.match_score - a.match_score);
    const topN = sorted.slice(0, limit);

    console.log('✅ Returning', topN.length, 'recommendations');
    if (topN.length > 0) {
      console.log('🏆 Top recommendation:', {
        title: topN[0].cook_card.title,
        match_score: topN[0].match_score.toFixed(2),
        completeness: (topN[0].completeness * 100).toFixed(0) + '%',
        reasons: topN[0].priority_reasons,
      });
    }

    return topN;
  } catch (error) {
    console.error('❌ Error in getPersonalizedRecommendations:', error);
    return [];
  }
}

/**
 * Get hybrid recommendations (blend personalized + YouTube discovery)
 *
 * Ratio changes based on collection size:
 * - 0-10 recipes: Mostly discovery (2 personalized, 8 YouTube)
 * - 10-50 recipes: Balanced (5 personalized, 5 YouTube)
 * - 50+ recipes: Mostly personalized (8 personalized, 2 YouTube)
 */
export async function getHybridRecommendations(
  userId: string,
  householdId: string
): Promise<HybridRecommendation[]> {
  try {
    console.log('🔀 Getting hybrid recommendations');

    // 1. Get user's recipe collection size
    const { count: recipeCount, error: countError } = await supabase
      .from('cook_cards')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_archived', false);

    if (countError) {
      console.error('Error counting recipes:', countError);
    }

    const totalRecipes = recipeCount || 0;
    console.log('📚 User has', totalRecipes, 'saved recipes');

    // 2. Determine blend ratio based on collection size
    let personalizedCount: number;
    let youtubeCount: number;

    if (totalRecipes < 10) {
      // New user: Mostly discovery, some personalized
      personalizedCount = 2;
      youtubeCount = 8;
    } else if (totalRecipes < 50) {
      // Building collection: Balanced
      personalizedCount = 5;
      youtubeCount = 5;
    } else {
      // Established collection: Mostly personalized
      personalizedCount = 8;
      youtubeCount = 2;
    }

    console.log('📊 Blend ratio:', personalizedCount, 'personalized +', youtubeCount, 'YouTube');

    // 3. Get personalized recommendations
    const personalized = totalRecipes > 0
      ? await getPersonalizedRecommendations(userId, householdId, personalizedCount)
      : [];

    console.log('✅ Got', personalized.length, 'personalized recommendations');

    // 4. Get YouTube discovery (using existing edge function)
    let youtube: any[] = [];
    try {
      const { data: youtubeData, error: youtubeError } = await supabase.functions.invoke(
        'search-recipes-by-pantry',
        {
          body: {
            household_id: householdId,
            min_match_percent: 30, // Lower threshold for discovery
            max_missing: 10,
            limit: youtubeCount,
          },
        }
      );

      if (youtubeError) {
        console.warn('Error fetching YouTube recommendations:', youtubeError);
      } else if (youtubeData?.success && youtubeData.recipes) {
        youtube = youtubeData.recipes;
        console.log('✅ Got', youtube.length, 'YouTube recommendations');
      }
    } catch (error) {
      console.warn('Failed to fetch YouTube recommendations:', error);
    }

    // 5. Interleave results (alternate between personalized and YouTube)
    const hybrid: HybridRecommendation[] = [];
    const maxLength = Math.max(personalized.length, youtube.length);

    for (let i = 0; i < maxLength; i++) {
      if (i < personalized.length) {
        hybrid.push({ type: 'personalized', recommendation: personalized[i] });
      }
      if (i < youtube.length) {
        hybrid.push({ type: 'youtube', recommendation: youtube[i] });
      }
    }

    console.log('🔀 Final hybrid:', hybrid.length, 'total recommendations');
    return hybrid.slice(0, 10); // Return top 10
  } catch (error) {
    console.error('❌ Error in getHybridRecommendations:', error);
    return [];
  }
}

export interface HybridRecommendation {
  type: 'personalized' | 'youtube';
  recommendation: RecipeRecommendation | any; // YouTube recipe from edge function
}
