/**
 * Database Types for v5.2 RuleChef Recipes
 * Mirror Supabase schema exactly
 */

export interface DatabaseRecipe {
  id: string;
  slug: string;
  title: string; // NOT name (app uses 'name')
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  instructions: string; // text format
  instructions_json: Array<{
    step: number;
    instruction: string;
    timing?: string;
    temperature?: string;
    _tags?: {
      adds?: string[];
      cooks?: string[];
      temps?: string[];
    };
  }>;
  prep_time_minutes: number;
  cook_time_minutes: number;
  total_time_minutes: number;
  servings: number;
  cuisine: string[] | null;
  meal_type: string[] | null;
  course: string[] | null;
  dietary_tags: string[] | null;
  source: string;
  author: string;
  is_public: boolean;
  created_at: string;
  updated_at?: string;
}

export interface DatabaseRecipeIngredient {
  id: string;
  recipe_id: string;
  ingredient_name: string;
  normalized_name: string;
  amount?: string;
  unit?: string;
  sort_order: number;
  is_optional: boolean;
}

export interface DatabaseRecipeWithIngredients extends DatabaseRecipe {
  ingredients: DatabaseRecipeIngredient[];
}
