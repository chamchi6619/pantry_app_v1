/**
 * Extraction Helper Utilities
 *
 * Purpose: Additional helpers for recipe extraction
 * - Quality signal detection
 * - Unicode fraction normalization
 * - Section header grouping
 * - Canonical item matching
 */

// Canonical items cache (1 hour TTL)
interface CanonicalCache {
  map: Map<string, string>;
  expiresAt: number;
}

let _canonicalItemsCache: CanonicalCache | null = null;

/**
 * Load canonical items map with caching
 *
 * Batches all canonical item queries into a single load with 1-hour cache
 *
 * @param supabase - Supabase client
 * @returns Map of normalized_name → canonical_item_id
 */
export async function loadCanonicalItemsMap(supabase: any): Promise<Map<string, string>> {
  const now = Date.now();

  // Return cached map if still valid
  if (_canonicalItemsCache && _canonicalItemsCache.expiresAt > now) {
    return _canonicalItemsCache.map;
  }

  console.log('🔄 Loading canonical items map...');

  // Fetch all canonical items (single query)
  const { data: items, error } = await supabase
    .from('canonical_items')
    .select('id, canonical_name, aliases');

  if (error) {
    console.error('❌ Failed to load canonical items:', error);
    return new Map();
  }

  // Build map: normalized_name → id
  const map = new Map<string, string>();

  for (const item of items || []) {
    const normalizedName = item.canonical_name.toLowerCase().trim();
    map.set(normalizedName, item.id);

    // Add aliases if present
    if (item.aliases && Array.isArray(item.aliases)) {
      for (const alias of item.aliases) {
        const normalizedAlias = alias.toLowerCase().trim();
        map.set(normalizedAlias, item.id);
      }
    }
  }

  console.log(`✅ Loaded ${map.size} canonical item mappings`);

  // Cache for 1 hour
  _canonicalItemsCache = {
    map,
    expiresAt: now + 3600000  // 1 hour
  };

  return map;
}

/**
 * Match ingredients to canonical items (batch optimized)
 *
 * Replaces N database queries with 1 cached map lookup
 *
 * @param supabase - Supabase client
 * @param ingredients - Ingredients with normalized_name field
 * @returns Ingredients with canonical_item_id added
 */
export async function matchCanonicalItems<T extends { normalized_name?: string; canonical_item_id?: string }>(
  supabase: any,
  ingredients: T[]
): Promise<T[]> {
  const canonicalMap = await loadCanonicalItemsMap(supabase);

  for (const ingredient of ingredients) {
    if (ingredient.normalized_name) {
      const normalizedName = ingredient.normalized_name.toLowerCase().trim();
      const canonicalId = canonicalMap.get(normalizedName);
      if (canonicalId) {
        ingredient.canonical_item_id = canonicalId;
      }
    }
  }

  return ingredients;
}

/**
 * Feature flags
 */
export function isTranscriptExtractionEnabled(): boolean {
  const envFlag = Deno.env.get('ENABLE_TRANSCRIPT_EXTRACTION');
  if (envFlag !== undefined) {
    return envFlag.toLowerCase() === 'true';
  }
  // Default: enabled
  return true;
}

/**
 * Check if text has quality signals worth sending to LLM
 *
 * Purpose: Save costs by detecting text that's unlikely to contain recipes
 *
 * @param sourceText - Text to analyze
 * @returns True if text has recipe signals
 */
export function hasRecipeQualitySignals(sourceText: string): boolean {
  // Check for quantity signals (measurements)
  const quantityPattern = /\d+\s*(cup|cups|tbsp|tablespoon|tsp|teaspoon|oz|ounce|lb|pound|g|gram|ml|milliliter|kg|kilogram|l|liter|clove|piece|stalk)/i;
  const hasQuantitySignals = quantityPattern.test(sourceText);

  // Check for list structure (bullets or numbers)
  const listPattern = /\n\s*[-•*▢▣□☐]\s/;
  const numberedListPattern = /\n\s*\d+[\.)]\s/;
  const hasListStructure = listPattern.test(sourceText) || numberedListPattern.test(sourceText);

  // Check for ingredient-related keywords
  const ingredientKeywords = /\b(ingredients?|recipes?|you need|you'll need|for the|sauce|marinade|dressing)\b/i;
  const hasIngredientKeywords = ingredientKeywords.test(sourceText);

  // Must have either:
  // - Quantity signals AND some structure (list or keywords)
  // - Strong ingredient keywords (even without quantities)
  // - Strong list structure (3+ bullets)
  if (hasQuantitySignals && (hasListStructure || hasIngredientKeywords)) {
    return true;
  }

  // NEW: If text explicitly mentions "ingredients" or "recipe", trust it
  // Even without quantities, creators often list items in prose form
  // Example: "Ingredients: Fresh Asparagus, Garlic, Butter"
  if (hasIngredientKeywords && sourceText.length >= 100) {
    return true;
  }

  const bulletCount = (sourceText.match(/\n\s*[-•*]/g) || []).length;
  if (bulletCount >= 3 && hasIngredientKeywords) {
    return true;
  }

  // If text is long enough, give it a chance (might have verbose descriptions)
  if (sourceText.length >= 300) {
    return true;
  }

  return false;
}

