/**
 * Traditional Recipe Service
 *
 * Purpose: Interface for ingesting recipes from traditional recipe websites
 * using schema.org JSON-LD parsing
 *
 * Cost: $0.00 per recipe (no AI processing)
 */

import { supabase } from '../lib/supabase';
import { CookCard } from '../types/CookCard';

export interface IngestTraditionalRecipeParams {
  url: string;
  userId: string;
  householdId?: string;
  ignoreCache?: boolean; // For testing: bypass cache and force re-extraction
}

export interface IngestTraditionalRecipeResult {
  cook_card: any; // Database row format
  ingredient_count: number;
  cache_status: 'cached' | 'fresh';
  extraction_method: 'schema_org';
  cost_cents: number;
}

export interface TraditionalRecipeError {
  error: string;
  details?: string;
}

/**
 * Detect if a URL is a VIDEO platform (social media with video content)
 * vs TRADITIONAL RECIPE WEBSITE (text-based recipes with schema.org markup)
 *
 * CRITICAL: This distinction determines extraction cost
 * - Video platforms → yt-dlp + Gemini Vision → $0.01-0.02 per recipe
 * - Traditional websites → schema.org JSON-LD → $0.00 per recipe
 *
 * Rules:
 * 1. ALL social media platforms = video extraction (even if post has text)
 * 2. ALL traditional recipe websites = schema.org extraction
 * 3. NO mixed mode - URL must be clearly one or the other
 */
export function isTraditionalRecipeUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace('www.', '');
    const fullUrl = url.toLowerCase();

    // ============================================
    // RULE 1: Video/Social Media Platforms (ALWAYS social extraction)
    // ============================================
    const videoPlatforms = [
      // YouTube (videos, shorts)
      'youtube.com',
      'youtu.be',
      'm.youtube.com',

      // Instagram (posts, reels, stories)
      'instagram.com',
      'instagr.am',

      // TikTok (short-form video)
      'tiktok.com',
      'vm.tiktok.com',
      'vt.tiktok.com',

      // Xiaohongshu (Red Note)
      'xiaohongshu.com',
      'xhslink.com',

      // Facebook (posts, videos, reels)
      'facebook.com',
      'fb.com',
      'fb.watch',
      'm.facebook.com',

      // Twitter/X (threads, videos)
      'twitter.com',
      'x.com',
      'mobile.twitter.com',

      // Pinterest (user-generated content)
      'pinterest.com',
      'pin.it',
    ];

    // If hostname matches ANY video platform → social extraction
    if (videoPlatforms.some((platform) => hostname.includes(platform))) {
      console.log('[isTraditionalRecipeUrl] Video platform detected:', hostname, '→ social extraction');
      return false;
    }

    // ============================================
    // RULE 2: Known Traditional Recipe Websites
    // ============================================
    const traditionalRecipeSites = [
      // Major Recipe Publishers
      'cooking.nytimes.com',
      'bonappetit.com',
      'epicurious.com',
      'seriouseats.com',
      'foodnetwork.com',
      'food.com',
      'allrecipes.com',
      'myrecipes.com',
      'food52.com',
      'tasteofhome.com',
      'delish.com',

      // Food Blogs
      'minimalistbaker.com',
      'budgetbytes.com',
      'thekitchn.com',
      'cookieandkate.com',
      'pinchofyum.com',
      'skinnytaste.com',
      'smittenkitchen.com',
      '101cookbooks.com',
      'simplyrecipes.com',
      'thepioneerwoman.com',

      // Baking Specific
      'kingarthurbaking.com',
      'sallysbakingaddiction.com',

      // International
      'bbcgoodfood.com',
      'jamieoliver.com',
      'recipetineats.com',

      // Health/Specialty
      'eatingwell.com',
      'cookinglight.com',
    ];

    // If hostname matches known recipe site → traditional extraction
    if (traditionalRecipeSites.some((site) => hostname === site || hostname.endsWith('.' + site))) {
      console.log('[isTraditionalRecipeUrl] Known recipe site detected:', hostname, '→ traditional extraction');
      return true;
    }

    // ============================================
    // RULE 3: URL Pattern Analysis (for unknown sites)
    // ============================================

    // Strong indicators for traditional recipe pages
    const recipePathPatterns = [
      '/recipe/',
      '/recipes/',
      '/dish/',
      '/dishes/',
      '/meal/',
      '/meals/',
    ];

    const hasRecipePattern = recipePathPatterns.some((pattern) => fullUrl.includes(pattern));

    if (hasRecipePattern) {
      console.log('[isTraditionalRecipeUrl] Recipe URL pattern detected:', fullUrl, '→ traditional extraction');
      return true;
    }

    // ============================================
    // RULE 4: Default Behavior
    // ============================================

    // If we can't determine, be conservative: assume video/social
    // Better to charge $0.01 and succeed than fail trying schema.org
    console.warn('[isTraditionalRecipeUrl] Unknown URL type:', hostname, '→ defaulting to social extraction');
    return false;

  } catch (error) {
    console.error('[isTraditionalRecipeUrl] Error parsing URL:', error);
    return false; // Default to social extraction on error
  }
}

/**
 * Ingest a traditional recipe from a URL
 */
