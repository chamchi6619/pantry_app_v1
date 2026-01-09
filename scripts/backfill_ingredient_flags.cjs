#!/usr/bin/env node
/**
 * Backfill Script: Flag Critical & Staple Ingredients
 *
 * Purpose: Mark existing ingredients as critical (hero) or staple
 * - Critical: Recipe-defining ingredients (salmon, chicken, etc.)
 * - Staple: Common pantry items that inflate match % (salt, pepper, oil)
 *
 * Usage: node scripts/backfill_ingredient_flags.cjs
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// STAPLE INGREDIENTS (common pantry items that shouldn't inflate match %)
// ============================================================================
const STAPLE_INGREDIENTS = [
  // Salts & Peppers
  'salt', 'sea salt', 'kosher salt', 'table salt', 'fine salt', 'coarse salt',
  'black pepper', 'white pepper', 'ground black pepper', 'ground white pepper',
  'pepper', 'peppercorns', 'cayenne pepper', 'red pepper flakes',

  // Oils & Fats
  'olive oil', 'extra virgin olive oil', 'vegetable oil', 'canola oil',
  'sesame oil', 'coconut oil', 'avocado oil', 'cooking oil', 'oil',
  'butter', 'unsalted butter', 'salted butter',

  // Aromatics
  'garlic', 'garlic clove', 'garlic powder', 'minced garlic',
  'onion', 'yellow onion', 'white onion', 'red onion', 'onion powder',
  'shallot', 'scallion', 'green onion',

  // Liquids
  'water', 'chicken stock', 'chicken broth', 'vegetable stock', 'vegetable broth',
  'beef stock', 'beef broth',

  // Sugars
  'sugar', 'granulated sugar', 'white sugar', 'brown sugar', 'honey',
  'maple syrup', 'agave',

  // Flours
  'flour', 'all-purpose flour', 'plain flour',

  // Condiments
  'soy sauce', 'fish sauce', 'worcestershire sauce',

  // Acids
  'lemon juice', 'lime juice', 'vinegar', 'white vinegar', 'apple cider vinegar',
  'rice vinegar', 'balsamic vinegar',

  // Herbs & Spices (dried)
  'bay leaves', 'bay leaf', 'thyme', 'dried thyme', 'rosemary', 'dried rosemary',
  'basil', 'dried basil', 'oregano', 'dried oregano', 'parsley', 'dried parsley',
  'cumin', 'ground cumin', 'paprika', 'chili powder', 'cinnamon',
];

// ============================================================================
// MAIN BACKFILL LOGIC
// ============================================================================
async function backfillIngredientFlags() {
  console.log('🚀 Starting ingredient flags backfill...\n');

  try {
    // Step 1: Backfill recipe_database_ingredients
    console.log('📊 Processing recipe_database_ingredients...');
    await backfillRecipeDatabaseIngredients();

    // Step 2: Backfill cook_card_ingredients
    console.log('\n📊 Processing cook_card_ingredients...');
    await backfillCookCardIngredients();

    console.log('\n✅ Backfill complete!');
    console.log('\n📈 Run queries to verify:');
    console.log('   SELECT is_critical, is_staple, COUNT(*) FROM recipe_database_ingredients GROUP BY is_critical, is_staple;');
    console.log('   SELECT is_critical, is_staple, COUNT(*) FROM cook_card_ingredients GROUP BY is_critical, is_staple;');
  } catch (error) {
    console.error('\n❌ Backfill failed:', error);
    process.exit(1);
  }
}

async function backfillRecipeDatabaseIngredients() {
  // Fetch all recipes with their ingredients
  const { data: recipes, error: recipesError } = await supabase
    .from('recipe_database')
    .select('id, title');

  if (recipesError) throw recipesError;

  console.log(`   Found ${recipes.length} recipes`);

  let stapleFlagged = 0;
  let criticalFlagged = 0;

  for (const recipe of recipes) {
    // Detect hero ingredient from title
    const { data: heroResult } = await supabase.rpc(
      'detect_hero_ingredient_from_title',
      { recipe_title: recipe.title }
    );

    const heroIngredient = heroResult;

    // Fetch ingredients for this recipe
    const { data: ingredients, error: ingredientsError } = await supabase
      .from('recipe_database_ingredients')
      .select('id, ingredient_name, normalized_name')
      .eq('recipe_id', recipe.id);

    if (ingredientsError) throw ingredientsError;

    for (const ingredient of ingredients) {
      const nameLower = (ingredient.normalized_name || ingredient.ingredient_name).toLowerCase().trim();

      // Check if staple
      const isStaple = STAPLE_INGREDIENTS.some(staple =>
        nameLower === staple || nameLower.includes(staple)
      );

      // Check if critical (matches hero ingredient)
      const isCritical = heroIngredient && nameLower.includes(heroIngredient);

      // Update flags if needed
      if (isStaple || isCritical) {
        const { error: updateError } = await supabase
          .from('recipe_database_ingredients')
          .update({
            is_staple: isStaple,
            is_critical: isCritical || false,
          })
          .eq('id', ingredient.id);

        if (updateError) throw updateError;

        if (isStaple) stapleFlagged++;
        if (isCritical) criticalFlagged++;
      }
    }
  }

  console.log(`   ✓ Flagged ${stapleFlagged} staple ingredients`);
  console.log(`   ✓ Flagged ${criticalFlagged} critical ingredients`);
}

async function backfillCookCardIngredients() {
  // Fetch all cook cards with their ingredients
  const { data: cookCards, error: cardsError } = await supabase
    .from('cook_cards')
    .select('id, title');

  if (cardsError) throw cardsError;

  console.log(`   Found ${cookCards.length} cook cards`);

  let stapleFlagged = 0;
  let criticalFlagged = 0;

  for (const card of cookCards) {
    // Detect hero ingredient from title
    const { data: heroResult } = await supabase.rpc(
      'detect_hero_ingredient_from_title',
      { recipe_title: card.title }
    );

    const heroIngredient = heroResult;

    // Fetch ingredients for this cook card
    const { data: ingredients, error: ingredientsError } = await supabase
      .from('cook_card_ingredients')
      .select('id, ingredient_name, normalized_name')
      .eq('cook_card_id', card.id);

    if (ingredientsError) throw ingredientsError;

    for (const ingredient of ingredients) {
      const nameLower = (ingredient.normalized_name || ingredient.ingredient_name).toLowerCase().trim();

      // Check if staple
      const isStaple = STAPLE_INGREDIENTS.some(staple =>
        nameLower === staple || nameLower.includes(staple)
      );

      // Check if critical (matches hero ingredient)
      const isCritical = heroIngredient && nameLower.includes(heroIngredient);

      // Update flags if needed
      if (isStaple || isCritical) {
        const { error: updateError } = await supabase
          .from('cook_card_ingredients')
          .update({
            is_staple: isStaple,
            is_critical: isCritical || false,
          })
          .eq('id', ingredient.id);

        if (updateError) throw updateError;

        if (isStaple) stapleFlagged++;
        if (isCritical) criticalFlagged++;
      }
    }
  }

  console.log(`   ✓ Flagged ${stapleFlagged} staple ingredients`);
  console.log(`   ✓ Flagged ${criticalFlagged} critical ingredients`);
}

// Run backfill
backfillIngredientFlags();