/**
 * Unicode fraction normalization
 *
 * Converts unicode fractions to decimal for parsing
 *
 * @param text - Text with potential unicode fractions
 * @returns Text with normalized fractions
 */
const FRACTION_MAP: Record<string, string> = {
  '½': '0.5',
  '¼': '0.25',
  '¾': '0.75',
  '⅓': '0.33',
  '⅔': '0.67',
  '⅕': '0.2',
  '⅖': '0.4',
  '⅗': '0.6',
  '⅘': '0.8',
  '⅙': '0.17',
  '⅚': '0.83',
  '⅐': '0.14',
  '⅛': '0.125',
  '⅜': '0.375',
  '⅝': '0.625',
  '⅞': '0.875',
  '⅑': '0.11',
  '⅒': '0.1',
};

export function normalizeFractions(text: string): string {
  let normalized = text;

  // Replace unicode fractions
  for (const [fraction, decimal] of Object.entries(FRACTION_MAP)) {
    normalized = normalized.replace(new RegExp(fraction, 'g'), decimal);
  }

  // Also handle mixed numbers like "1½" → "1.5"
  normalized = normalized.replace(/(\d+)([½¼¾⅓⅔⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒])/g, (match, whole, frac) => {
    const wholeNum = parseInt(whole, 10);
    const fracNum = parseFloat(FRACTION_MAP[frac] || '0');
    return (wholeNum + fracNum).toString();
  });

  return normalized;
}

/**
 * Parse section headers and group ingredients
 *
 * Converts section headers like "For the sauce:" into ingredient groups
 * instead of rejecting them entirely
 *
 * @param ingredients - Raw ingredients from LLM
 * @returns Ingredients with group assignments
 */
export interface IngredientWithGroup {
  name: string;
  amount?: number;
  unit?: string;
  preparation?: string;
  confidence: number;
  provenance: string;
  evidence_phrase?: string;
  group?: string;
  sort_order: number;
}

export function groupIngredientsBySections(
  ingredients: IngredientWithGroup[]
): IngredientWithGroup[] {
  const result: IngredientWithGroup[] = [];
  let currentGroup: string | null = null;

  // Patterns that indicate section headers (not actual ingredients)
  const sectionHeaderPatterns = [
    /^(for the|for|the)\s+(sauce|dressing|marinade|topping|garnish|filling|glaze|base|dough|batter)/i,
    /^(sauce|dressing|marinade|topping|garnish|filling|glaze|base|dough|batter)$/i,
    /^(optional|garnish|toppings?)$/i,
  ];

  // Standalone meta-headers to always reject
  const metaHeaderPatterns = [
    /^ingredients?$/i,
    /^instructions?$/i,
    /^directions?$/i,
    /^notes?$/i,
    /^tips?$/i,
  ];

  for (const ingredient of ingredients) {
    const name = ingredient.name.trim();

    // Reject standalone meta-headers
    if (metaHeaderPatterns.some(p => p.test(name))) {
      console.log(`   🚫 Rejecting meta-header: "${name}"`);
      continue;
    }

    // Check if this is a section header
    const isSectionHeader = sectionHeaderPatterns.some(p => p.test(name));

    if (isSectionHeader) {
      // This becomes the current group name
      currentGroup = name;
      console.log(`   📂 Section detected: "${name}"`);
      continue; // Don't add as ingredient
    }

    // Normal ingredient - add with current group
    result.push({
      ...ingredient,
      group: currentGroup || undefined,
    });
  }

  return result;
}

/**
 * Fetch YouTube transcript with timeout
 *
 * Purpose: Best-effort transcript fetching that never blocks
 *
 * @param videoId - YouTube video ID
 * @param timeoutMs - Timeout in milliseconds (default: 3000)
 * @returns Transcript text or empty string
 */
export async function fetchYouTubeTranscriptSafe(
  videoId: string,
  timeoutMs: number = 3000
): Promise<string> {
  if (!isTranscriptExtractionEnabled()) {
    console.log('⏭️ Transcript extraction disabled by feature flag');
    return '';
  }

  try {
    const timedTextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`;

    const transcriptPromise = fetch(timedTextUrl).then(async (res) => {
      if (!res.ok || res.headers.get('content-length') === '0') {
        return '';
      }

      const data = await res.json();

      if (!data.events || !Array.isArray(data.events)) {
        return '';
      }

      const transcriptLines: string[] = [];
      for (const event of data.events) {
        if (event.segs) {
          const text = event.segs.map((seg: any) => seg.utf8 || '').join('');
          if (text.trim()) transcriptLines.push(text.trim());
        }
      }

      return transcriptLines.join(' ');
    });

    // Race against timeout
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('Transcript fetch timeout')), timeoutMs)
    );

    const transcript = await Promise.race([transcriptPromise, timeoutPromise]);
    return transcript;
  } catch (err) {
    console.warn(`⚠️ Transcript fetch failed (expected): ${err.message}`);
    return '';
  }
}
