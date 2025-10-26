/**
 * Pantry Match Service
 *
 * Purpose: Calculate how well a cook card's ingredients match what's in the user's pantry
 * Algorithm: exact_matches × 1.0 + strong_subs × 0.8 + weak_subs × 0.4 / total_ingredients
 *
 * Used by: Meal planning, recipe browser sorting, recipe recommendations
 */

import { supabase } from '../lib/supabase';

export interface PantryMatchResult {
  matchPercent: number;
  exactMatches: string[]; // Ingredient names that exactly match
  strongSubstitutions: Array<{ // Bidirectional substitutions (ratio close to 1.0)
    from: string;
    to: string;
    reason: string;
    ratio: number;
  }>;
  weakSubstitutions: Array<{ // One-way or ratio-adjusted substitutions
    from: string;
    to: string;
    reason: string;
    ratio: number;
  }>;
  missingIngredients: string[]; // Ingredients with no pantry match or substitute
  totalIngredients: number;
}

interface CookCardIngredient {
  id: string;
  ingredient_name: string;
  canonical_item_id?: string;
  amount?: number;
  unit?: string;
}

interface PantryItem {
  id: string;
  name: string;
  canonical_item_id?: string;
  quantity: number;
  unit: string;
}

interface SubstitutionRule {
  id: string;
  canonical_item_a: string;
  canonical_item_b: string;
  rationale: string;
  ratio: number;
  bidirectional: boolean;
}

/**
 * Calculate pantry match for a single cook card
 *
 * @param cookCardId - Cook card ID
 * @param householdId - Household ID
 * @returns Detailed pantry match result
 */
export async function calculatePantryMatch(
  cookCardId: string,
  householdId: string
): Promise<PantryMatchResult> {
  try {
    // 1. Fetch cook card ingredients (with canonical_item_id for normalization)
    const { data: ingredients, error: ingredientsError } = await supabase
      .from('cook_card_ingredients')
      .select(`
        id,
        ingredient_name,
        canonical_item_id,
        amount,
        unit
      `)
      .eq('cook_card_id', cookCardId);

    if (ingredientsError) throw ingredientsError;
    if (!ingredients || ingredients.length === 0) {
      return {
        matchPercent: 0,
        exactMatches: [],
        strongSubstitutions: [],
        weakSubstitutions: [],
        missingIngredients: [],
        totalIngredients: 0,
      };
    }

    // 2. Fetch pantry items for household (with canonical_item_id)
    const { data: pantryItems, error: pantryError } = await supabase
      .from('pantry_items')
      .select(`
        id,
        name,
        canonical_item_id,
        quantity,
        unit
      `)
      .eq('household_id', householdId)
      .eq('status', 'active');

    if (pantryError) throw pantryError;

    // Create a map of canonical_item_id -> pantry item for fast lookup
    const pantryMap = new Map<string, PantryItem>();
    (pantryItems || []).forEach(item => {
      if (item.canonical_item_id) {
        pantryMap.set(item.canonical_item_id, item as PantryItem);
      }
    });

    // 3. Fetch substitution rules (all at once for performance)
    const { data: substitutionRules, error: subError } = await supabase
      .from('substitution_rules')
      .select('*');

    if (subError) throw subError;

    // Build substitution lookup: canonical_item_id -> possible substitutes
    const substitutionMap = new Map<string, SubstitutionRule[]>();
    (substitutionRules || []).forEach(rule => {
      // Forward direction (A -> B)
      if (!substitutionMap.has(rule.canonical_item_a)) {
        substitutionMap.set(rule.canonical_item_a, []);
      }
      substitutionMap.get(rule.canonical_item_a)!.push(rule);

      // Reverse direction if bidirectional (B -> A)
      if (rule.bidirectional) {
        if (!substitutionMap.has(rule.canonical_item_b)) {
          substitutionMap.set(rule.canonical_item_b, []);
        }
        substitutionMap.get(rule.canonical_item_b)!.push({
          ...rule,
          canonical_item_a: rule.canonical_item_b,
          canonical_item_b: rule.canonical_item_a,
        });
      }
    });

    // 4. Match each ingredient to pantry
    const exactMatches: string[] = [];
    const strongSubstitutions: PantryMatchResult['strongSubstitutions'] = [];
    const weakSubstitutions: PantryMatchResult['weakSubstitutions'] = [];
    const missingIngredients: string[] = [];

    for (const ingredient of ingredients) {
      let matched = false;

      // Try exact match first
      if (ingredient.canonical_item_id && pantryMap.has(ingredient.canonical_item_id)) {
        exactMatches.push(ingredient.ingredient_name);
        matched = true;
        continue;
      }

      // Try substitutions
      if (ingredient.canonical_item_id && substitutionMap.has(ingredient.canonical_item_id)) {
        const possibleSubs = substitutionMap.get(ingredient.canonical_item_id)!;

        for (const sub of possibleSubs) {
          const targetCanonicalId = sub.canonical_item_b;

          if (pantryMap.has(targetCanonicalId)) {
            const pantryItem = pantryMap.get(targetCanonicalId)!;

            // Classify as strong (bidirectional + ratio close to 1.0) or weak
            const isStrong = sub.bidirectional && sub.ratio >= 0.75 && sub.ratio <= 1.25;

            if (isStrong) {
              strongSubstitutions.push({
                from: ingredient.ingredient_name,
                to: pantryItem.name,
                reason: sub.rationale,
                ratio: sub.ratio,
              });
            } else {
              weakSubstitutions.push({
                from: ingredient.ingredient_name,
                to: pantryItem.name,
                reason: sub.rationale,
                ratio: sub.ratio,
              });
            }

            matched = true;
            break; // Only use first available substitute
          }
        }
      }

      if (!matched) {
        missingIngredients.push(ingredient.ingredient_name);
      }
    }

    // 5. Calculate weighted score
    const totalIngredients = ingredients.length;
    const score = (
      (exactMatches.length * 1.0) +
      (strongSubstitutions.length * 0.8) +
      (weakSubstitutions.length * 0.4)
    ) / totalIngredients;

    const matchPercent = Math.round(score * 100);

    return {
      matchPercent,
      exactMatches,
      strongSubstitutions,
      weakSubstitutions,
      missingIngredients,
      totalIngredients,
    };
  } catch (error) {
    console.error('Error calculating pantry match:', error);
    throw error;
  }
}

