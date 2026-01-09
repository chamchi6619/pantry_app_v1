const fs = require('fs');

console.log('Normalizing canonical mappings in recipes...\n');

const data = JSON.parse(fs.readFileSync('scripts/all_recipes_complete.json', 'utf8'));

// Flatten recipes from category structure
let recipes = [];
Object.values(data.recipes).forEach(category => {
  if (category.dishes && Array.isArray(category.dishes)) {
    recipes = recipes.concat(category.dishes);
  }
});

console.log(`Loaded ${recipes.length} recipes\n`);

// NORMALIZATION RULES
// Based on analysis of 83 inconsistencies
// Philosophy: lowercase, singular, spaces, moderate specificity

const normalizationRules = {
  // ========== PATTERN FIXES ==========

  // Underscore → space
  'black_pepper': 'black pepper',
  'green_onions': 'green onion',
  'sesame_oil': 'sesame oil',
  'soy_sauce': 'soy sauce',
  'napa_cabbage': 'napa cabbage',
  'glass_noodles': 'glass noodles',

  // Capitalization
  'Parmesan cheese': 'parmesan cheese',
  'Shaoxing wine': 'shaoxing wine',

  // ========== TOP INCONSISTENCIES (BY FREQUENCY) ==========

  // #1: green onions (4 variants, 34 uses)
  'green onions': 'green onion',
  'scallions': 'green onion',

  // #2: shiitake mushrooms (4 variants, 8 uses)
  'shiitake mushrooms': 'shiitake mushroom',
  'mushroom': 'mushroom',  // generic
  'mushrooms': 'mushroom',

  // #3: gochugaru (4 variants, 5 uses)
  'korean chili flakes': 'gochugaru',
  'chili flakes': 'red pepper flakes',  // different from gochugaru
  'chili powder': 'chili powder',  // keep separate

  // #4: green chilies (4 variants, 6 uses)
  'green chili': 'green chili',
  'green chile': 'green chili',
  'green chilies': 'green chili',
  'chili': 'chili pepper',

  // #5: black pepper (3 variants, 87 uses) - HIGH IMPACT
  'pepper': 'black pepper',

  // #6: vegetable oil (3 variants, 84 uses) - HIGH IMPACT
  'cooking oil': 'vegetable oil',
  'oil': 'vegetable oil',

  // #7: dried red chilies (3 variants, 5 uses)
  'chili peppers': 'dried red chilies',
  'chilies, dried red': 'dried red chilies',
  'dried chilies': 'dried chilies',  // keep general

  // #8: aonori (3 variants, 3 uses)
  'seaweed': 'dried seaweed',
  'seaweed flakes': 'dried seaweed flakes',

  // #9: glass noodles - already fixed above

  // #10: almond milk (3 variants, 6 uses)
  'plant milk': 'almond milk',
  'milk': 'whole milk',  // specify whole milk

  // ========== 2-VARIANT INCONSISTENCIES ==========

  // #11: spaghetti
  'spaghetti': 'pasta',  // consolidate pasta shapes

  // #12: egg yolks
  // Keep egg yolk separate from egg (functionally different in baking)

  // #13: ground beef
  // Keep ground beef separate from beef (different cut/preparation)

  // #14: ground pork
  // Keep ground pork separate from pork

  // #15: carrots
  'carrots': 'carrot',

  // #16: Parmesan cheese - already fixed above

  // #17: heavy cream
  'cream': 'heavy cream',

  // #18: parmesan cheese
  'cheese': 'cheese',  // generic

  // #19: semolina flour
  // Keep semolina separate from flour

  // #20: crushed tomatoes
  'tomatoes': 'tomato',
  'canned tomatoes': 'canned crushed tomatoes',

  // #21: red pepper flakes - already fixed above

  // #22: eggs
  'eggs': 'egg',

  // #23: fresh mozzarella
  'mozzarella cheese': 'mozzarella',

  // #24: vegetable broth
  'broth': 'broth',  // generic

  // #25: arborio rice
  // Keep arborio separate (needed for risotto)

  // #26: cremini mushrooms - already fixed above

  // #27: orange zest
  'orange': 'orange',  // keep orange as base

  // #28: mozzarella cheese - already fixed above

  // #29: egg yolk - keep separate

  // #30: chicken broth
  // Keep chicken broth separate from generic broth

  // #31: russet potatoes
  'potato': 'potato',
  'potatoes': 'potato',

  // #32: bay leaves
  'bay leaves': 'bay leaf',

  // #33: guajillo chiles
  'dried chiles': 'dried chilies',

  // #34: ancho chiles
  // Keep ancho separate from guajillo

  // #35: cloves
  'cloves': 'clove',

  // #36: corn tortillas
  'tortillas': 'corn tortillas',

  // #37: lime juice
  'lime': 'lime juice',

  // #38: red onion
  'onion': 'onion',  // default yellow onion

  // #39: cheddar cheese
  // Keep cheddar separate from generic cheese

  // #40: red cabbage
  'cabbage': 'cabbage',

  // #41: cod fillets
  'fish': 'white fish',

  // #42: tortilla chips
  'chips': 'tortilla chips',

  // #43: cotija cheese
  // Keep cotija separate

  // #44: fried eggs - keep as egg

  // #45: peas and carrots
  'mixed vegetables': 'peas and carrots',

  // #46: sesame oil - already fixed above

  // #47: rice vinegar
  'vinegar': 'rice vinegar',  // default for Asian recipes

  // #48: soy sauce - already fixed above

  // #49: Shaoxing wine
  'cooking wine': 'shaoxing wine',

  // #50: brown sugar
  'sugar': 'granulated sugar',

  // #51: white pepper

  // #52: spring roll wrappers
  'spring roll wrappers': 'spring roll wrapper',

  // #53: napa cabbage - already fixed above

  // #54: shaoxing wine
  'rice wine': 'shaoxing wine',

  // #55: mirin
  // Keep mirin separate from shaoxing wine

  // #56: daikon radish
  'daikon': 'daikon',
  'radish': 'radish',

  // #57: shichimi togarashi
  'spice blend': 'spice blend',

  // #58: pork belly
  // Keep pork belly separate from pork

  // #59: pickled ginger
  'ginger': 'ginger',

  // #60: nori seaweed
  'nori': 'nori sheet',
  'nori seaweed': 'nori sheet',

  // #61: gochujang
  'chili paste': 'chili paste',

  // #62: tamarind paste
  'tamarind': 'tamarind paste',

  // #63: palm sugar
  // Keep palm sugar separate

  // #64: kaffir lime leaves
  'lime leaves': 'kaffir lime leaves',

  // #65: red curry paste
  'curry paste': 'curry paste',

  // #66: cinnamon stick
  'cinnamon': 'cinnamon stick',

  // #67: bird's eye chilies
  'chilies': 'chili pepper',

  // #68: thai chilies
  // Keep as chili pepper

  // #69: cherry tomatoes
  // Keep cherry tomatoes separate

  // #70: romaine lettuce
  'lettuce': 'lettuce',

  // #71: coriander seeds
  'coriander': 'coriander seeds',

  // #72: cumin seeds
  'cumin': 'cumin seeds',

  // #73: turmeric powder
  'turmeric': 'turmeric powder',

  // #74: lemon juice
  'lemon': 'lemon juice',

  // #75: fenugreek leaves
  'fenugreek': 'fenugreek leaves',

  // #76: red chili powder
  // Keep red chili powder separate

  // #77: coriander powder
  'coriander powder': 'coriander powder',  // different from seeds

  // #78: cumin powder
  'cumin powder': 'cumin powder',  // different from seeds

  // #79: amchur powder
  'amchur': 'amchur powder',

  // #80: ghee or vegetable oil
  'ghee': 'ghee',

  // #81: tomatoes - already fixed above

  // #82: hamburger buns
  'bread': 'bread',

  // #83: dijon mustard
  'mustard': 'dijon mustard',
};

