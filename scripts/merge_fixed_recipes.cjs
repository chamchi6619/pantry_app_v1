/**
 * Merge Fixed Recipes Script
 *
 * Merges the 4 successfully regenerated recipes back into the main collection
 */

const fs = require('fs');
const path = require('path');

const MAIN_FILE = path.join(__dirname, 'generated_recipes.json');
const FIXED_FILE = path.join(__dirname, 'fixed_recipes.json');
const OUTPUT_FILE = path.join(__dirname, 'all_recipes_complete.json');

console.log('🔀 MERGING FIXED RECIPES');
console.log('='.repeat(70));

// Load files
const main = JSON.parse(fs.readFileSync(MAIN_FILE, 'utf8'));
const fixed = JSON.parse(fs.readFileSync(FIXED_FILE, 'utf8'));

console.log(`📂 Main file: ${main.metadata.successful}/${main.metadata.total_recipes} recipes`);
console.log(`📂 Fixed file: ${fixed.successful.length} regenerated recipes\n`);

// Map fixed recipes by category
const fixedByCategory = {};
fixed.successful.forEach(({ dish, category, recipe }) => {
  const catKey = category.toLowerCase().replace(/ /g, '_');
  if (!fixedByCategory[catKey]) fixedByCategory[catKey] = [];
  fixedByCategory[catKey].push({ dish, recipe });
});

// Merge into main collection
let addedCount = 0;

for (const [categoryKey, categoryData] of Object.entries(main.recipes)) {
  if (fixedByCategory[categoryKey]) {
    console.log(`\n📝 ${categoryData.emoji} ${categoryData.name}:`);

    for (const { dish, recipe } of fixedByCategory[categoryKey]) {
      // Check if already exists
      const exists = categoryData.dishes.find(d => d.title === recipe.title);

      if (!exists) {
        categoryData.dishes.push(recipe);
        addedCount++;
        console.log(`   ✅ Added: ${recipe.title}`);
      } else {
        console.log(`   ⏭️  Skipped (already exists): ${recipe.title}`);
      }
    }
  }
}

// Update metadata
const totalRecipes = Object.values(main.recipes).reduce((sum, cat) => sum + cat.dishes.length, 0);
main.metadata.successful = totalRecipes;
main.metadata.total_recipes = 200;
main.metadata.failed = 200 - totalRecipes;
main.metadata.completion_date = new Date().toISOString();

// Save merged file
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(main, null, 2));

console.log('\n' + '='.repeat(70));
console.log('✅ MERGE COMPLETE!');
console.log('='.repeat(70));
console.log(`📊 Total recipes: ${totalRecipes}/200`);
console.log(`➕ Added from fixes: ${addedCount}`);
console.log(`📁 Output: ${OUTPUT_FILE}`);
console.log('\n💡 Ready for manual review and seeding!');
