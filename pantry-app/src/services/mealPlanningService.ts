/**
 * Meal Planning Service
 *
 * Purpose: CRUD operations for meal plans and planned meals
 * Used by: MealPlanningScreen, RecipeBrowserModal, AI meal generation
 */

import { supabase } from '../lib/supabase';
import { calculatePantryMatch, type PantryMatchResult } from './pantryMatchService';

export interface MealPlan {
  id: string;
  user_id: string;
  household_id: string;
  title: string;
  week_start_date: string; // ISO date string
  week_end_date: string;
  generated_by: 'manual' | 'ai';
  generation_cost_cents?: number;
  ai_model?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlannedMeal {
  id: string;
  meal_plan_id: string;
  cook_card_id?: string; // Optional - can be null for text-only meals
  meal_title?: string; // For lightweight planning without cook_card
  source_url?: string; // Optional recipe URL reference
  is_extracted: boolean; // TRUE if cook_card exists, FALSE if text-only
  planned_date: string; // ISO date string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  pantry_match_percent?: number;
  missing_ingredients_count?: number;
  substitutions_applied?: Array<{from: string; to: string; reason: string}>;
  is_locked: boolean;
  user_notes?: string;
  status: 'planned' | 'cooking' | 'cooked' | 'skipped';
  cooked_at?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  cook_card?: any;
}

export interface CreateMealPlanInput {
  user_id: string;
  household_id: string;
  title?: string;
  week_start_date: string;
  generated_by?: 'manual' | 'ai';
}

export interface AddMealToPlanInput {
  meal_plan_id: string;
  cook_card_id?: string; // Optional - for text-only meals
  meal_title?: string; // Required if cook_card_id is not provided
  source_url?: string; // Optional recipe URL
  planned_date: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

/**
 * Get week's date range (Monday to Sunday) with optional offset
 * @param weekOffset - Number of weeks from current week (0 = current, 1 = next, -1 = previous)
 */
export function getCurrentWeekRange(weekOffset: number = 0): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust so Monday is start

  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + (weekOffset * 7)); // Apply week offset
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
}

/**
 * Create a new meal plan
 */
