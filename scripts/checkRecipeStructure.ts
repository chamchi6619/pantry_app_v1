import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkRecipeStructure() {
  console.log('🔍 Checking Recipe Data Structure\n');

  // 1. Get a recipe from Edge Function (what app receives)
  console.log('1️⃣ Edge Function Response:');
  const { data: edgeData } = await supabase.functions.invoke('search-recipes-by-pantry', {
    body: {
      household_id: 'aeefe34a-a1b7-494e-97cc-b7418a314aee',
      min_match_percent: 5,
      max_missing: 25,
      limit: 1,
    },
  });

  if (edgeData?.recipes && edgeData.recipes.length > 0) {
    const recipe = edgeData.recipes[0];
    console.log('Recipe ID:', recipe.recipe_id);
    console.log('Recipe Title:', recipe.title);
    console.log('Has ingredients array?', Array.isArray(recipe.ingredients));
    console.log('Keys:', Object.keys(recipe));
  }

  // 2. Get same recipe with ingredients from database
  const recipeId = edgeData?.recipes[0]?.recipe_id;
  if (recipeId) {
    console.log('\n2️⃣ Direct Database Query:');
    const { data: dbRecipe } = await supabase
      .from('recipes')
      .select('*, recipe_ingredients(*)')
      .eq('id', recipeId)
      .single();

    console.log('Recipe ID:', dbRecipe?.id);
    console.log('Recipe Title:', dbRecipe?.title);
    console.log('Has ingredients?', dbRecipe?.recipe_ingredients?.length);
    console.log('First ingredient:', dbRecipe?.recipe_ingredients?.[0]);
  }
}

checkRecipeStructure().catch(console.error);
