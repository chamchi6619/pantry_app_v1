/**
 * Full Canonical Ingredient Database Assessment
 *
 * Analyzes:
 * - Total items and coverage
 * - Category distribution
 * - Alias coverage
 * - Test coverage on validation datasets
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Import the cleaning function
function cleanIngredientName(name) {
  let cleaned = name.toLowerCase().trim();

  const equipmentItems = new Set([
    'parchment paper', 'wax paper', 'plastic wrap', 'aluminum foil', 'foil',
    'offset spatula', 'spatula', 'whisk', 'bowl', 'pan', 'baking sheet',
    'baking pan', 'loaf pan', 'sheet pan', 'ice cream maker', 'blender',
    'food processor', 'mixer', 'slicer', 'adjustable-blade slicer',
    'clean jars', 'jars',
  ]);

  if (equipmentItems.has(cleaned)) return '';

  cleaned = cleaned.replace(/^(\d+)\/+(?=[a-zA-Z])/, '$1 ');
  cleaned = cleaned.replace(/\b\d+(?:[./]\d+)?\s*(g|kg|ml|l|oz|lb|lbs)\b/gi, ' ');
  cleaned = cleaned.replace(/\b\d+(?:\s*\d+\/\d+)?\b/g, ' ');
  cleaned = cleaned.replace(/\b(tsp|teaspoons?|tbsp|tbs|tbls?|T|cups?)\b/gi, ' ');
  cleaned = cleaned.replace(/^(small|large|medium|big|tiny|whole|fresh|frozen|dried|raw|cooked|new|old|ripe|unripe|young|baby)\s+/, '');
  cleaned = cleaned.replace(/^(thinly\s+sliced|finely\s+chopped|roughly\s+chopped|coarsely\s+chopped|finely\s+diced|chopped|minced|diced|grated|sliced|shredded|crushed|halved|quartered|peeled|seeded|deseeded|trimmed|cleaned|cut)\s+/i, '');
  cleaned = cleaned.replace(/\s+(for\s+(serving|garnish|garnishing|drizzling|sprinkling|topping|frying)|to\s+(serve|taste)|as\s+needed|if\s+desired|optional)(,|\s|$)/gi, '');
  cleaned = cleaned.replace(/,?\s*divided\s*$/i, '');
  cleaned = cleaned.replace(/,\s*(thinly\s+sliced|finely\s+chopped|roughly\s+chopped|chopped|minced|diced|grated|sliced|shredded|crushed|halved|quartered|peeled|seeded|beaten|whisked|melted|softened|at\s+room\s+temperature|room\s+temperature)/i, '');
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*/g, ' ');

  if (cleaned === 'all purpose flour' || cleaned === 'all purpose') {
    cleaned = 'all-purpose flour';
  } else if (cleaned === 'self rising flour' || cleaned === 'self rising') {
    cleaned = 'self-rising flour';
  } else if (cleaned === 'semi sweet') {
    cleaned = 'semi-sweet';
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

function normalize(str) {
  return str.toLowerCase().trim()
    .replace(/\b(low-fat|lowfat|reduced-fat|fat-free|nonfat|non-fat)\b/gi, '')
    .replace(/\b(fresh|dried|frozen|canned|raw|roasted|toasted)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function assessDatabase() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 CANONICAL INGREDIENT DATABASE ASSESSMENT');
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Load canonical items
  const { data: canonical, error } = await supabase
    .from('canonical_items')
    .select('*');

  if (error) {
    console.error('❌ Error loading canonical items:', error);
    return;
  }

  console.log('🗄️  DATABASE STATISTICS\n');
  console.log(`Total items:              ${canonical.length}`);

  const withAliases = canonical.filter(c => c.aliases && c.aliases.length > 0);
  console.log(`Items with aliases:       ${withAliases.length} (${(withAliases.length/canonical.length*100).toFixed(1)}%)`);

  const totalAliases = canonical.reduce((sum, c) => sum + (c.aliases?.length || 0), 0);
  console.log(`Total aliases:            ${totalAliases}`);
  console.log(`Avg aliases per item:     ${(totalAliases/canonical.length).toFixed(2)}`);

  // Category breakdown
  const byCategory = {};
  canonical.forEach(c => {
    const cat = c.category || 'uncategorized';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  });

  console.log('\n📦 BY CATEGORY\n');
  Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`  ${cat.padEnd(20)} ${count.toString().padStart(4)} items (${(count/canonical.length*100).toFixed(1)}%)`);
    });

  // 2. Test on validation datasets
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🎯 COVERAGE TESTING\n');

  const datasets = [
    { name: 'TheMealDB (28 cuisines)', file: 'validation_all_cuisines.json' },
    { name: 'RecipeNLG (American)', file: 'recipenlg_validation.json' },
  ];

  const results = [];

  for (const dataset of datasets) {
    if (!fs.existsSync(dataset.file)) {
      console.log(`⚠️  ${dataset.name}: File not found, skipping`);
      continue;
    }

    const recipes = JSON.parse(fs.readFileSync(dataset.file, 'utf-8'));
    let totalIngredients = 0;
    let matched = 0;
    const oovSet = new Set();

    for (const recipe of recipes) {
      for (const ing of recipe.ingredients) {
        const cleaned = cleanIngredientName(ing);
        if (!cleaned || cleaned.length < 3) continue;

        totalIngredients++;
        const normalized = normalize(cleaned);

        // Simple matching logic
        const isMatch = canonical.some(c => {
          const cName = normalize(c.canonical_name);
          const aliases = (c.aliases || []).map(a => normalize(a));

          return cName === normalized ||
                 aliases.includes(normalized) ||
                 cName.includes(normalized) ||
                 normalized.includes(cName);
        });

        if (isMatch) {
          matched++;
        } else {
          oovSet.add(cleaned);
        }
      }
    }

    const coverage = (matched / totalIngredients * 100).toFixed(1);
    results.push({
      name: dataset.name,
      recipes: recipes.length,
      ingredients: totalIngredients,
      matched,
      coverage: parseFloat(coverage),
      oov: oovSet.size
    });

    console.log(`${dataset.name}:`);
    console.log(`  Recipes:      ${recipes.length}`);
    console.log(`  Ingredients:  ${totalIngredients}`);
    console.log(`  Matched:      ${matched}`);
    console.log(`  Coverage:     ${coverage}%`);
    console.log(`  Unique OOV:   ${oovSet.size}\n`);
  }

  // 3. Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('📈 SUMMARY\n');

  const avgCoverage = results.reduce((sum, r) => sum + r.coverage, 0) / results.length;
  console.log(`Average Coverage:     ${avgCoverage.toFixed(1)}%`);
  console.log(`Database Size:        ${canonical.length} items`);
  console.log(`Total Aliases:        ${totalAliases}`);
  console.log(`Categories:           ${Object.keys(byCategory).length}`);

  console.log('\n🎯 READINESS ASSESSMENT\n');

  if (avgCoverage >= 90) {
    console.log('✅ EXCELLENT - Ready to ship');
    console.log('   Coverage is strong across diverse datasets');
    console.log('   Continue weekly OOV review to maintain quality');
  } else if (avgCoverage >= 85) {
    console.log('✅ GOOD - Ready to ship with monitoring');
    console.log('   Coverage is acceptable for MVP launch');
    console.log('   Monitor first week OOV rate closely');
    console.log('   Add top 10-20 items if coverage drops below 80%');
  } else if (avgCoverage >= 75) {
    console.log('⚠️  MARGINAL - Ship with caution');
    console.log('   Coverage is lower than ideal');
    console.log('   Consider adding 50-100 high-frequency items before launch');
  } else {
    console.log('❌ NOT READY - Expand before shipping');
    console.log('   Coverage is too low for production');
    console.log('   Add 100-200 items from OOV analysis');
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📋 NEXT STEPS\n');
  console.log('1. Review coverage results above');
  console.log('2. Check OOV telemetry: SELECT * FROM weekly_oov_review;');
  console.log('3. If coverage < 85%, add top OOV items');
  console.log('4. Ship with production telemetry enabled');
  console.log('5. Review weekly and iterate\n');
}

assessDatabase().catch(console.error);
