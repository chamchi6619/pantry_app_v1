/**
 * Queue Service
 *
 * Purpose: Spotify/Netflix-style cooking queue management
 * Pattern: Add to queue → Pick when ready → Cook → Moves to history
 * NOT: Schedule for specific date/time
 */

import { supabase } from '../lib/supabase';
import { batchCalculatePantryMatch, type PantryMatchResult } from './pantryMatchService';

export interface QueueItem {
  id: string;
  user_id: string;
  household_id: string;
  cook_card_id: string;
  status: 'queued' | 'cooking' | 'cooked' | 'skipped';
  added_at: string;
  added_by: 'user' | 'ai_suggested';
  pantry_match_percent: number | null;
  missing_ingredients_count: number | null;
  urgency_score: number;
  cooked_at: string | null;
  rating: number | null;
  user_notes: string | null;
  created_at: string;
  updated_at: string;

  // Joined data
  cook_card: {
    id: string;
    title: string;
    image_url: string | null;
    cook_time_minutes: number | null;
    total_time_minutes: number | null;
    servings: number | null;
    creator_name: string | null;
    platform: string | null;
  };
}

/**
 * Get all saved recipes with pantry match calculated
 * (Auto-populates from cook_cards - no manual "add to queue" needed)
 */
export async function getQueue(
  householdId: string
): Promise<QueueItem[]> {
  // Fetch all saved cook cards (cook_cards are user-based, not household-based due to RLS)
  // We fetch all user's cook_cards and use householdId for pantry matching
  const { data: cookCards, error } = await supabase
    .from('cook_cards')
    .select(`
      id,
      title,
      image_url,
      cook_time_minutes,
      total_time_minutes,
      servings,
      creator_name,
      platform,
      created_at,
      user_id,
      household_id,
      is_archived
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Queue] Error fetching cook cards:', error);
    throw error;
  }

  if (!cookCards || cookCards.length === 0) {
    console.log('[Queue] No cook cards found');
    return [];
  }

  console.log(`[Queue] Found ${cookCards.length} cook cards`);

  // Filter out archived recipes
  const activeCookCards = cookCards.filter(card => !card.is_archived);
  console.log(`[Queue] ${activeCookCards.length} active (non-archived) cook cards`);

  if (activeCookCards.length === 0) {
    return [];
  }

  // Calculate pantry match for ALL recipes in batch (3 queries instead of 2N!)
  const cookCardIds = activeCookCards.map(c => c.id);
  console.log(`[Queue] Batch calculating pantry matches for ${cookCardIds.length} recipes...`);

  let matchResults: Map<string, PantryMatchResult>;
  try {
    matchResults = await batchCalculatePantryMatch(cookCardIds, householdId);
    console.log(`[Queue] Batch calculation complete`);
  } catch (error) {
    console.error('[Queue] Error in batch pantry match:', error);
    // Fallback: create empty matches
    matchResults = new Map();
    cookCardIds.forEach(id => {
      matchResults.set(id, {
        matchPercent: 0,
        exactMatches: [],
        strongSubstitutions: [],
        weakSubstitutions: [],
        missingIngredients: [],
        totalIngredients: 0,
      });
    });
  }

  // Build queue items with pre-calculated matches (no more DB queries!)
  const queueItems: QueueItem[] = activeCookCards.map(card => {
    const pantryMatch = matchResults.get(card.id) || {
      matchPercent: 0,
      exactMatches: [],
      strongSubstitutions: [],
      weakSubstitutions: [],
      missingIngredients: [],
      totalIngredients: 0,
    };

    return {
      id: card.id, // Use cook_card.id as queue item id
      user_id: card.user_id,
      household_id: householdId,
      cook_card_id: card.id,
      status: 'queued' as const,
      added_at: card.created_at,
      added_by: 'user' as const,
      pantry_match_percent: pantryMatch.matchPercent,
      missing_ingredients_count: pantryMatch.missingIngredients.length,
      urgency_score: 0,
      cooked_at: null,
      rating: null,
      user_notes: null,
      created_at: card.created_at,
      updated_at: card.created_at,
      cook_card: {
        id: card.id,
        title: card.title,
        image_url: card.image_url,
        cook_time_minutes: card.cook_time_minutes,
        total_time_minutes: card.total_time_minutes,
        servings: card.servings,
        creator_name: card.creator_name,
        platform: card.platform,
      },
    };
  });

  return queueItems;
}

/**
 * Add recipe to queue (like "Add to Playlist")
 * Calculates pantry match immediately for sorting
 */
export async function addToQueue(
  userId: string,
  householdId: string,
  cookCardId: string,
  addedBy: 'user' | 'ai_suggested' = 'user'
): Promise<QueueItem> {
  // Check if already in queue
  const { data: existing } = await supabase
    .from('cooking_queue')
    .select('id')
    .eq('household_id', householdId)
    .eq('cook_card_id', cookCardId)
    .eq('status', 'queued')
    .maybeSingle();

  if (existing) {
    throw new Error('Recipe already in your queue');
  }

  // Calculate pantry match for sorting
  const pantryMatch = await calculatePantryMatch(cookCardId, householdId);

  const { data, error } = await supabase
    .from('cooking_queue')
    .insert({
      user_id: userId,
      household_id: householdId,
      cook_card_id: cookCardId,
      added_by: addedBy,
      pantry_match_percent: pantryMatch.matchPercent,
      missing_ingredients_count: pantryMatch.missingIngredients.length,
      status: 'queued',
    })
    .select(`
      *,
      cook_card:cook_cards(
        id,
        title,
        image_url,
        cook_time_minutes,
        total_time_minutes,
        servings,
        creator_name,
        platform
      )
    `)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Remove from queue (like "Remove from Playlist")
 * Sets status to 'skipped' for analytics, then deletes
 */
export async function removeFromQueue(queueItemId: string): Promise<void> {
  const { error } = await supabase
    .from('cooking_queue')
    .delete()
    .eq('id', queueItemId);

  if (error) throw error;
}

/**
 * Start cooking (like "Now Playing" in Spotify)
 * Optional step - user can skip straight to markAsCooked
 */
export async function startCooking(queueItemId: string): Promise<void> {
  const { error } = await supabase
    .from('cooking_queue')
    .update({ status: 'cooking' })
    .eq('id', queueItemId);

  if (error) throw error;
}

/**
 * Mark as cooked (like "Mark as Played")
 * Moves to history, stays in cooking_queue for analytics
 */
export async function markAsCooked(
  queueItemId: string,
  rating?: number,
  notes?: string
): Promise<void> {
  // Update queue item
  const { error: updateError, data: queueItem } = await supabase
    .from('cooking_queue')
    .update({
      status: 'cooked',
      cooked_at: new Date().toISOString(),
      rating: rating || null,
      user_notes: notes || null,
    })
    .eq('id', queueItemId)
    .select('user_id, household_id, cook_card_id')
    .single();

  if (updateError) throw updateError;

  // Add to meal_history (like Spotify's "Recently Played")
  if (queueItem) {
    const { error: historyError } = await supabase
      .from('meal_history')
      .insert({
        user_id: queueItem.user_id,
        household_id: queueItem.household_id,
        cook_card_id: queueItem.cook_card_id,
        cooked_at: new Date().toISOString(),
        rating: rating || null,
      });

    if (historyError) {
      console.error('Error adding to history:', historyError);
      // Don't throw - marking cooked succeeded
    }
  }
}

/**
 * Recalculate pantry matches for entire queue
 * Call this after user scans receipt (like Netflix updating recommendations)
 */
export async function recalculateQueueMatches(
  householdId: string
): Promise<void> {
  const queue = await getQueue(householdId);

  for (const item of queue) {
    const match = await calculatePantryMatch(item.cook_card_id, householdId);

    await supabase
      .from('cooking_queue')
      .update({
        pantry_match_percent: match.matchPercent,
        missing_ingredients_count: match.missingIngredients.length,
      })
      .eq('id', item.id);
  }
}

/**
 * Get queue size (for notifications like "Your queue is low")
 */
export async function getQueueSize(householdId: string): Promise<number> {
  const { count, error } = await supabase
    .from('cooking_queue')
    .select('*', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .eq('status', 'queued');

  if (error) throw error;
  return count || 0;
}

/**
 * Get cooking history (like "Recently Played")
 */
export async function getCookingHistory(
  householdId: string,
  limit: number = 30
): Promise<Array<{
  id: string;
  cooked_at: string;
  rating: number | null;
  cook_card: {
    id: string;
    title: string;
    image_url: string | null;
  };
}>> {
  const { data, error } = await supabase
    .from('meal_history')
    .select(`
      id,
      cooked_at,
      rating,
      cook_card:cook_cards(
        id,
        title,
        image_url
      )
    `)
    .eq('household_id', householdId)
    .order('cooked_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Check if recipe is already in queue
 */
export async function isInQueue(
  householdId: string,
  cookCardId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('cooking_queue')
    .select('id')
    .eq('household_id', householdId)
    .eq('cook_card_id', cookCardId)
    .eq('status', 'queued')
    .maybeSingle();

  if (error) throw error;
  return !!data;
}
