/**
 * Recipe Service - Unified Save with Canonical Matching
 *
 * Purpose: Single entry point for saving recipes from ANY source
 * - Social media imports
 * - Traditional website imports (schema.org)
 * - Manual entry
 *
 * All paths converge here for consistent canonical matching and storage.
 *
 * ENHANCED (2025-01-22): Now includes full 5-tier fuzzy matching algorithm
 * ported from Edge Function canonicalMatcher.ts for 94.8% match rate.
 */

import { CookCard, Ingredient } from '../types/CookCard';
import { supabase } from '../lib/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface CanonicalItem {
  id: string;
  name: string;
  aliases: string[] | null;
}

interface CanonicalCache {
  items: CanonicalItem[];
  map: Map<string, string>;  // normalized name → id (for quick lookup)
  expiresAt: number;
}

interface MatchResult {
  canonical_item_id: string;
  confidence: 'exact' | 'alias' | 'fuzzy';
  matched_name: string;
  score: number;
}

let _canonicalCache: CanonicalCache | null = null;
const CACHE_TTL_MS = 3600000; // 1 hour

// =============================================================================
// NORMALIZATION - Ported from Edge Function canonicalMatcher.ts
// =============================================================================

/**
 * Normalize ingredient name for matching
 * Removes prep words, modifiers, brands, etc. to get to the core ingredient
 *
 * Examples:
 *   "2 cups unsalted butter, softened" → "butter"
 *   "fresh garlic cloves, minced" → "garlic"
 *   "organic whole milk" → "milk"
 */
