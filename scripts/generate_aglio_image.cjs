/**
 * Generate image for Aglio e Olio recipe
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { getPromptTemplate, categorizeDish } = require('./flux_prompt_templates.cjs');
const Replicate = require('replicate');
const fs = require('fs');
const { execSync } = require('child_process');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Create output directory
const outputDir = path.join(__dirname, 'recipe_images');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Download image from URL to local file using curl
 */
async function downloadImage(url, filepath) {
  try {
    execSync(`curl -sS "${url}" -o "${filepath}"`, { stdio: 'inherit' });
  } catch (error) {
    throw new Error(`Failed to download image: ${error.message}`);
  }
}

async function generateAglioImage() {
  console.log('Generating image for Aglio e Olio...\n');

  const recipeId = '47191eab-9597-462a-b720-7d448b8af7cf';

  // Get recipe from database
  const { data: recipe, error } = await supabase
    .from('recipe_database')
    .select('*')
    .eq('id', recipeId)
    .single();

  if (error || !recipe) {
    console.error('Failed to fetch recipe:', error);
    process.exit(1);
  }

  console.log(`Recipe: ${recipe.title}`);
  console.log(`Category: ${recipe.category || 'uncategorized'}`);
  console.log(`Description: ${recipe.description || 'N/A'}\n`);

  const prompt = getPromptTemplate(recipe);
  const dishType = categorizeDish(recipe.title, recipe.description || '', recipe.category);

  console.log(`Dish Type: ${dishType}`);
  console.log(`Prompt: ${prompt}\n`);

  try {
    console.log('Calling Replicate API (Flux 1.1 Pro)...');
    // Generate image with Flux 1.1 Pro
    const output = await replicate.run(
      "black-forest-labs/flux-1.1-pro",
      {
        input: {
          prompt: prompt,
          aspect_ratio: "1:1",
          output_format: "webp",
          output_quality: 90,
          safety_tolerance: 2
        }
      }
    );

    // Output is a URL string
    const imageUrl = output;
    console.log(`✅ Generated: ${imageUrl}\n`);

    // Create safe filename from recipe title
    const safeFilename = recipe.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const localPath = path.join(outputDir, `${safeFilename}_${recipe.id}.webp`);

    // Download image
    console.log('Downloading image...');
    await downloadImage(imageUrl, localPath);
    console.log(`💾 Saved: ${localPath}\n`);

    // Update database with image URL
    console.log('Updating database...');
    const { error: updateError } = await supabase
      .from('recipe_database')
      .update({
        image_url: imageUrl,
        image_source: 'flux_ai',
        image_photographer: 'AI Generated'
      })
      .eq('id', recipe.id);

    if (updateError) {
      console.error(`⚠️  Database update failed:`, updateError);
    } else {
      console.log('✅ Database updated successfully!');
    }

    console.log('\n🎉 Done! The app should now display the image.');
    console.log('Note: You may need to pull-to-refresh in the app to see the new image.');

  } catch (error) {
    console.error('❌ Error generating image:', error);
    process.exit(1);
  }
}

generateAglioImage();
