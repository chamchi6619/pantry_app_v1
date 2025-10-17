/**
 * HTML Scraper - Multi-Source Text Extraction
 *
 * Purpose: Fetch and parse HTML from share links to extract recipe data
 * Replaces: Single-source YouTube Data API description fetching
 * Benefit: Richer text sources (Schema.org, full descriptions, embedded JSON)
 *
 * Supported Platforms:
 * - YouTube: Schema.org ld+json + full description
 * - Instagram: OpenGraph + embedded JSON
 * - TikTok: __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON blob
 *
 * Cost: $0.00 (just HTTP fetch + parsing)
 * Latency: 300-800ms (faster than API in some cases)
 */

/**
 * Extraction result with provenance tracking
 */
export interface HTMLExtractionResult {
  success: boolean;
  text: string;
  sources: string[]; // e.g., ['schema_org', 'description', 'opengraph']
  metadata: {
    title?: string;
    description?: string;
    image_url?: string;
    creator?: {
      name?: string;
      handle?: string;
      avatar_url?: string;
    };
    // Recipe-specific schema.org data
    prep_time_minutes?: number;
    cook_time_minutes?: number;
    servings?: number;
    ingredients?: string[]; // Pre-extracted from schema.org
    instructions?: string | string[]; // Pre-extracted from schema.org
  };
  error?: string;
}

/**
 * Schema.org Recipe markup (JSON-LD)
 */
interface SchemaOrgRecipe {
  "@type"?: string;
  name?: string;
  description?: string;
  image?: string | string[] | { url: string }[];
  author?: {
    name?: string;
    url?: string;
  };
  prepTime?: string; // ISO 8601 duration (PT15M)
  cookTime?: string;
  totalTime?: string;
  recipeYield?: string | number;
  recipeIngredient?: string[];
  recipeInstructions?: string | Array<{ text: string } | string>;
}

/**
 * Parse ISO 8601 duration to minutes
 * Examples: "PT15M" → 15, "PT1H30M" → 90, "P1DT2H" → 1560
 */
function parseDuration(duration: string): number | undefined {
  if (!duration) return undefined;

  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return undefined;

  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');

  return hours * 60 + minutes;
}

/**
 * Extract Schema.org Recipe markup from HTML
 */
function extractSchemaOrg(html: string): Partial<SchemaOrgRecipe> | null {
  try {
    // Find all <script type="application/ld+json"> tags
    const jsonLdRegex = /<script\s+type="application\/ld\+json"[^>]*>(.*?)<\/script>/gis;
    const matches = html.matchAll(jsonLdRegex);

    for (const match of matches) {
      const jsonStr = match[1];
      const data = JSON.parse(jsonStr);

      // Handle both single object and array of objects
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        // Check if this is a Recipe schema
        if (item["@type"] === "Recipe" || item["@type"]?.includes?.("Recipe")) {
          console.log('✅ Found Schema.org Recipe markup');
          return item as SchemaOrgRecipe;
        }

        // Handle nested graph structures
        if (item["@graph"]) {
          for (const graphItem of item["@graph"]) {
            if (graphItem["@type"] === "Recipe") {
              console.log('✅ Found Schema.org Recipe in @graph');
              return graphItem as SchemaOrgRecipe;
            }
          }
        }
      }
    }

    console.log('ℹ️  No Schema.org Recipe markup found');
    return null;
  } catch (error) {
    console.error('⚠️  Schema.org parsing error:', error);
    return null;
  }
}

/**
 * Decode HTML entities (&#x5929; → 天, &quot; → ", etc.)
 */
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&#x([0-9A-Fa-f]+);/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'");
}

/**
 * Extract OpenGraph metadata
 */
function extractOpenGraph(html: string): {
  title?: string;
  description?: string;
  image?: string;
} {
  const result: { title?: string; description?: string; image?: string } = {};

  // Extract og:title
  const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  if (titleMatch) result.title = decodeHTMLEntities(titleMatch[1]);

  // Extract og:description
  const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
  if (descMatch) result.description = decodeHTMLEntities(descMatch[1]);

  // Extract og:image
  const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  if (imageMatch) result.image = imageMatch[1];

  return result;
}

