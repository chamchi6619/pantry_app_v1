#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to convert recipe filename to title
function filenameToTitle(filename) {
  // Remove .webp and UUID
  // Format: recipe_name_uuid.webp -> recipe_name
  const nameWithUuid = filename.replace('.webp', '');
  const parts = nameWithUuid.split('_');

  // Remove last UUID part (36 chars with dashes)
  // UUID format: 8-4-4-4-12 = 36 chars total
  const lastPart = parts[parts.length - 1];
  if (lastPart.includes('-')) {
    parts.pop(); // Remove UUID
  }

  // Rejoin and convert to title case
  const recipeName = parts.join('_');

  // Convert to title case (e.g., "chicken_curry" -> "Chicken Curry")
  return recipeName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

async function updateRecipeUrls() {
  console.log('Updating recipe_database with Supabase Storage URLs...\n');

  // Read upload results
  const resultsPath = path.join(__dirname, 'upload_results.json');
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

  console.log(`Found ${results.success.length} uploaded images\n`);

  const updateResults = {
    success: [],
    failed: [],
    notFound: []
  };

  let count = 0;
  for (const { filename, publicUrl } of results.success) {
    count++;

    // Convert filename to recipe title
    const title = filenameToTitle(filename);

    try {
      // Find recipe by title
      const { data: recipes, error: selectError } = await supabase
        .from('recipe_database')
        .select('id, title')
        .ilike('title', title) // Case-insensitive match
        .limit(1);

      if (selectError) throw selectError;

      if (!recipes || recipes.length === 0) {
        updateResults.notFound.push({ filename, expectedTitle: title });
        console.log(`⚠️  Recipe not found: ${title} (from ${filename})`);
        continue;
      }

      const recipe = recipes[0];

      // Update image_url
      const { error: updateError } = await supabase
        .from('recipe_database')
        .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', recipe.id);

      if (updateError) throw updateError;

      updateResults.success.push({
        filename,
        title: recipe.title,
        url: publicUrl
      });

      if (count % 20 === 0) {
        console.log(`Updated ${count}/${results.success.length} recipes...`);
      }

    } catch (error) {
      console.error(`Failed to update ${title}:`, error.message);
      updateResults.failed.push({
        filename,
        expectedTitle: title,
        error: error.message
      });
    }
  }

  console.log(`\n✅ Successfully updated: ${updateResults.success.length}/${results.success.length}`);

  if (updateResults.notFound.length > 0) {
    console.log(`⚠️  Not found in database: ${updateResults.notFound.length}`);
    updateResults.notFound.forEach(r => {
      console.log(`   - ${r.expectedTitle} (${r.filename})`);
    });
  }

  if (updateResults.failed.length > 0) {
    console.log(`❌ Failed: ${updateResults.failed.length}`);
    updateResults.failed.forEach(r => {
      console.log(`   - ${r.expectedTitle}: ${r.error}`);
    });
  }

  // Save results
  const outputPath = path.join(__dirname, 'update_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(updateResults, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);

  return updateResults;
}

updateRecipeUrls().catch(console.error);
