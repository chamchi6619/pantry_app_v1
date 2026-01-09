#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkImageUrls() {
  // Check a few replaced recipes
  const testRecipes = ['Beef and Broccoli', 'Ramen', 'Bulgogi Beef'];

  console.log('Checking image URLs in database...\n');

  for (const title of testRecipes) {
    const { data, error } = await supabase
      .from('recipe_database')
      .select('title, image_url')
      .ilike('title', title)
      .limit(1);

    if (error) {
      console.error(`Error: ${error.message}`);
      continue;
    }

    if (data && data.length > 0) {
      const recipe = data[0];
      console.log(`${recipe.title}:`);
      console.log(`  URL: ${recipe.image_url || 'NULL'}\n`);
    }
  }

  // Check cleared recipes
  console.log('\nChecking cleared image URLs...\n');
  const clearedDishes = ['Hotteok', 'Korean Beef Stew'];

  for (const title of clearedDishes) {
    const { data, error } = await supabase
      .from('recipe_database')
      .select('title, image_url')
      .ilike('title', `%${title}%`)
      .limit(1);

    if (error) {
      console.error(`Error: ${error.message}`);
      continue;
    }

    if (data && data.length > 0) {
      const recipe = data[0];
      console.log(`${recipe.title}:`);
      console.log(`  URL: ${recipe.image_url || 'NULL (cleared successfully)'}\n`);
    }
  }
}

checkImageUrls().catch(console.error);
