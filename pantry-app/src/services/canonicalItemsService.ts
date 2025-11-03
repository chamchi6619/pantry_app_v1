import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/supabase';

type CanonicalItem = Database['public']['Tables']['canonical_items']['Row'];

const STORAGE_KEY = '@canonical_items';
const SYNC_TIMESTAMP_KEY = '@canonical_items_sync';
const SYNC_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export interface CanonicalIngredient {
  id: string;
  displayName: string;
  category: string;
  aliases: string[];
  density?: number;
  densityGroup?: string;
  safeConversions?: boolean;
  typical_unit?: string;
  typical_location?: string;
  is_perishable?: boolean;
  typical_shelf_life_days?: number;
}

class CanonicalItemsService {
  private items: Map<string, CanonicalIngredient> = new Map();
  private aliasToCanonical: Map<string, string> = new Map();
  private categoryIndex: Map<string, string[]> = new Map();
  private isInitialized = false;

  /**
   * Initialize the service - load from cache or sync from Supabase
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Try to load from local storage first
    const cachedItems = await this.loadFromCache();

    if (cachedItems && cachedItems.length > 0) {
      this.buildIndices(cachedItems);
      this.isInitialized = true;

      // Check if we need to sync (in background)
      this.checkAndSync();
    } else {
      // No cache, fetch from Supabase
      await this.syncFromSupabase();
    }
  }

  /**
   * Load canonical items from AsyncStorage cache
   */
  private async loadFromCache(): Promise<CanonicalIngredient[] | null> {
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEY);
      if (!cached) return null;

      return JSON.parse(cached);
    } catch (error) {
      console.error('Error loading canonical items from cache:', error);
      return null;
    }
  }

  /**
   * Save canonical items to AsyncStorage cache
   */
  private async saveToCache(items: CanonicalIngredient[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      await AsyncStorage.setItem(SYNC_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      console.error('Error saving canonical items to cache:', error);
    }
  }

  /**
   * Check if sync is needed and sync in background
   */
  private async checkAndSync(): Promise<void> {
    try {
      const lastSync = await AsyncStorage.getItem(SYNC_TIMESTAMP_KEY);
      const now = Date.now();

      if (!lastSync || (now - parseInt(lastSync)) > SYNC_INTERVAL) {
        // Sync in background
        this.syncFromSupabase().catch(err =>
          console.error('Background sync failed:', err)
        );
      }
    } catch (error) {
      console.error('Error checking sync status:', error);
    }
  }

  /**
   * Sync canonical items from Supabase
   */
  async syncFromSupabase(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('canonical_items')
        .select('*')
        .order('canonical_name');

      if (error) throw error;

      if (!data || data.length === 0) {
        console.warn('No canonical items found in Supabase');
        return;
      }

      // Transform to our format
      const items = data.map(item => this.transformSupabaseItem(item));

      // Build indices
      this.buildIndices(items);

      // Save to cache
      await this.saveToCache(items);

      this.isInitialized = true;

      console.log(`✅ Synced ${items.length} canonical items from Supabase`);
    } catch (error) {
      console.error('Error syncing canonical items from Supabase:', error);
      throw error;
    }
  }

  /**
   * Transform Supabase canonical item to our format
   */
  private transformSupabaseItem(item: CanonicalItem): CanonicalIngredient {
    return {
      id: item.id, // ✅ USE DATABASE UUID, NOT CUSTOM ID!
      displayName: item.canonical_name,
      category: item.category || 'other',
      aliases: item.aliases || [],
      typical_unit: item.typical_unit || undefined,
      typical_location: item.typical_location || undefined,
      is_perishable: item.is_perishable,
      typical_shelf_life_days: item.typical_shelf_life_days || undefined,
      // Defaults for compatibility with existing code
      density: 1.0,
      densityGroup: item.category || 'other',
      safeConversions: true,
    };
  }

  /**
   * Build search indices from canonical items
   */
  private buildIndices(items: CanonicalIngredient[]): void {
    this.items.clear();
    this.aliasToCanonical.clear();
    this.categoryIndex.clear();

    for (const item of items) {
      // Add to main map
      this.items.set(item.id, item);

      // Build alias index
      for (const alias of item.aliases) {
        const normalizedAlias = this.normalize(alias);
        this.aliasToCanonical.set(normalizedAlias, item.id);
      }

      // Also map display name
      this.aliasToCanonical.set(this.normalize(item.displayName), item.id);

      // Build category index
      if (!this.categoryIndex.has(item.category)) {
        this.categoryIndex.set(item.category, []);
      }
      this.categoryIndex.get(item.category)!.push(item.id);
    }
  }

  /**
   * Normalize string for matching
   */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Get all canonical items
   */
  getAllItems(): CanonicalIngredient[] {
    return Array.from(this.items.values());
  }

  /**
   * Get canonical item by ID
   */
  getItemById(id: string): CanonicalIngredient | null {
    return this.items.get(id) || null;
  }

  /**
   * Find canonical item by name or alias
   */
  findByNameOrAlias(name: string): CanonicalIngredient | null {
    const normalized = this.normalize(name);

    // Check if it's a canonical ID
    if (this.items.has(normalized)) {
      return this.items.get(normalized) || null;
    }

    // Check aliases
    const canonicalId = this.aliasToCanonical.get(normalized);
    if (canonicalId) {
      return this.items.get(canonicalId) || null;
    }

    return null;
  }

  /**
   * Get items by category
   */
  getItemsByCategory(category: string): CanonicalIngredient[] {
    const ids = this.categoryIndex.get(category) || [];
    return ids.map(id => this.items.get(id)!).filter(Boolean);
  }

  /**
   * Search items by partial name match
   */
  searchItems(query: string, limit: number = 20): CanonicalIngredient[] {
    const normalized = this.normalize(query);
    const results: CanonicalIngredient[] = [];

    for (const item of this.items.values()) {
      // Check display name
      if (this.normalize(item.displayName).includes(normalized)) {
        results.push(item);
        continue;
      }

      // Check aliases
      const aliasMatch = item.aliases.some(alias =>
        this.normalize(alias).includes(normalized)
      );

      if (aliasMatch) {
        results.push(item);
      }

      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalItems: number;
    totalAliases: number;
    categoryCounts: Record<string, number>;
  } {
    const categoryCounts: Record<string, number> = {};
    let totalAliases = 0;

    for (const item of this.items.values()) {
      categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
      totalAliases += item.aliases.length;
    }

    return {
      totalItems: this.items.size,
      totalAliases,
      categoryCounts,
    };
  }

  /**
   * Convert to old format for backward compatibility
   */
  toOldFormat(): Record<string, CanonicalIngredient> {
    const result: Record<string, CanonicalIngredient> = {};

    for (const [id, item] of this.items.entries()) {
      result[id] = item;
    }

    return result;
  }
}

export const canonicalItemsService = new CanonicalItemsService();
