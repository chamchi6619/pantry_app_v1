/**
 * YouTube Comment Harvester
 *
 * Purpose: Fetch comments from YouTube videos to find ingredient lists
 * in pinned comments or top-rated comments
 *
 * API: YouTube Data API v3 - commentThreads.list
 * Quota Cost: 1 unit per call (very cheap)
 * Daily Limit: 10,000 units/day (default quota)
 *
 * Use Case: When video description is sparse/empty, check comments for
 * ingredient lists posted by creator or community
 *
 * Success Rate: 15-25% of sparse videos have usable ingredient comments
 */

export interface YouTubeComment {
  id: string;
  text: string;
  textDisplay: string; // HTML formatted version
  author: string;
  authorChannelId: string;
  likeCount: number;
  publishedAt: string;
  isTopLevel: boolean; // True if top-level comment (not reply)
}

export interface CommentHarvestResult {
  success: boolean;
  comments: YouTubeComment[];
  totalResults: number;
  error?: string;
}

/**
 * Extract video ID from YouTube URL
 *
 * Handles:
 * - https://youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://youtube.com/shorts/VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID (mobile)
 * - https://youtube.com/embed/VIDEO_ID (embed)
 */
export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);

    // Standard watch URL: /watch?v=VIDEO_ID (desktop & mobile)
    if (parsed.pathname === '/watch' || parsed.pathname.startsWith('/watch')) {
      return parsed.searchParams.get('v');
    }

    // Short URL: youtu.be/VIDEO_ID
    if (parsed.hostname === 'youtu.be' || parsed.hostname === 'www.youtu.be') {
      return parsed.pathname.slice(1); // Remove leading slash
    }

    // Mobile: m.youtube.com/watch?v=VIDEO_ID
    if (parsed.hostname === 'm.youtube.com') {
      return parsed.searchParams.get('v');
    }

    // Embed: youtube.com/embed/VIDEO_ID
    if (parsed.pathname.startsWith('/embed/')) {
      return parsed.pathname.replace('/embed/', '');
    }

    // Shorts: /shorts/VIDEO_ID
    if (parsed.pathname.startsWith('/shorts/')) {
      return parsed.pathname.replace('/shorts/', '');
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch top comments from a YouTube video
 *
 * Strategy:
 * - Fetch top 50 comments ordered by relevance
 * - Prioritize pinned comments and highly-liked comments
 * - Filter to top-level comments only (ignore replies)
 *
 * @param videoId - YouTube video ID
 * @param maxResults - Max number of comments to fetch (default: 50, max: 100)
 * @returns Comment harvest result
 */
export async function fetchYouTubeComments(
  videoId: string,
  maxResults: number = 50
): Promise<CommentHarvestResult> {
  try {
    const apiKey = Deno.env.get('YOUTUBE_API_KEY');
    if (!apiKey) {
      console.error('❌ YOUTUBE_API_KEY not configured');
      return {
        success: false,
        comments: [],
        totalResults: 0,
        error: 'YOUTUBE_API_KEY not configured',
      };
    }

    // Build API request
    const apiUrl = new URL('https://www.googleapis.com/youtube/v3/commentThreads');
    apiUrl.searchParams.append('part', 'snippet');
    apiUrl.searchParams.append('videoId', videoId);
    apiUrl.searchParams.append('maxResults', Math.min(maxResults, 100).toString());
    apiUrl.searchParams.append('order', 'relevance'); // Most relevant first
    apiUrl.searchParams.append('textFormat', 'plainText'); // Plain text (not HTML)
    apiUrl.searchParams.append('key', apiKey);

    console.log(`🔍 Fetching comments for video: ${videoId}`);

    const response = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ YouTube API error: ${response.status} ${response.statusText}`);
      console.error(`Error details: ${errorText}`);

      return {
        success: false,
        comments: [],
        totalResults: 0,
        error: `YouTube API error: ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();

    // Parse comments from response
    const comments: YouTubeComment[] = [];

    if (data.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        const snippet = item.snippet?.topLevelComment?.snippet;
        if (!snippet) continue;

        comments.push({
          id: item.id,
          text: snippet.textOriginal || snippet.textDisplay,
          textDisplay: snippet.textDisplay,
          author: snippet.authorDisplayName,
          authorChannelId: snippet.authorChannelId?.value || '',
          likeCount: snippet.likeCount || 0,
          publishedAt: snippet.publishedAt,
          isTopLevel: true,
        });
      }
    }

    console.log(`✅ Fetched ${comments.length} comments from video ${videoId}`);

    return {
      success: true,
      comments,
      totalResults: data.pageInfo?.totalResults || comments.length,
    };
  } catch (err) {
    console.error('❌ Comment fetch error:', err);
    return {
      success: false,
      comments: [],
      totalResults: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Fetch comments from YouTube video URL
 *
 * Convenience wrapper that extracts video ID and fetches comments
 *
 * @param url - YouTube video URL
 * @param maxResults - Max comments to fetch
 * @returns Comment harvest result
 */
export async function fetchCommentsFromURL(
  url: string,
  maxResults: number = 50
): Promise<CommentHarvestResult> {
  const videoId = extractYouTubeVideoId(url);

  if (!videoId) {
    console.error('❌ Could not extract video ID from URL:', url);
    return {
      success: false,
      comments: [],
      totalResults: 0,
      error: 'Invalid YouTube URL - could not extract video ID',
    };
  }

  return fetchYouTubeComments(videoId, maxResults);
}

/**
 * Check if video has comments enabled
 *
 * Some videos have comments disabled - this checks before attempting to fetch
 *
 * @param videoId - YouTube video ID
 * @returns True if comments are enabled
 */
export async function areCommentsEnabled(videoId: string): Promise<boolean> {
  try {
    const apiKey = Deno.env.get('YOUTUBE_API_KEY');
    if (!apiKey) return false;

    // Use videos.list to check comment status
    const apiUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    apiUrl.searchParams.append('part', 'status');
    apiUrl.searchParams.append('id', videoId);
    apiUrl.searchParams.append('key', apiKey);

    const response = await fetch(apiUrl.toString());
    if (!response.ok) return false;

    const data = await response.json();
    const status = data.items?.[0]?.status;

    // If publicStatsViewable is false, comments might be disabled
    return status?.publicStatsViewable !== false;
  } catch {
    // If check fails, assume comments are enabled (we'll get error when fetching)
    return true;
  }
}

/**
 * Get comment count for a video (optional - costs 1 quota unit)
 *
 * @param videoId - YouTube video ID
 * @returns Number of comments or null if unavailable
 */
export async function getCommentCount(videoId: string): Promise<number | null> {
  try {
    const apiKey = Deno.env.get('YOUTUBE_API_KEY');
    if (!apiKey) return null;

    const apiUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    apiUrl.searchParams.append('part', 'statistics');
    apiUrl.searchParams.append('id', videoId);
    apiUrl.searchParams.append('key', apiKey);

    const response = await fetch(apiUrl.toString());
    if (!response.ok) return null;

    const data = await response.json();
    const stats = data.items?.[0]?.statistics;

    return stats?.commentCount ? parseInt(stats.commentCount, 10) : null;
  } catch {
    return null;
  }
}

/**
 * Filter comments to likely ingredient lists
 *
 * Quick pre-filter before running expensive scoring
 *
 * @param comments - Array of comments
 * @returns Filtered comments that might contain ingredients
 */
export function filterToIngredientCandidates(comments: YouTubeComment[]): YouTubeComment[] {
  // SIMPLIFIED: Find first comment that's an ACTUAL ingredient list
  // YouTube creators pin recipe comments to top, so check first 5

  for (let i = 0; i < Math.min(comments.length, 5); i++) {
    const comment = comments[i];
    const text = comment.text;
    const length = text.length;

    // Must be non-trivial
    if (length < 100) {
      console.log(`   ⏭️  Skipping comment ${i}: too short (${length} chars)`);
      continue;
    }

    // HARD REJECT: Questions/requests (not providing recipe)
    const isQuestion = /\?|does anyone|can someone|anyone have|please share|need the recipe|looking for|where can|how do|recipe\?/i.test(text);
    if (isQuestion) {
      console.log(`   ⏭️  Skipping comment ${i}: appears to be question/request`);
      continue;
    }

    // HARD REJECT: Pure praise (no recipe content)
    const isPurePraise = /(amazing|delicious|yum|love this|great recipe|best ever).{0,50}$/i.test(text) && length < 200;
    if (isPurePraise) {
      console.log(`   ⏭️  Skipping comment ${i}: appears to be pure praise`);
      continue;
    }

    // HARD REJECT: Promotional spam
    const isPromo = /buy my|my channel|subscribe|follow me|link in bio|check out my channel/i.test(text);
    if (isPromo) {
      console.log(`   ⏭️  Skipping comment ${i}: appears to be promotional`);
      continue;
    }

    // STRONG SIGNALS for actual ingredient list:
    const hasIngredientHeader = /\ningredients?:/i.test(text) || /^ingredients?:/i.test(text);
    const quantityMatches = text.match(/\d+\s*(cup|tbsp|tsp|oz|lb|g|ml|clove|gr|pcs|piece|stalk|teaspoon|tablespoon|kg)/gi) || [];
    const hasHighQuantityDensity = quantityMatches.length >= 5;

    // List structure: lines starting with bullets or numbers
    const lines = text.split('\n');
    const bulletLines = lines.filter(l => /^[\s]*[-•▢▣□☐\*]/.test(l) || /^[\s]*\d+[\.\)]/.test(l));
    const hasStrongListStructure = bulletLines.length >= 5;

    // ACCEPT if strong signals present
    if (hasIngredientHeader) {
      console.log(`   ✅ Using comment ${i}: Has "Ingredients:" header (${length} chars, ${quantityMatches.length} quantities)`);
      return [comment];
    }

    if (hasStrongListStructure && hasHighQuantityDensity) {
      console.log(`   ✅ Using comment ${i}: Strong list structure (${bulletLines.length} bullets, ${quantityMatches.length} quantities)`);
      return [comment];
    }

    console.log(`   ⏭️  Skipping comment ${i}: No strong signals (${bulletLines.length} bullets, ${quantityMatches.length} quantities)`);
  }

  console.log(`   ❌ No suitable comments found in first 5`);
  return [];
}

/**
 * Extract just the ingredients section from comment/description text
 *
 * Reduces token usage by removing instructions, notes, stories
 *
 * @param text - Full comment/description text
 * @returns Ingredients-only text (much shorter)
 */
export function extractIngredientsSection(text: string): string {
  const lines = text.split('\n');

  // Strategy 1: If "Ingredients:" header exists, extract that section
  const ingredientsHeaderIndex = lines.findIndex(l => /^[\s]*ingredients?:/i.test(l));

  if (ingredientsHeaderIndex !== -1) {
    // Find where ingredients section ends (next major header or empty lines)
    const sectionEndPatterns = [
      /^[\s]*(instructions?|directions?|method|steps?|preparation|to make|how to):/i,
      /^[\s]*[A-Z][A-Z\s]{10,}$/,  // ALL CAPS headers like "INSTRUCTIONS"
    ];

    let endIndex = lines.length;
    for (let i = ingredientsHeaderIndex + 1; i < lines.length; i++) {
      const line = lines[i];

      // Stop at next major section
      if (sectionEndPatterns.some(pattern => pattern.test(line))) {
        endIndex = i;
        break;
      }

      // Stop after 2 consecutive empty lines (end of section)
      if (i > ingredientsHeaderIndex + 2 &&
          lines[i].trim() === '' &&
          lines[i-1].trim() === '') {
        endIndex = i - 1;
        break;
      }
    }

    const ingredientsSection = lines.slice(ingredientsHeaderIndex, endIndex).join('\n');
    console.log(`   📉 Token reduction: ${text.length} → ${ingredientsSection.length} chars (${Math.round(100 - (ingredientsSection.length / text.length * 100))}% reduction)`);
    return ingredientsSection;
  }

  // Strategy 2: Extract lines that look like ingredients (bullets + quantities)
  const ingredientLines = lines.filter(line => {
    const hasBullet = /^[\s]*[-•▢▣□☐\*]/.test(line) || /^[\s]*\d+[\.\)]/.test(line);
    const hasQuantity = /\d+\s*(cup|tbsp|tsp|oz|lb|g|ml|clove|gr|pcs|piece|stalk|kg)/i.test(line);
    return hasBullet || hasQuantity;
  });

  if (ingredientLines.length >= 5) {
    const extracted = ingredientLines.join('\n');
    console.log(`   📉 Token reduction: ${text.length} → ${extracted.length} chars (${Math.round(100 - (extracted.length / text.length * 100))}% reduction)`);
    return extracted;
  }

  // Strategy 3: No clear structure - send first 2000 chars max
  const truncated = text.substring(0, 2000);
  if (truncated.length < text.length) {
    console.log(`   📉 Token reduction: ${text.length} → ${truncated.length} chars (truncated)`);
  }
  return truncated;
}

/**
 * Extract instructions section from comment/description text
 *
 * @param text - Full comment/description text
 * @returns Instructions as array of steps
 */
export function extractInstructionsSection(text: string): string[] {
  const lines = text.split('\n');

  // Find instructions header
  const instructionsHeaderPatterns = [
    /^[\s]*(instructions?|directions?|method|steps?|preparation|how to make|to make):/i,
    /^[\s]*(to make|how to make)[\s\w]*:/i, // Match "TO MAKE THE X:" patterns
    /^[\s]*INSTRUCTIONS?$/i,
    /^[\s]*DIRECTIONS?$/i,
    /^[\s]*METHOD$/i,
  ];

  const headerIndex = lines.findIndex(l =>
    instructionsHeaderPatterns.some(pattern => pattern.test(l))
  );

  if (headerIndex === -1) {
    // No clear instructions section found
    return [];
  }

  // Extract from header until end or next major section
  const endPatterns = [
    /^[\s]*(notes?|tips?|storage|nutrition|substitutions?):/i,
  ];

  let endIndex = lines.length;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    if (endPatterns.some(pattern => pattern.test(lines[i]))) {
      endIndex = i;
      break;
    }
  }

  const instructionLines = lines.slice(headerIndex + 1, endIndex);

  // Parse into steps
  const steps: string[] = [];
  let currentStep = '';

  for (const line of instructionLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this is a numbered step (1., 2., 1), 2), etc.)
    const isNumberedStep = /^[\s]*\d+[\.\)]/.test(line);

    if (isNumberedStep) {
      // Save previous step
      if (currentStep) {
        steps.push(currentStep.trim());
      }
      // Start new step (remove number prefix)
      currentStep = trimmed.replace(/^[\s]*\d+[\.\)]\s*/, '');
    } else {
      // Continue current step
      if (currentStep) {
        currentStep += ' ' + trimmed;
      } else {
        currentStep = trimmed;
      }
    }
  }

  // Save last step
  if (currentStep) {
    steps.push(currentStep.trim());
  }

  return steps.filter(s => s.length > 10); // Filter out empty/short lines
}
