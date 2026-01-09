/**
 * Generate images for all 200 recipes
 *
 * Process:
 * 1. Load all recipes without images from database
 * 2. Generate Flux 1.1 Pro prompts using template system
 * 3. Call Replicate API to generate images ($0.04 each)
 * 4. Download and save images locally to scripts/recipe_images/
 * 5. Update database with image URLs and metadata
 *
 * Total cost: $8.00 for 200 images
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

/**
 * Generate image for a single recipe
 */
async function generateRecipeImage(recipe, index, total) {
  const prompt = getPromptTemplate(recipe);
  const dishType = categorizeDish(recipe.title, recipe.description || '', recipe.category);

  console.log(`\n[${index + 1}/${total}] ${recipe.title} [${dishType}]`);
  console.log(`  Prompt: ${prompt.substring(0, 100)}...`);

  try {
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
    console.log(`  ✅ Generated: ${imageUrl}`);

    // Create safe filename from recipe title
    const safeFilename = recipe.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const localPath = path.join(outputDir, `${safeFilename}_${recipe.id}.webp`);

    // Download image
    await downloadImage(imageUrl, localPath);
    console.log(`  💾 Saved: ${localPath}`);

    // Update database with image URL (we'll upload to Supabase storage later)
    const { error: updateError } = await supabase
      .from('recipe_database')
      .update({
        image_url: imageUrl,
        image_source: 'flux_ai',
        image_photographer: 'AI Generated'
      })
      .eq('id', recipe.id);

    if (updateError) {
      console.error(`  ⚠️  Database update failed:`, updateError);
    } else {
      console.log(`  ✅ Database updated`);
    }

    return { success: true, recipe, imageUrl, localPath };

  } catch (error) {
    console.error(`  ❌ Failed:`, error.message);
    return { success: false, recipe, error: error.message };
  }
}

/**
 * Main function
 */
async function generateAllImages() {
  console.log('🎨 FLUX 1.1 PRO IMAGE GENERATION\n');
  console.log('='.repeat(80));

  // Load all recipes without images
  console.log('\n📋 Loading recipes from database...');
  const { data: recipes, error } = await supabase
    .from('recipe_database')
    .select('id, title, category, description')
    .is('image_url', null)
    .order('category', { ascending: true });

  if (error) {
    console.error('❌ Database error:', error);
    process.exit(1);
  }

  if (!recipes || recipes.length === 0) {
    console.log('✅ All recipes already have images!');
    return;
  }

  console.log(`\nFound ${recipes.length} recipes without images`);
  console.log(`Estimated cost: $${(recipes.length * 0.04).toFixed(2)}`);
  console.log(`Output directory: ${outputDir}`);
  console.log('\n' + '='.repeat(80));

  // Generate images
  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < recipes.length; i++) {
    const result = await generateRecipeImage(recipes[i], i, recipes.length);
    results.push(result);

    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }

    // Progress update every 10 recipes
    if ((i + 1) % 10 === 0) {
      console.log(`\n📊 Progress: ${i + 1}/${recipes.length} (${successCount} success, ${failCount} failed)`);
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 FINAL SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total recipes: ${recipes.length}`);
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`💰 Actual cost: $${(successCount * 0.04).toFixed(2)}`);
  console.log(`📁 Images saved to: ${outputDir}`);

  // List any failures
  if (failCount > 0) {
    console.log('\n❌ Failed recipes:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.recipe.title}: ${r.error}`);
    });
  }

  // Save results log
  const logPath = path.join(__dirname, 'generation_results.json');
  fs.writeFileSync(logPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Full results saved to: ${logPath}`);

  console.log('\n✨ Generation complete!');
}

generateAllImages().catch(console.error);
