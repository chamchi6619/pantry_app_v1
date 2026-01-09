#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getRecipe(searchTitle) {
  const { data: recipes, error } = await supabase
    .from('recipe_database')
    .select(`
      *,
      ingredients:recipe_database_ingredients(ingredient_name, amount, unit, preparation, sort_order),
      instructions:recipe_database_instructions(step_number, instruction_text)
    `)
    .ilike('title', `%${searchTitle}%`)
    .limit(1);

  if (error) throw error;
  if (!recipes || recipes.length === 0) {
    console.log(`Recipe not found: ${searchTitle}`);
    return;
  }

  const recipe = recipes[0];

  console.log('='.repeat(60));
  console.log(`RECIPE: ${recipe.title}`);
  console.log('='.repeat(60));
  console.log(`\nDescription: ${recipe.description}`);
  console.log(`\nPrep: ${recipe.prep_time_minutes} min | Cook: ${recipe.cook_time_minutes} min | Total: ${recipe.total_time_minutes} min`);
  console.log(`Servings: ${recipe.servings} | Difficulty: ${recipe.difficulty}`);
  console.log(`Category: ${recipe.category}`);

  console.log(`\n${'='.repeat(60)}`);
  console.log('INGREDIENTS:');
  console.log('='.repeat(60));
  recipe.ingredients
    .sort((a, b) => a.sort_order - b.sort_order)
    .forEach(ing => {
      const amount = ing.amount ? `${ing.amount}` : '';
      const unit = ing.unit || '';
      const prep = ing.preparation ? `, ${ing.preparation}` : '';
      console.log(`${amount} ${unit} ${ing.ingredient_name}${prep}`.trim());
    });

  console.log(`\n${'='.repeat(60)}`);
  console.log('INSTRUCTIONS:');
  console.log('='.repeat(60));
  recipe.instructions
    .sort((a, b) => a.step_number - b.step_number)
    .forEach(inst => {
      console.log(`${inst.step_number}. ${inst.instruction_text}`);
    });

  console.log('\n');
}

const searchTitle = process.argv[2] || 'beef and broccoli';
getRecipe(searchTitle).catch(console.error);
