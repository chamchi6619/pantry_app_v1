/**
 * Recipe Ranking Service
 *
 * Purpose: Add freshness and diversity to recipe recommendations
 * Features:
 *  - Hourly seeded shuffle (60% freshness factor for variety)
 *  - Recency decay (demote recently viewed, not eliminate)
 *  - Enhanced category generation
 *
 * Design Philosophy:
 *  - Netflix/Spotify-style content rotation
 *  - Same hour = same order (consistent, cacheable)
 *  - Different hour = different shuffle (more variety!)
 *  - Recency penalty, not filtering (you can remake favorites)
 */

import type { RecipeDatabaseItem } from './recipeDatabaseService';

const FRESHNESS_FACTOR = 0.6; // 60% random variation in scores (more variety!)
const RECENCY_PENALTY_MAX = 0.5; // Up to 50% score penalty for recently viewed
const RECENCY_DECAY_DAYS = 10; // Full score returns after 10 days (faster rotation)

/**
 * Seeded random number generator (for deterministic shuffles)
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Get hourly seed (changes every hour for more variety)
 * Format: YYYYDDDHHH (year + dayOfYear + hour)
 *
 * This provides more freshness while still being deterministic:
 * - Same hour = same order (consistent for 1 hour)
 * - Different hour = different shuffle
 * - More variety throughout the day
 */
function getHourlySeed(): number {
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
  );
  const hour = now.getHours();
  return now.getFullYear() * 10000 + dayOfYear * 100 + hour;
}

/**
 * Apply hourly shuffle to recipe scores
 *
 * @param recipes - Recipes with pantry_match_percent
 * @param viewHistory - Map of recipe_id → days since last view
 * @returns Recipes with adjusted scores, sorted by final score
 */
export function rankRecipesWithFreshness(
  recipes: RecipeDatabaseItem[],
  viewHistory: Map<string, number> = new Map()
): RecipeDatabaseItem[] {
  const seed = getHourlySeed();
  const random = seededRandom(seed);

  console.log(`[Ranking] Using hourly seed: ${seed} (changes every hour)`);

  // Calculate final scores for each recipe
  const scored = recipes.map(recipe => {
    // Base score from pantry match (0-100)
    const baseScore = recipe.pantry_match_percent || 0;

    // Hourly random variation (±60% of base score for more variety)
    const randomFactor = 1 + (random() - 0.5) * 2 * FRESHNESS_FACTOR;
    const shuffledScore = baseScore * randomFactor;

    // Recency penalty (if recently viewed)
    // Note: Use explicit undefined check to handle daysSinceView = 0 (viewed today)
    const daysSinceView = viewHistory.has(recipe.id) ? viewHistory.get(recipe.id)! : 999;
    const recencyPenalty = Math.max(0, 1 - (daysSinceView / RECENCY_DECAY_DAYS));
    const recencyMultiplier = 1 - (RECENCY_PENALTY_MAX * recencyPenalty);

    // Final score
    const finalScore = shuffledScore * recencyMultiplier;

    // Debug logging for recipes with significant changes
    if (Math.abs(finalScore - baseScore) > 10) {
      console.log(`[Ranking] ${recipe.title}: ${baseScore.toFixed(0)}% → ${finalScore.toFixed(0)}% (random: ${randomFactor.toFixed(2)}x, recency: ${recencyMultiplier.toFixed(2)}x)`);
    }

    return {
      ...recipe,
      _finalScore: finalScore,
      _baseScore: baseScore,
      _recencyPenalty: recencyPenalty,
    };
  });

  // Sort by final score (highest first)
  scored.sort((a, b) => (b._finalScore || 0) - (a._finalScore || 0));

  // Log top 5 for debugging
  console.log('[Ranking] Top 5 after ranking:');
  scored.slice(0, 5).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.title} (${r._finalScore?.toFixed(0)}%)`);
  });

  return scored;
}

/**
 * Generate enhanced categories from ranked recipes
 *
 * Categories:
 *  - Best Match: Top pantry matches (with daily shuffle)
 *  - Quick & Easy: <30 min, high match
 *  - Just Need 1 Thing: Only 1 ingredient missing
 *  - Meal Prep: Serves 4+, good for leftovers
 */
export function generateEnhancedCategories(
  allRecipes: RecipeDatabaseItem[],
  viewHistory: Map<string, number> = new Map()
): {
  'Best Match': RecipeDatabaseItem[];
  'Quick & Easy': RecipeDatabaseItem[];
  'Just Need 1 Thing': RecipeDatabaseItem[];
  'Meal Prep': RecipeDatabaseItem[];
} {
  console.log('[Categories] Generating enhanced categories from', allRecipes.length, 'recipes');

  // Apply ranking to all recipes
  const ranked = rankRecipesWithFreshness(allRecipes, viewHistory);

  // Best Match: Top 10 overall (with hourly shuffle applied)
  const bestMatch = ranked.slice(0, 10);

  // Quick & Easy: <30 min + high match
  const quickAndEasy = ranked
    .filter(r =>
      (r.total_time_minutes || 0) <= 30 &&
      (r.pantry_match_percent || 0) >= 40
    )
    .slice(0, 10);

  // Just Need 1 Thing: Exactly 1 ingredient missing
  const justNeedOne = ranked
    .filter(r => r.missing_ingredients_count === 1)
    .slice(0, 10);

  // Meal Prep: Serves 4+, sorted by pantry match
  const mealPrep = ranked
    .filter(r => (r.servings || 0) >= 4)
    .slice(0, 10);

  console.log('[Categories] Generated:');
  console.log(`  Best Match: ${bestMatch.length} recipes`);
  console.log(`  Quick & Easy: ${quickAndEasy.length} recipes`);
  console.log(`  Just Need 1 Thing: ${justNeedOne.length} recipes`);
  console.log(`  Meal Prep: ${mealPrep.length} recipes`);

  return {
    'Best Match': bestMatch,
    'Quick & Easy': quickAndEasy,
    'Just Need 1 Thing': justNeedOne,
    'Meal Prep': mealPrep,
  };
}

/**
 * Apply ranking to a single category's recipes
 * (Used when loading categories progressively)
 */
export function rankCategoryRecipes(
  recipes: RecipeDatabaseItem[],
  viewHistory: Map<string, number> = new Map()
): RecipeDatabaseItem[] {
  return rankRecipesWithFreshness(recipes, viewHistory);
}