// Apply normalization
let changeCount = 0;
const changedRecipes = new Set();
const changes = [];

recipes.forEach(recipe => {
  recipe.ingredients.forEach(ingredient => {
    const original = ingredient.canonical_item_mapping;

    if (normalizationRules[original]) {
      const normalized = normalizationRules[original];
      ingredient.canonical_item_mapping = normalized;
      changeCount++;
      changedRecipes.add(recipe.title);
      changes.push({
        recipe: recipe.title,
        ingredient: ingredient.ingredient_name,
        from: original,
        to: normalized
      });
    }
  });
});

console.log(`Applied ${changeCount} normalizations across ${changedRecipes.size} recipes\n`);

// Show sample changes
console.log('Sample changes:');
changes.slice(0, 10).forEach(change => {
  console.log(`  "${change.from}" → "${change.to}" in ${change.recipe}`);
});
if (changes.length > 10) {
  console.log(`  ... and ${changes.length - 10} more\n`);
}

// Rebuild data structure
const normalizedData = {
  metadata: {
    ...data.metadata,
    normalized_at: new Date().toISOString(),
    normalizations_applied: changeCount
  },
  recipes: {}
};

// Group back into categories
recipes.forEach(recipe => {
  const category = recipe.category;

  if (!normalizedData.recipes[category]) {
    // Find original category metadata
    const originalCategory = data.recipes[category];

    if (!originalCategory) {
      console.warn(`Warning: No category metadata found for "${category}"`);
      normalizedData.recipes[category] = {
        name: category.charAt(0).toUpperCase() + category.slice(1),
        emoji: '🍽️',
        dishes: []
      };
    } else {
      normalizedData.recipes[category] = {
        name: originalCategory.name,
        emoji: originalCategory.emoji,
        dishes: []
      };
    }
  }

  normalizedData.recipes[category].dishes.push(recipe);
});

// Write normalized recipes
fs.writeFileSync(
  'scripts/all_recipes_normalized.json',
  JSON.stringify(normalizedData, null, 2)
);

console.log('✅ Normalized recipes saved to: scripts/all_recipes_normalized.json\n');
console.log('Next step: Run validation to check for remaining inconsistencies');