/**
 * Extract YouTube description from HTML (alternative to API)
 * Fallback if Schema.org not found
 */
function extractYouTubeDescription(html: string): string {
  try {
    // YouTube embeds video data in ytInitialData
    const dataMatch = html.match(/var ytInitialData = ({.+?});/);
    if (dataMatch) {
      const data = JSON.parse(dataMatch[1]);

      // Navigate to description (path varies by YouTube UI version)
      const description =
        data?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[1]
          ?.videoSecondaryInfoRenderer?.attributedDescription?.content ||
        data?.engagementPanels?.[0]?.engagementPanelSectionListRenderer?.content
          ?.structuredDescriptionContentRenderer?.items?.[1]?.expandableVideoDescriptionBodyRenderer
          ?.attributedDescriptionBodyText?.content ||
        '';

      if (description) {
        console.log(`📝 Extracted YouTube description from HTML (${description.length} chars)`);
        return description;
      }
    }

    // Fallback: Look for meta description
    const metaMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
    if (metaMatch) {
      console.log(`📝 Extracted YouTube meta description (${metaMatch[1].length} chars)`);
      return metaMatch[1];
    }

    return '';
  } catch (error) {
    console.error('⚠️  YouTube HTML description extraction failed:', error);
    return '';
  }
}

/**
 * Clean Instagram title - extract recipe name from "Username on Instagram: Recipe..."
 */
