const fs = require('fs');

console.log('Analyzing canonical mappings in all_recipes_normalized.json...\n');

const data = JSON.parse(fs.readFileSync('scripts/all_recipes_normalized.json', 'utf8'));

// Flatten recipes from category structure to array
let recipes = [];
if (Array.isArray(data)) {
  recipes = data;
} else if (data.recipes && typeof data.recipes === 'object') {
  // If recipes is an object with categories, flatten it
  Object.values(data.recipes).forEach(category => {
    if (category.dishes && Array.isArray(category.dishes)) {
      recipes = recipes.concat(category.dishes);
    } else if (Array.isArray(category)) {
      recipes = recipes.concat(category);
    }
  });
} else {
  recipes = data.recipes || data;
}

// Track all canonical mappings per normalized name
const mappingStats = {};
const allCanonicals = new Set();

recipes.forEach(recipe => {
  recipe.ingredients.forEach(ing => {
    const normalized = ing.normalized_name;
    const canonical = ing.canonical_item_mapping;

    if (!mappingStats[normalized]) {
      mappingStats[normalized] = {
        canonicals: new Set(),
        count: 0,
        examples: []
      };
    }

    mappingStats[normalized].canonicals.add(canonical);
    mappingStats[normalized].count++;

    if (mappingStats[normalized].examples.length < 3) {
      mappingStats[normalized].examples.push({
        recipe: recipe.title,
        ingredient_name: ing.ingredient_name
      });
    }

    allCanonicals.add(canonical);
  });
});

// Find inconsistencies (normalized names with multiple canonical mappings)
const inconsistencies = {};
Object.entries(mappingStats).forEach(([normalized, stats]) => {
  if (stats.canonicals.size > 1) {
    inconsistencies[normalized] = {
      canonicals: Array.from(stats.canonicals),
      count: stats.count,
      examples: stats.examples
    };
  }
});

console.log('═══════════════════════════════════════════════════════════');
console.log('SUMMARY STATISTICS');
console.log('═══════════════════════════════════════════════════════════');
console.log(`Total recipes: ${recipes.length}`);
console.log(`Total ingredients: ${recipes.reduce((sum, r) => sum + r.ingredients.length, 0)}`);
console.log(`Unique normalized names: ${Object.keys(mappingStats).length}`);
console.log(`Unique canonical items: ${allCanonicals.size}`);
console.log(`Inconsistent mappings: ${Object.keys(inconsistencies).length}`);
console.log('');

if (Object.keys(inconsistencies).length > 0) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('INCONSISTENCIES FOUND');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Sort by number of different canonical mappings (most inconsistent first)
  const sorted = Object.entries(inconsistencies)
    .sort((a, b) => b[1].canonicals.length - a[1].canonicals.length);

  sorted.forEach(([normalized, data], index) => {
    console.log(`${index + 1}. "${normalized}" maps to ${data.canonicals.length} different canonicals:`);
    data.canonicals.forEach(canonical => {
      console.log(`   → "${canonical}"`);
    });
    console.log(`   Used ${data.count} times across recipes`);
    console.log(`   Examples:`);
    data.examples.forEach(ex => {
      console.log(`     - ${ex.ingredient_name} in "${ex.recipe}"`);
    });
    console.log('');
  });

  // Save detailed report to JSON
  fs.writeFileSync(
    'scripts/canonical_inconsistencies.json',
    JSON.stringify(inconsistencies, null, 2)
  );

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Full report saved to: scripts/canonical_inconsistencies.json`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Identify patterns for auto-fix rules
  console.log('═══════════════════════════════════════════════════════════');
  console.log('PATTERN ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════\n');

  let casingIssues = 0;
  let pluralIssues = 0;
  let underscoreIssues = 0;
  let otherIssues = 0;

  sorted.forEach(([normalized, data]) => {
    const canonicals = data.canonicals;

    // Check if difference is just casing
    const lowercased = canonicals.map(c => c.toLowerCase());
    if (new Set(lowercased).size === 1) {
      casingIssues++;
      return;
    }

    // Check if difference is singular/plural
    const singularized = canonicals.map(c =>
      c.endsWith('s') && c.length > 3 ? c.slice(0, -1) : c
    );
    if (new Set(singularized).size === 1) {
      pluralIssues++;
      return;
    }

    // Check if difference is underscore vs space
    const normalized_space = canonicals.map(c => c.replace(/_/g, ' '));
    if (new Set(normalized_space).size === 1) {
      underscoreIssues++;
      return;
    }

    otherIssues++;
  });

  console.log(`Casing issues: ${casingIssues} (e.g., "Parmesan" vs "parmesan")`);
  console.log(`Plural/singular issues: ${pluralIssues} (e.g., "egg" vs "eggs")`);
  console.log(`Underscore/space issues: ${underscoreIssues} (e.g., "black_pepper" vs "black pepper")`);
  console.log(`Other issues: ${otherIssues} (requires manual review)`);
  console.log('');

} else {
  console.log('✅ No inconsistencies found! All canonical mappings are consistent.');
}

// Top 20 most common canonical items
console.log('═══════════════════════════════════════════════════════════');
console.log('TOP 20 MOST COMMON CANONICAL ITEMS');
console.log('═══════════════════════════════════════════════════════════\n');

const canonicalCounts = {};
recipes.forEach(recipe => {
  recipe.ingredients.forEach(ing => {
    const canonical = ing.canonical_item_mapping;
    canonicalCounts[canonical] = (canonicalCounts[canonical] || 0) + 1;
  });
});

const topCanonicals = Object.entries(canonicalCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);

topCanonicals.forEach(([canonical, count], index) => {
  console.log(`${index + 1}. "${canonical}" - ${count} uses`);
});

console.log('\n✅ Analysis complete!\n');
