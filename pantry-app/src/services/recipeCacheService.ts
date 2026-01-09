/**
 * Recipe Cache Service
 *
 * Purpose: Intelligent caching layer for recipe data
 * Strategy:
 *  - Cache recipe data for 30 minutes
 *  - Invalidate on pantry changes
 *  - Provide instant loads on subsequent visits
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RecipeDatabaseItem, RecipesByCategory } from './recipeDatabaseService';

const CACHE_KEY_PREFIX = 'recipe_cache_v1:';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const PANTRY_UPDATE_KEY = 'last_pantry_update';

interface CacheEntry {
  data: RecipeDatabaseItem[];
  timestamp: number;
  householdId: string;
}

class RecipeCacheService {
  /**
   * Get cached category data if fresh
   */
  async getCachedCategory(
    category: string,
    householdId: string
  ): Promise<RecipeDatabaseItem[] | null> {
    try {
      const key = `${CACHE_KEY_PREFIX}${householdId}:${category}`;
      const cached = await AsyncStorage.getItem(key);

      if (!cached) return null;

      const entry: CacheEntry = JSON.parse(cached);

      // Check if cache is stale
      if (!this.isFresh(entry)) {
        await AsyncStorage.removeItem(key);
        return null;
      }

      // Check if pantry was updated since cache
      if (await this.pantryUpdatedSince(entry.timestamp)) {
        await AsyncStorage.removeItem(key);
        return null;
      }

      console.log(`[Cache] HIT for ${category} (age: ${this.getAge(entry)}s)`);
      return entry.data;
    } catch (error) {
      console.error('[Cache] Error reading cache:', error);
      return null;
    }
  }

  /**
   * Cache category data
   */
  async setCachedCategory(
    category: string,
    householdId: string,
    data: RecipeDatabaseItem[]
  ): Promise<void> {
    try {
      const key = `${CACHE_KEY_PREFIX}${householdId}:${category}`;
      const entry: CacheEntry = {
        data,
        timestamp: Date.now(),
        householdId,
      };

      await AsyncStorage.setItem(key, JSON.stringify(entry));
      console.log(`[Cache] STORED ${category} (${data.length} recipes)`);
    } catch (error) {
      console.error('[Cache] Error writing cache:', error);
    }
  }

  /**
   * Get all cached categories
   */
  async getAllCached(householdId: string): Promise<RecipesByCategory | null> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(k =>
        k.startsWith(CACHE_KEY_PREFIX) &&
        k.includes(householdId)
      );

      if (cacheKeys.length === 0) return null;

      const entries = await AsyncStorage.multiGet(cacheKeys);
      const result: RecipesByCategory = {};
      let hasStaleData = false;

      for (const [key, value] of entries) {
        if (!value) continue;

        const entry: CacheEntry = JSON.parse(value);

        // Check freshness
        if (!this.isFresh(entry) || await this.pantryUpdatedSince(entry.timestamp)) {
          hasStaleData = true;
          continue;
        }

        // Extract category name from key
        const category = key.split(':')[2];
        result[category] = entry.data;
      }

      console.log(`[Cache] Loaded ${Object.keys(result).length} cached categories`);

      // If some data is stale, return null to force full refresh
      if (hasStaleData && Object.keys(result).length < 8) {
        return null;
      }

      return Object.keys(result).length > 0 ? result : null;
    } catch (error) {
      console.error('[Cache] Error reading all cache:', error);
      return null;
    }
  }

  /**
   * Invalidate all cache for a household
   */
  async invalidate(householdId: string): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(k =>
        k.startsWith(CACHE_KEY_PREFIX) &&
        k.includes(householdId)
      );

      await AsyncStorage.multiRemove(cacheKeys);
      console.log(`[Cache] INVALIDATED ${cacheKeys.length} entries for household`);
    } catch (error) {
      console.error('[Cache] Error invalidating cache:', error);
    }
  }

  /**
   * Mark pantry as updated (invalidates cache)
   */
  async markPantryUpdated(): Promise<void> {
    try {
      await AsyncStorage.setItem(PANTRY_UPDATE_KEY, Date.now().toString());
      console.log('[Cache] Marked pantry as updated');
    } catch (error) {
      console.error('[Cache] Error marking pantry update:', error);
    }
  }

  /**
   * Check if cache entry is fresh
   */
  private isFresh(entry: CacheEntry): boolean {
    const age = Date.now() - entry.timestamp;
    return age < CACHE_DURATION;
  }

  /**
   * Check if pantry was updated after cache timestamp
   */
  private async pantryUpdatedSince(timestamp: number): Promise<boolean> {
    try {
      const lastUpdate = await AsyncStorage.getItem(PANTRY_UPDATE_KEY);
      if (!lastUpdate) return false;

      return parseInt(lastUpdate) > timestamp;
    } catch {
      return false;
    }
  }

  /**
   * Get cache age in seconds
   */
  private getAge(entry: CacheEntry): number {
    return Math.round((Date.now() - entry.timestamp) / 1000);
  }

  /**
   * Clear all caches (for debugging)
   */
  async clearAll(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(k => k.startsWith(CACHE_KEY_PREFIX));
      await AsyncStorage.multiRemove(cacheKeys);
      await AsyncStorage.removeItem(PANTRY_UPDATE_KEY);
      console.log('[Cache] CLEARED all caches');
    } catch (error) {
      console.error('[Cache] Error clearing cache:', error);
    }
  }
}

export const recipeCache = new RecipeCacheService();
