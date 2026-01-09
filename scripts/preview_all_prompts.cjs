/**
 * Preview all prompts before generation
 *
 * Loads 200 recipes from database and shows what prompt will be generated for each
 * This lets you review before spending $8 on image generation
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { getPromptTemplate, categorizeDish } = require('./flux_prompt_templates.cjs');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function previewAllPrompts() {
  console.log('📋 Loading recipes from database...\n');

  // Load all recipes without images
  const { data: recipes, error } = await supabase
    .from('recipe_database')
    .select('id, title, category, description')
    .is('image_url', null)
    .order('category', { ascending: true });

  if (error) {
    console.error('❌ Database error:', error);
    process.exit(1);
  }

  if (!recipes || recipes.length === 0) {
    console.log('✅ All recipes already have images!');
    return;
  }

  console.log(`Found ${recipes.length} recipes without images\n`);
  console.log('='.repeat(80) + '\n');

  const promptsByCategory = {};
  const dishTypeStats = {};

  // Generate prompts for all recipes
  recipes.forEach(recipe => {
    const prompt = getPromptTemplate(recipe);
    const dishType = categorizeDish(recipe.title, recipe.description || '', recipe.category);

    if (!promptsByCategory[recipe.category]) {
      promptsByCategory[recipe.category] = [];
    }

    promptsByCategory[recipe.category].push({
      title: recipe.title,
      dishType: dishType,
      prompt: prompt
    });

    dishTypeStats[dishType] = (dishTypeStats[dishType] || 0) + 1;
  });

  // Print by category
  Object.keys(promptsByCategory).sort().forEach(category => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`CATEGORY: ${category.toUpperCase()}`);
    console.log('='.repeat(80));

    promptsByCategory[category].forEach(item => {
      console.log(`\n${item.title} [${item.dishType}]`);
      console.log(`  ${item.prompt}`);
    });
  });

  // Summary stats
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 SUMMARY STATISTICS');
  console.log('='.repeat(80));
  console.log(`\nTotal recipes: ${recipes.length}`);
  console.log(`\nDish type distribution:`);
  Object.entries(dishTypeStats).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    const percentage = ((count / recipes.length) * 100).toFixed(1);
    console.log(`  ${type.padEnd(20)} ${count.toString().padStart(3)} (${percentage}%)`);
  });

  console.log(`\nCategories: ${Object.keys(promptsByCategory).length}`);
  console.log(`\nEstimated cost: $${(recipes.length * 0.04).toFixed(2)}`);

  // Save to file
  const outputData = {
    totalRecipes: recipes.length,
    estimatedCost: recipes.length * 0.04,
    dishTypeStats: dishTypeStats,
    byCategory: promptsByCategory
  };

  fs.writeFileSync(
    path.join(__dirname, 'prompt_preview.json'),
    JSON.stringify(outputData, null, 2)
  );

  console.log(`\n💾 Full preview saved to: scripts/prompt_preview.json`);

  console.log('\n' + '='.repeat(80));
  console.log('🎯 NEXT STEPS');
  console.log('='.repeat(80));
  console.log('1. Review the prompts above');
  console.log('2. Check that dish types are categorized correctly');
  console.log('3. Look for any recipes that might need hands (none should)');
  console.log('4. If everything looks good, run: node scripts/generate_all_recipe_images.cjs');
  console.log('\n✨ Preview complete!');
}

previewAllPrompts().catch(console.error);
