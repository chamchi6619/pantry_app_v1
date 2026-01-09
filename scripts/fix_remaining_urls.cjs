#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET_NAME = 'recipe-images';

// Manual mappings for the 31 mismatched recipes
const MANUAL_MAPPINGS = {
  'aglio_e_olio_garlic_pasta': 'Aglio e Olio',
  'aloo_gobi_potato_cauliflower': 'Aloo Gobi',
  'beef_bowl_gyudon': 'Beef Bowl (Gyudon)',
  'bingsu_shaved_ice': 'Bingsu',
  'bulgogi_beef': 'Bulgogi',
  'char_siu_bbq_pork': 'Char Siu',
  'dak_galbi_spicy_chicken': 'Dak Galbi (Spicy Chicken)',
  'dakgangjeong_sweet_crispy_chicken': 'Dakgangjeong (Sweet Crispy Chicken)',
  'drunken_noodles_pad_kee_mao': 'Drunken Noodles (Pad Kee Mao)',
  'dumplings_jiaozi': 'Dumplings (Jiaozi)',
  'elote_mexican_street_corn': 'Elote (Mexican Street Corn)',
  'galbi_short_ribs': 'Galbi (Short Ribs)',
  'general_tso_s_chicken': 'General Tso\'s Chicken',
  'hotteok_sweet_pancakes': 'Hotteok (Sweet Pancakes)',
  'jajangmyeon_black_bean_noodles': 'Jajangmyeon',
  'japchae_glass_noodles': 'Japchae (Glass Noodles)',
  'kimchi_jjigae_kimchi_stew': 'Kimchi Jjigae (Kimchi Stew)',
  'larb_gai_chicken_salad': 'Larb Gai',
  'mandu_dumplings': 'Mandu (Dumplings)',
  'onigiri_rice_balls': 'Onigiri (Rice Balls)',
  'pad_krapow_basil_stir_fry': 'Pad Krapow (Basil Stir-Fry)',
  'pan_seared_salmon': 'Pan-Seared Salmon',
  'pozole_rojo_red_pork_and_hominy_stew': 'Pozole Rojo',
  'samgyeopsal_pork_belly': 'Samgyeopsal (Pork Belly)',
  'som_tam_papaya_salad': 'Som Tam',
  'sundubu_jjigae_tofu_stew': 'Sundubu Jjigae (Tofu Stew)',
  'tamagoyaki_japanese_omelette': 'Tamagoyaki (Japanese Omelette)',
  'tom_kha_gai_coconut_chicken_soup': 'Tom Kha Gai',
  'tonkatsu_pork_cutlet': 'Tonkatsu (Pork Cutlet)',
  'tteokbokki_spicy_rice_cakes': 'Tteokbokki (Spicy Rice Cakes)',
  'zucchini_noodles_zoodles': 'Zucchini Noodles (Zoodles)'
};

async function fixUrls() {
  console.log('Fixing 31 remaining recipe URLs...\n');

  // Read the upload results to get filenames
  const resultsPath = path.join(__dirname, 'upload_results.json');
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

  const updates = {
    success: [],
    failed: []
  };

  for (const { filename, publicUrl } of results.success) {
    // Extract recipe key from filename (remove UUID and extension)
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 chars)
    const nameWithoutExt = filename.replace('.webp', '');
    const recipeKey = nameWithoutExt.substring(0, nameWithoutExt.length - 37); // Remove _UUID

    // Check if this is one of the 31 that need fixing
    if (!MANUAL_MAPPINGS[recipeKey]) {
      continue;
    }

    const dbTitle = MANUAL_MAPPINGS[recipeKey];

    try {
      // Update the database
      const { error } = await supabase
        .from('recipe_database')
        .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('title', dbTitle);

      if (error) throw error;

      console.log(`✅ ${dbTitle}`);
      updates.success.push({ title: dbTitle, url: publicUrl });

    } catch (error) {
      console.error(`❌ ${dbTitle}: ${error.message}`);
      updates.failed.push({ title: dbTitle, error: error.message });
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY:');
  console.log(`✅ Success: ${updates.success.length}/31`);
  console.log(`❌ Failed: ${updates.failed.length}/31`);

  if (updates.failed.length > 0) {
    console.log(`\nFailed:`, updates.failed);
  }

  return updates;
}

fixUrls().catch(console.error);
