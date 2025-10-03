import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Levenshtein distance for fuzzy matching
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .trim()
    // Remove "s " prefix (parser bug)
    .replace(/^s\s+/, '')
    // Remove diet/quality modifiers
    .replace(/\b(low-fat|lowfat|reduced-fat|fat-free|nonfat|non-fat)\b/gi, '')
    .replace(/\b(low-sodium|reduced-sodium|sodium-free)\b/gi, '')
    .replace(/\b(lite|light|reduced|part-skim|plain)\b/gi, '')
    // Remove apple varieties (map to "apples")
    .replace(/\b(granny smith|gala|fuji|honeycrisp|red delicious|tart)\s+(apple)/gi, '$2')
    // Remove common prep words
    .replace(/\b(finely|coarsely|freshly|thinly|thickly|roughly|lightly)\s+/g, '')
    .replace(/\b(chopped|sliced|diced|minced|grated|shredded|crushed|ground|whole)\b/g, '')
    .replace(/\b(fresh|dried|frozen|canned|raw|roasted|toasted|cooked|prepared|uncooked)\b/g, '')
    .replace(/\b(instant|quick-cooking|rapid-rise|ready-to-eat)\b/g, '')
    // Remove quantity/container words
    .replace(/\b(bunch|sprig|sprigs|leaves|leaf|clove|cloves|head|heads|piece|pieces)\s+(of\s+)?/g, '')
    .replace(/\b(pinch|dash|envelope|can|jar|package|box|container)\s+(of\s+)?/g, '')
    // Remove state descriptors
    .replace(/\b(peeled|seeded|trimmed|drained|rinsed|scrubbed|halved|quartered|pitted|cubed)\b/g, '')
    .replace(/\b(divided|plus more|to taste|optional|if desired|if needed)\b/g, '')
    // Remove "or X" alternatives
    .replace(/\s+or\s+\w+(\s+\w+)?/g, '')
    // Remove parenthetical content
    .replace(/\([^)]*\)/g, '')
    // Remove measurement words
    .replace(/\b(cup|cups|tablespoon|tablespoons|teaspoon|teaspoons|tbsp|tsp|oz|ounce|ounces|lb|pound|pounds|g|gram|grams|ml|liter|liters)\b/g, '')
    // Remove numbers and measurements like "1 ", "2.5 ", etc
    .replace(/\b\d+(\.\d+)?\s*/g, '')
    // Clean up extra spaces, commas, dashes
    .replace(/[,;]+/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface CanonicalItem {
  id: string;
  canonical_name: string;
  aliases: string[];
  category: string;
}

interface MatchResult {
  ingredient_id: string;
  canonical_item_id: string | null;
  confidence: 'exact' | 'alias' | 'fuzzy' | 'none';
  matched_name?: string;
}

function isJunk(ingredientName: string): boolean {
  const lower = ingredientName.toLowerCase().trim();

  // Section headers
  if (
    ingredientName.startsWith('For the ') ||
    ingredientName.startsWith('For ') ||
    ingredientName.endsWith(':') ||
    ingredientName.includes('Ingredient') ||
    ingredientName.includes('Topping:') ||
    ingredientName.includes('Salad:') ||
    ingredientName.includes('Dressing:')
  ) return true;

  // Empty or single characters
  if (lower.length <= 2) return true;

  // Just punctuation or numbers
  if (/^[^\w]+$/.test(ingredientName)) return true;
  if (lower === ')' || lower === '(' || lower.startsWith('s)') || lower === 'to medium') return true;

  // Single words that are prep instructions
  if (['fresh', 'grated', 'chopped', 'sliced', 'diced', 'en', 'canned', 'cubed', 'halved', 'quartered'].includes(lower)) return true;

  // Non-food items
  if (
    lower.includes('aluminum foil') ||
    lower.includes('paper') ||
    lower.includes('bamboo skewers') ||
    lower.includes('toothpicks') ||
    lower.includes('popsicle sticks') ||
    lower.includes('craft sticks') ||
    lower.includes('skewers') ||
    lower.includes('foil')
  ) return true;

  // Brand-specific or recipe-specific names
  if (
    lower.includes('eating smart') ||
    lower.includes('basic soup') ||
    lower.includes('"logs"') ||
    lower.includes('"bugs"')
  ) return true;

  // Instructions or notes
  if (
    lower.startsWith('note:') ||
    lower.includes('optional toppings') ||
    lower.includes('necessary tools') ||
    lower.includes('to reduce browning') ||
    lower.includes('adjust to taste')
  ) return true;

  return false;
}

function findMatch(ingredientName: string, canonicalItems: CanonicalItem[]): MatchResult | null {
  // Skip junk first
  if (isJunk(ingredientName)) return null;

  const normalized = normalize(ingredientName);

  if (!normalized || normalized.length < 3) return null;

  // 1. EXACT MATCH on canonical name
  for (const item of canonicalItems) {
    if (normalize(item.canonical_name) === normalized) {
      return {
        ingredient_id: '',
        canonical_item_id: item.id,
        confidence: 'exact',
        matched_name: item.canonical_name
      };
    }
  }

  // 2. EXACT MATCH on aliases
  for (const item of canonicalItems) {
    if (item.aliases) {
      for (const alias of item.aliases) {
        if (normalize(alias) === normalized) {
          return {
            ingredient_id: '',
            canonical_item_id: item.id,
            confidence: 'alias',
            matched_name: item.canonical_name
          };
        }
      }
    }
  }

  // 2.5 SINGULAR/PLURAL MATCH
  for (const item of canonicalItems) {
    const canonicalNorm = normalize(item.canonical_name);

    // Check singular/plural variations
    if (canonicalNorm === normalized + 's' || canonicalNorm + 's' === normalized) {
      return {
        ingredient_id: '',
        canonical_item_id: item.id,
        confidence: 'fuzzy',
        matched_name: item.canonical_name
      };
    }

    // Check for -es plural (tomato/tomatoes)
    if (canonicalNorm === normalized + 'es' || canonicalNorm + 'es' === normalized) {
      return {
        ingredient_id: '',
        canonical_item_id: item.id,
        confidence: 'fuzzy',
        matched_name: item.canonical_name
      };
    }

    // Check aliases for singular/plural too
    if (item.aliases) {
      for (const alias of item.aliases) {
        const aliasNorm = normalize(alias);
        if (aliasNorm === normalized + 's' || aliasNorm + 's' === normalized) {
          return {
            ingredient_id: '',
            canonical_item_id: item.id,
            confidence: 'alias',
            matched_name: item.canonical_name
          };
        }
        if (aliasNorm === normalized + 'es' || aliasNorm + 'es' === normalized) {
          return {
            ingredient_id: '',
            canonical_item_id: item.id,
            confidence: 'alias',
            matched_name: item.canonical_name
          };
        }
      }
    }
  }

  // 3. CONTAINS MATCH (ingredient contains canonical name or vice versa)
  for (const item of canonicalItems) {
    const canonicalNorm = normalize(item.canonical_name);

    // Skip very short names to avoid false matches
    if (canonicalNorm.length < 4) continue;

    // Check if normalized ingredient contains the canonical name
    if (normalized.includes(canonicalNorm)) {
      return {
        ingredient_id: '',
        canonical_item_id: item.id,
        confidence: 'fuzzy',
        matched_name: item.canonical_name
      };
    }

    // Check if canonical name contains the ingredient (less common but possible)
    if (canonicalNorm.includes(normalized) && normalized.length >= 4) {
      return {
        ingredient_id: '',
        canonical_item_id: item.id,
        confidence: 'fuzzy',
        matched_name: item.canonical_name
      };
    }
  }

  // 4. FUZZY MATCH using Levenshtein distance
  let bestMatch: { item: CanonicalItem; distance: number } | null = null;

  for (const item of canonicalItems) {
    const canonicalNorm = normalize(item.canonical_name);
    const distance = levenshtein(normalized, canonicalNorm);

    // Only consider if distance is small relative to string length
    const maxLength = Math.max(normalized.length, canonicalNorm.length);
    const threshold = Math.ceil(maxLength * 0.3); // 30% difference allowed

    if (distance <= threshold) {
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { item, distance };
      }
    }

    // Also check aliases
    if (item.aliases) {
      for (const alias of item.aliases) {
        const aliasNorm = normalize(alias);
        const aliasDistance = levenshtein(normalized, aliasNorm);
        const aliasMaxLength = Math.max(normalized.length, aliasNorm.length);
        const aliasThreshold = Math.ceil(aliasMaxLength * 0.3);

        if (aliasDistance <= aliasThreshold) {
          if (!bestMatch || aliasDistance < bestMatch.distance) {
            bestMatch = { item, distance: aliasDistance };
          }
        }
      }
    }
  }

  if (bestMatch) {
    return {
      ingredient_id: '',
      canonical_item_id: bestMatch.item.id,
      confidence: 'fuzzy',
      matched_name: bestMatch.item.canonical_name
    };
  }

  return null;
}

