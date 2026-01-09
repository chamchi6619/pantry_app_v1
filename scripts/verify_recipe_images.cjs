#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Manual list of mismatches identified from visual inspection (batches 1-5)
const knownMismatches = [
  'bibimbap',
  'bingsu_shaved_ice',
  'bruschetta',
  'butter_chicken',
  'cacio_e_pepe', // HAS HANDS - CRITICAL
  'caesar_salad',
  'caprese_salad',
  'chana_masala',
  'chia_pudding',
  'chicken_biryani',
  'chicken_caesar_salad',
  'chicken_curry',
  'chicken_fried_rice',
  'chicken_parmigiana',
  'chilaquiles_rojos',
  'chips_and_salsa'
];

async function main() {
  console.log('🔍 Recipe Image Verification Report');
  console.log('=====================================\n');

  // Get all recipes
  const { data: recipes, error } = await supabase
    .from('recipe_database')
    .select('id, title')
    .order('title');

  if (error) {
    console.error('Error fetching recipes:', error);
    return;
  }

  console.log(`Total recipes: ${recipes.length}`);

  // Check which images exist
  const imageDir = path.join(__dirname, 'recipe_images');
  const existingImages = fs.readdirSync(imageDir);

  console.log(`Total images: ${existingImages.length}\n`);

  // Create mapping of recipe names to filenames
  const imageMap = {};
  existingImages.forEach(filename => {
    const recipeName = filename.replace(/^([a-z_]+)_[a-f0-9-]+\.webp$/, '$1');
    imageMap[recipeName] = filename;
  });

  // Check for known mismatches
  console.log('KNOWN MISMATCHES FROM MANUAL INSPECTION:');
  console.log('=========================================\n');

  knownMismatches.forEach((name, index) => {
    const filename = Object.keys(imageMap).find(key => key === name);
    if (filename) {
      console.log(`${index + 1}. ${name} → ${imageMap[name]}`);
    }
  });

  console.log(`\nTotal mismatches found: ${knownMismatches.length}`);
  console.log(`\nError rate: ${((knownMismatches.length / 50) * 100).toFixed(1)}% (from first 50 checked)`);
  console.log(`\nProjected total mismatches (if pattern holds): ~${Math.round((knownMismatches.length / 50) * 200)}`);
}

main().catch(console.error);