/**
 * Batch calculate pantry match for multiple cook cards
 * More efficient than calling calculatePantryMatch multiple times
 *
 * @param cookCardIds - Array of cook card IDs
 * @param householdId - Household ID
 * @returns Map of cookCardId -> PantryMatchResult
 */
export async function batchCalculatePantryMatch(
  cookCardIds: string[],
  householdId: string
): Promise<Map<string, PantryMatchResult>> {
  const results = new Map<string, PantryMatchResult>();

  // For MVP: just call calculatePantryMatch sequentially
  // Future optimization: fetch all ingredients at once, then process
  for (const cookCardId of cookCardIds) {
    try {
      const result = await calculatePantryMatch(cookCardId, householdId);
      results.set(cookCardId, result);
    } catch (error) {
      console.error(`Error calculating match for ${cookCardId}:`, error);
      // Set default result on error
      results.set(cookCardId, {
        matchPercent: 0,
        exactMatches: [],
        strongSubstitutions: [],
        weakSubstitutions: [],
        missingIngredients: [],
        totalIngredients: 0,
      });
    }
  }

  return results;
}

/**
 * Get missing ingredients count (for quick badge display)
 *
 * @param cookCardId - Cook card ID
 * @param householdId - Household ID
 * @returns Count of missing ingredients
 */
export async function getMissingIngredientsCount(
  cookCardId: string,
  householdId: string
): Promise<number> {
  const result = await calculatePantryMatch(cookCardId, householdId);
  return result.missingIngredients.length;
}

/**
 * Check if user has sufficient pantry items for a recipe
 * (Useful for "Can I cook this now?" feature)
 *
 * @param cookCardId - Cook card ID
 * @param householdId - Household ID
 * @param threshold - Match percentage threshold (default 70%)
 * @returns True if pantry match >= threshold
 */
export async function canCookWithPantry(
  cookCardId: string,
  householdId: string,
  threshold: number = 70
): Promise<boolean> {
  const result = await calculatePantryMatch(cookCardId, householdId);
  return result.matchPercent >= threshold;
}
