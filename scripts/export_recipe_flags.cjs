#!/usr/bin/env node
/**
 * Export Script: Recipe Database with Ingredient Flags
 *
 * Purpose: Export all recipes with ingredient flags for manual review
 * Output: CSV file for easy review in Excel/Google Sheets
 *
 * Usage: node scripts/export_recipe_flags.cjs
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function exportRecipeFlags() {
  console.log('🚀 Exporting recipe database with ingredient flags...\n');

  try {
    // Fetch all recipes
    const { data: recipes, error: recipesError } = await supabase
      .from('recipe_database')
      .select('id, title, category, total_time_minutes')
      .order('category', { ascending: true })
      .order('title', { ascending: true });

    if (recipesError) throw recipesError;

    console.log(`📊 Found ${recipes.length} recipes\n`);

    // Prepare CSV data
    const csvRows = [];

    // CSV Header
    csvRows.push([
      'Recipe ID',
      'Recipe Title',
      'Category',
      'Time (min)',
      'Ingredient Name',
      'Is Critical',
      'Is Staple',
      'Notes'
    ].join(','));

    let totalIngredients = 0;
    let criticalCount = 0;
    let stapleCount = 0;

    for (const recipe of recipes) {
      // Fetch ingredients for this recipe
      const { data: ingredients, error: ingredientsError } = await supabase
        .from('recipe_database_ingredients')
        .select('id, ingredient_name, is_critical, is_staple, sort_order')
        .eq('recipe_id', recipe.id)
        .order('sort_order', { ascending: true });

      if (ingredientsError) throw ingredientsError;

      totalIngredients += ingredients.length;

      // Check if recipe has any critical ingredients flagged
      const hasCritical = ingredients.some(i => i.is_critical);
      const criticalIngredients = ingredients.filter(i => i.is_critical);
      const stapleIngredients = ingredients.filter(i => i.is_staple);

      criticalCount += criticalIngredients.length;
      stapleCount += stapleIngredients.length;

      // Add note if no critical ingredient detected
      const note = !hasCritical ? '⚠️ NO HERO DETECTED' : '';

      // Add each ingredient as a row
      ingredients.forEach((ing, idx) => {
        csvRows.push([
          recipe.id,
          `"${recipe.title}"`, // Quote to handle commas in title
          recipe.category,
          recipe.total_time_minutes || '',
          `"${ing.ingredient_name}"`, // Quote to handle commas
          ing.is_critical ? 'YES' : 'NO',
          ing.is_staple ? 'YES' : 'NO',
          idx === 0 ? note : '' // Only show note on first ingredient
        ].join(','));
      });

      // Add blank row between recipes for readability
      csvRows.push('');
    }

    // Write CSV file
    const outputPath = path.join(__dirname, 'recipe_flags_export.csv');
    fs.writeFileSync(outputPath, csvRows.join('\n'), 'utf-8');

    console.log('✅ Export complete!\n');
    console.log(`📄 File: ${outputPath}`);
    console.log(`\n📊 Statistics:`);
    console.log(`   Total Recipes: ${recipes.length}`);
    console.log(`   Total Ingredients: ${totalIngredients}`);
    console.log(`   Critical Flagged: ${criticalCount} (${((criticalCount/totalIngredients)*100).toFixed(1)}%)`);
    console.log(`   Staple Flagged: ${stapleCount} (${((stapleCount/totalIngredients)*100).toFixed(1)}%)`);
    console.log(`   Recipes with no hero: ${recipes.length - recipes.filter(r =>
      ingredients.some(i => i.is_critical)
    ).length}`);

    console.log(`\n💡 Tips for review:`);
    console.log(`   1. Open in Excel/Google Sheets`);
    console.log(`   2. Look for "⚠️ NO HERO DETECTED" - these need manual review`);
    console.log(`   3. Check if critical ingredients match recipe title`);
    console.log(`   4. Verify staples don't include hero ingredients`);

    // Also export summary JSON for problematic recipes
    const problematicRecipes = [];
    for (const recipe of recipes) {
      const { data: ingredients } = await supabase
        .from('recipe_database_ingredients')
        .select('ingredient_name, is_critical, is_staple')
        .eq('recipe_id', recipe.id);

      const hasCritical = ingredients.some(i => i.is_critical);
      if (!hasCritical) {
        problematicRecipes.push({
          id: recipe.id,
          title: recipe.title,
          category: recipe.category,
          ingredients: ingredients.map(i => ({
            name: i.ingredient_name,
            is_critical: i.is_critical,
            is_staple: i.is_staple
          }))
        });
      }
    }

    const jsonPath = path.join(__dirname, 'recipes_needing_review.json');
    fs.writeFileSync(jsonPath, JSON.stringify(problematicRecipes, null, 2), 'utf-8');
    console.log(`\n📋 Recipes needing review: ${jsonPath}`);
    console.log(`   ${problematicRecipes.length} recipes with no hero ingredient detected`);

  } catch (error) {
    console.error('\n❌ Export failed:', error);
    process.exit(1);
  }
}

exportRecipeFlags();
