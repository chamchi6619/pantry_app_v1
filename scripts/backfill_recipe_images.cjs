/**
 * Recipe Image Backfill Script
 *
 * Strategy: Smart matching with Pexels (free) + Unsplash (free) fallback
 * - Multi-level search (specific → generic)
 * - Deduplication (don't reuse same photo)
 * - Quality validation
 *
 * Cost: $0
 * Coverage: ~80-90% with good matches
 */

require('dotenv').config({ path: '../backend/.env' });
const { createClient } = require('@supabase/supabase-js');

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Track used image URLs to avoid duplicates
const usedImageUrls = new Set();

/**
 * Extract searchable terms from recipe
 */
function extractSearchTerms(recipe) {
  const title = recipe.title.toLowerCase();
  const category = recipe.category.toLowerCase();

  // Common dish patterns
  const dishPatterns = [
    /pad thai/i, /fried rice/i, /stir fry/i, /curry/i,
    /pasta/i, /pizza/i, /risotto/i, /lasagna/i,
    /tacos/i, /burrito/i, /quesadilla/i, /enchilada/i,
    /ramen/i, /udon/i, /sushi/i, /tempura/i,
    /soup/i, /salad/i, /sandwich/i, /burger/i
  ];

  // Check if title contains common dish name
  for (const pattern of dishPatterns) {
    const match = title.match(pattern);
    if (match) {
      return [
        `${match[0]} ${category}`,  // "pad thai thai"
        match[0],                    // "pad thai"
        `${category} cuisine`        // "thai cuisine"
      ];
    }
  }

  // Fallback: use category + main cooking method
  const methods = ['grilled', 'roasted', 'fried', 'baked', 'sauteed'];
  const method = methods.find(m => title.includes(m));

  if (method) {
    return [
      `${method} ${category} food`,  // "grilled thai food"
      `${category} ${method}`,       // "thai grilled"
      `${category} cuisine`          // "thai cuisine"
    ];
  }

  // Generic fallback
  return [
    `${category} food dish`,         // "thai food dish"
    `${category} cuisine`,           // "thai cuisine"
    `${category} meal`               // "thai meal"
  ];
}

/**
 * Search Pexels with query
 */
async function searchPexels(query, page = 1) {
  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&page=${page}`,
      {
        headers: { 'Authorization': PEXELS_API_KEY }
      }
    );

    if (!response.ok) {
      throw new Error(`Pexels API error: ${response.status}`);
    }

    const data = await response.json();
    return data.photos || [];
  } catch (error) {
    console.error(`[Pexels] Error searching "${query}":`, error.message);
    return [];
  }
}

/**
 * Search Unsplash with query
 */
async function searchUnsplash(query, page = 1) {
  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&page=${page}`,
      {
        headers: { 'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}` }
      }
    );

    if (!response.ok) {
      throw new Error(`Unsplash API error: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error(`[Unsplash] Error searching "${query}":`, error.message);
    return [];
  }
}

/**
 * Check if image is good quality and not already used
 */
function isGoodImage(photo, source) {
  let url, width, height;

  if (source === 'pexels') {
    url = photo.src?.large;
    width = photo.width;
    height = photo.height;
  } else { // unsplash
    url = photo.urls?.regular;
    width = photo.width;
    height = photo.height;
  }

  if (!url) return false;

  // Skip if already used
  if (usedImageUrls.has(url)) {
    return false;
  }

  // Check dimensions (prefer landscape or square for food)
  const aspectRatio = width / height;
  if (aspectRatio < 0.7 || aspectRatio > 1.5) {
    return false; // Too portrait or too wide
  }

  // Minimum resolution
  if (width < 800 || height < 600) {
    return false;
  }

  return true;
}

/**
 * Get best image for recipe
 */
async function getImageForRecipe(recipe) {
  const searchTerms = extractSearchTerms(recipe);

  console.log(`\n[${recipe.title}]`);
  console.log(`  Search terms: ${searchTerms.join(' → ')}`);

  // Try each search term
  for (const term of searchTerms) {
    // Try Pexels first (no attribution required)
    console.log(`  Trying Pexels: "${term}"`);
    const pexelsPhotos = await searchPexels(term);

    for (const photo of pexelsPhotos) {
      if (isGoodImage(photo, 'pexels')) {
        const imageUrl = photo.src.large;
        usedImageUrls.add(imageUrl);

        return {
          url: imageUrl,
          source: 'pexels',
          photographer: photo.photographer,
          photographer_url: photo.photographer_url,
          search_term: term
        };
      }
    }

    // Try Unsplash as fallback (requires attribution)
    console.log(`  Trying Unsplash: "${term}"`);
    const unsplashPhotos = await searchUnsplash(term);

    for (const photo of unsplashPhotos) {
      if (isGoodImage(photo, 'unsplash')) {
        const imageUrl = photo.urls.regular;
        usedImageUrls.add(imageUrl);

        return {
          url: imageUrl,
          source: 'unsplash',
          photographer: photo.user.name,
          photographer_url: photo.user.links.html,
          search_term: term
        };
      }
    }
  }

  console.log(`  ❌ No good match found`);
  return null;
}

/**
 * Main backfill function
 */
async function backfillImages() {
  console.log('🖼️  Recipe Image Backfill Starting...\n');

  // Get recipes without images
  const { data: recipes, error } = await supabase
    .from('recipe_database')
    .select('id, title, category')
    .is('image_url', null)
    .eq('is_published', true)
    .order('category', { ascending: true });

  if (error) {
    console.error('Error fetching recipes:', error);
    return;
  }

  console.log(`Found ${recipes.length} recipes without images\n`);
  console.log('─'.repeat(60));

  let successCount = 0;
  let failCount = 0;
  const failed = [];

  for (const recipe of recipes) {
    const imageData = await getImageForRecipe(recipe);

    if (imageData) {
      // Update database
      const { error: updateError } = await supabase
        .from('recipe_database')
        .update({
          image_url: imageData.url,
          // Store metadata for attribution if needed
          image_source: imageData.source,
          image_photographer: imageData.photographer,
          image_photographer_url: imageData.photographer_url
        })
        .eq('id', recipe.id);

      if (updateError) {
        console.log(`  ❌ DB update failed: ${updateError.message}`);
        failCount++;
        failed.push({ ...recipe, reason: 'db_error' });
      } else {
        console.log(`  ✅ ${imageData.source} (${imageData.search_term})`);
        successCount++;
      }
    } else {
      failCount++;
      failed.push({ ...recipe, reason: 'no_match' });
    }

    // Rate limiting (be nice to APIs)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '─'.repeat(60));
  console.log('\n📊 Results:');
  console.log(`  ✅ Success: ${successCount}/${recipes.length}`);
  console.log(`  ❌ Failed:  ${failCount}/${recipes.length}`);

  if (failed.length > 0) {
    console.log('\n⚠️  Failed recipes:');
    failed.forEach(r => {
      console.log(`  - ${r.title} (${r.category}) - ${r.reason}`);
    });
    console.log('\n  Consider manual image selection or AI generation for these.');
  }

  console.log('\n✨ Backfill complete!');
}

// Run if called directly
if (require.main === module) {
  backfillImages().catch(console.error);
}

module.exports = { backfillImages, getImageForRecipe };
