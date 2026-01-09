/**
 * Recipe View History Service
 *
 * Purpose: Track when users view recipes (for recency penalties)
 * Storage: AsyncStorage (lightweight, client-side)
 * Strategy:
 *  - Track last view timestamp for each recipe
 *  - Calculate days since view
 *  - Used by ranking service to apply recency decay
 *  - Keep last 100 views (enough for recency, not bloated)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const VIEW_HISTORY_KEY = 'recipe_view_history_v1';
const MAX_HISTORY_SIZE = 100; // Keep only most recent 100 views

interface ViewRecord {
  recipeId: string;
  lastViewed: number; // Unix timestamp
}

interface ViewHistory {
  [recipeId: string]: number; // recipeId → timestamp
}

class RecipeViewHistoryService {
  /**
   * Record that a recipe was viewed
   */
  async recordView(recipeId: string): Promise<void> {
    try {
      const history = await this.getHistory();

      // Update/add view record
      history[recipeId] = Date.now();

      // Prune old entries (keep newest 100)
      const entries = Object.entries(history);
      if (entries.length > MAX_HISTORY_SIZE) {
        // Sort by timestamp descending, keep top 100
        entries.sort((a, b) => b[1] - a[1]);
        const pruned: ViewHistory = {};
        entries.slice(0, MAX_HISTORY_SIZE).forEach(([id, ts]) => {
          pruned[id] = ts;
        });
        await AsyncStorage.setItem(VIEW_HISTORY_KEY, JSON.stringify(pruned));
        console.log(`[ViewHistory] Pruned to ${MAX_HISTORY_SIZE} entries`);
      } else {
        await AsyncStorage.setItem(VIEW_HISTORY_KEY, JSON.stringify(history));
      }

      const daysSince = this.getDaysSinceView(recipeId, history);
      console.log(`[ViewHistory] Recorded view: ${recipeId.substring(0, 8)} (was ${daysSince} days ago)`);
    } catch (error) {
      console.error('[ViewHistory] Error recording view:', error);
    }
  }

  /**
   * Get full view history
   */
  async getHistory(): Promise<ViewHistory> {
    try {
      const stored = await AsyncStorage.getItem(VIEW_HISTORY_KEY);
      if (!stored) return {};
      return JSON.parse(stored);
    } catch (error) {
      console.error('[ViewHistory] Error reading history:', error);
      return {};
    }
  }

  /**
   * Get days since last view for a recipe
   * Returns 999 if never viewed (no penalty)
   */
  getDaysSinceView(recipeId: string, history?: ViewHistory): number {
    if (!history) {
      return 999;
    }

    const lastViewed = history[recipeId];
    if (!lastViewed) return 999;

    const daysSince = Math.floor((Date.now() - lastViewed) / (1000 * 60 * 60 * 24));
    return daysSince;
  }

  /**
   * Get view history as Map<recipeId, daysSince>
   * (Format expected by ranking service)
   */
  async getViewHistoryMap(): Promise<Map<string, number>> {
    const history = await this.getHistory();
    const map = new Map<string, number>();

    Object.keys(history).forEach(recipeId => {
      const daysSince = this.getDaysSinceView(recipeId, history);
      map.set(recipeId, daysSince);
    });

    console.log(`[ViewHistory] Loaded ${map.size} view records`);
    return map;
  }

  /**
   * Clear all view history (for debugging)
   */
  async clearHistory(): Promise<void> {
    try {
      await AsyncStorage.removeItem(VIEW_HISTORY_KEY);
      console.log('[ViewHistory] Cleared all history');
    } catch (error) {
      console.error('[ViewHistory] Error clearing history:', error);
    }
  }

  /**
   * Get recently viewed recipes (for debugging/UI)
   */
  async getRecentlyViewed(limit: number = 10): Promise<ViewRecord[]> {
    const history = await this.getHistory();
    const entries = Object.entries(history);

    // Sort by timestamp descending
    entries.sort((a, b) => b[1] - a[1]);

    return entries.slice(0, limit).map(([recipeId, lastViewed]) => ({
      recipeId,
      lastViewed,
    }));
  }
}

export const recipeViewHistory = new RecipeViewHistoryService();