export async function createMealPlan(input: CreateMealPlanInput): Promise<MealPlan> {
  const weekRange = input.week_start_date ? {
    start: input.week_start_date,
    end: new Date(new Date(input.week_start_date).getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  } : getCurrentWeekRange();

  const { data, error } = await supabase
    .from('meal_plans')
    .insert({
      user_id: input.user_id,
      household_id: input.household_id,
      title: input.title || 'Meal Plan',
      week_start_date: weekRange.start,
      week_end_date: weekRange.end,
      generated_by: input.generated_by || 'manual',
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get meal plan by ID
 */
export async function getMealPlan(planId: string): Promise<MealPlan | null> {
  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return data;
}

/**
 * Get active meal plan for current week
 */
export async function getActiveMealPlan(householdId: string): Promise<MealPlan | null> {
  const { start } = getCurrentWeekRange();

  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('household_id', householdId)
    .eq('week_start_date', start)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return data;
}

/**
 * Get or create active meal plan for a specific week
 * @param weekOffset - Number of weeks from current week
 */
export async function getOrCreateActiveMealPlan(
  userId: string,
  householdId: string,
  weekOffset: number = 0
): Promise<MealPlan> {
  const weekRange = getCurrentWeekRange(weekOffset);

  // Try to find existing plan for this week
  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('household_id', householdId)
    .eq('week_start_date', weekRange.start)
    .eq('is_active', true)
    .single();

  // If plan exists, return it
  if (data && !error) return data;

  // If error is not "not found", throw it
  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching meal plan:', error);
    throw error;
  }

  // Create new plan if none exists (error code PGRST116 or no data)
  console.log(`Creating new meal plan for week ${weekRange.start} (offset: ${weekOffset})`);

  const weekTitle = weekOffset === 0 ? 'This Week' :
                    weekOffset === 1 ? 'Next Week' :
                    weekOffset === -1 ? 'Last Week' :
                    `Week ${weekRange.start}`;

  return await createMealPlan({
    user_id: userId,
    household_id: householdId,
    title: weekTitle,
    week_start_date: weekRange.start,
    generated_by: 'manual',
  });
}

/**
 * Update meal plan
 */
export async function updateMealPlan(
  planId: string,
  updates: Partial<Pick<MealPlan, 'title' | 'is_active'>>
): Promise<void> {
  const { error } = await supabase
    .from('meal_plans')
    .update(updates)
    .eq('id', planId);

  if (error) throw error;
}

/**
 * Delete meal plan (and all associated planned meals via CASCADE)
 */
export async function deleteMealPlan(planId: string): Promise<void> {
  const { error } = await supabase
    .from('meal_plans')
    .delete()
    .eq('id', planId);

  if (error) throw error;
}

/**
 * Add a meal to a plan (supports both text-only and extracted meals)
 */
export async function addMealToPlan(
  input: AddMealToPlanInput,
  householdId: string
): Promise<PlannedMeal> {
  // Validate: must have either cook_card_id OR meal_title
  if (!input.cook_card_id && !input.meal_title) {
    throw new Error('Must provide either cook_card_id or meal_title');
  }

  let pantryMatch: PantryMatchResult | null = null;
  let mealTitle = input.meal_title;

  // If cook_card_id provided, calculate pantry match and get title
  if (input.cook_card_id) {
    pantryMatch = await calculatePantryMatch(input.cook_card_id, householdId);

    // Get cook_card title if meal_title not provided
    if (!mealTitle) {
      const { data: cookCard } = await supabase
        .from('cook_cards')
        .select('title')
        .eq('id', input.cook_card_id)
        .single();

      mealTitle = cookCard?.title || 'Untitled Meal';
    }
  }

  const { data, error } = await supabase
    .from('planned_meals')
    .insert({
      meal_plan_id: input.meal_plan_id,
      cook_card_id: input.cook_card_id || null,
      meal_title: mealTitle,
      source_url: input.source_url || null,
      is_extracted: !!input.cook_card_id,
      planned_date: input.planned_date,
      meal_type: input.meal_type,
      pantry_match_percent: pantryMatch?.matchPercent || null,
      missing_ingredients_count: pantryMatch?.missingIngredients.length || 0,
      substitutions_applied: pantryMatch ? [
        ...pantryMatch.strongSubstitutions,
        ...pantryMatch.weakSubstitutions,
      ] : [],
      status: 'planned',
      is_locked: false,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Add a text-only meal to plan (lightweight planning without extraction)
 * This is a convenience wrapper for addMealToPlan with clearer semantics
 */
export async function addTextOnlyMealToPlan(
  mealPlanId: string,
  mealTitle: string,
  plannedDate: string,
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack',
  sourceUrl?: string
): Promise<PlannedMeal> {
  const { data, error } = await supabase
    .from('planned_meals')
    .insert({
      meal_plan_id: mealPlanId,
      meal_title: mealTitle,
      source_url: sourceUrl || null,
      is_extracted: false,
      planned_date: plannedDate,
      meal_type: mealType,
      status: 'planned',
      is_locked: false,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Link a text-only meal to a cook_card after extraction
 */
export async function linkMealToCookCard(
  mealId: string,
  cookCardId: string,
  householdId: string
): Promise<void> {
  // Calculate pantry match for the newly linked cook_card
  const pantryMatch = await calculatePantryMatch(cookCardId, householdId);

  const { error } = await supabase
    .from('planned_meals')
    .update({
      cook_card_id: cookCardId,
      is_extracted: true,
      pantry_match_percent: pantryMatch.matchPercent,
      missing_ingredients_count: pantryMatch.missingIngredients.length,
      substitutions_applied: [
        ...pantryMatch.strongSubstitutions,
        ...pantryMatch.weakSubstitutions,
      ],
    })
    .eq('id', mealId);

  if (error) throw error;
}

/**
 * Get all planned meals for a meal plan
 */
export async function getMealsForPlan(planId: string): Promise<PlannedMeal[]> {
  const { data, error } = await supabase
    .from('planned_meals')
    .select(`
      *,
      cook_card:cook_cards(
        id,
        title,
        image_url,
        cook_time_minutes,
        total_time_minutes,
        servings,
        source_url
      )
    `)
    .eq('meal_plan_id', planId)
    .order('planned_date', { ascending: true })
    .order('meal_type', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Update a planned meal
 */
export async function updatePlannedMeal(
  mealId: string,
  updates: Partial<Pick<PlannedMeal, 'is_locked' | 'user_notes' | 'status' | 'planned_date' | 'meal_type'>>
): Promise<void> {
  const { error } = await supabase
    .from('planned_meals')
    .update(updates)
    .eq('id', mealId);

  if (error) throw error;
}

/**
 * Remove a meal from plan
 */
export async function removeMealFromPlan(mealId: string): Promise<void> {
  const { error } = await supabase
    .from('planned_meals')
    .delete()
    .eq('id', mealId);

  if (error) throw error;
}

/**
 * Mark a meal as cooked
 * Note: Only adds to meal_history if meal has a cook_card_id (text-only meals are skipped)
 */
export async function markMealAsCooked(mealId: string): Promise<void> {
  const { error } = await supabase
    .from('planned_meals')
    .update({
      status: 'cooked',
      cooked_at: new Date().toISOString(),
    })
    .eq('id', mealId);

  if (error) throw error;

  // Also update meal_history table for tracking (only for extracted meals)
  const { data: meal } = await supabase
    .from('planned_meals')
    .select('cook_card_id, meal_plan_id')
    .eq('id', mealId)
    .single();

  // Skip meal_history if no cook_card_id (text-only meal)
  if (meal && meal.cook_card_id) {
    const { data: plan } = await supabase
      .from('meal_plans')
      .select('user_id, household_id')
      .eq('id', meal.meal_plan_id)
      .single();

    if (plan) {
      await supabase.from('meal_history').insert({
        user_id: plan.user_id,
        household_id: plan.household_id,
        cook_card_id: meal.cook_card_id,
        cooked_at: new Date().toISOString(),
      });
    }
  }
}

/**
 * Lock/unlock a meal (for AI regeneration feature)
 */
export async function toggleMealLock(mealId: string, isLocked: boolean): Promise<void> {
  await updatePlannedMeal(mealId, { is_locked: isLocked });
}

/**
 * Get meals for a specific date
 */
export async function getMealsForDate(
  planId: string,
  date: string
): Promise<PlannedMeal[]> {
  const { data, error } = await supabase
    .from('planned_meals')
    .select(`
      *,
      cook_card:cook_cards(
        id,
        title,
        image_url,
        cook_time_minutes,
        total_time_minutes,
        servings
      )
    `)
    .eq('meal_plan_id', planId)
    .eq('planned_date', date)
    .order('meal_type', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Recalculate pantry match for all meals in a plan
 * (Useful after user adds new pantry items)
 * Skips text-only meals (those without cook_card_id)
 */
export async function recalculatePantryMatches(
  planId: string,
  householdId: string
): Promise<void> {
  const meals = await getMealsForPlan(planId);

  for (const meal of meals) {
    // Skip text-only meals (no cook_card_id)
    if (!meal.cook_card_id) continue;

    const pantryMatch = await calculatePantryMatch(meal.cook_card_id, householdId);

    await supabase
      .from('planned_meals')
      .update({
        pantry_match_percent: pantryMatch.matchPercent,
        missing_ingredients_count: pantryMatch.missingIngredients.length,
        substitutions_applied: [
          ...pantryMatch.strongSubstitutions,
          ...pantryMatch.weakSubstitutions,
        ],
      })
      .eq('id', meal.id);
  }
}

/**
 * Get summary of meal plan
 * Note: pantry match stats only include extracted meals (text-only meals don't have pantry match)
 */
export async function getMealPlanSummary(planId: string): Promise<{
  totalMeals: number;
  extractedMeals: number;
  textOnlyMeals: number;
  cookedMeals: number;
  plannedMeals: number;
  skippedMeals: number;
  avgPantryMatch: number;
  totalMissingIngredients: number;
}> {
  const meals = await getMealsForPlan(planId);

  const extractedMeals = meals.filter(m => m.is_extracted).length;
  const textOnlyMeals = meals.filter(m => !m.is_extracted).length;
  const cookedMeals = meals.filter(m => m.status === 'cooked').length;
  const plannedMeals = meals.filter(m => m.status === 'planned').length;
  const skippedMeals = meals.filter(m => m.status === 'skipped').length;

  // Calculate average pantry match only for extracted meals
  const extractedMealsWithMatch = meals.filter(m => m.is_extracted && m.pantry_match_percent !== null);
  const avgPantryMatch = extractedMealsWithMatch.length > 0
    ? extractedMealsWithMatch.reduce((sum, m) => sum + (m.pantry_match_percent || 0), 0) / extractedMealsWithMatch.length
    : 0;

  const totalMissingIngredients = meals.reduce(
    (sum, m) => sum + (m.missing_ingredients_count || 0),
    0
  );

  return {
    totalMeals: meals.length,
    extractedMeals,
    textOnlyMeals,
    cookedMeals,
    plannedMeals,
    skippedMeals,
    avgPantryMatch: Math.round(avgPantryMatch),
    totalMissingIngredients,
  };
}
