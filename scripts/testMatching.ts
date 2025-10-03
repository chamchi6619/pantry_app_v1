import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function testMatching() {
  console.log('🔍 Testing Recipe Ingredient → Canonical Item Matching\n');

  // 1. Check canonical items quality
  console.log('📊 CANONICAL ITEMS ANALYSIS:\n');

  const { data: canonical, count: canonicalCount } = await supabase
    .from('canonical_items')
    .select('id, canonical_name, aliases, category', { count: 'exact' });

  console.log(`Total canonical items: ${canonicalCount}`);

  // Check for quality issues
  const noSpaces = canonical?.filter(c => !c.canonical_name.includes(' ') && c.canonical_name.length > 10) || [];
  const noCategory = canonical?.filter(c => !c.category) || [];
  const weirdChars = canonical?.filter(c => /[^a-zA-Z0-9\s\-',.]/.test(c.canonical_name)) || [];

  console.log(`✓ Items without spaces (10+ chars): ${noSpaces.length}`);
  if (noSpaces.length > 0) {
    console.log(`  Examples: ${noSpaces.slice(0, 5).map(c => c.canonical_name).join(', ')}`);
  }
  console.log(`✓ Items without category: ${noCategory.length}`);
  console.log(`✓ Items with unusual characters: ${weirdChars.length}\n`);

  // 2. Check recipe ingredients quality
  console.log('📊 RECIPE INGREDIENTS ANALYSIS:\n');

  const { data: ingredients, count: ingredientsCount } = await supabase
    .from('recipe_ingredients')
    .select('id, ingredient_name, notes, canonical_item_id', { count: 'exact' });

  console.log(`Total recipe ingredients: ${ingredientsCount}`);

  const matched = ingredients?.filter(i => i.canonical_item_id) || [];
  const unmatched = ingredients?.filter(i => !i.canonical_item_id) || [];
  const matchRate = (matched.length / ingredients!.length * 100).toFixed(1);

  console.log(`✓ Matched to canonical: ${matched.length} (${matchRate}%)`);
  console.log(`✓ Unmatched: ${unmatched.length} (${(100 - parseFloat(matchRate)).toFixed(1)}%)\n`);

  // Sample unmatched ingredients
  console.log('📋 Sample of UNMATCHED ingredients (first 20):\n');
  unmatched.slice(0, 20).forEach((ing, i) => {
    const text = ing.notes || ing.ingredient_name;
    console.log(`${i + 1}. "${text}"`);
  });

  // 3. Test actual matching with a sample recipe
  console.log('\n🧪 TESTING ACTUAL RECIPE MATCHING:\n');

  const { data: sampleRecipe } = await supabase
    .from('recipes')
    .select(`
      id,
      title,
      recipe_ingredients (
        id,
        ingredient_name,
        notes,
        canonical_item_id,
        canonical_items (
          canonical_name,
          category
        )
      )
    `)
    .limit(1)
    .single();

  if (sampleRecipe) {
    console.log(`Recipe: "${sampleRecipe.title}"\n`);
    console.log('Ingredients and their matches:\n');

    sampleRecipe.recipe_ingredients.forEach((ing: any, i: number) => {
      const text = ing.notes || ing.ingredient_name;
      const match = ing.canonical_items;

      if (match) {
        console.log(`${i + 1}. ✅ "${text}"`);
        console.log(`   → Matched to: "${match.canonical_name}" (${match.category})\n`);
      } else {
        console.log(`${i + 1}. ❌ "${text}"`);
        console.log(`   → No match found\n`);
      }
    });

    const recipeMatched = sampleRecipe.recipe_ingredients.filter((i: any) => i.canonical_item_id).length;
    const recipeTotal = sampleRecipe.recipe_ingredients.length;
    console.log(`Recipe match rate: ${recipeMatched}/${recipeTotal} (${(recipeMatched/recipeTotal*100).toFixed(0)}%)\n`);
  }

  // 4. Check most common unmatched ingredients
  console.log('📊 MOST COMMON UNMATCHED PATTERNS:\n');

  const unmatchedSample = unmatched.slice(0, 100);
  const patterns: { [key: string]: number } = {};

  unmatchedSample.forEach(ing => {
    const text = (ing.notes || ing.ingredient_name).toLowerCase();
    // Extract first word
    const firstWord = text.split(/\s+/)[0];
    if (firstWord && firstWord.length > 2) {
      patterns[firstWord] = (patterns[firstWord] || 0) + 1;
    }
  });

  const sortedPatterns = Object.entries(patterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  console.log('Top ingredient words in unmatched items:');
  sortedPatterns.forEach(([word, count]) => {
    console.log(`  ${word}: ${count} times`);
  });

  console.log('\n✅ Analysis complete!');
}

testMatching().catch(console.error);
