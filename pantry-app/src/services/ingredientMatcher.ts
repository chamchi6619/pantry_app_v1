/**
 * Client-Side Ingredient Matcher
 *
 * Uses canonicalItemsService for fast, offline canonical matching
 * Returns canonical_item_id, canonical_name, and normalized_name for storage
 */

import { canonicalItemsService } from './canonicalItemsService';

export interface MatchResult {
  canonical_item_id: string;  // Database UUID
  canonical_name: string;     // Display name (e.g., "Milk")
  normalized_name: string;    // Lowercase for search (e.g., "milk")
  confidence: 'exact' | 'alias' | 'none';
}

/**
 * Match an ingredient name to a canonical item
 *
 * @param name - The user-entered ingredient name (e.g., "whole milk")
 * @returns Match result with canonical IDs, or null if no match
 */
export async function matchIngredient(name: string): Promise<MatchResult | null> {
  // Ensure service is initialized
  await canonicalItemsService.initialize();

  // Try exact match first
  const match = canonicalItemsService.findByNameOrAlias(name);

  if (match) {
    return {
      canonical_item_id: match.id,  // This is now the DB UUID ✅
      canonical_name: match.displayName,
      normalized_name: normalize(name),
      confidence: 'exact',
    };
  }

  // Try fuzzy matching via search
  const searchResults = canonicalItemsService.searchItems(name, 1);

  if (searchResults.length > 0) {
    const topMatch = searchResults[0];
    return {
      canonical_item_id: topMatch.id,
      canonical_name: topMatch.displayName,
      normalized_name: normalize(name),
      confidence: 'alias',
    };
  }

  // No match found
  return null;
}

/**
 * Normalize ingredient name for storage
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get autocomplete suggestions as user types
 *
 * @param query - Partial ingredient name
 * @param limit - Max number of suggestions
 * @returns Array of matching canonical items
 */
export async function getAutocompleteSuggestions(
  query: string,
  limit: number = 5
): Promise<Array<{ id: string; displayName: string; category: string }>> {
  if (query.length < 2) return [];

  await canonicalItemsService.initialize();

  const results = canonicalItemsService.searchItems(query, limit);

  return results.map(item => ({
    id: item.id,
    displayName: item.displayName,
    category: item.category,
  }));
}

/**
 * Check if canonical items are loaded
 */
export function isCanonicalDataReady(): boolean {
  return canonicalItemsService.getAllItems().length > 0;
}

/**
 * Force refresh canonical items from Supabase
 */
export async function refreshCanonicalItems(): Promise<void> {
  await canonicalItemsService.syncFromSupabase();
}
