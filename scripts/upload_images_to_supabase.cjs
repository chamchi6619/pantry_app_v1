#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const IMAGES_DIR = path.join(__dirname, 'recipe_images');
const BUCKET_NAME = 'recipe-images';

async function ensureBucketExists() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);

  if (!bucketExists) {
    console.log(`Creating bucket: ${BUCKET_NAME}`);
    const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 5242880, // 5MB
      allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png']
    });

    if (error) {
      console.error('Error creating bucket:', error);
      throw error;
    }
  }
}

async function uploadImage(filename) {
  const filepath = path.join(IMAGES_DIR, filename);
  const fileBuffer = fs.readFileSync(filepath);

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filename, fileBuffer, {
      contentType: 'image/webp',
      upsert: true // Overwrite if exists
    });

  if (error) {
    throw error;
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filename);

  return publicUrl;
}

async function uploadAllImages() {
  console.log('Starting image upload to Supabase Storage...\n');

  // Ensure bucket exists
  await ensureBucketExists();

  // Get all webp files
  const files = fs.readdirSync(IMAGES_DIR).filter(f => f.endsWith('.webp'));
  console.log(`Found ${files.length} images to upload\n`);

  const results = {
    success: [],
    failed: []
  };

  let count = 0;
  for (const filename of files) {
    count++;
    try {
      const publicUrl = await uploadImage(filename);
      results.success.push({ filename, publicUrl });

      if (count % 10 === 0) {
        console.log(`Uploaded ${count}/${files.length} images...`);
      }
    } catch (error) {
      console.error(`Failed to upload ${filename}:`, error.message);
      results.failed.push({ filename, error: error.message });
    }
  }

  console.log(`\n✅ Successfully uploaded: ${results.success.length}/${files.length}`);

  if (results.failed.length > 0) {
    console.log(`❌ Failed: ${results.failed.length}`);
    results.failed.forEach(f => console.log(`  - ${f.filename}: ${f.error}`));
  }

  // Save results to file
  const resultsPath = path.join(__dirname, 'upload_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${resultsPath}`);

  return results;
}

uploadAllImages().catch(console.error);
