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
const RECIPE_ID = '47191eab-9597-462a-b720-7d448b8af7cf';

async function ensureBucketExists() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);

  if (!bucketExists) {
    console.log(`Creating bucket: ${BUCKET_NAME}`);
    const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 5242880, // 5MB
      allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png', 'image/jpg']
    });

    if (error) {
      console.error('Error creating bucket:', error);
      throw error;
    }
    console.log('✅ Bucket created\n');
  } else {
    console.log(`✅ Bucket exists: ${BUCKET_NAME}\n`);
  }
}

async function uploadAglioImage() {
  console.log('Uploading Aglio e Olio image to Supabase Storage...\n');

  // Ensure bucket exists
  await ensureBucketExists();

  // Read the image file
  const imagePath = path.join(__dirname, 'recipe_image_stock_search', 'aglio_e_olio.jpg');

  if (!fs.existsSync(imagePath)) {
    console.error('❌ Image file not found:', imagePath);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(imagePath);
  const fileStats = fs.statSync(imagePath);
  console.log(`📁 File: ${imagePath}`);
  console.log(`📊 Size: ${(fileStats.size / 1024).toFixed(2)} KB\n`);

  // Upload to Supabase Storage
  const storageFilename = 'aglio_e_olio.jpg';
  console.log(`⬆️  Uploading to: ${BUCKET_NAME}/${storageFilename}`);

  const { data, error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storageFilename, fileBuffer, {
      contentType: 'image/jpeg',
      upsert: true // Overwrite if exists
    });

  if (uploadError) {
    console.error('❌ Upload failed:', uploadError);
    throw uploadError;
  }

  console.log('✅ Upload successful\n');

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storageFilename);

  console.log(`🔗 Public URL: ${publicUrl}\n`);

  // Update database
  console.log('📝 Updating recipe_database...');
  const { data: updateData, error: updateError } = await supabase
    .from('recipe_database')
    .update({
      image_url: publicUrl,
      image_source: 'stock_photo',
      image_photographer: 'Stock'
    })
    .eq('id', RECIPE_ID)
    .select('id, title, image_url, image_source, image_photographer');

  if (updateError) {
    console.error('❌ Database update failed:', updateError);
    throw updateError;
  }

  console.log('✅ Database updated successfully!\n');
  console.log('Recipe:');
  console.log(JSON.stringify(updateData, null, 2));

  console.log('\n🎉 Done! Pull-to-refresh in the app to see the new image.');
}

uploadAglioImage().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
