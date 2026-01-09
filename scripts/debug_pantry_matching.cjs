/**
 * Debug script to trace pantry matching through the full flow
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugPantryMatching() {
  try {
    console.log('[Debug] Starting pantry matching debug...\n');

    // Get household
    const { data: households } = await supabase
      .from('household_members')
      .select('household_id')
      .limit(1);
    const householdId = households?.[0]?.household_id;
    console.log(`Household ID: ${householdId}\n`);

    // Step 1: Get pantry items
    const { data: pantryItems, error: pantryError } = await supabase
      .from('pantry_items')
      .select('id, name, canonical_item_id')
      .eq('household_id', householdId)
      .eq('status', 'active');

    if (pantryError) throw pantryError;

    console.log('STEP 1: Pantry Items');
    console.log(`  Found ${pantryItems?.length || 0} items`);
    const pantryMap = new Map();
    (pantryItems || []).forEach(item => {
      if (item.canonical_item_id) {
        pantryMap.set(item.canonical_item_id, item);
        console.log(`  - ${item.name} → ${item.canonical_item_id.substring(0, 8)}`);
      }
    });
    console.log('');

    // Step 2: Get "Aglio e Olio" recipe
    const { data: recipe } = await supabase
      .from('recipe_database')
      .select('id, title, category')
      .ilike('title', '%aglio%olio%')
      .single();

    console.log('STEP 2: Recipe');
    console.log(`  ${recipe.title} (${recipe.category})`);
    console.log(`  ID: ${recipe.id}\n`);

    // Step 3: Get ingredients for this recipe
    const { data: ingredients } = await supabase
      .from('recipe_database_ingredients')
      .select('id, recipe_id, ingredient_name, canonical_item_id')
      .eq('recipe_id', recipe.id);

    console.log('STEP 3: Recipe Ingredients');
    let exactMatches = [];
    let missingIngredients = [];

    ingredients?.forEach(ing => {
      const hasMatch = ing.canonical_item_id && pantryMap.has(ing.canonical_item_id);
      console.log(`  ${hasMatch ? '✓' : '✗'} ${ing.ingredient_name}`);
      console.log(`      canonical_id: ${ing.canonical_item_id?.substring(0, 8) || 'NULL'}`);

      if (hasMatch) {
        exactMatches.push(ing.ingredient_name);
      } else {
        missingIngredients.push(ing.ingredient_name);
      }
    });

    // Step 4: Calculate match
    const totalIngredients = ingredients?.length || 0;
    const score = exactMatches.length / totalIngredients;
    const matchPercent = Math.round(score * 100);

    console.log('\nSTEP 4: Match Calculation');
    console.log(`  Exact matches: ${exactMatches.length}/${totalIngredients}`);
    console.log(`  Score: ${exactMatches.length} / ${totalIngredients} = ${score}`);
    console.log(`  Match percent: ${matchPercent}%`);
    console.log(`  Missing: ${missingIngredients.join(', ')}\n`);

    // Step 5: Simulate what the service does
    console.log('STEP 5: Simulating Service (batchCalculateRecipeDatabasePantryMatch)');

    const recipeIds = [recipe.id];
    const { data: allIngredients } = await supabase
      .from('recipe_database_ingredients')
      .select('id, recipe_id, ingredient_name, canonical_item_id')
      .in('recipe_id', recipeIds);

    const ingredientsByRecipe = new Map();
    (allIngredients || []).forEach(ing => {
      if (!ingredientsByRecipe.has(ing.recipe_id)) {
        ingredientsByRecipe.set(ing.recipe_id, []);
      }
      ingredientsByRecipe.get(ing.recipe_id).push(ing);
    });

    const recipeIngredients = ingredientsByRecipe.get(recipe.id) || [];
    console.log(`  Fetched ${recipeIngredients.length} ingredients for recipe ${recipe.id.substring(0, 8)}`);

    let serviceExactMatches = [];
    let serviceMissingIngredients = [];

    for (const ingredient of recipeIngredients) {
      if (ingredient.canonical_item_id && pantryMap.has(ingredient.canonical_item_id)) {
        serviceExactMatches.push(ingredient.ingredient_name);
      } else {
        serviceMissingIngredients.push(ingredient.ingredient_name);
      }
    }

    const serviceScore = serviceExactMatches.length / recipeIngredients.length;
    const serviceMatchPercent = Math.round(serviceScore * 100);

    console.log(`  Service calculated: ${serviceExactMatches.length}/${recipeIngredients.length} = ${serviceMatchPercent}%\n`);

    // Step 6: Simulate what getAllCategoriesWithRecipes does
    console.log('STEP 6: Simulating getAllCategoriesWithRecipes');

    const { data: allRecipes } = await supabase
      .from('recipe_database')
      .select('*')
      .eq('is_published', true)
      .limit(20);

    console.log(`  Fetched ${allRecipes?.length || 0} recipes from database`);

    // Find our Aglio recipe in the results
    const aglioInResults = allRecipes?.find(r => r.id === recipe.id);
    if (aglioInResults) {
      console.log(`  Found Aglio e Olio in results:`);
      console.log(`    Title: ${aglioInResults.title}`);
      console.log(`    Has pantry_match_percent field: ${'pantry_match_percent' in aglioInResults}`);
      console.log(`    Value: ${aglioInResults.pantry_match_percent}`);

      // Now simulate adding the computed field
      const recipeWithMatch = {
        ...aglioInResults,
        pantry_match_percent: serviceMatchPercent,
        missing_ingredients_count: serviceMissingIngredients.length,
      };

      console.log(`\n  After adding computed fields:`);
      console.log(`    pantry_match_percent: ${recipeWithMatch.pantry_match_percent}`);
      console.log(`    missing_ingredients_count: ${recipeWithMatch.missing_ingredients_count}`);
    }

    console.log('\n✅ Debug complete!');
    console.log(`\nExpected result: Aglio e Olio should show ${serviceMatchPercent}% match in the UI`);

  } catch (error) {
    console.error('[Debug] Error:', error);
    process.exit(1);
  }
}

debugPantryMatching()
  .then(() => {
    console.log('\n[Debug] Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('[Debug] Failed:', err);
    process.exit(1);
  });
