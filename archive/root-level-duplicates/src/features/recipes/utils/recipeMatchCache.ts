import { RecipeScore, InventoryItem, CachedMatchResult } from '../types';

export class RecipeMatchCache {
  private cache: Map<string, CachedMatchResult> = new Map();
  private maxAge: number = 5 * 60 * 1000; // 5 minutes default
  private maxEntries: number = 100;

  constructor(maxAge?: number, maxEntries?: number) {
    if (maxAge) this.maxAge = maxAge;
    if (maxEntries) this.maxEntries = maxEntries;
  }

  generateKey(recipeId: string, inventoryHash: string): string {
    return `${recipeId}:${inventoryHash}`;
  }

  hashInventory(items: InventoryItem[]): string {
    // Sort by ID for consistency
    const sorted = items
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(item => {
        // Include all relevant fields that affect matching
        const expiry = item.expirationDate ?
          new Date(item.expirationDate).toISOString().split('T')[0] : 'none';
        return `${item.id}:${item.quantity}:${item.unit}:${item.canonicalId || ''}:${expiry}`;
      })
      .join('|');

    return this.simpleHash(sorted);
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).substring(0, 8);
  }

  get(recipeId: string, inventory: InventoryItem[]): RecipeScore | null {
    const hash = this.hashInventory(inventory);
    const key = this.generateKey(recipeId, hash);
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    // Check if cache entry has expired
    if (Date.now() - cached.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    return cached.result;
  }

  set(recipeId: string, inventory: InventoryItem[], result: RecipeScore): void {
    const hash = this.hashInventory(inventory);
    const key = this.generateKey(recipeId, hash);

    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      inventoryHash: hash
    });
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Date.now();

    // Find the oldest entry
    for (const [key, value] of this.cache.entries()) {
      if (value.timestamp < oldestTimestamp) {
        oldestTimestamp = value.timestamp;
        oldestKey = key;
      }
    }

    // Remove the oldest entry
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  clearExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.maxAge) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  has(recipeId: string, inventory: InventoryItem[]): boolean {
    const hash = this.hashInventory(inventory);
    const key = this.generateKey(recipeId, hash);
    const cached = this.cache.get(key);

    if (!cached) {
      return false;
    }

    // Check if expired
    if (Date.now() - cached.timestamp > this.maxAge) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  getStats(): {
    size: number;
    maxSize: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    let oldestTimestamp: number | null = null;
    let newestTimestamp: number | null = null;

    for (const value of this.cache.values()) {
      if (oldestTimestamp === null || value.timestamp < oldestTimestamp) {
        oldestTimestamp = value.timestamp;
      }
      if (newestTimestamp === null || value.timestamp > newestTimestamp) {
        newestTimestamp = value.timestamp;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxEntries,
      oldestEntry: oldestTimestamp,
      newestEntry: newestTimestamp
    };
  }

  // Batch get for multiple recipes
  getBatch(
    recipeIds: string[],
    inventory: InventoryItem[]
  ): Map<string, RecipeScore | null> {
    const results = new Map<string, RecipeScore | null>();

    for (const recipeId of recipeIds) {
      results.set(recipeId, this.get(recipeId, inventory));
    }

    return results;
  }

  // Batch set for multiple recipes
  setBatch(
    scores: RecipeScore[],
    inventory: InventoryItem[]
  ): void {
    for (const score of scores) {
      this.set(score.recipe.id, inventory, score);
    }
  }

  // Invalidate cache entries for a specific recipe
  invalidateRecipe(recipeId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith(`${recipeId}:`)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  // Invalidate all cache entries when inventory changes significantly
  invalidateAll(): void {
    this.clear();
  }

  // Update cache TTL
  updateMaxAge(maxAge: number): void {
    this.maxAge = maxAge;
    // Clean up expired entries with new TTL
    this.clearExpired();
  }

  // Update max entries
  updateMaxEntries(maxEntries: number): void {
    this.maxEntries = maxEntries;

    // Evict entries if we're over the new limit
    while (this.cache.size > this.maxEntries) {
      this.evictOldest();
    }
  }
}

export const recipeMatchCache = new RecipeMatchCache();