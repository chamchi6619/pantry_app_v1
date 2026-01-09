/**
 * Add to Pantry Edge Function
 * Centralized pantry item creation with canonical matching
 *
 * This is the SINGLE entry point for adding items to pantry_items.
 * All inventory additions (manual, shopping list, etc.) go through here.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

// Inlined canonical matcher (from _shared/canonicalMatcher.ts)
interface CanonicalItem {
  id: string;
  name: string;
  aliases: string[] | null;
  category: string | null;
}

interface MatchResult {
  canonical_item_id: string;
  confidence: 'exact' | 'alias' | 'fuzzy' | 'none';
  matched_name: string;
  score?: number;
}

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

function isJunk(ingredientName: string): boolean {
  const lower = ingredientName.toLowerCase().trim();
  if (
    ingredientName.startsWith('For the ') ||
    ingredientName.startsWith('For ') ||
    ingredientName.endsWith(':') ||
    ingredientName.includes('Ingredient') ||
    ingredientName.includes('Topping:') ||
    ingredientName.includes('Salad:') ||
    ingredientName.includes('Dressing:')
  ) return true;
  if (lower.length <= 2) return true;
  if (/^[^\w]+$/.test(ingredientName)) return true;
  if (lower === ')' || lower === '(' || lower.startsWith('s)') || lower === 'to medium') return true;
  if (['fresh', 'grated', 'chopped', 'sliced', 'diced', 'en', 'canned', 'cubed', 'halved', 'quartered'].includes(lower)) return true;
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
  if (
    lower.includes('eating smart') ||
    lower.includes('basic soup') ||
    lower.includes('"logs"') ||
    lower.includes('"bugs"')
  ) return true;
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
  if (isJunk(ingredientName)) return null;
  const normalized = normalize(ingredientName);
  if (!normalized || normalized.length < 3) return null;

  // 1. EXACT MATCH on canonical name
  for (const item of canonicalItems) {
    if (normalize(item.name) === normalized) {
      return {
        canonical_item_id: item.id,
        confidence: 'exact',
        matched_name: item.name,
        score: 100
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
            confidence: 'alias',
            matched_name: item.name,
            score: 95
          };
        }
      }
    }
  }

  // 2.5 SINGULAR/PLURAL MATCH
  for (const item of canonicalItems) {
    const canonicalNorm = normalize(item.name);
    if (canonicalNorm === normalized + 's' || canonicalNorm + 's' === normalized) {
      return {
        canonical_item_id: item.id,
        confidence: 'fuzzy',
        matched_name: item.name,
        score: 90
      };
    }
    if (canonicalNorm === normalized + 'es' || canonicalNorm + 'es' === normalized) {
      return {
        canonical_item_id: item.id,
        confidence: 'fuzzy',
        matched_name: item.name,
        score: 90
      };
    }
    if (item.aliases) {
      for (const alias of item.aliases) {
        const aliasNorm = normalize(alias);
        if (aliasNorm === normalized + 's' || aliasNorm + 's' === normalized) {
          return {
            canonical_item_id: item.id,
            confidence: 'alias',
            matched_name: item.name,
            score: 88
          };
        }
        if (aliasNorm === normalized + 'es' || aliasNorm + 'es' === normalized) {
          return {
            canonical_item_id: item.id,
            confidence: 'alias',
            matched_name: item.name,
            score: 88
          };
        }
      }
    }
  }

  // 3. CONTAINS MATCH
  for (const item of canonicalItems) {
    const canonicalNorm = normalize(item.name);
    if (canonicalNorm.length < 4) continue;
    if (normalized.includes(canonicalNorm)) {
      return {
        canonical_item_id: item.id,
        confidence: 'fuzzy',
        matched_name: item.name,
        score: 80
      };
    }
    if (canonicalNorm.includes(normalized) && normalized.length >= 4) {
      return {
        canonical_item_id: item.id,
        confidence: 'fuzzy',
        matched_name: item.name,
        score: 75
      };
    }
  }

  // 4. FUZZY MATCH using Levenshtein distance
  let bestMatch: { item: CanonicalItem; distance: number; score: number } | null = null;
  for (const item of canonicalItems) {
    const canonicalNorm = normalize(item.name);
    const distance = levenshtein(normalized, canonicalNorm);
    const maxLength = Math.max(normalized.length, canonicalNorm.length);
    const threshold = Math.ceil(maxLength * 0.3);
    if (distance <= threshold) {
      const score = Math.round((1 - distance / maxLength) * 70);
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { item, distance, score };
      }
    }
    if (item.aliases) {
      for (const alias of item.aliases) {
        const aliasNorm = normalize(alias);
        const aliasDistance = levenshtein(normalized, aliasNorm);
        const aliasMaxLength = Math.max(normalized.length, aliasNorm.length);
        const aliasThreshold = Math.ceil(aliasMaxLength * 0.3);
        if (aliasDistance <= aliasThreshold) {
          const score = Math.round((1 - aliasDistance / aliasMaxLength) * 70);
          if (!bestMatch || aliasDistance < bestMatch.distance) {
            bestMatch = { item, distance: aliasDistance, score };
          }
        }
      }
    }
  }

  if (bestMatch) {
    return {
      canonical_item_id: bestMatch.item.id,
      confidence: 'fuzzy',
      matched_name: bestMatch.item.name,
      score: bestMatch.score
    };
  }

  return null;
}
// End inlined canonical matcher

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AddToPantryRequest {
  household_id: string;
  name: string;
  quantity: number;
  unit: string;
  location: 'fridge' | 'freezer' | 'pantry';
  category?: string;
  notes?: string;
  expiry_date?: string;
  added_by?: string;
  source?: string;
  canonical_item_id?: string | null;  // Pre-matched canonical ID from client-side matching
}

interface AddToPantryResponse {
  success: boolean;
  item?: any;
  canonical_match?: {
    canonical_item_id: string;
    name: string;
    confidence: string;
    score?: number;
  };
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create client with user's auth token for RLS enforcement
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestData = await req.json() as AddToPantryRequest;
    const {
      household_id,
      name,
      quantity,
      unit,
      location,
      category,
      notes,
      expiry_date,
      added_by,
      source = 'manual',
      canonical_item_id: provided_canonical_id
    } = requestData;

    // Validate required fields
    if (!household_id || !name || !quantity || !unit || !location) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: household_id, name, quantity, unit, location'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Validate location enum
    if (!['fridge', 'freezer', 'pantry'].includes(location)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid location. Must be: fridge, freezer, or pantry'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    console.log(`\n📦 Add to Pantry - v3 (with auth & validation)`);
    console.log(`   User: ${user.id}`);
    console.log(`   Item: "${name}"`);
    console.log(`   Household: ${household_id}`);
    console.log(`   Location: ${location}`);
    if (provided_canonical_id) {
      console.log(`   ✅ Pre-matched canonical ID: ${provided_canonical_id}`);
    }

    // Match item to canonical item
    let canonical_item_id: string | null = provided_canonical_id || null;
    let matchInfo: any = null;

    // Only run matching if canonical_item_id was not provided
    if (!provided_canonical_id) {
      // Load canonical items for matching
      console.log('\n📚 Loading canonical items for matching...');
      const { data: canonicalItems, error: canonicalError } = await supabaseClient
        .from('canonical_items')
        .select('id, name, aliases, category');

      if (canonicalError) {
        console.error('❌ Error loading canonical items:', canonicalError);
      }

      console.log(`   Loaded ${canonicalItems?.length || 0} canonical items`);

      if (canonicalItems && canonicalItems.length > 0) {
        const match = findMatch(name, canonicalItems as CanonicalItem[]);

        if (match) {
          canonical_item_id = match.canonical_item_id;
          matchInfo = {
            canonical_item_id: match.canonical_item_id,
            name: match.matched_name,
            confidence: match.confidence,
            score: match.score
          };
          console.log(`   ✓ Matched "${name}" → "${match.matched_name}" (${match.confidence}, score: ${match.score})`);
        } else {
          console.log(`   ✗ No canonical match for "${name}"`);
        }
      }
    } else {
      // Use provided canonical_item_id (from recipe/shopping list)
      console.log('   ⏭️  Skipping matching - using provided canonical_item_id');
    }

    // Insert pantry item with canonical_item_id
    // RLS policy will automatically validate user has access to household_id
    console.log('\n💾 Inserting to pantry_items...');
    const { data: pantryItem, error: insertError } = await supabaseClient
      .from('pantry_items')
      .insert({
        household_id,
        name,
        quantity,
        unit,
        location,
        category: category || 'Other',
        notes,
        expiry_date,
        added_by,
        source,
        canonical_item_id, // ✅ Set canonical ID from matching
        status: 'active',
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Insert error:', insertError);
      throw insertError;
    }

    console.log(`   ✅ Created pantry item: ${pantryItem.id}`);
    if (canonical_item_id) {
      console.log(`   🔗 Linked to canonical item: ${canonical_item_id}`);
    }

    const response: AddToPantryResponse = {
      success: true,
      item: pantryItem,
      canonical_match: matchInfo,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('❌ Error in add-to-pantry:', error);

    const response: AddToPantryResponse = {
      success: false,
      error: error.message || 'Failed to add item to pantry',
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