export async function ingestTraditionalRecipe(
  params: IngestTraditionalRecipeParams
): Promise<IngestTraditionalRecipeResult> {
  const { url, userId, householdId, ignoreCache } = params;

  console.log('[TraditionalRecipeService] Ingesting recipe from:', url);
  console.log('[TraditionalRecipeService] User ID:', userId);
  console.log('[TraditionalRecipeService] Household ID:', householdId);
  if (ignoreCache) {
    console.log('[TraditionalRecipeService] 🧪 Testing mode: Cache bypassed');
  }

  try {
    // Call Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('ingest-traditional-recipe', {
      body: {
        url,
        user_id: userId,
        household_id: householdId,
        ignore_cache: ignoreCache || false,
      },
    });

    // Log full response for debugging
    console.log('[TraditionalRecipeService] Edge Function response:', {
      data,
      error,
      hasData: !!data,
      hasError: !!error,
    });

    if (error) {
      console.error('[TraditionalRecipeService] Edge Function error:', {
        name: error.name,
        message: error.message,
        context: error.context,
        status: error.status,
      });
      throw new Error(`Edge Function error: ${error.message || 'Unknown error'}`);
    }

    if (!data) {
      throw new Error('Edge Function returned no data');
    }

    if (data.error) {
      console.error('[TraditionalRecipeService] Server error response:', data);
      throw new Error(data.details || data.error || 'Server error');
    }

    console.log('[TraditionalRecipeService] Success! Cook Card ID:', data.cook_card?.id);

    return data as IngestTraditionalRecipeResult;
  } catch (err) {
    console.error('[TraditionalRecipeService] Fatal error:', err);
    throw err;
  }
}

/**
 * Transform database cook_card to CookCard type
 */
export async function loadTraditionalRecipeAsCookCard(cookCardId: string): Promise<CookCard> {
  console.log('[TraditionalRecipeService] Loading cook card:', cookCardId);

  // Load cook_card with ingredients
  const { data: cookCardData, error: cardError } = await supabase
    .from('cook_cards')
    .select('*')
    .eq('id', cookCardId)
    .single();

  if (cardError) throw cardError;

  const { data: ingredientsData, error: ingredientsError } = await supabase
    .from('cook_card_ingredients')
    .select('*')
    .eq('cook_card_id', cookCardId)
    .order('sort_order');

  if (ingredientsError) throw ingredientsError;

  // Transform instructions to match CookCard format
  let instructions: any;

  if (cookCardData.instructions_json && Array.isArray(cookCardData.instructions_json)) {
    // Structured instructions (array of steps from schema.org)
    // CookCardScreen.tsx checks for `type === 'steps'` to show step-by-step instructions
    instructions = {
      type: 'steps', // Must be 'steps' to trigger structured display in CookCardScreen
      steps: cookCardData.instructions_json.map((step: any, index: number) => ({
        step_number: index + 1,
        instruction: step.text || step.instruction || String(step), // Handle different formats
      })),
      text: cookCardData.instructions_text, // Also include plain text version
    };
  } else if (cookCardData.instructions_text) {
    // Plain text instructions
    instructions = {
      type: 'creator_provided',
      text: cookCardData.instructions_text,
    };
  } else {
    // Fallback to link-only
    instructions = {
      type: 'link_only',
    };
  }

  // Transform to CookCard format
  const cookCard: CookCard = {
    id: cookCardData.id,
    version: '1.0',
    source: {
      url: cookCardData.source_url,
      platform: cookCardData.platform,
      creator: {
        handle: cookCardData.creator_handle,
        name: cookCardData.creator_name,
        avatar_url: cookCardData.creator_avatar_url,
      },
    },
    title: cookCardData.title,
    description: cookCardData.description,
    image_url: cookCardData.image_url,
    prep_time_minutes: cookCardData.prep_time_minutes,
    cook_time_minutes: cookCardData.cook_time_minutes,
    servings: cookCardData.servings,
    instructions: instructions,
    ingredients: (ingredientsData || []).map((ing: any, idx: number) => ({
      // Use normalized_name for display (without quantity) since we show amount/unit separately
      name: ing.normalized_name || ing.ingredient_name,
      normalized_name: ing.normalized_name,
      canonical_item_id: ing.canonical_item_id,
      amount: ing.amount,
      unit: ing.unit,
      preparation: ing.preparation,
      confidence: ing.confidence || 0.75,
      provenance: ing.provenance || 'creator_provided',
      in_pantry: ing.in_pantry || false,
      is_substitution: ing.is_substitution || false,
      substitution_rationale: ing.substitution_rationale,
      group: ing.ingredient_group,
      sort_order: ing.sort_order !== null ? ing.sort_order : idx,
      is_optional: ing.is_optional || false,
    })),
    extraction: {
      method: cookCardData.extraction_method,
      confidence: cookCardData.extraction_confidence,
      version: cookCardData.extraction_version,
      timestamp: cookCardData.created_at,
      cost_cents: cookCardData.extraction_cost_cents || 0,
    },
    created_at: cookCardData.created_at,
    updated_at: cookCardData.updated_at,
  };

  return cookCard;
}

/**
 * Test if a URL supports schema.org extraction (quick validation)
 */
export async function testSchemaOrgSupport(url: string): Promise<boolean> {
  try {
    // This is a lightweight check - we could make a HEAD request
    // or use a lightweight parser, but for now just check URL pattern
    return isTraditionalRecipeUrl(url);
  } catch {
    return false;
  }
}

/**
 * Get user's traditional recipe count (for analytics)
 */
export async function getUserTraditionalRecipeCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('cook_cards')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('platform', 'traditional')
    .eq('is_archived', false);

  if (error) {
    console.error('[TraditionalRecipeService] Error counting recipes:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Get user's total recipe count (all platforms)
 */
export async function getUserTotalRecipeCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('cook_cards')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_archived', false);

  if (error) {
    console.error('[TraditionalRecipeService] Error counting recipes:', error);
    return 0;
  }

  return count || 0;
}
