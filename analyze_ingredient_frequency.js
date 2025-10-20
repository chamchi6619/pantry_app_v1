/**
 * Analyze ingredient frequency from recipe dataset
 * Identifies top OOV (out-of-vocabulary) ingredients to add to canonical database
 *
 * Run: node analyze_ingredient_frequency.js [dataset_file]
 *
 * Supports:
 * - RecipeNLG JSON: recipe_sample.json
 * - Food.com CSV: recipes.csv
 * - Or generates simulated data to demonstrate the process
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Enhanced cleaning function v3 - matches TypeScript implementation
// Handles: food magazine style, prep phrases, purpose modifiers, equipment filtering
function cleanIngredientName(name) {
  let cleaned = name.toLowerCase().trim();

  // Equipment items - return empty string (not an ingredient)
  const equipmentItems = new Set([
    'parchment paper', 'wax paper', 'plastic wrap', 'aluminum foil', 'foil',
    'offset spatula', 'spatula', 'whisk', 'bowl', 'pan', 'baking sheet',
    'baking pan', 'loaf pan', 'sheet pan', 'ice cream maker', 'blender',
    'food processor', 'mixer', 'slicer', 'adjustable-blade slicer',
    'clean jars', 'jars'
  ]);

  if (equipmentItems.has(cleaned)) {
    return '';
  }

  // 1. Fix malformed patterns: "1/ingredient" → "1 ingredient" → "ingredient"
  // Preserves space so subsequent number stripping works correctly
  cleaned = cleaned.replace(/^(\d+)\/+(?=[a-zA-Z])/, '$1 ');

  // 2. Normalize Unicode fractions
  const fractionMap = {
    '½': '0.5', '¼': '0.25', '¾': '0.75',
    '⅓': '0.33', '⅔': '0.66', '⅛': '0.125',
    '⅜': '0.375', '⅝': '0.625', '⅞': '0.875'
  };
  Object.keys(fractionMap).forEach(f => {
    cleaned = cleaned.replace(new RegExp(f, 'g'), fractionMap[f]);
  });

  // 3. Strip glued metric units (140g, 500ml, 1kg, 2L)
  cleaned = cleaned.replace(/\b\d+\.?\d*\s*(g|kg|ml|l|oz|lb|lbs)\b\s*/gi, '');

  // 4. Strip quantity + unit patterns
  cleaned = cleaned.replace(/\d+\.?\d*\s+(cup|cups|tablespoon|tablespoons|teaspoon|teaspoons|tbsp|tsp|tbs|tbl|tbls|T|Tbsp|pinch|dash|clove|cloves|sprig|sprigs|bunch|can|jar|packet|pack|piece|pieces|whole|ounces?|cans?|jars?|packages?|pkg)\s+(of\s+)?/gi, '');

  // 5. Strip units without numbers
  cleaned = cleaned.replace(/^(tablespoons?|tbsp|teaspoons?|tsp|cups?|pounds?|lbs?|ounces?|oz|grams?|g|cans?|jars?|packages?|pkg|handfuls?|pinch|dash)\s+/gi, '');

  // 6. Strip bare leading numbers (must come AFTER unit patterns)
  cleaned = cleaned.replace(/^\d+\.?\d*\s+/g, '');

  // 7. Strip size/quality modifiers
  cleaned = cleaned.replace(/^(small|large|medium|big|tiny|whole|fresh|frozen|dried|raw|cooked|new|old|ripe|unripe|young|baby|skinned|boneless|skin-on|bone-in)\s+/gi, '');

  // 8. Strip prep words at START (thinly sliced, halved, peeled, etc.)
  cleaned = cleaned.replace(/^(thinly\s+sliced|finely\s+chopped|roughly\s+chopped|coarsely\s+chopped|finely\s+diced|chopped|minced|diced|grated|sliced|shredded|crushed|halved|quartered|peeled|seeded|deseeded|trimmed|cleaned|cut)\s+/gi, '');

  // 9. Strip form suffixes (clove, head, bunch)
  cleaned = cleaned.replace(/\s+(cloves?|heads?|bunches?|stalks?|sprigs?|ears?)(,|$)/gi, '$2');

  // 10. Strip purpose phrases at END (for serving, for garnish, for drizzling, etc.)
  cleaned = cleaned.replace(/\s+(for\s+(serving|garnish|garnishing|drizzling|sprinkling|topping|frying)|to\s+(serve|taste)|as\s+needed|if\s+desired|optional)(,|\s|$)/gi, '');

  // 11. Strip "divided" modifier (Bon Appetit style)
  cleaned = cleaned.replace(/,?\s*divided\s*$/gi, '');

  // 12. Strip trailing prep phrases after comma
  cleaned = cleaned.replace(/,\s*(thinly\s+sliced|finely\s+chopped|roughly\s+chopped|chopped|minced|diced|grated|sliced|shredded|crushed|halved|quartered|peeled|seeded|beaten|whisked|melted|softened|at\s+room\s+temperature|room\s+temperature)/gi, '');

  // 13. Strip trailing generic descriptors after comma
  cleaned = cleaned.replace(/,\s*[a-z\s]+$/gi, '');

  // 14. Strip parenthetical notes
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*/g, ' ');

  // 15. Normalize hyphenated compounds
  if (cleaned === 'all purpose flour' || cleaned === 'all purpose') {
    cleaned = 'all-purpose flour';
  } else if (cleaned === 'self rising flour' || cleaned === 'self rising') {
    cleaned = 'self-rising flour';
  } else if (cleaned === 'semi sweet') {
    cleaned = 'semi-sweet';
  }

  // 16. Normalize UK/US spelling
  cleaned = cleaned.replace(/chilli/g, 'chili');

  // 17. Clean up
  cleaned = cleaned.replace(/^,\s*/, '');
  cleaned = cleaned.replace(/\s*,\s*$/, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

// Simulated recipe data for demonstration
const SIMULATED_RECIPES = [
  { title: 'Pasta Carbonara', ingredients: ['1 lb spaghetti', '6 eggs', '1 cup parmesan cheese', '8 oz pancetta', 'black pepper', 'salt'] },
  { title: 'Chicken Tikka Masala', ingredients: ['2 lbs chicken thighs', 'garam masala', '1 can tomato sauce', 'heavy cream', 'garlic', 'ginger', 'onion', 'cilantro'] },
  { title: 'Beef Stir Fry', ingredients: ['1 lb flank steak', 'soy sauce', 'sesame oil', 'broccoli', 'bell pepper', 'garlic', 'ginger', 'cornstarch'] },
  { title: 'Caesar Salad', ingredients: ['romaine lettuce', 'parmesan cheese', 'croutons', 'anchovies', 'garlic', 'lemon juice', 'olive oil', 'worcestershire sauce'] },
  { title: 'Chocolate Chip Cookies', ingredients: ['2 cups flour', '1 cup butter', '1 cup sugar', '1/2 cup brown sugar', '2 eggs', 'vanilla extract', 'baking soda', 'chocolate chips'] },
  { title: 'Thai Green Curry', ingredients: ['chicken breast', 'green curry paste', 'coconut milk', 'bamboo shoots', 'thai basil', 'fish sauce', 'palm sugar', 'lime leaves'] },
  { title: 'Margherita Pizza', ingredients: ['pizza dough', 'san marzano tomatoes', 'fresh mozzarella', 'basil', 'olive oil', 'salt'] },
  { title: 'French Onion Soup', ingredients: ['yellow onions', 'beef stock', 'white wine', 'gruyere cheese', 'french bread', 'butter', 'thyme', 'bay leaf'] },
  { title: 'Pad Thai', ingredients: ['rice noodles', 'shrimp', 'eggs', 'bean sprouts', 'peanuts', 'tamarind paste', 'fish sauce', 'palm sugar', 'garlic', 'lime'] },
  { title: 'Beef Tacos', ingredients: ['ground beef', 'taco seasoning', 'tortillas', 'lettuce', 'tomato', 'cheddar cheese', 'sour cream', 'salsa'] },
];

async function analyzeFrequency() {
  console.log('📊 Ingredient Frequency Analysis\n');

  // Check for dataset file
  const args = process.argv.slice(2);
  const datasetFile = args[0];

  let recipes = [];

  if (datasetFile && fs.existsSync(datasetFile)) {
    console.log(`📂 Loading dataset from: ${datasetFile}\n`);

    const ext = path.extname(datasetFile).toLowerCase();

    if (ext === '.json') {
      const raw = fs.readFileSync(datasetFile, 'utf-8');
      recipes = JSON.parse(raw);
      console.log(`✅ Loaded JSON dataset\n`);
    } else if (ext === '.csv') {
      console.log('⚠️  CSV parsing not yet implemented.');
      console.log('   Using simulated data instead.\n');
      recipes = SIMULATED_RECIPES;
    } else {
      console.log('⚠️  Unknown file format.');
      console.log('   Using simulated data instead.\n');
      recipes = SIMULATED_RECIPES;
    }
  } else {
    console.log('💡 No dataset file provided. Using simulated data.\n');
    console.log('To analyze real data:');
    console.log('  1. Download dataset from Kaggle or HuggingFace');
    console.log('  2. Run: node analyze_ingredient_frequency.js <file>\n');
    recipes = SIMULATED_RECIPES;
  }

  console.log(`Analyzing ${recipes.length} recipes...\n`);

  // Extract and clean all ingredients
  const ingredientCounts = new Map();

  for (const recipe of recipes) {
    for (const ing of recipe.ingredients) {
      const cleaned = cleanIngredientName(ing);
      if (cleaned) {
        ingredientCounts.set(cleaned, (ingredientCounts.get(cleaned) || 0) + 1);
      }
    }
  }

  console.log(`Found ${ingredientCounts.size} unique ingredients\n`);

  // Load canonical items
  const { data: canonical } = await supabase
    .from('canonical_items')
    .select('canonical_name, aliases');

  console.log(`Loaded ${canonical.length} canonical items\n`);

  // Check which ingredients are OOV
  const oovCounts = new Map();

  for (const [ingredient, count] of ingredientCounts.entries()) {
    // Check if matches canonical
    const matches = canonical.some(c => {
      const cName = c.canonical_name.toLowerCase();
      const aliases = (c.aliases || []).map(a => a.toLowerCase());
      return (
        cName === ingredient ||
        aliases.includes(ingredient) ||
        cName.includes(ingredient) ||
        ingredient.includes(cName)
      );
    });

    if (!matches) {
      oovCounts.set(ingredient, count);
    }
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log(`📈 ANALYSIS RESULTS\n`);
  console.log(`Total unique ingredients:    ${ingredientCounts.size}`);
  console.log(`Matched to canonical:        ${ingredientCounts.size - oovCounts.size}`);
  console.log(`OOV (missing):               ${oovCounts.size}`);
  console.log(`Coverage rate:               ${(((ingredientCounts.size - oovCounts.size) / ingredientCounts.size) * 100).toFixed(1)}%\n`);

  // Sort OOV by frequency
  const sortedOOV = Array.from(oovCounts.entries())
    .sort((a, b) => b[1] - a[1]);

  console.log('═══════════════════════════════════════════════════════');
  console.log('🔝 TOP 50 MISSING INGREDIENTS (by frequency)\n');

  sortedOOV.slice(0, 50).forEach(([ing, count], idx) => {
    console.log(`${(idx + 1).toString().padStart(3)}. ${ing.padEnd(30)} (appears ${count}x)`);
  });

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('💡 RECOMMENDATIONS\n');

  const top20 = sortedOOV.slice(0, 20);
  console.log(`Adding the top 20 OOV items would improve coverage by ${((20 / ingredientCounts.size) * 100).toFixed(1)}%`);
  console.log(`Adding the top 50 OOV items would improve coverage by ${((50 / ingredientCounts.size) * 100).toFixed(1)}%\n`);

  console.log('Next steps:');
  console.log('1. Review top OOV items for accuracy');
  console.log('2. Categorize and add aliases');
  console.log('3. Run promotion script to add to database');
  console.log('4. Re-test coverage\n');

  // Export to file
  const output = {
    analysis: {
      total_ingredients: ingredientCounts.size,
      matched: ingredientCounts.size - oovCounts.size,
      oov: oovCounts.size,
      coverage_pct: ((ingredientCounts.size - oovCounts.size) / ingredientCounts.size) * 100
    },
    top_oov: sortedOOV.slice(0, 100).map(([ing, count]) => ({ ingredient: ing, count }))
  };

  fs.writeFileSync('oov_analysis.json', JSON.stringify(output, null, 2));
  console.log('📄 Detailed results saved to: oov_analysis.json\n');
}

analyzeFrequency();
