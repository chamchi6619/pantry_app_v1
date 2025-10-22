/**
 * Cook Card Service
 *
 * Purpose: Interface with extract-cook-card Edge Function
 * PRD Reference: COOKCARD_PRD_V1.md Task 2.3
 */

import { CookCard, ExtractionResponse } from '../types/CookCard';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

interface ExtractCookCardRequest {
  url: string;
  user_id: string;
  household_id?: string;
  bypass_cache?: boolean;
}

/**
 * Extract Cook Card from social media URL
 */
export async function extractCookCard(
  url: string,
  userId: string,
  householdId?: string,
  bypassCache?: boolean
): Promise<ExtractionResponse> {
  try {
    const request: ExtractCookCardRequest = {
      url,
      user_id: userId,
      household_id: householdId,
      bypass_cache: bypassCache,
    };

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/extract-cook-card`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Extraction failed');
    }

    const data: ExtractionResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Extract Cook Card error:', error);
    throw error;
  }
}

/**
 * Save Cook Card to database
 */
export async function saveCookCard(
  cookCard: CookCard,
  userId: string,
  householdId?: string
): Promise<{ id: string; alreadyExists?: boolean }> {
  try {
    console.log('Saving Cook Card:', cookCard.title);

    // Import supabase client dynamically to avoid circular deps
    const { supabase } = await import('../lib/supabase');

    // Check if this URL already exists for this user
    const { data: existingCard } = await supabase
      .from('cook_cards')
      .select('id')
      .eq('source_url', cookCard.source.url)
      .eq('user_id', userId)
      .single();

    if (existingCard) {
      console.log('✅ Cook Card already saved, returning existing ID:', existingCard.id);
      return { id: existingCard.id, alreadyExists: true };
    }

    // Insert cook card record
    const { data: cookCardData, error: cookCardError } = await supabase
      .from('cook_cards')
      .insert({
        user_id: userId,
        household_id: householdId || null,
        source_url: cookCard.source.url,
        platform: cookCard.source.platform,
        creator_handle: cookCard.source.creator.handle || null,
        creator_name: cookCard.source.creator.name || null,
        creator_avatar_url: cookCard.source.creator.avatar_url || null,
        title: cookCard.title,
        description: cookCard.description || null,
        image_url: cookCard.image_url || null,
        prep_time_minutes: cookCard.prep_time_minutes || null,
        cook_time_minutes: cookCard.cook_time_minutes || null,
        total_time_minutes: cookCard.total_time_minutes || null,
        servings: cookCard.servings || null,
        instructions_type: cookCard.instructions.type,
        instructions_text: cookCard.instructions.text || null,
        instructions_json: cookCard.instructions.steps || null,
        extraction_method: cookCard.extraction.method,
        extraction_confidence: cookCard.extraction.confidence,
        extraction_version: cookCard.extraction.version,
        extraction_cost_cents: cookCard.extraction.cost_cents || 0,
      })
      .select('id')
      .single();

    if (cookCardError) {
      // Check if it's a duplicate key error (race condition - inserted between check and insert)
      if (cookCardError.code === '23505') {
        console.log('⚠️  Race condition: Cook Card was just saved by another request');
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

      console.error('Failed to insert cook_cards row:', cookCardError);
      throw new Error(`Database error: ${cookCardError.message}`);
    }

    const cookCardId = cookCardData.id;
    console.log(`✅ Cook Card saved with ID: ${cookCardId}`);

    // Insert ingredients (if any)
    if (cookCard.ingredients && cookCard.ingredients.length > 0) {
      const ingredientInserts = cookCard.ingredients.map((ing, idx) => ({
        cook_card_id: cookCardId,
        ingredient_name: ing.name,
        normalized_name: ing.normalized_name || null,
        canonical_item_id: ing.canonical_item_id || null,
        amount: ing.amount || null,
        unit: ing.unit || null,
        preparation: ing.preparation || null,
        confidence: ing.confidence,
        provenance: ing.provenance,
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
        console.error('Failed to insert ingredients:', ingredientsError);
        // Don't throw - cook card is saved, ingredients can be added later
        console.warn('Cook Card saved but ingredients failed to insert');
      } else {
        console.log(`✅ Inserted ${ingredientInserts.length} ingredients`);
      }
    }

    return { id: cookCardId };
  } catch (error) {
    console.error('Save Cook Card error:', error);
    throw error;
  }
}

/**
 * Log cook_card_saved event (Gate 2)
 */
export async function logCookCardSaved(
  cookCardId: string,
  userId: string,
  householdId?: string
): Promise<void> {
  try {
    // TODO: Implement event logging
    console.log('Logging cook_card_saved event:', cookCardId);

    // This will be implemented with Supabase client
    // await supabase.from('cook_card_events').insert({
    //   user_id: userId,
    //   household_id: householdId,
    //   cook_card_id: cookCardId,
    //   event_type: 'cook_card_saved',
    //   created_at: new Date().toISOString(),
    // });
  } catch (error) {
    console.error('Log event error:', error);
    // Don't throw - event logging failures shouldn't block user
  }
}

/**
 * Log ingredient_confirmed event (Gate 1)
 */
export async function logIngredientConfirmed(
  cookCardId: string,
  userId: string,
  confirmTaps: number,
  confidence: number
): Promise<void> {
  try {
    console.log('Logging ingredient_confirmed event:', {
      cookCardId,
      confirmTaps,
      confidence,
    });

    // This will be implemented with Supabase client
    // await supabase.from('cook_card_events').insert({
    //   user_id: userId,
    //   cook_card_id: cookCardId,
    //   event_type: 'ingredient_confirmed',
    //   confirm_taps: confirmTaps,
    //   extraction_confidence: confidence,
    //   created_at: new Date().toISOString(),
    // });
  } catch (error) {
    console.error('Log event error:', error);
  }
}

/**
 * Calculate pantry match for Cook Card
 */
export async function calculatePantryMatch(
  cookCardId: string,
  userId: string
): Promise<{
  have: number;
  need: number;
  match_percentage: number;
}> {
  try {
    // TODO: Implement pantry match calculation
    // This will query user's pantry items and match against cook_card_ingredients

    console.log('Calculating pantry match for:', cookCardId);

    // Mock response
    return {
      have: 0,
      need: 0,
      match_percentage: 0,
    };
  } catch (error) {
    console.error('Calculate pantry match error:', error);
    throw error;
  }
}

/**
 * Extract YouTube video ID from URL
 */
function extractYouTubeVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);

    // Standard URL: youtube.com/watch?v=VIDEO_ID
    if (urlObj.hostname.includes('youtube.com') && urlObj.searchParams.has('v')) {
      return urlObj.searchParams.get('v');
    }

    // Short URL: youtu.be/VIDEO_ID
    if (urlObj.hostname === 'youtu.be') {
      return urlObj.pathname.slice(1);
    }

    // Shorts: youtube.com/shorts/VIDEO_ID
    if (urlObj.pathname.startsWith('/shorts/')) {
      return urlObj.pathname.split('/shorts/')[1];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Open YouTube video in YouTube app or web
 *
 * @param recipeUrl - Recipe source URL (YouTube link)
 * @param recipeName - Recipe name for search fallback
 * @returns Promise that resolves when link is opened
 */
export async function openYouTubeDeepLink(
  recipeUrl: string,
  recipeName?: string
): Promise<void> {
  try {
    const { Linking } = await import('react-native');

    // Try to extract video ID for direct video link
    const videoId = extractYouTubeVideoId(recipeUrl);

    if (videoId) {
      // Open specific video
      const youtubeApp = `youtube://watch?v=${videoId}`;
      const youtubeWeb = recipeUrl;

      const canOpen = await Linking.canOpenURL(youtubeApp);
      if (canOpen) {
        await Linking.openURL(youtubeApp);
      } else {
        await Linking.openURL(youtubeWeb);
      }
    } else if (recipeName) {
      // Fallback: Search for recipe by name
      const query = `${recipeName} recipe`;
      const youtubeApp = `youtube://results?search_query=${encodeURIComponent(query)}`;
      const youtubeWeb = `https://youtube.com/results?search_query=${encodeURIComponent(query)}`;

      const canOpen = await Linking.canOpenURL(youtubeApp);
      if (canOpen) {
        await Linking.openURL(youtubeApp);
      } else {
        await Linking.openURL(youtubeWeb);
      }
    } else {
      // Just open the web URL
      await Linking.openURL(recipeUrl);
    }
  } catch (error) {
    console.error('Failed to open YouTube link:', error);
    throw error;
  }
}
