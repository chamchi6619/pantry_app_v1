const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🌱 Seeding recipes to Supabase...\n');
console.log(`Database: ${supabaseUrl}`);
console.log(`Using: SERVICE_ROLE_KEY (bypasses RLS)\n`);

async function seedRecipes() {
  // Load recipes
  const data = JSON.parse(fs.readFileSync('scripts/all_recipes_final.json', 'utf8'));

  // Flatten from category structure
  let recipes = [];
  Object.values(data.recipes).forEach(category => {
    if (category.dishes && Array.isArray(category.dishes)) {
      recipes = recipes.concat(category.dishes);
    }
  });

  console.log(`📖 Loaded ${recipes.length} recipes from all_recipes_final.json\n`);

  let successCount = 0;
  let failureCount = 0;
  const errors = [];

  for (let i = 0; i < recipes.length; i++) {
    const recipe = recipes[i];

    try {
      console.log(`[${i + 1}/${recipes.length}] Seeding: ${recipe.title}...`);

      // Insert recipe
      const { data: recipeData, error: recipeError } = await supabase
        .from('recipe_database')
        .insert({
          title: recipe.title,
          description: recipe.description,
          category: recipe.category,
          difficulty: recipe.difficulty,
          prep_time_minutes: recipe.prep_time_minutes,
          cook_time_minutes: recipe.cook_time_minutes,
          total_time_minutes: recipe.total_time_minutes,
          servings: recipe.servings,
          tags: recipe.tags || [],
          image_url: recipe.image_url || null,
        })
        .select()
        .single();

      if (recipeError) {
        throw new Error(`Recipe insert failed: ${recipeError.message}`);
      }

      const recipeId = recipeData.id;

      // Insert ingredients
      const ingredientsToInsert = recipe.ingredients.map(ing => ({
        recipe_id: recipeId,
        ingredient_name: ing.ingredient_name,
        amount: ing.amount,
        unit: ing.unit,
        preparation: ing.preparation || ing.preparation_notes || null,
        is_optional: ing.optional || ing.is_optional || false,
        normalized_name: ing.normalized_name,
        canonical_item_name: ing.canonical_item_mapping, // Using text field for now
        sort_order: ing.sort_order,
      }));

      const { error: ingredientsError } = await supabase
        .from('recipe_database_ingredients')
        .insert(ingredientsToInsert);

      if (ingredientsError) {
        throw new Error(`Ingredients insert failed: ${ingredientsError.message}`);
      }

      // Insert instructions
      const instructionsToInsert = recipe.instructions.map(inst => ({
        recipe_id: recipeId,
        step_number: inst.step_number,
        instruction_text: inst.instruction_text,
      }));

      const { error: instructionsError } = await supabase
        .from('recipe_database_instructions')
        .insert(instructionsToInsert);

      if (instructionsError) {
        throw new Error(`Instructions insert failed: ${instructionsError.message}`);
      }

      console.log(`  ✅ Success (ID: ${recipeId})`);
      successCount++;

    } catch (error) {
      console.error(`  ❌ Failed: ${error.message}`);
      failureCount++;
      errors.push({
        recipe: recipe.title,
        error: error.message
      });
    }
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('SEEDING COMPLETE');
  console.log('═══════════════════════════════════════════════');
  console.log(`✅ Successful: ${successCount}/${recipes.length}`);
  console.log(`❌ Failed: ${failureCount}/${recipes.length}`);

  if (errors.length > 0) {
    console.log('\nErrors encountered:');
    errors.forEach(err => {
      console.log(`  - ${err.recipe}: ${err.error}`);
    });
  }

  if (successCount === recipes.length) {
    console.log('\n🎉 All recipes seeded successfully!');
  }
}

seedRecipes()
  .then(() => {
    console.log('\n✅ Seeding complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  });