async function matchIngredientsIntelligently() {
  console.log('🧠 Starting intelligent ingredient matching...\n');

  // Load canonical items
  const { data: canonicalItems } = await supabase
    .from('canonical_items')
    .select('id, canonical_name, aliases, category');

  if (!canonicalItems || canonicalItems.length === 0) {
    console.error('❌ No canonical items found!');
    return;
  }

  console.log(`📚 Loaded ${canonicalItems.length} canonical items\n`);

  // Get total count first
  const { count } = await supabase
    .from('recipe_ingredients')
    .select('*', { count: 'exact', head: true });

  console.log(`🍳 Total ingredients in database: ${count}\n`);

  // Load ALL recipe ingredients (Supabase defaults to 1000, so we need to fetch all)
  const FETCH_BATCH = 1000;
  const ingredients: any[] = [];

  for (let offset = 0; offset < count!; offset += FETCH_BATCH) {
    const { data } = await supabase
      .from('recipe_ingredients')
      .select('id, ingredient_name, notes, canonical_item_id')
      .range(offset, offset + FETCH_BATCH - 1);

    if (data) {
      ingredients.push(...data);
    }
    console.log(`   Loaded ${ingredients.length} / ${count}...`);
  }

  console.log(`\n✅ Loaded all ${ingredients.length} ingredients\n`);

  let exactMatches = 0;
  let aliasMatches = 0;
  let fuzzyMatches = 0;
  let noMatches = 0;
  let alreadyLinked = 0;
  let updated = 0;

  const unmatchedIngredients: { id: string; name: string }[] = [];

  // Process in batches for progress reporting
  const BATCH_SIZE = 500;
  for (let i = 0; i < ingredients.length; i += BATCH_SIZE) {
    const batch = ingredients.slice(i, i + BATCH_SIZE);

    for (const ingredient of batch) {
      // Skip if already linked
      if (ingredient.canonical_item_id) {
        alreadyLinked++;
        continue;
      }

      const ingredientName = ingredient.ingredient_name || ingredient.notes || '';
      if (!ingredientName) {
        noMatches++;
        continue;
      }

      const match = findMatch(ingredientName, canonicalItems);

      if (match) {
        match.ingredient_id = ingredient.id;

        // Update database
        const { error } = await supabase
          .from('recipe_ingredients')
          .update({ canonical_item_id: match.canonical_item_id })
          .eq('id', ingredient.id);

        if (!error) {
          updated++;

          if (match.confidence === 'exact') exactMatches++;
          else if (match.confidence === 'alias') aliasMatches++;
          else if (match.confidence === 'fuzzy') fuzzyMatches++;
        }
      } else {
        noMatches++;
        unmatchedIngredients.push({ id: ingredient.id, name: ingredientName });
      }
    }

    // Progress report
    const processed = Math.min(i + BATCH_SIZE, ingredients.length);
    console.log(`   ✓ Processed ${processed} / ${ingredients.length} (${((processed / ingredients.length) * 100).toFixed(1)}%)`);
  }

  console.log('\n📊 INTELLIGENT MATCHING RESULTS:');
  console.log(`   Already linked: ${alreadyLinked}`);
  console.log(`   Exact matches: ${exactMatches}`);
  console.log(`   Alias matches: ${aliasMatches}`);
  console.log(`   Fuzzy matches: ${fuzzyMatches}`);
  console.log(`   No matches: ${noMatches}`);
  console.log(`   Total updated: ${updated}`);
  console.log(`\n   Match rate: ${(((exactMatches + aliasMatches + fuzzyMatches) / (count! - alreadyLinked)) * 100).toFixed(1)}%`);

  if (unmatchedIngredients.length > 0) {
    console.log(`\n❌ ${unmatchedIngredients.length} ingredients couldn't be matched:`);
    console.log('   Sample unmatched (first 20):');
    unmatchedIngredients.slice(0, 20).forEach(ing => {
      console.log(`   - "${ing.name}"`);
    });

    console.log('\n💡 These will need Gemini API for matching.');
    console.log('   Run cleanIngredientsViaEdge.ts to match remaining items.');
  } else {
    console.log('\n🎉 All ingredients matched! No need for Gemini API!');
  }
}

matchIngredientsIntelligently().catch(console.error);
