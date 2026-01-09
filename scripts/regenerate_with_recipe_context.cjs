#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const Replicate = require('replicate');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const IMAGES_DIR = path.join(__dirname, 'recipe_images');
const OUTPUT_DIR = path.join(__dirname, 'recipe_images_regenerated');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Created output directory: ${OUTPUT_DIR}\n`);
}

// List of recipes to regenerate
const RECIPES_TO_REGENERATE = [
  'Aglio e Olio',
  'Beef and Broccoli',
  'Beef Bowl (Gyudon)',
  'Beef Teriyaki',
  'Bulgogi Beef',
  'Chicken Noodle Soup',
  'Chicken Parmigiana',
  'Chicken Karaage',
  'Dakgalbi (Spicy Chicken)',
  'Dakgangjeong',
  'Fettuccine Alfredo',
  'General Tso Chicken',
  'Gimbap',
  'Hotteok',
  'Japchae',
  'Kimchi Jjigae',
  'Korean Beef Stew',
  'Kung Pao Chicken',
  'Mandu (Dumplings)'
];

// Helper to find image file by recipe title
function findImageFile(title) {
  const files = fs.readdirSync(IMAGES_DIR);

  // Convert title to snake_case and search
  const searchName = title
    .toLowerCase()
    .replace(/[()]/g, '') // Remove parentheses
    .replace(/\s+/g, '_') // Spaces to underscores
    .replace(/__+/g, '_') // Multiple underscores to single
    .replace(/[^a-z0-9_]/g, ''); // Remove special chars

  const matchingFile = files.find(f => {
    const fileNamePart = f.split('_').slice(0, -5).join('_'); // Remove UUID and .webp
    return fileNamePart === searchName || f.startsWith(searchName + '_');
  });

  return matchingFile ? path.join(IMAGES_DIR, matchingFile) : null;
}

// Fetch recipe with all details
async function fetchRecipe(title) {
  const { data: recipes, error } = await supabase
    .from('recipe_database')
    .select(`
      *,
      ingredients:recipe_database_ingredients(ingredient_name, amount, unit, preparation),
      instructions:recipe_database_instructions(step_number, instruction_text)
    `)
    .ilike('title', title)
    .limit(1);

  if (error) throw error;
  if (!recipes || recipes.length === 0) {
    throw new Error(`Recipe not found: ${title}`);
  }

  return recipes[0];
}

// Generate prompt from recipe data
function generatePrompt(recipe) {
  const { title, description, ingredients, instructions } = recipe;

  // Extract key ingredients (first 5-7 main ones)
  const keyIngredients = ingredients
    .slice(0, 7)
    .map(i => i.ingredient_name)
    .join(', ');

  // Get final presentation hints from last instruction
  const lastStep = instructions
    .sort((a, b) => b.step_number - a.step_number)[0]
    ?.instruction_text || '';

  // Extract serving/presentation keywords from last step
  const presentationHints = lastStep
    .toLowerCase()
    .match(/(garnish|topped|served|sprinkled|drizzled)[^.]+/)?.[0] || '';

  // Build comprehensive prompt
  const prompt = `Overhead food photography shot from directly above at 90-degree angle of ${title}, ${description}.
Key ingredients visible: ${keyIngredients}.
${presentationHints ? `Presentation: ${presentationHints}.` : ''}
Served in a white bowl or plate sitting on table surface, bowl is not being held,
no hands visible anywhere in frame, no people, no chopsticks, no utensils being held,
no body parts of any kind visible, food only, static product shot,
50mm lens, bright natural daylight, highly detailed, appetizing, professional food photography`;

  return prompt.replace(/\s+/g, ' ').trim();
}

// Download and save image
async function downloadImage(url, filepath) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(filepath, Buffer.from(buffer));
}

// Main regeneration function
async function regenerateRecipeImages() {
  console.log(`Starting recipe-aware image regeneration for ${RECIPES_TO_REGENERATE.length} recipes...\n`);

  const results = {
    success: [],
    failed: []
  };

  for (const title of RECIPES_TO_REGENERATE) {
    try {
      console.log(`\n[${results.success.length + results.failed.length + 1}/${RECIPES_TO_REGENERATE.length}] Processing: ${title}`);

      // Find existing image file
      const imageFile = findImageFile(title);
      if (!imageFile) {
        throw new Error(`Image file not found for: ${title}`);
      }
      console.log(`  Found image: ${path.basename(imageFile)}`);

      // Fetch recipe data
      const recipe = await fetchRecipe(title);
      console.log(`  Fetched recipe with ${recipe.ingredients.length} ingredients`);

      // Generate context-aware prompt
      const prompt = generatePrompt(recipe);
      console.log(`  Generated prompt (${prompt.length} chars)`);
      console.log(`  Preview: ${prompt.substring(0, 150)}...`);

      // Generate new image
      console.log(`  Generating image...`);
      const output = await replicate.run("black-forest-labs/flux-1.1-pro", {
        input: {
          prompt: prompt,
          aspect_ratio: "1:1",
          output_format: "webp",
          output_quality: 90,
          safety_tolerance: 2,
          prompt_upsampling: false
        }
      });

      // Download and save to new directory (keep original intact)
      const outputFile = path.join(OUTPUT_DIR, path.basename(imageFile));
      await downloadImage(output, outputFile);
      const stats = fs.statSync(outputFile);
      const fileSizeKB = (stats.size / 1024).toFixed(2);

      console.log(`  ✅ Success: ${path.basename(outputFile)} (${fileSizeKB} KB)`);
      results.success.push({
        title,
        filename: path.basename(outputFile),
        originalPath: imageFile,
        newPath: outputFile,
        prompt: prompt.substring(0, 200) + '...'
      });

    } catch (error) {
      console.error(`  ❌ Failed: ${error.message}`);
      results.failed.push({
        title,
        error: error.message
      });
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULTS:`);
  console.log(`✅ Success: ${results.success.length}/${RECIPES_TO_REGENERATE.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`💰 Cost: $${(results.success.length * 0.04).toFixed(2)}`);
  console.log(`\n📁 Original images: ${IMAGES_DIR}`);
  console.log(`📁 New images: ${OUTPUT_DIR}`);
  console.log(`\nCompare the images and decide which ones to keep!`);

  if (results.failed.length > 0) {
    console.log(`\nFailed recipes:`);
    results.failed.forEach(f => console.log(`  - ${f.title}: ${f.error}`));
  }

  // Save results
  const resultsPath = path.join(__dirname, 'recipe_context_regeneration_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed results saved to: ${resultsPath}`);

  return results;
}

regenerateRecipeImages().catch(console.error);
