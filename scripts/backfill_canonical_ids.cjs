const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_HOUSEHOLD_ID = 'b2f96ded-577a-47b1-9ab0-13a7fb4f99b3';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Matching logic (copied from canonicalMatcher.ts)
function normalize(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/^s\s+/, '')
    .replace(/\b(low-fat|lowfat|reduced-fat|fat-free|nonfat|non-fat)\b/gi, '')
    .replace(/\b(low-sodium|reduced-sodium|sodium-free)\b/gi, '')
    .replace(/\b(lite|light|reduced|part-skim|plain)\b/gi, '')
    .replace(/\b(granny smith|gala|fuji|honeycrisp|red delicious|tart)\s+(apple)/gi, '$2')
    .replace(/\b(kirkland|365|great value|member's mark|store brand|organic)\b/gi, '')
    .replace(/\b(finely|coarsely|freshly|thinly|thickly|roughly|lightly)\s+/g, '')
    .replace(/\b(chopped|sliced|diced|minced|grated|shredded|crushed|ground|whole)\b/g, '')
    .replace(/\b(fresh|dried|frozen|canned|raw|roasted|toasted|cooked|prepared|uncooked)\b/g, '')
    .replace(/\b(instant|quick-cooking|rapid-rise|ready-to-eat)\b/g, '')
    .replace(/\b(bunch|sprig|sprigs|leaves|leaf|clove|cloves|head|heads|piece|pieces)\s+(of\s+)?/g, '')
    .replace(/\b(pinch|dash|envelope|can|jar|package|box|container)\s+(of\s+)?/g, '')
    .replace(/\b(peeled|seeded|trimmed|drained|rinsed|scrubbed|halved|quartered|pitted|cubed)\b/g, '')
    .replace(/\b(divided|plus more|to taste|optional|if desired|if needed)\b/g, '')
    .replace(/\s+or\s+\w+(\s+\w+)?/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(cup|cups|tablespoon|tablespoons|teaspoon|teaspoons|tbsp|tsp|oz|ounce|ounces|lb|pound|pounds|g|gram|grams|ml|liter|liters)\b/g, '')
    .replace(/\b\d+(\.\d+)?\s*/g, '')
    .replace(/[,;]+/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findMatch(ingredientName, canonicalItems) {
  const normalized = normalize(ingredientName);

  if (!normalized || normalized.length < 3) return null;

  // 1. EXACT MATCH
  for (const item of canonicalItems) {
    if (normalize(item.name) === normalized) {
      return {
        canonical_item_id: item.id,
        matched_name: item.name,
        confidence: 'exact'
      };
    }
  }

  // 2. EXACT MATCH on aliases
  for (const item of canonicalItems) {
    if (item.aliases) {
      for (const alias of item.aliases) {
        if (normalize(alias) === normalized) {
          return {
            canonical_item_id: item.id,
            matched_name: item.name,
            confidence: 'alias'
          };
        }
      }
    }
  }

  // 3. SINGULAR/PLURAL MATCH
  for (const item of canonicalItems) {
    const canonicalNorm = normalize(item.name);

    if (canonicalNorm === normalized + 's' || canonicalNorm + 's' === normalized ||
        canonicalNorm === normalized + 'es' || canonicalNorm + 'es' === normalized) {
      return {
        canonical_item_id: item.id,
        matched_name: item.name,
        confidence: 'fuzzy'
      };
    }

    if (item.aliases) {
      for (const alias of item.aliases) {
        const aliasNorm = normalize(alias);
        if (aliasNorm === normalized + 's' || aliasNorm + 's' === normalized ||
            aliasNorm === normalized + 'es' || aliasNorm + 'es' === normalized) {
          return {
            canonical_item_id: item.id,
            matched_name: item.name,
            confidence: 'alias'
          };
        }
      }
    }
  }

  // 4. CONTAINS MATCH (prefer longest match)
  let bestMatch = null;
  let longestMatchLength = 0;

  for (const item of canonicalItems) {
    const canonicalNorm = normalize(item.name);

    // Allow 3-letter words if they're common ingredients
    const allowedShortWords = ['egg', 'oil', 'ham', 'jam', 'tea', 'ice', 'yam', 'pea', 'cod', 'pie'];
    const minLength = allowedShortWords.includes(canonicalNorm) ? 3 : 4;

    if (canonicalNorm.length < minLength) continue;

    if (normalized.includes(canonicalNorm) && canonicalNorm.length > longestMatchLength) {
      bestMatch = {
        canonical_item_id: item.id,
        matched_name: item.name,
        confidence: 'fuzzy'
      };
      longestMatchLength = canonicalNorm.length;
    }

    if (canonicalNorm.includes(normalized) && normalized.length >= 4 && normalized.length > longestMatchLength) {
      bestMatch = {
        canonical_item_id: item.id,
        matched_name: item.name,
        confidence: 'fuzzy'
      };
      longestMatchLength = normalized.length;
    }
  }

  if (bestMatch) return bestMatch;

  return null;
}

async function backfillCanonicalIds() {
  console.log('🔧 Backfilling canonical_item_id for household pantry items...\n');

  try {
    // 1. Load all canonical items
    const { data: canonicalItems, error: canonicalError } = await supabase
      .from('canonical_items')
      .select('id, name, aliases, category');

    if (canonicalError) throw canonicalError;
    console.log(`✅ Loaded ${canonicalItems.length} canonical items\n`);

    // 2. Get unmapped pantry items
    const { data: unmappedItems, error: itemsError } = await supabase
      .from('pantry_items')
      .select('id, name')
      .eq('household_id', TARGET_HOUSEHOLD_ID)
      .eq('status', 'active')
      .is('canonical_item_id', null);

    if (itemsError) throw itemsError;

    console.log(`📦 Found ${unmappedItems.length} unmapped pantry items\n`);
    console.log('═══════════════════════════════════════════════');

    let matchedCount = 0;
    let updatedCount = 0;

    for (const item of unmappedItems) {
      const match = findMatch(item.name, canonicalItems);

      if (match) {
        matchedCount++;
        console.log(`✅ "${item.name}" → "${match.matched_name}" (${match.confidence})`);

        // Update the pantry item
        const { error: updateError } = await supabase
          .from('pantry_items')
          .update({ canonical_item_id: match.canonical_item_id })
          .eq('id', item.id);

        if (updateError) {
          console.error(`   ❌ Failed to update: ${updateError.message}`);
        } else {
          updatedCount++;
          console.log(`   💾 Updated in database`);
        }
      } else {
        console.log(`❌ "${item.name}" - no match found`);
      }
    }

    console.log('═══════════════════════════════════════════════');
    console.log(`\n📊 Results:`);
    console.log(`   Matched: ${matchedCount}/${unmappedItems.length}`);
    console.log(`   Updated: ${updatedCount}/${unmappedItems.length}`);
    console.log(`   Match rate: ${((matchedCount / unmappedItems.length) * 100).toFixed(1)}%`);
    console.log('\n✅ Backfill complete!');

  } catch (error) {
    console.error('❌ Error during backfill:', error);
    process.exit(1);
  }
}

backfillCanonicalIds();
