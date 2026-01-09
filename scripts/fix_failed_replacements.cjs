#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STOCK_PHOTOS_DIR = path.join(__dirname, 'recipe_image_stock_search');
const AI_IMAGES_DIR = path.join(__dirname, 'recipe_images');
const BUCKET_NAME = 'recipe-images';

// Manual mappings for the 4 failed dishes
const MANUAL_MAPPINGS = [
  {
    stockPhoto: 'chicken karaage.jpg',
    aiImage: 'classic_chicken_karaage_bd8d9f56-c246-489d-987c-152e2123eb7a.webp'
  },
  {
    stockPhoto: 'dakgalbi spicy chicken.jpg',
    aiImage: 'dak_galbi_spicy_chicken_550b4521-6769-4afb-a1e9-e6594aede38d.webp'
  },
  {
    stockPhoto: 'egg-drop-soup-9735931.png',
    aiImage: 'egg_drop_soup_fc2690b2-8c71-489c-8ba9-b05210f991f4.webp'
  },
  {
    stockPhoto: 'general tso chicken.jpg',
    aiImage: 'general_tso_s_chicken_8495c775-3edf-4c08-b92b-cef37141e039.webp'
  }
];

async function replaceImage(stockPhotoPath, aiImagePath) {
  const buffer = await sharp(stockPhotoPath)
    .webp({ quality: 90 })
    .resize(1024, 1024, { fit: 'cover' })
    .toBuffer();

  fs.writeFileSync(aiImagePath, buffer);
  return buffer;
}

async function uploadToSupabase(filename, buffer) {
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filename, buffer, {
      contentType: 'image/webp',
      upsert: true
    });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filename);

  return publicUrl;
}

async function main() {
  console.log('Fixing 4 failed image replacements...\n');

  const results = {
    success: [],
    failed: []
  };

  for (const mapping of MANUAL_MAPPINGS) {
    const stockPhotoPath = path.join(STOCK_PHOTOS_DIR, mapping.stockPhoto);
    const aiImagePath = path.join(AI_IMAGES_DIR, mapping.aiImage);

    try {
      console.log(`Processing: ${mapping.stockPhoto} → ${mapping.aiImage}`);

      if (!fs.existsSync(stockPhotoPath)) {
        throw new Error(`Stock photo not found: ${stockPhotoPath}`);
      }

      if (!fs.existsSync(aiImagePath)) {
        throw new Error(`AI image not found: ${aiImagePath}`);
      }

      // Convert and replace
      console.log(`  Converting to webp and replacing...`);
      const buffer = await replaceImage(stockPhotoPath, aiImagePath);

      // Upload to Supabase
      console.log(`  Uploading to Supabase Storage...`);
      const publicUrl = await uploadToSupabase(mapping.aiImage, buffer);

      console.log(`  ✅ Success: ${mapping.aiImage}\n`);
      results.success.push({
        stockPhoto: mapping.stockPhoto,
        aiImage: mapping.aiImage,
        url: publicUrl
      });

    } catch (error) {
      console.error(`  ❌ Failed: ${error.message}\n`);
      results.failed.push({
        stockPhoto: mapping.stockPhoto,
        error: error.message
      });
    }
  }

  console.log('='.repeat(60));
  console.log('SUMMARY:');
  console.log(`✅ Success: ${results.success.length}/4`);
  console.log(`❌ Failed: ${results.failed.length}/4`);

  if (results.failed.length > 0) {
    console.log(`\nFailed items:`);
    results.failed.forEach(f => console.log(`  - ${f.stockPhoto}: ${f.error}`));
  }

  return results;
}

main().catch(console.error);
