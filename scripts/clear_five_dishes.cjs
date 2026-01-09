#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DISHES_TO_CLEAR = [
  'Hotteok (Sweet Pancakes)',
  'Korean Beef Stew',
  'Rogan Josh',
  'Sundubu Jjigae (Tofu Stew)',
  'Tom Kha Gai'
];

async function clearImageUrls() {
  console.log('Clearing image URLs for 5 dishes...\n');

  for (const title of DISHES_TO_CLEAR) {
    try {
      const { error } = await supabase
        .from('recipe_database')
        .update({ image_url: null, updated_at: new Date().toISOString() })
        .eq('title', title);

      if (error) throw error;
      console.log(`✅ Cleared: ${title}`);
    } catch (error) {
      console.error(`❌ Failed to clear ${title}: ${error.message}`);
    }
  }

  console.log('\nDone!');
}

clearImageUrls().catch(console.error);