function normalizeIngredient(str: string): string {
  return str
    .toLowerCase()
    .trim()
    // Remove "s " prefix (parser bug)
    .replace(/^s\s+/, '')
    // Remove diet/quality modifiers
    .replace(/\b(low-fat|lowfat|reduced-fat|fat-free|nonfat|non-fat)\b/gi, '')
    .replace(/\b(low-sodium|reduced-sodium|sodium-free)\b/gi, '')
    .replace(/\b(lite|light|reduced|part-skim|plain)\b/gi, '')
    // Remove milk type modifiers (whole, skim, 2%)
    .replace(/\b(whole|skim|skimmed|2%|1%|fat-free)\s+(milk)\b/gi, '$2')
    // Remove butter modifiers
    .replace(/\b(unsalted|salted|clarified|cultured)\s+(butter)\b/gi, '$2')
    // Remove apple varieties (map to "apples")
    .replace(/\b(granny smith|gala|fuji|honeycrisp|red delicious|tart)\s+(apple)/gi, '$2')
    // Remove brand names (common grocery stores)
    .replace(/\b(kirkland|365|great value|member's mark|store brand|organic)\b/gi, '')
    // Remove common prep words
    .replace(/\b(finely|coarsely|freshly|thinly|thickly|roughly|lightly)\s+/g, '')
    .replace(/\b(chopped|sliced|diced|minced|grated|shredded|crushed|ground|whole)\b/g, '')
    .replace(/\b(fresh|dried|frozen|canned|raw|roasted|toasted|cooked|prepared|uncooked)\b/g, '')
    .replace(/\b(instant|quick-cooking|rapid-rise|ready-to-eat)\b/g, '')
    // Remove quantity/container words
    .replace(/\b(bunch|sprig|sprigs|leaves|leaf|clove|cloves|head|heads|piece|pieces)\s+(of\s+)?/g, '')
    .replace(/\b(pinch|dash|envelope|can|jar|package|box|container)\s+(of\s+)?/g, '')
    // Remove state descriptors
    .replace(/\b(peeled|seeded|trimmed|drained|rinsed|scrubbed|halved|quartered|pitted|cubed|softened|melted|room temperature)\b/g, '')
    .replace(/\b(divided|plus more|to taste|optional|if desired|if needed|for serving|for garnish)\b/g, '')
    // Remove "or X" alternatives
    .replace(/\s+or\s+\w+(\s+\w+)?/g, '')
    // Remove parenthetical content
    .replace(/\([^)]*\)/g, '')
    // Remove measurement words
    .replace(/\b(cup|cups|tablespoon|tablespoons|teaspoon|teaspoons|tbsp|tsp|oz|ounce|ounces|lb|pound|pounds|g|gram|grams|ml|liter|liters|kg|kilogram)\b/g, '')
    // Remove numbers and measurements
    .replace(/\b\d+(\.\d+)?\s*/g, '')
    .replace(/\b\d+\/\d+\s*/g, '')  // fractions like 1/2
    // Clean up extra spaces, commas, dashes
    .replace(/[,;]+/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// =============================================================================
// LEVENSHTEIN DISTANCE - For fuzzy matching
// =============================================================================

/**
 * Calculate Levenshtein (edit) distance between two strings
 * Used for fuzzy matching when exact/alias matches fail
 */
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
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// =============================================================================
// 5-TIER FUZZY MATCHING - Ported from Edge Function
// =============================================================================

/**
 * Find best matching canonical item using 5-tier algorithm
 *
 * Tiers:
 * 1. EXACT MATCH on canonical name (score: 100)
 * 2. EXACT MATCH on aliases (score: 95)
 * 3. SINGULAR/PLURAL match (score: 88-90)
 * 4. CONTAINS match (score: 75-80)
 * 5. FUZZY match via Levenshtein (score: 0-70)
 *
 * @param ingredientName - Raw ingredient name from user input
 * @param canonicalItems - List of canonical items to match against
 * @returns MatchResult or null if no match found
 */
function findBestMatch(
  ingredientName: string,
  canonicalItems: CanonicalItem[]
): MatchResult | null {
  const normalized = normalizeIngredient(ingredientName);

  // Skip very short or empty strings
  if (!normalized || normalized.length < 2) {
    return null;
  }

  // TIER 1: EXACT MATCH on canonical name
  for (const item of canonicalItems) {
    const canonicalNorm = normalizeIngredient(item.name);
    if (canonicalNorm === normalized) {
      return {
        canonical_item_id: item.id,
        confidence: 'exact',
        matched_name: item.name,
        score: 100
      };
    }
  }

  // TIER 2: EXACT MATCH on aliases
  for (const item of canonicalItems) {
    if (item.aliases) {
      for (const alias of item.aliases) {
        const aliasNorm = normalizeIngredient(alias);
        if (aliasNorm === normalized) {
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

  // TIER 3: SINGULAR/PLURAL match
  for (const item of canonicalItems) {
    const canonicalNorm = normalizeIngredient(item.name);

    // Check singular/plural variations
    if (canonicalNorm === normalized + 's' || canonicalNorm + 's' === normalized) {
      return {
        canonical_item_id: item.id,
        confidence: 'fuzzy',
        matched_name: item.name,
        score: 90
      };
    }

    // Check for -es plural (tomato/tomatoes)
    if (canonicalNorm === normalized + 'es' || canonicalNorm + 'es' === normalized) {
      return {
        canonical_item_id: item.id,
        confidence: 'fuzzy',
        matched_name: item.name,
        score: 90
      };
    }

    // Check aliases for singular/plural too
    if (item.aliases) {
      for (const alias of item.aliases) {
        const aliasNorm = normalizeIngredient(alias);
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

  // TIER 4: CONTAINS match (ingredient contains canonical name or vice versa)
  for (const item of canonicalItems) {
    const canonicalNorm = normalizeIngredient(item.name);

    // Skip very short names to avoid false matches
    if (canonicalNorm.length < 4) continue;

    // Check if normalized ingredient contains the canonical name
    if (normalized.includes(canonicalNorm)) {
      return {
        canonical_item_id: item.id,
        confidence: 'fuzzy',
        matched_name: item.name,
        score: 80
      };
    }

    // Check if canonical name contains the ingredient (less common but possible)
    if (canonicalNorm.includes(normalized) && normalized.length >= 4) {
      return {
        canonical_item_id: item.id,
        confidence: 'fuzzy',
        matched_name: item.name,
        score: 75
      };
    }
  }

  // TIER 5: FUZZY match using Levenshtein distance
  let bestMatch: { item: CanonicalItem; distance: number; score: number } | null = null;

  for (const item of canonicalItems) {
    const canonicalNorm = normalizeIngredient(item.name);
    const distance = levenshtein(normalized, canonicalNorm);

    // Only consider if distance is small relative to string length
    const maxLength = Math.max(normalized.length, canonicalNorm.length);
    const threshold = Math.ceil(maxLength * 0.3); // 30% difference allowed

    if (distance <= threshold) {
      const score = Math.round((1 - distance / maxLength) * 70); // Score 0-70
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { item, distance, score };
      }
    }

    // Also check aliases
    if (item.aliases) {
      for (const alias of item.aliases) {
        const aliasNorm = normalizeIngredient(alias);
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

  // No match found
  return null;
}

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

/**
 * Load canonical items with caching
 * Returns both the raw items list (for fuzzy matching) and a quick-lookup map
 */
async function loadCanonicalItems(): Promise<CanonicalCache> {
  const now = Date.now();

  // Return cached if still valid
  if (_canonicalCache && _canonicalCache.expiresAt > now) {
    console.log('[RecipeService] Using cached canonical items');
    return _canonicalCache;
  }

  console.log('[RecipeService] Loading canonical items from database...');

  const { data: items, error } = await supabase
    .from('canonical_items')
    .select('id, name, aliases');

  if (error) {
    console.error('[RecipeService] Failed to load canonical items:', error);
    // Return empty cache on error
    return {
      items: [],
      map: new Map(),
      expiresAt: now + 60000 // Retry in 1 minute
    };
  }

  // Build quick-lookup map for exact matches
  const map = new Map<string, string>();
  for (const item of items || []) {
    const normalizedName = normalizeIngredient(item.name);
    map.set(normalizedName, item.id);

    // Add aliases to map
    if (item.aliases && Array.isArray(item.aliases)) {
      for (const alias of item.aliases) {
        const normalizedAlias = normalizeIngredient(alias);
        map.set(normalizedAlias, item.id);
      }
    }
  }

  console.log(`[RecipeService] Loaded ${items?.length || 0} canonical items (${map.size} mappings with aliases)`);

  // Cache for 1 hour
  _canonicalCache = {
    items: items || [],
    map,
    expiresAt: now + CACHE_TTL_MS,
  };

  return _canonicalCache;
}

/**
 * Clear canonical cache (for testing or refresh)
 */
export function clearCanonicalCache(): void {
  _canonicalCache = null;
  console.log('[RecipeService] Canonical cache cleared');
}

// =============================================================================
// INGREDIENT MATCHING
// =============================================================================

/**
 * Match ingredients to canonical items using 5-tier fuzzy algorithm
 *
 * This is the enhanced matching function that provides the same accuracy
 * as the Edge Function (94.8% match rate) for manually entered recipes.
 */
async function matchIngredientsToCanonical(
  ingredients: Ingredient[]
): Promise<Ingredient[]> {
  const cache = await loadCanonicalItems();

  let exactCount = 0;
  let fuzzyCount = 0;
  let missCount = 0;

  for (const ingredient of ingredients) {
    // Get the name to match
    const rawName = ingredient.normalized_name || ingredient.name || '';

    if (!rawName) {
      missCount++;
      continue;
    }

    // Try quick lookup first (exact match on pre-normalized map)
    const quickNormalized = normalizeIngredient(rawName);
    const quickMatch = cache.map.get(quickNormalized);

    if (quickMatch) {
      ingredient.canonical_item_id = quickMatch;
      exactCount++;
      continue;
    }

    // Fall back to full 5-tier fuzzy matching
    const match = findBestMatch(rawName, cache.items);

    if (match) {
      ingredient.canonical_item_id = match.canonical_item_id;
      fuzzyCount++;

      // Log fuzzy matches for debugging (can be removed in production)
      if (match.confidence === 'fuzzy') {
        console.log(`[RecipeService] Fuzzy match: "${rawName}" → "${match.matched_name}" (score: ${match.score})`);
      }
    } else {
      missCount++;
      console.log(`[RecipeService] No match found for: "${rawName}" (normalized: "${quickNormalized}")`);
    }
  }

  const total = ingredients.length;
  const matched = exactCount + fuzzyCount;
  console.log(`[RecipeService] Matched ${matched}/${total} ingredients (${exactCount} exact, ${fuzzyCount} fuzzy, ${missCount} missed)`);

  return ingredients;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Save recipe with canonical matching
 *
 * Unified save function that:
 * 1. Matches ingredients to canonical items (using 5-tier fuzzy algorithm)
 * 2. Saves cook_card
 * 3. Saves cook_card_ingredients (with canonical IDs)
 *
 * Use this for ALL recipe sources:
 * - Social media (extractCookCard results)
 * - Traditional websites (ingestTraditionalRecipe results)
 * - Manual entry (user input)
 */
export async function saveRecipeWithMatching(
  cookCard: CookCard,
  userId: string,
  householdId?: string
): Promise<{ id: string; alreadyExists?: boolean }> {
  console.log('[RecipeService] Saving recipe with matching:', cookCard.title);

  // Step 1: Check for existing card (if source URL exists)
  if (cookCard.source?.url) {
    const { data: existingCard } = await supabase
      .from('cook_cards')
      .select('id')
      .eq('source_url', cookCard.source.url)
      .eq('user_id', userId)
      .single();

    if (existingCard) {
      console.log('[RecipeService] Recipe already exists:', existingCard.id);
      return { id: existingCard.id, alreadyExists: true };
    }
  }

  // Step 2: Match ingredients to canonical items (THE KEY STEP)
  let matchedIngredients = cookCard.ingredients || [];
  if (matchedIngredients.length > 0) {
    matchedIngredients = await matchIngredientsToCanonical(matchedIngredients);
  }

  // Step 3: Insert cook card
  const { data: cookCardData, error: cookCardError } = await supabase
    .from('cook_cards')
    .insert({
      user_id: userId,
      household_id: householdId || null,
      source_url: cookCard.source?.url || null,
      platform: cookCard.source?.platform || 'manual',
      creator_handle: cookCard.source?.creator?.handle || null,
      creator_name: cookCard.source?.creator?.name || null,
      creator_avatar_url: cookCard.source?.creator?.avatar_url || null,
      title: cookCard.title,
      description: cookCard.description || null,
      image_url: cookCard.image_url || null,
      prep_time_minutes: cookCard.prep_time_minutes || null,
      cook_time_minutes: cookCard.cook_time_minutes || null,
      total_time_minutes: cookCard.total_time_minutes || null,
      servings: cookCard.servings || null,
      instructions_type: cookCard.instructions?.type || 'text',
      instructions_text: cookCard.instructions?.text || null,
      instructions_json: cookCard.instructions?.steps || null,
      extraction_method: cookCard.extraction?.method || 'manual',
      extraction_confidence: cookCard.extraction?.confidence || 1.0,
      extraction_version: cookCard.extraction?.version || '1.0',
      extraction_cost_cents: cookCard.extraction?.cost_cents || 0,
    })
    .select('id')
    .single();

  if (cookCardError) {
    // Handle race condition (duplicate key)
    if (cookCardError.code === '23505' && cookCard.source?.url) {
      console.log('[RecipeService] Race condition, fetching existing card');
      const { data: raceCard } = await supabase
        .from('cook_cards')
        .select('id')
        .eq('source_url', cookCard.source.url)
        .eq('user_id', userId)
        .single();

      if (raceCard) {
        return { id: raceCard.id, alreadyExists: true };
      }
    }

    console.error('[RecipeService] Failed to insert cook_card:', cookCardError);
    throw new Error(`Failed to save recipe: ${cookCardError.message}`);
  }

  const cookCardId = cookCardData.id;
  console.log(`[RecipeService] Cook card saved with ID: ${cookCardId}`);

  // Step 4: Insert ingredients with canonical IDs
  if (matchedIngredients.length > 0) {
    const ingredientInserts = matchedIngredients.map((ing, idx) => ({
      cook_card_id: cookCardId,
      ingredient_name: ing.name,
      normalized_name: ing.normalized_name || normalizeIngredient(ing.name),
      canonical_item_id: ing.canonical_item_id || null,
      amount: ing.amount || null,
      unit: ing.unit || null,
      preparation: ing.preparation || null,
      confidence: ing.confidence || 1.0,
      provenance: ing.provenance || 'user_edited',
      in_pantry: ing.in_pantry || false,
      is_substitution: ing.is_substitution || false,
      substitution_rationale: ing.substitution_rationale || null,
      ingredient_group: ing.group || null,
      sort_order: ing.sort_order !== undefined ? ing.sort_order : idx,
      is_optional: ing.is_optional || false,
    }));

    const { error: ingredientsError } = await supabase
      .from('cook_card_ingredients')
      .insert(ingredientInserts);

    if (ingredientsError) {
      console.error('[RecipeService] Failed to insert ingredients:', ingredientsError);
      // Don't throw - cook card is saved, ingredients can be recovered
    } else {
      const matchedCount = ingredientInserts.filter(i => i.canonical_item_id).length;
      console.log(`[RecipeService] Inserted ${ingredientInserts.length} ingredients (${matchedCount} matched to canonical)`);
    }
  }

  return { id: cookCardId };
}

/**
 * Update existing recipe ingredients with canonical matching
 *
 * Use this for recipes that were already saved (e.g., traditional imports)
 * but don't have canonical_item_id set.
 *
 * Now uses the enhanced 5-tier fuzzy matching algorithm.
 */
export async function updateRecipeWithCanonicalMatching(
  cookCardId: string
): Promise<{ updated: number; total: number }> {
  console.log('[RecipeService] Updating recipe with canonical matching:', cookCardId);

  // Load existing ingredients
  const { data: ingredients, error: fetchError } = await supabase
    .from('cook_card_ingredients')
    .select('id, ingredient_name, normalized_name, canonical_item_id')
    .eq('cook_card_id', cookCardId);

  if (fetchError) {
    console.error('[RecipeService] Failed to fetch ingredients:', fetchError);
    throw new Error(`Failed to fetch ingredients: ${fetchError.message}`);
  }

  if (!ingredients || ingredients.length === 0) {
    console.log('[RecipeService] No ingredients to update');
    return { updated: 0, total: 0 };
  }

  // Load canonical items
  const cache = await loadCanonicalItems();

  // Find ingredients that need updating
  const updates: { id: string; canonical_item_id: string; normalized_name: string }[] = [];

  for (const ing of ingredients) {
    // Skip if already has canonical_item_id
    if (ing.canonical_item_id) continue;

    const rawName = ing.normalized_name || ing.ingredient_name || '';
    if (!rawName) continue;

    // Try quick lookup first
    const quickNormalized = normalizeIngredient(rawName);
    let canonicalId = cache.map.get(quickNormalized);

    // Fall back to fuzzy matching
    if (!canonicalId) {
      const match = findBestMatch(rawName, cache.items);
      if (match) {
        canonicalId = match.canonical_item_id;
      }
    }

    if (canonicalId) {
      updates.push({
        id: ing.id,
        canonical_item_id: canonicalId,
        normalized_name: quickNormalized
      });
    }
  }

  // Batch update ingredients
  if (updates.length > 0) {
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('cook_card_ingredients')
        .update({
          canonical_item_id: update.canonical_item_id,
          normalized_name: update.normalized_name
        })
        .eq('id', update.id);

      if (updateError) {
        console.error('[RecipeService] Failed to update ingredient:', update.id, updateError);
      }
    }
  }

  console.log(`[RecipeService] Updated ${updates.length}/${ingredients.length} ingredients with canonical IDs`);

  return { updated: updates.length, total: ingredients.length };
}

/**
 * Export the normalize function for use in other modules
 * (e.g., for displaying normalized names in the UI)
 */
export { normalizeIngredient };
