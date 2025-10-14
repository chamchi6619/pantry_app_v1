/**
 * Extraction Cache Utilities
 *
 * Purpose: Input-hash based caching for Cook Card extractions
 *
 * Why input-hash?
 * - Same URL + different user paste = different extractions
 * - Cache key = SHA256(url + title + description + userPaste + extraction_version)
 * - Bump extraction_version when we update prompts/validation logic
 *
 * TTL: 30 days (consistent for all URLs)
 */

/**
 * Current extraction version
 *
 * Bump this when you make changes to:
 * - LLM prompts
 * - Evidence validation logic
 * - Section header filtering
 * - Ingredient normalization
 * - Any extraction algorithm changes
 *
 * Version History:
 * - 1.0.0: Initial implementation (YouTube API + oEmbed)
 * - 2.0.0: yt-dlp integration for all platforms (TikTok descriptions, Xiaohongshu support)
 */
export const EXTRACTION_VERSION = "2.0.0";

/**
 * Compute input hash for cache key
 *
 * @param url - Normalized source URL
 * @param title - Recipe title
 * @param description - Recipe description/caption
 * @param userPaste - Optional user-provided text
 * @returns SHA256 hash of combined inputs
 */
export async function computeInputHash(
  url: string,
  title: string,
  description: string,
  userPaste?: string
): Promise<string> {
  const combined = [
    url,
    title,
    description || '',
    userPaste || '',
    EXTRACTION_VERSION,  // Invalidates cache when extraction logic changes
  ].join('||');

  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Cached extraction result
 */
export interface CachedResult {
  cook_card: any;
  cache_hit: true;
  cached_at: string;
  hit_count: number;
}

/**
 * Get cached extraction by input hash
 *
 * @param supabase - Supabase client
 * @param url - Normalized source URL
 * @param title - Recipe title
 * @param description - Recipe description
 * @param userPaste - Optional user-provided text
 * @returns Cached result or null if not found/expired
 */
export async function getCachedExtraction(
  supabase: any,
  url: string,
  title: string,
  description: string,
  userPaste?: string
): Promise<CachedResult | null> {
  try {
    const inputHash = await computeInputHash(url, title, description, userPaste);

    const { data, error } = await supabase
      .from('extraction_cache')
      .select('*')
      .eq('url_hash', inputHash)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) {
      console.log(`⚡ Cache miss for hash: ${inputHash.substring(0, 8)}...`);
      return null;
    }

    console.log(`✅ Cache HIT for hash: ${inputHash.substring(0, 8)}... (hit count: ${data.hit_count + 1})`);

    // Update hit count and last accessed
    await supabase
      .from('extraction_cache')
      .update({
        hit_count: data.hit_count + 1,
        last_accessed_at: new Date().toISOString(),
      })
      .eq('id', data.id);

    return {
      cook_card: {
        ...data.metadata_json,
        ingredients: data.ingredients_json,
        extraction: {
          method: data.extraction_method,
          confidence: data.extraction_confidence,
          version: 'cached',
          timestamp: data.created_at,
          cost_cents: 0, // No cost for cached extraction
        },
      },
      cache_hit: true,
      cached_at: data.created_at,
      hit_count: data.hit_count + 1,
    };
  } catch (err) {
    console.error('Cache lookup error:', err);
    return null;
  }
}

/**
 * Set cached extraction
 *
 * @param supabase - Supabase client
 * @param url - Normalized source URL
 * @param inputHash - Pre-computed input hash
 * @param cookCard - Cook card to cache
 * @param cost - Extraction cost in cents
 */
export async function setCachedExtraction(
  supabase: any,
  url: string,
  inputHash: string,
  cookCard: any,
  cost: number
): Promise<void> {
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30-day TTL

    await supabase.from('extraction_cache').upsert({
      source_url: url,
      url_hash: inputHash,
      metadata_json: {
        version: cookCard.version,
        source: cookCard.source,
        title: cookCard.title,
        description: cookCard.description,
        image_url: cookCard.image_url,
        prep_time_minutes: cookCard.prep_time_minutes,
        cook_time_minutes: cookCard.cook_time_minutes,
        total_time_minutes: cookCard.total_time_minutes,
        servings: cookCard.servings,
        instructions: cookCard.instructions,
      },
      ingredients_json: cookCard.ingredients,
      extraction_method: cookCard.extraction.method,
      extraction_confidence: cookCard.extraction.confidence,
      llm_calls_count: cookCard.extraction.method === 'llm_assisted' ? 1 : 0,
      total_cost_cents: cost,
      ttl_days: 30,
      expires_at: expiresAt.toISOString(),
      hit_count: 0,
      created_at: new Date().toISOString(),
      last_accessed_at: new Date().toISOString(),
    });

    console.log(`💾 Cached extraction for hash: ${inputHash.substring(0, 8)}... (expires in 30 days)`);
  } catch (err) {
    console.error('Cache write error:', err);
    // Non-blocking: Continue even if cache write fails
  }
}

/**
 * Invalidate cache entry by URL
 * (Admin function for manual cache refresh)
 *
 * @param supabase - Supabase client
 * @param url - Source URL to invalidate
 * @returns Number of cache entries deleted
 */
export async function invalidateCacheByURL(
  supabase: any,
  url: string
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('extraction_cache')
      .delete()
      .eq('source_url', url)
      .select();

    if (error) {
      console.error('Cache invalidation error:', err);
      return 0;
    }

    console.log(`🗑️  Invalidated ${data?.length || 0} cache entries for URL: ${url}`);
    return data?.length || 0;
  } catch (err) {
    console.error('Cache invalidation error:', err);
    return 0;
  }
}
