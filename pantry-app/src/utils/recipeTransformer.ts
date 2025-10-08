/**
 * Recipe Transformer
 * Transforms v5.2 database recipes to app format
 */

import { Recipe, RecipeIngredient } from '../features/recipes/types';
import { DatabaseRecipeWithIngredients, DatabaseRecipeIngredient } from '../types/database';

/**
 * Transform database ingredient to app format
 */
function transformIngredient(dbIng: DatabaseRecipeIngredient): RecipeIngredient {
  // Reconstruct display text: "2 tbsp olive oil"
  const parts = [dbIng.amount, dbIng.unit, dbIng.ingredient_name].filter(Boolean);
  const recipeText = parts.join(' ');

  // Parse quantity as number or null
  const quantity = dbIng.amount ? parseFloat(dbIng.amount) : null;

  return {
    id: dbIng.id,
    recipeText,
    parsed: {
      quantity,
      unit: dbIng.unit || null,
      ingredient: dbIng.ingredient_name,
      preparation: dbIng.preparation || undefined,
      original: recipeText,
      confidence: 1.0 // v5.2 recipes are verified, high confidence
    },
    canonicalId: dbIng.canonical_item_id || undefined,
    requiredQuantity: quantity,
    requiredUnit: dbIng.unit || null
  };
}

/**
 * Smart category mapping with priority-based logic
 */
function mapToAppCategory(dbRecipe: DatabaseRecipeWithIngredients): string {
  // Priority 1: Desserts (most specific)
  if (dbRecipe.course?.includes('dessert')) return 'dessert';

  // Priority 2: Meal times (user-driven)
  if (dbRecipe.meal_type?.includes('breakfast')) return 'breakfast';
  if (dbRecipe.meal_type?.includes('lunch')) return 'lunch';
  if (dbRecipe.meal_type?.includes('dinner')) return 'dinner';

  // Priority 3: Speed (practical)
  if (dbRecipe.total_time_minutes <= 30) return 'quick';

  // Priority 4: Health (dietary)
  const healthyTags = ['vegan', 'vegetarian', 'low-calorie', 'gluten-free'];
  if (dbRecipe.dietary_tags?.some(tag => healthyTags.includes(tag.toLowerCase()))) {
    return 'healthy';
  }

  // Default: Comfort
  return 'comfort';
}

/**
 * Get cuisine-based image placeholder
 */
function getRecipeImage(dbRecipe: DatabaseRecipeWithIngredients): string {
  const cuisine = dbRecipe.cuisine?.[0] || 'food';
  const query = cuisine.toLowerCase().replace(/\s+/g, ',');
  return `https://source.unsplash.com/400x300/?${query},food`;
}

/**
 * Transform v5.2 database recipe to app format
 */
export function transformDatabaseRecipe(dbRecipe: DatabaseRecipeWithIngredients): Recipe {
  console.log('🔄 Transforming recipe:', dbRecipe.title);
  console.log('  - DB ingredients count:', dbRecipe.ingredients?.length || 0);

  const transformedIngredients = (dbRecipe.ingredients || [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(transformIngredient);

  console.log('  - Transformed ingredients count:', transformedIngredients.length);
  if (transformedIngredients.length > 0) {
    console.log('  - First ingredient:', transformedIngredients[0]);
  }

  return {
    id: dbRecipe.id,
    name: dbRecipe.title, // KEY: title → name
    category: mapToAppCategory(dbRecipe),
    prepTime: dbRecipe.prep_time_minutes,
    cookTime: dbRecipe.cook_time_minutes,
    servings: dbRecipe.servings,
    difficulty: dbRecipe.difficulty,
    description: dbRecipe.description,

    // Parse instructions_json to string array
    instructions: dbRecipe.instructions_json.map(step => step.instruction),

    // Transform ingredients (sorted by sort_order)
    ingredients: transformedIngredients,

    // Combine tags from dietary_tags + course + cuisine
    tags: [
      ...(dbRecipe.dietary_tags || []),
      ...(dbRecipe.course || []),
      ...(dbRecipe.cuisine || [])
    ].filter((tag, index, arr) => arr.indexOf(tag) === index), // unique

    // Use cuisine-based image placeholder
    imageUrl: getRecipeImage(dbRecipe)
  };
}

/**
 * Transform array of database recipes
 */
export function transformDatabaseRecipes(dbRecipes: DatabaseRecipeWithIngredients[]): Recipe[] {
  return dbRecipes.map(transformDatabaseRecipe);
}
