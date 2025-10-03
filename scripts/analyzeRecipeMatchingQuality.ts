/**
 * Analyze Recipe Ingredient Matching Quality
 * Tests the 94.8% match rate with real recipes to ensure quality
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function analyzeRecipeMatchingQuality() {
  console.log('📊 Analyzing Recipe Ingredient Matching Quality\n');

  // 1. Overall Statistics
  console.log('═══ OVERALL STATISTICS ═══\n');
  const { data: stats } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT
        COUNT(*) as total_ingredients,
        COUNT(canonical_item_id) as matched,
        COUNT(*) - COUNT(canonical_item_id) as unmatched,
        ROUND(COUNT(canonical_item_id)::numeric / COUNT(*) * 100, 2) as match_rate_percent
      FROM recipe_ingredients;
    `
  });

  if (stats) {
    console.log(`Total Ingredients: ${stats[0].total_ingredients}`);
    console.log(`Matched: ${stats[0].matched}`);
    console.log(`Unmatched: ${stats[0].unmatched}`);
    console.log(`Match Rate: ${stats[0].match_rate_percent}%\n`);
  }

  // 2. Get 20 popular recipes to test
  console.log('═══ TESTING 20 POPULAR RECIPES ═══\n');
  const { data: popularRecipes } = await supabase
    .from('recipes')
    .select(`
      id,
      title,
      servings,
      total_time_minutes
    `)
    .eq('is_public', true)
    .order('times_cooked', { ascending: false })
    .limit(20);

  if (!popularRecipes) {
    console.error('Failed to fetch recipes');
    return;
  }

  // For each recipe, check ingredient matching
  for (const recipe of popularRecipes) {
    const { data: ingredients } = await supabase
      .from('recipe_ingredients')
      .select(`
        ingredient_name,
        canonical_item_id,
        amount,
        unit,
        canonical_items (canonical_name)
      `)
      .eq('recipe_id', recipe.id);

    if (!ingredients) continue;

    const matched = ingredients.filter(i => i.canonical_item_id).length;
    const total = ingredients.length;
    const matchRate = total > 0 ? ((matched / total) * 100).toFixed(1) : 0;

    console.log(`📖 ${recipe.title}`);
    console.log(`   Ingredients: ${matched}/${total} matched (${matchRate}%)`);

    // Show unmatched ingredients
    const unmatched = ingredients.filter(i => !i.canonical_item_id);
    if (unmatched.length > 0 && unmatched.length <= 5) {
      console.log(`   Unmatched:`);
      unmatched.forEach(ing => {
        console.log(`     - "${ing.ingredient_name}"`);
      });
    } else if (unmatched.length > 5) {
      console.log(`   Unmatched: ${unmatched.length} items (too many to list)`);
    }
    console.log();
  }

  // 3. Category-wise matching
  console.log('\n═══ MATCHING BY CANONICAL CATEGORY ═══\n');
  const { data: categoryStats } = await supabase
    .from('recipe_ingredients')
    .select(`
      canonical_items (category)
    `)
    .not('canonical_item_id', 'is', null);

  if (categoryStats) {
    const categoryCounts = categoryStats.reduce((acc: any, item: any) => {
      const cat = item.canonical_items?.category || 'Unknown';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    const sorted = Object.entries(categoryCounts)
      .sort(([, a]: any, [, b]: any) => b - a)
      .slice(0, 15);

    sorted.forEach(([category, count]) => {
      console.log(`${category.padEnd(20)} ${count}`);
    });
  }

  // 4. Most common unmatched ingredients
  console.log('\n═══ TOP 30 UNMATCHED INGREDIENTS ═══\n');
  const { data: unmatchedFreq } = await supabase
    .from('recipe_ingredients')
    .select('ingredient_name')
    .is('canonical_item_id', null);

  if (unmatchedFreq) {
    const freq: Record<string, number> = {};
    unmatchedFreq.forEach((item: any) => {
      const name = item.ingredient_name.toLowerCase().trim();
      freq[name] = (freq[name] || 0) + 1;
    });

    const sorted = Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 30);

    sorted.forEach(([name, count], index) => {
      console.log(`${(index + 1).toString().padStart(2)}. ${name.padEnd(40)} (${count}x)`);
    });
  }

  // 5. Recommendation
  console.log('\n═══ RECOMMENDATIONS ═══\n');
  console.log('✅ If match rate is 94%+: Quality is good, proceed with recipe search');
  console.log('⚠️  If match rate is 85-94%: Add top unmatched items to canonical_items');
  console.log('❌ If match rate is <85%: Review matching algorithm');
}

analyzeRecipeMatchingQuality().catch(console.error);