function cleanInstagramTitle(title: string): string {
  // Pattern: "Username on Instagram: \"Recipe title...\""
  const match = title.match(/on Instagram:\s*["']?\s*(.+)/s);
  if (match) {
    let cleaned = match[1].trim();
    // Remove leading/trailing quotes
    cleaned = cleaned.replace(/^["']+|["']+$/g, '');

    // Skip if it's just punctuation or too short
    if (cleaned.length <= 2 || /^[.\s,!?]+$/.test(cleaned)) {
      // Try to extract from the next line
      const lines = cleaned.split('\n').filter(line => line.trim().length > 3);
      if (lines.length > 0) {
        cleaned = lines[0].trim();
      } else {
        return 'Instagram Recipe';
      }
    }

    // Truncate at newline if present (get first meaningful line)
    cleaned = cleaned.split('\n')[0];

    // Truncate if too long (keep first 60 chars)
    if (cleaned.length > 60) {
      cleaned = cleaned.substring(0, 60) + '...';
    }

    return cleaned || 'Instagram Recipe';
  }
  return title;
}

/**
 * Extract Instagram caption from HTML
 */
function extractInstagramCaption(html: string): string {
  try {
    // Instagram embeds data in window._sharedData
    const sharedDataMatch = html.match(/window\._sharedData = ({.+?});<\/script>/);
    if (sharedDataMatch) {
      const data = JSON.parse(sharedDataMatch[1]);

      // Navigate to caption (path may vary)
      const caption =
        data?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media?.edge_media_to_caption?.edges?.[0]
          ?.node?.text || '';

      if (caption) {
        console.log(`📝 Extracted Instagram caption from HTML (${caption.length} chars)`);
        return caption;
      }
    }

    // Fallback: OpenGraph description
    const ogDesc = extractOpenGraph(html).description || '';
    if (ogDesc) {
      console.log(`📝 Extracted Instagram OG description (${ogDesc.length} chars)`);
      return ogDesc;
    }

    return '';
  } catch (error) {
    console.error('⚠️  Instagram HTML caption extraction failed:', error);
    return '';
  }
}

/**
 * Extract TikTok description from HTML
 */
function extractTikTokDescription(html: string): string {
  try {
    // TikTok embeds data in __UNIVERSAL_DATA_FOR_REHYDRATION__
    const dataMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>({.+?})<\/script>/);
    if (dataMatch) {
      const data = JSON.parse(dataMatch[1]);

      // Navigate to description
      const description =
        data?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct?.desc || '';

      if (description) {
        console.log(`📝 Extracted TikTok description from HTML (${description.length} chars)`);
        return description;
      }
    }

    // Fallback: meta description
    const metaMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
    if (metaMatch) {
      console.log(`📝 Extracted TikTok meta description (${metaMatch[1].length} chars)`);
      return metaMatch[1];
    }

    return '';
  } catch (error) {
    console.error('⚠️  TikTok HTML description extraction failed:', error);
    return '';
  }
}

/**
 * Fetch HTML from URL with headers to avoid bot detection
 */
async function fetchHTML(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.text();
}

/**
 * Main extraction function - YouTube
 */
export async function extractFromYouTubeHTML(url: string): Promise<HTMLExtractionResult> {
  console.log('🔍 Fetching YouTube HTML...');

  try {
    const html = await fetchHTML(url);
    console.log(`✅ Fetched HTML (${html.length} bytes)`);

    const sources: string[] = [];
    let combinedText = '';
    const metadata: HTMLExtractionResult['metadata'] = {};

    // 1. Try Schema.org Recipe (best quality)
    const schema = extractSchemaOrg(html);
    if (schema) {
      sources.push('schema_org');

      // Extract metadata
      metadata.title = schema.name;
      metadata.description = schema.description;

      if (typeof schema.image === 'string') {
        metadata.image_url = schema.image;
      } else if (Array.isArray(schema.image) && schema.image.length > 0) {
        metadata.image_url = typeof schema.image[0] === 'string' ? schema.image[0] : schema.image[0].url;
      }

      if (schema.author) {
        metadata.creator = {
          name: schema.author.name,
        };
      }

      metadata.prep_time_minutes = parseDuration(schema.prepTime || '');
      metadata.cook_time_minutes = parseDuration(schema.cookTime || '');

      if (schema.recipeYield) {
        metadata.servings =
          typeof schema.recipeYield === 'number'
            ? schema.recipeYield
            : parseInt(schema.recipeYield.toString());
      }

      // Extract ingredients
      if (schema.recipeIngredient && Array.isArray(schema.recipeIngredient)) {
        metadata.ingredients = schema.recipeIngredient;
        combinedText += '=== Ingredients ===\n' + schema.recipeIngredient.join('\n') + '\n\n';
      }

      // Extract instructions
      if (schema.recipeInstructions) {
        if (typeof schema.recipeInstructions === 'string') {
          metadata.instructions = schema.recipeInstructions;
          combinedText += '=== Instructions ===\n' + schema.recipeInstructions + '\n\n';
        } else if (Array.isArray(schema.recipeInstructions)) {
          const steps = schema.recipeInstructions.map((step) =>
            typeof step === 'string' ? step : step.text
          );
          metadata.instructions = steps;
          combinedText += '=== Instructions ===\n' + steps.join('\n') + '\n\n';
        }
      }

      if (schema.description) {
        combinedText += '=== Description ===\n' + schema.description + '\n\n';
      }

      console.log(`✅ Schema.org extraction: ${metadata.ingredients?.length || 0} ingredients`);
    }

    // 2. Extract full description from HTML (richer than API sometimes)
    const htmlDescription = extractYouTubeDescription(html);
    if (htmlDescription && htmlDescription.length > 50) {
      sources.push('html_description');
      combinedText += '=== Video Description ===\n' + htmlDescription + '\n\n';
    }

    // 3. Fallback to OpenGraph
    const og = extractOpenGraph(html);
    if (og.description && og.description.length > 50 && !combinedText.includes(og.description)) {
      sources.push('opengraph');
      combinedText += '=== OpenGraph Description ===\n' + og.description + '\n\n';
    }

    // Populate missing metadata from OpenGraph
    if (!metadata.title && og.title) metadata.title = og.title;
    if (!metadata.description && og.description) metadata.description = og.description;
    if (!metadata.image_url && og.image) metadata.image_url = og.image;

    return {
      success: true,
      text: combinedText.trim(),
      sources,
      metadata,
    };
  } catch (error) {
    console.error('❌ YouTube HTML extraction failed:', error);
    return {
      success: false,
      text: '',
      sources: [],
      metadata: {},
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Main extraction function - Instagram
 */
export async function extractFromInstagramHTML(url: string): Promise<HTMLExtractionResult> {
  console.log('🔍 Fetching Instagram HTML...');

  try {
    const html = await fetchHTML(url);
    console.log(`✅ Fetched HTML (${html.length} bytes)`);

    const sources: string[] = [];
    let combinedText = '';
    const metadata: HTMLExtractionResult['metadata'] = {};

    // 1. Try Schema.org
    const schema = extractSchemaOrg(html);
    if (schema && schema.recipeIngredient) {
      sources.push('schema_org');
      // (Same logic as YouTube)
      if (schema.recipeIngredient) {
        metadata.ingredients = schema.recipeIngredient;
        combinedText += '=== Ingredients ===\n' + schema.recipeIngredient.join('\n') + '\n\n';
      }
    }

    // 2. Extract caption from embedded JSON
    const caption = extractInstagramCaption(html);
    if (caption && caption.length > 20) {
      sources.push('instagram_caption');
      combinedText += '=== Caption ===\n' + caption + '\n\n';
    }

    // 3. OpenGraph fallback
    const og = extractOpenGraph(html);
    if (og.description && !combinedText.includes(og.description)) {
      sources.push('opengraph');
      combinedText += '=== Description ===\n' + og.description + '\n\n';
    }

    // Clean Instagram title (remove "Username on Instagram:" prefix)
    metadata.title = og.title ? cleanInstagramTitle(og.title) : 'Instagram Recipe';
    metadata.description = og.description;
    metadata.image_url = og.image;

    return {
      success: true,
      text: combinedText.trim(),
      sources,
      metadata,
    };
  } catch (error) {
    console.error('❌ Instagram HTML extraction failed:', error);
    return {
      success: false,
      text: '',
      sources: [],
      metadata: {},
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Main extraction function - TikTok
 */
export async function extractFromTikTokHTML(url: string): Promise<HTMLExtractionResult> {
  console.log('🔍 Fetching TikTok HTML...');

  try {
    const html = await fetchHTML(url);
    console.log(`✅ Fetched HTML (${html.length} bytes)`);

    const sources: string[] = [];
    let combinedText = '';
    const metadata: HTMLExtractionResult['metadata'] = {};

    // 1. Extract from embedded JSON
    const description = extractTikTokDescription(html);
    if (description && description.length > 20) {
      sources.push('tiktok_embedded_json');
      combinedText += '=== Description ===\n' + description + '\n\n';
    }

    // 2. OpenGraph fallback
    const og = extractOpenGraph(html);
    if (og.description && !combinedText.includes(og.description)) {
      sources.push('opengraph');
      combinedText += '=== OpenGraph ===\n' + og.description + '\n\n';
    }

    metadata.title = og.title;
    metadata.description = og.description;
    metadata.image_url = og.image;

    return {
      success: true,
      text: combinedText.trim(),
      sources,
      metadata,
    };
  } catch (error) {
    console.error('❌ TikTok HTML extraction failed:', error);
    return {
      success: false,
      text: '',
      sources: [],
      metadata: {},
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Extract Xiaohongshu (RedNote) description from HTML
 */
function extractXiaoHongShuDescription(html: string): string {
  try {
    // Xiaohongshu embeds data in window.__INITIAL_STATE__
    // Use more robust extraction: find the assignment and extract until actual </script>
    const stateStart = html.indexOf('window.__INITIAL_STATE__');
    if (stateStart === -1) {
      console.warn('   ⚠️  window.__INITIAL_STATE__ not found in HTML');
      return '';
    }

    // Find the equals sign after __INITIAL_STATE__
    const equalsIndex = html.indexOf('=', stateStart);
    if (equalsIndex === -1) {
      console.warn('   ⚠️  No assignment found after __INITIAL_STATE__');
      return '';
    }

    // Find the closing </script> tag
    const scriptEndIndex = html.indexOf('</script>', equalsIndex);
    if (scriptEndIndex === -1) {
      console.warn('   ⚠️  No closing </script> tag found');
      return '';
    }

    // Extract the JSON string between = and </script>
    // Remove the equals sign and any leading whitespace
    let jsonStr = html.substring(equalsIndex + 1, scriptEndIndex).trim();

    // Remove trailing semicolon if present
    if (jsonStr.endsWith(';')) {
      jsonStr = jsonStr.slice(0, -1).trim();
    }

    // Replace JavaScript undefined with null for valid JSON
    jsonStr = jsonStr.replace(/:\s*undefined\b/g, ': null');

    // Additional safety: replace other JavaScript-specific values that aren't valid JSON
    jsonStr = jsonStr.replace(/:\s*NaN\b/g, ': null');
    jsonStr = jsonStr.replace(/:\s*Infinity\b/g, ': null');
    jsonStr = jsonStr.replace(/:\s*-Infinity\b/g, ': null');

    // Parse JSON
    let data;
    try {
      data = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('   ❌ JSON parse error:', parseError instanceof Error ? parseError.message : 'Unknown error');
      console.error('   First 500 chars of JSON string:', jsonStr.substring(0, 500));
      console.error('   Last 500 chars of JSON string:', jsonStr.substring(jsonStr.length - 500));
      return '';
    }

    // Navigate to note description (path may vary for images vs videos)
    const noteDetail = data?.note?.noteDetailMap;

    if (noteDetail) {
      // Get the first note (there's usually only one)
      const noteId = Object.keys(noteDetail)[0];
      const note = noteDetail[noteId]?.note;

      if (note) {
        const description = note.desc || note.title || '';

        if (description) {
          console.log(`📝 Extracted Xiaohongshu description from HTML (${description.length} chars)`);
          return description;
        }
      }
    }

    // Fallback: Try meta description
    const metaMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
    if (metaMatch) {
      console.log(`📝 Extracted Xiaohongshu meta description (${metaMatch[1].length} chars)`);
      return metaMatch[1];
    }

    return '';
  } catch (error) {
    console.error('⚠️  Xiaohongshu HTML description extraction failed:', error);
    return '';
  }
}

/**
 * Main extraction function - Xiaohongshu
 */
export async function extractFromXiaoHongShuHTML(url: string): Promise<HTMLExtractionResult> {
  console.log('🔍 Fetching Xiaohongshu HTML...');

  try {
    const html = await fetchHTML(url);
    console.log(`✅ Fetched HTML (${html.length} bytes)`);

    const sources: string[] = [];
    let combinedText = '';
    const metadata: HTMLExtractionResult['metadata'] = {};

    // Extract from embedded JSON
    const description = extractXiaoHongShuDescription(html);
    if (description && description.length > 20) {
      sources.push('xiaohongshu_embedded_json');
      combinedText += '=== Description ===\n' + description + '\n\n';
    }

    // OpenGraph fallback
    const og = extractOpenGraph(html);
    if (og.description && !combinedText.includes(og.description)) {
      sources.push('opengraph');
      combinedText += '=== OpenGraph ===\n' + og.description + '\n\n';
    }

    metadata.title = og.title || 'Xiaohongshu Recipe';
    metadata.description = description || og.description;
    metadata.image_url = og.image;

    return {
      success: true,
      text: combinedText.trim(),
      sources,
      metadata,
    };
  } catch (error) {
    console.error('❌ Xiaohongshu HTML extraction failed:', error);
    return {
      success: false,
      text: '',
      sources: [],
      metadata: {},
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Extract from generic web page (non-social-media)
 * Primary target: Recipe websites with schema.org markup
 */
async function extractFromGenericHTML(url: string): Promise<HTMLExtractionResult> {
  console.log('🌐 Fetching generic web page HTML...');

  try {
    const html = await fetchHTML(url);
    console.log(`✅ Fetched HTML (${html.length} bytes)`);

    const sources: string[] = [];
    let combinedText = '';
    const metadata: HTMLExtractionResult['metadata'] = {};

    // 1. Try Schema.org Recipe (primary method for recipe sites)
    const schema = extractSchemaOrg(html);
    if (schema) {
      sources.push('schema_org');

      // Extract all recipe metadata
      metadata.title = schema.name;
      metadata.description = schema.description;

      // Extract image URL
      if (typeof schema.image === 'string') {
        metadata.image_url = schema.image;
      } else if (Array.isArray(schema.image) && schema.image.length > 0) {
        metadata.image_url = typeof schema.image[0] === 'string' ? schema.image[0] : schema.image[0].url;
      }

      // Extract author/creator
      if (schema.author) {
        metadata.creator = {
          name: schema.author.name,
          handle: schema.author.url,
        };
      }

      // Extract recipe timings
      metadata.prep_time_minutes = parseDuration(schema.prepTime || '');
      metadata.cook_time_minutes = parseDuration(schema.cookTime || '');

      // Extract servings
      if (schema.recipeYield) {
        metadata.servings = typeof schema.recipeYield === 'number'
          ? schema.recipeYield
          : parseInt(schema.recipeYield.toString().match(/\d+/)?.[0] || '0');
      }

      // Extract ingredients (most important!)
      if (schema.recipeIngredient && Array.isArray(schema.recipeIngredient)) {
        metadata.ingredients = schema.recipeIngredient;
        combinedText += '=== Ingredients ===\n' + schema.recipeIngredient.join('\n') + '\n\n';
      }

      // Extract instructions
      if (schema.recipeInstructions) {
        if (typeof schema.recipeInstructions === 'string') {
          metadata.instructions = schema.recipeInstructions;
          combinedText += '=== Instructions ===\n' + schema.recipeInstructions + '\n\n';
        } else if (Array.isArray(schema.recipeInstructions)) {
          const steps = schema.recipeInstructions.map(step =>
            typeof step === 'string' ? step : (step.text || step.name || String(step))
          );
          metadata.instructions = steps;
          combinedText += '=== Instructions ===\n' + steps.join('\n') + '\n\n';
        }
      }

      if (schema.description) {
        combinedText += '=== Description ===\n' + schema.description + '\n\n';
      }

      console.log(`✅ Schema.org extraction: ${metadata.ingredients?.length || 0} ingredients, ${Array.isArray(metadata.instructions) ? metadata.instructions.length : 0} steps`);
    }

    // 2. Fallback to OpenGraph if schema.org failed
    if (!metadata.title || !metadata.ingredients) {
      const og = extractOpenGraph(html);

      if (!metadata.title && og.title) {
        metadata.title = og.title;
      }
      if (!metadata.description && og.description) {
        metadata.description = og.description;
        sources.push('opengraph');
      }
      if (!metadata.image_url && og.image) {
        metadata.image_url = og.image;
      }
    }

    return {
      success: true,
      text: combinedText.trim(),
      sources,
      metadata,
    };
  } catch (error) {
    console.error('❌ Generic HTML extraction failed:', error);
    return {
      success: false,
      text: '',
      sources: [],
      metadata: {},
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Platform-agnostic extraction
 * Automatically detects platform and uses appropriate scraper
 */
export async function extractFromHTML(
  url: string,
  platform: string
): Promise<HTMLExtractionResult> {
  console.log(`🌐 HTML extraction for platform: ${platform}`);

  switch (platform.toLowerCase()) {
    case 'youtube':
      return await extractFromYouTubeHTML(url);
    case 'instagram':
      return await extractFromInstagramHTML(url);
    case 'tiktok':
      return await extractFromTikTokHTML(url);
    case 'xiaohongshu':
      return await extractFromXiaoHongShuHTML(url);
    case 'web':           // NEW
    case 'traditional':   // NEW
    case 'unknown':       // NEW
      return await extractFromGenericHTML(url);
    default:
      console.warn(`⚠️  Unsupported platform: ${platform}, trying generic extraction...`);
      return await extractFromGenericHTML(url);  // Fallback to generic
  }
}
