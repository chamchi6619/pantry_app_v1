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

// Dishes without photos - will clear their image URLs
const DISHES_WITHOUT_PHOTOS = [
  'Hotteok',
  'Korean Beef Stew',
  'Rogan Josh',
  'Sundubu Jjigae',
  'Tom Kha Gai'
];

// Helper to normalize recipe title for matching
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/\s+/g, '_')
    .replace(/__+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

// Find existing AI image file by recipe title
function findAiImageFile(title) {
  const files = fs.readdirSync(AI_IMAGES_DIR);
  const searchName = normalizeTitle(title);

  const matchingFile = files.find(f => {
    const fileNamePart = f.replace('.webp', '').split('_').slice(0, -5).join('_');
    return fileNamePart === searchName || f.startsWith(searchName + '_');
  });

  return matchingFile ? path.join(AI_IMAGES_DIR, matchingFile) : null;
}

// Convert image to webp and replace AI image
async function replaceImage(stockPhotoPath, aiImagePath) {
  const buffer = await sharp(stockPhotoPath)
    .webp({ quality: 90 })
    .resize(1024, 1024, { fit: 'cover' })
    .toBuffer();

  fs.writeFileSync(aiImagePath, buffer);
  return buffer;
}

// Upload to Supabase Storage
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

// Clear image URL for dishes without photos
async function clearImageUrl(title) {
  const { error } = await supabase
    .from('recipe_database')
    .update({ image_url: null, updated_at: new Date().toISOString() })
    .ilike('title', title);

  if (error) throw error;
}

async function main() {
  console.log('Starting stock photo replacement process...\n');

  const results = {
    replaced: [],
    cleared: [],
    failed: []
  };

  // Get all stock photos
  const stockPhotos = fs.readdirSync(STOCK_PHOTOS_DIR);
  console.log(`Found ${stockPhotos.length} stock photos\n`);

  // Replace stock photos
  for (const stockPhoto of stockPhotos) {
    const stockPhotoPath = path.join(STOCK_PHOTOS_DIR, stockPhoto);

    // Skip if not an image
    if (!['.jpg', '.jpeg', '.png'].some(ext => stockPhoto.toLowerCase().endsWith(ext))) {
      continue;
    }

    try {
      // Extract recipe name from stock photo filename
      const recipeName = stockPhoto
        .replace(/\.(jpg|jpeg|png)$/i, '')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      console.log(`Processing: ${recipeName}`);

      // Find corresponding AI image
      const aiImagePath = findAiImageFile(recipeName);

      if (!aiImagePath) {
        console.log(`  ⚠️  Could not find AI image for: ${recipeName}`);
        results.failed.push({ recipeName, reason: 'AI image not found' });
        continue;
      }

      const aiImageFilename = path.basename(aiImagePath);
      console.log(`  Found AI image: ${aiImageFilename}`);

      // Convert and replace
      console.log(`  Converting to webp and replacing...`);
      const buffer = await replaceImage(stockPhotoPath, aiImagePath);

      // Upload to Supabase
      console.log(`  Uploading to Supabase Storage...`);
      const publicUrl = await uploadToSupabase(aiImageFilename, buffer);

      console.log(`  ✅ Success: ${aiImageFilename}`);
      results.replaced.push({
        recipeName,
        stockPhoto,
        aiImage: aiImageFilename,
        url: publicUrl
      });

    } catch (error) {
      console.error(`  ❌ Failed: ${error.message}`);
      results.failed.push({ recipeName: stockPhoto, reason: error.message });
    }
  }

  // Clear image URLs for dishes without photos
  console.log(`\n${'='.repeat(60)}`);
  console.log('Clearing image URLs for dishes without photos...\n');

  for (const dish of DISHES_WITHOUT_PHOTOS) {
    try {
      await clearImageUrl(dish);
      console.log(`✅ Cleared: ${dish}`);
      results.cleared.push(dish);
    } catch (error) {
      console.error(`❌ Failed to clear ${dish}: ${error.message}`);
      results.failed.push({ recipeName: dish, reason: error.message });
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY:');
  console.log(`✅ Stock photos replaced: ${results.replaced.length}`);
  console.log(`🔄 Image URLs cleared: ${results.cleared.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);

  if (results.failed.length > 0) {
    console.log(`\nFailed items:`);
    results.failed.forEach(f => console.log(`  - ${f.recipeName || f}: ${f.reason || ''}`));
  }

  // Save results
  const resultsPath = path.join(__dirname, 'stock_photo_replacement_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed results saved to: ${resultsPath}`);

  return results;
}

main().catch(console.error);
