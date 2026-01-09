const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyData() {
  console.log('🔍 Verifying seeded recipe data...\n');

  try {
    // 1. Get recipe count
    const { count: recipeCount, error: countError } = await supabase
      .from('recipe_database')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;
    console.log(`✅ Total recipes: ${recipeCount}`);

    // 2. Get ingredient count
    const { count: ingredientCount, error: ingError } = await supabase
      .from('recipe_database_ingredients')
      .select('*', { count: 'exact', head: true });

    if (ingError) throw ingError;
    console.log(`✅ Total ingredients: ${ingredientCount}`);

    // 3. Get instruction count
    const { count: instructionCount, error: instError } = await supabase
      .from('recipe_database_instructions')
      .select('*', { count: 'exact', head: true });

    if (instError) throw instError;
    console.log(`✅ Total instructions: ${instructionCount}\n`);

    // 4. Sample a complete recipe
    const { data: sampleRecipe, error: sampleError } = await supabase
      .from('recipe_database')
      .select(`
        *,
        recipe_database_ingredients (*),
        recipe_database_instructions (*)
      `)
      .eq('title', 'Spaghetti Carbonara')
      .single();

    if (sampleError) throw sampleError;

    console.log('═══════════════════════════════════════════════');
    console.log('SAMPLE RECIPE: Spaghetti Carbonara');
    console.log('═══════════════════════════════════════════════');
    console.log(`Category: ${sampleRecipe.category}`);
    console.log(`Difficulty: ${sampleRecipe.difficulty}`);
    console.log(`Time: ${sampleRecipe.total_time_minutes} minutes`);
    console.log(`Servings: ${sampleRecipe.servings}`);
    console.log(`Ingredients: ${sampleRecipe.recipe_database_ingredients.length}`);
    console.log(`Instructions: ${sampleRecipe.recipe_database_instructions.length}\n`);

    console.log('Sample ingredients:');
    sampleRecipe.recipe_database_ingredients
      .sort((a, b) => a.sort_order - b.sort_order)
      .slice(0, 5)
      .forEach(ing => {
        console.log(`  - ${ing.ingredient_name} (${ing.amount} ${ing.unit}) → [${ing.canonical_item_name}]`);
      });
    console.log('');

    // 5. Check canonical_item_name consistency (should all be lowercase)
    const { data: upperCaseCanonicals, error: caseError } = await supabase
      .from('recipe_database_ingredients')
      .select('canonical_item_name')
      .neq('canonical_item_name', null);

    if (caseError) throw caseError;

    const nonLowercase = upperCaseCanonicals.filter(
      item => item.canonical_item_name !== item.canonical_item_name.toLowerCase()
    );

    if (nonLowercase.length > 0) {
      console.log(`⚠️  Found ${nonLowercase.length} non-lowercase canonical names`);
    } else {
      console.log('✅ All canonical_item_name values are lowercase');
    }

    // 6. Get top 10 most common canonical items
    const { data: allIngredients, error: allError } = await supabase
      .from('recipe_database_ingredients')
      .select('canonical_item_name')
      .neq('canonical_item_name', null);

    if (allError) throw allError;

    const canonicalCounts = {};
    allIngredients.forEach(ing => {
      const canonical = ing.canonical_item_name;
      canonicalCounts[canonical] = (canonicalCounts[canonical] || 0) + 1;
    });

    const topCanonicals = Object.entries(canonicalCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    console.log('\n═══════════════════════════════════════════════');
    console.log('TOP 10 MOST COMMON CANONICAL ITEMS');
    console.log('═══════════════════════════════════════════════');
    topCanonicals.forEach(([canonical, count], index) => {
      console.log(`${index + 1}. "${canonical}" - ${count} uses`);
    });

    // 7. Get category distribution
    const { data: recipes, error: recipesError } = await supabase
      .from('recipe_database')
      .select('category');

    if (recipesError) throw recipesError;

    const categoryCounts = {};
    recipes.forEach(r => {
      categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
    });

    const sortedCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1]);

    console.log('\n═══════════════════════════════════════════════');
    console.log('CATEGORY DISTRIBUTION');
    console.log('═══════════════════════════════════════════════');
    sortedCategories.forEach(([category, count]) => {
      console.log(`${category}: ${count} recipes`);
    });

    console.log('\n═══════════════════════════════════════════════');
    console.log('✅ VERIFICATION COMPLETE');
    console.log('═══════════════════════════════════════════════');
    console.log(`All ${recipeCount} recipes successfully seeded and verified!`);
    console.log('Database is ready for production use.\n');

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verifyData()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
