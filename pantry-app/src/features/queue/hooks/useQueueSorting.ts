/**
 * useQueueSorting Hook
 *
 * Purpose: Netflix-style carousel sorting for saved recipes
 * Pattern: Dynamically sort saved recipes into sections based on current pantry state
 *
 * UI Structure:
 * - "Ready to Cook" (90%+ match) - Cook these tonight
 * - [Future: DB Recipe Categories (Italian, Mexican, etc.)]
 * - "Save for Later" (<90% match) - Need a few more ingredients
 *
 * Recalculates whenever:
 * - Queue changes (add/remove recipe)
 * - Pantry changes (scan receipt)
 * - User opens app (fresh sort)
 */

import { useMemo } from 'react';
import type { QueueItem } from '../../../services/queueService';

interface SortedQueue {
  ready: QueueItem[];        // 90%+ pantry match - "Ready to Cook"
  almost: QueueItem[];       // 60-89% pantry match - (merged into "Save for Later")
  needShopping: QueueItem[]; // <60% pantry match - (merged into "Save for Later")
}

/**
 * Dynamically sort saved recipes based on pantry match percentage
 * Returns sections for Netflix-style carousel layout
 */
export function useQueueSorting(queue: QueueItem[]): SortedQueue {
  return useMemo(() => {
    // Calculate urgency score for each item
    const scoredQueue = queue.map(item => {
      const daysInQueue = Math.floor(
        (Date.now() - new Date(item.added_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Urgency factors (like Netflix "Because you watched...")
      // - Days in queue: 0-7 days = 0-70 points (been waiting long = higher priority)
      // - Missing ingredients: Fewer missing = higher score
      // - Cook time: Faster = slight boost for weeknight prioritization
      const cookTimeBonus = (item.cook_card.total_time_minutes || 60) < 30 ? 10 : 0;

      const urgencyScore =
        Math.min(daysInQueue * 10, 70) +  // Waiting time
        Math.max(0, 30 - (item.missing_ingredients_count || 0) * 5) + // Ingredient readiness
        cookTimeBonus; // Quick meal boost

      return { ...item, calculatedUrgency: urgencyScore };
    });

    // Split into 3 carousels (like Netflix rows)

    // 🟢 Ready to Cook: 90-100% match
    // Like Netflix "Continue Watching" - priority viewing
    const ready = scoredQueue
      .filter(item => (item.pantry_match_percent || 0) >= 90)
      .sort((a, b) => {
        // Sort by urgency first (been waiting + quick to make)
        const urgencyDiff = b.calculatedUrgency - a.calculatedUrgency;
        if (urgencyDiff !== 0) return urgencyDiff;

        // Then by match % (higher = better)
        return (b.pantry_match_percent || 0) - (a.pantry_match_percent || 0);
      });

    // 🟡 Almost Ready: 60-89% match
    // Like Netflix "Top Picks For You" - worth shopping for 1-2 items
    const almost = scoredQueue
      .filter(item => {
        const match = item.pantry_match_percent || 0;
        return match >= 60 && match < 90;
      })
      .sort((a, b) => {
        // Sort by pantry match first (closer to ready = higher)
        const matchDiff = (b.pantry_match_percent || 0) - (a.pantry_match_percent || 0);
        if (matchDiff !== 0) return matchDiff;

        // Then by missing count (fewer = easier to complete)
        const missingDiff = (a.missing_ingredients_count || 999) - (b.missing_ingredients_count || 999);
        if (missingDiff !== 0) return missingDiff;

        // Then by urgency
        return b.calculatedUrgency - a.calculatedUrgency;
      });

    // 🔴 Need Shopping: <60% match
    // Like Netflix "Trending Now" - aspirational, need significant shopping
    const needShopping = scoredQueue
      .filter(item => (item.pantry_match_percent || 0) < 60)
      .sort((a, b) => {
        // Sort by match % (even low matches, higher is better)
        const matchDiff = (b.pantry_match_percent || 0) - (a.pantry_match_percent || 0);
        if (matchDiff !== 0) return matchDiff;

        // Then by when added (more recent = higher interest)
        return new Date(b.added_at).getTime() - new Date(a.added_at).getTime();
      });

    return { ready, almost, needShopping };
  }, [queue]); // Recalculate when queue changes (add/remove/pantry update)
}

/**
 * Get summary stats (like "12 items in your queue")
 */
export function useQueueStats(sortedQueue: SortedQueue) {
  return useMemo(() => {
    const total = sortedQueue.ready.length + sortedQueue.almost.length + sortedQueue.needShopping.length;

    return {
      total,
      readyCount: sortedQueue.ready.length,
      almostCount: sortedQueue.almost.length,
      shoppingCount: sortedQueue.needShopping.length,
      // Insights like "3 recipes ready to cook tonight!"
      hasReadyTonight: sortedQueue.ready.length > 0,
      needsRefill: total < 5, // Like "Add more to your queue"
    };
  }, [sortedQueue]);
}
