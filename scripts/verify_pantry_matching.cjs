/**
 * Verify pantry matching is working after adding common ingredients
 *
 * Expected results:
 * - Recipes should show 20-40% match (depending on how many of the 5 common ingredients they use)
 * - No more 0% matches for recipes using common ingredients
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyMatching() {
  try {
    console.log('[VerifyMatching] Starting verification...\n');

    // Get a sample household (first one)
    const { data: households } = await supabase
      .from('household_members')
      .select('household_id')
      .limit(1);

    const householdId = households?.[0]?.household_id;
    console.log(`[VerifyMatching] Testing with household: ${householdId}\n`);

    // Check pantry items for this household
    const { data: pantryItems } = await supabase
      .from('pantry_items')
      .select('id, name, canonical_item_id')
      .eq('household_id', householdId)
      .eq('status', 'active');

    console.log(`[VerifyMatching] Pantry items (${pantryItems?.length || 0} total):`);
    console.log(`  ${pantryItems?.map(p => p.name).join(', ')}\n`);

    // Get a sample Italian recipe
    const { data: sampleRecipe } = await supabase
      .from('recipe_database')
      .select('id, title, category')
      .eq('category', 'italian')
      .limit(1)
      .single();

    console.log(`[VerifyMatching] Testing recipe: "${sampleRecipe.title}"`);
    console.log(`  Category: ${sampleRecipe.category}\n`);

    // Get ingredients for this recipe
    const { data: ingredients } = await supabase
      .from('recipe_database_ingredients')
      .select('id, ingredient_name, canonical_item_id')
      .eq('recipe_id', sampleRecipe.id);

    console.log(`[VerifyMatching] Recipe ingredients (${ingredients?.length || 0} total):`);
    ingredients?.forEach(ing => {
      console.log(`  - ${ing.ingredient_name} (canonical: ${ing.canonical_item_id ? 'YES' : 'NO'})`);
    });

    // Calculate matches manually
    const pantryCanonicalIds = new Set(
      pantryItems?.filter(p => p.canonical_item_id).map(p => p.canonical_item_id)
    );

    let matchCount = 0;
    const matches = [];
    const missing = [];

    ingredients?.forEach(ing => {
      if (ing.canonical_item_id && pantryCanonicalIds.has(ing.canonical_item_id)) {
        matchCount++;
        matches.push(ing.ingredient_name);
      } else {
        missing.push(ing.ingredient_name);
      }
    });

    const matchPercent = Math.round((matchCount / (ingredients?.length || 1)) * 100);

    console.log(`\n[VerifyMatching] Match Results:`);
    console.log(`  Exact matches: ${matchCount}/${ingredients?.length || 0} (${matchPercent}%)`);
    console.log(`  Matched: ${matches.join(', ') || 'none'}`);
    console.log(`  Missing: ${missing.join(', ') || 'none'}`);

    if (matchPercent > 0) {
      console.log(`\n✅ SUCCESS! Pantry matching is working correctly.`);
      console.log(`   Users will now see ${matchPercent}% match for this recipe.`);
    } else {
      console.log(`\n⚠️  WARNING: Still showing 0% match. Check canonical_item_id mapping.`);
    }

    // Test a few more recipes to get a broader picture
    console.log(`\n[VerifyMatching] Testing 5 more random recipes...\n`);

    const { data: moreRecipes } = await supabase
      .from('recipe_database')
      .select('id, title, category')
      .limit(5);

    for (const recipe of moreRecipes || []) {
      const { data: recipeIngs } = await supabase
        .from('recipe_database_ingredients')
        .select('canonical_item_id')
        .eq('recipe_id', recipe.id);

      const recipeMatches = recipeIngs?.filter(
        ing => ing.canonical_item_id && pantryCanonicalIds.has(ing.canonical_item_id)
      ).length || 0;

      const percent = Math.round((recipeMatches / (recipeIngs?.length || 1)) * 100);

      console.log(`  ${recipe.title} (${recipe.category}): ${percent}% (${recipeMatches}/${recipeIngs?.length} matches)`);
    }

  } catch (error) {
    console.error('[VerifyMatching] Error:', error);
    process.exit(1);
  }
}

verifyMatching()
  .then(() => {
    console.log('\n[VerifyMatching] Verification complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('[VerifyMatching] Failed:', err);
    process.exit(1);
  });
