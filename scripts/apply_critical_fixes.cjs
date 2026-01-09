const fs = require('fs');

console.log('Applying critical fixes to normalized recipes...\n');

const data = JSON.parse(fs.readFileSync('scripts/all_recipes_normalized.json', 'utf8'));

// Flatten recipes
let recipes = [];
Object.values(data.recipes).forEach(category => {
  if (category.dishes && Array.isArray(category.dishes)) {
    recipes = recipes.concat(category.dishes);
  }
});

console.log(`Loaded ${recipes.length} recipes\n`);

let lowercaseCount = 0;
let gochugaruCount = 0;
let zestCount = 0;

// Additional rules for missed cases
const additionalRules = {
  // Gochugaru variations - force to 'gochugaru'
  'red pepper flakes': null, // will be handled by gochugaru check
  'chili powder': null, // will be handled by context

  // Zest should be separate
  'lemon': null, // will check context
  'orange': null, // will check context
};

recipes.forEach(recipe => {
  recipe.ingredients.forEach(ingredient => {
    const original = ingredient.canonical_item_mapping;
    const normalized = ingredient.normalized_name.toLowerCase();
    const ingredientName = ingredient.ingredient_name.toLowerCase();

    // Fix 1: LOWERCASE ALL canonical mappings
    const lowercased = original.toLowerCase();
    if (original !== lowercased) {
      ingredient.canonical_item_mapping = lowercased;
      lowercaseCount++;
    }

    // Fix 2: GOCHUGARU - force all gochugaru variations to 'gochugaru'
    if (normalized.includes('gochugaru') || ingredientName.includes('gochugaru')) {
      if (ingredient.canonical_item_mapping !== 'gochugaru') {
        ingredient.canonical_item_mapping = 'gochugaru';
        gochugaruCount++;
      }
    }

    // Fix 3: ZEST - ensure zest is separate from whole fruit
    if (normalized.includes('zest') || ingredientName.includes('zest')) {
      if (ingredientName.includes('lemon') || normalized.includes('lemon')) {
        if (ingredient.canonical_item_mapping !== 'lemon zest') {
          ingredient.canonical_item_mapping = 'lemon zest';
          zestCount++;
        }
      } else if (ingredientName.includes('orange') || normalized.includes('orange')) {
        if (ingredient.canonical_item_mapping !== 'orange zest') {
          ingredient.canonical_item_mapping = 'orange zest';
          zestCount++;
        }
      } else if (ingredientName.includes('lime') || normalized.includes('lime')) {
        if (ingredient.canonical_item_mapping !== 'lime zest') {
          ingredient.canonical_item_mapping = 'lime zest';
          zestCount++;
        }
      }
    }

    // Ensure non-zest citrus stays as juice/whole
    if (!normalized.includes('zest') && !ingredientName.includes('zest')) {
      if ((normalized.includes('lemon') || ingredientName.includes('lemon')) &&
          ingredient.canonical_item_mapping === 'lemon zest') {
        ingredient.canonical_item_mapping = 'lemon juice';
      }
      if ((normalized.includes('orange') || ingredientName.includes('orange')) &&
          ingredient.canonical_item_mapping === 'orange zest') {
        ingredient.canonical_item_mapping = 'orange';
      }
    }
  });
});

console.log('Fixes applied:');
console.log(`  Lowercase conversions: ${lowercaseCount}`);
console.log(`  Gochugaru fixes: ${gochugaruCount}`);
console.log(`  Zest fixes: ${zestCount}`);
console.log(`  Total changes: ${lowercaseCount + gochugaruCount + zestCount}\n`);

// Rebuild data structure
const fixedData = {
  metadata: {
    ...data.metadata,
    critical_fixes_applied: new Date().toISOString(),
    fixes: {
      lowercase: lowercaseCount,
      gochugaru: gochugaruCount,
      zest: zestCount
    }
  },
  recipes: {}
};

// Group back into categories
recipes.forEach(recipe => {
  const category = recipe.category;

  if (!fixedData.recipes[category]) {
    const originalCategory = data.recipes[category];
    if (!originalCategory) {
      fixedData.recipes[category] = {
        name: category.charAt(0).toUpperCase() + category.slice(1),
        emoji: '🍽️',
        dishes: []
      };
    } else {
      fixedData.recipes[category] = {
        name: originalCategory.name,
        emoji: originalCategory.emoji,
        dishes: []
      };
    }
  }

  fixedData.recipes[category].dishes.push(recipe);
});

// Write fixed recipes
fs.writeFileSync(
  'scripts/all_recipes_final.json',
  JSON.stringify(fixedData, null, 2)
);

console.log('✅ Fixed recipes saved to: scripts/all_recipes_final.json\n');
console.log('Next: Run validation to verify fixes');
