/**
 * YouTube Data API v3 Integration
 *
 * Purpose: Extract video metadata and captions using official YouTube API
 *
 * Why YouTube API instead of yt-dlp for YouTube?
 * - ✅ No bot detection issues
 * - ✅ Faster (500ms vs 2-4s)
 * - ✅ Stable (official Google API)
 * - ✅ FREE: 10,000 quota units/day
 *   - videos.list: 1 unit (metadata)
 *   - captions.download: 200 units (transcript)
 *   - ~50 full extractions/day or 10,000 metadata-only
 *
 * Quota usage:
 * - Metadata only: 1 unit per video
 * - Metadata + captions: 201 units per video
 *
 * API Documentation:
 * https://developers.google.com/youtube/v3/docs
 */

const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY') || Deno.env.get('GEMINI_API_KEY'); // Can use same key

/**
 * YouTube video metadata
 */
export interface YouTubeMetadata {
  title: string;
  description: string;
  thumbnail_url: string;
  duration_seconds: number;
  channel_name: string;
  channel_id: string;
  view_count?: number;
  published_at?: string;
  captions_available: boolean;
}

/**
 * Extract video ID from YouTube URL
 * Supports: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID
 */
export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // youtube.com/watch?v=VIDEO_ID
    if (hostname.includes('youtube.com')) {
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v');
      }
      // youtube.com/shorts/VIDEO_ID
      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.split('/')[2];
      }
      // youtube.com/embed/VIDEO_ID
      if (parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.split('/')[2];
      }
    }

    // youtu.be/VIDEO_ID
    if (hostname === 'youtu.be') {
      return parsed.pathname.slice(1); // Remove leading /
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse ISO 8601 duration to seconds
 * Format: PT1H2M10S = 1 hour, 2 minutes, 10 seconds
 */
function parseDuration(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Extract video metadata using YouTube Data API v3
 *
 * Cost: 1 quota unit per request (10,000/day free)
 *
 * @param videoId - YouTube video ID
 * @returns Video metadata or null if failed
 */
export async function getYouTubeMetadata(videoId: string): Promise<YouTubeMetadata | null> {
  if (!YOUTUBE_API_KEY) {
    console.error('❌ YouTube API key not configured');
    return null;
  }

  try {
    console.log(`📺 YouTube API: Fetching metadata for ${videoId}...`);

    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${YOUTUBE_API_KEY}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!response.ok) {
      console.error(`❌ YouTube API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      console.error(`❌ YouTube video not found: ${videoId}`);
      return null;
    }

    const video = data.items[0];
    const snippet = video.snippet;
    const contentDetails = video.contentDetails;
    const statistics = video.statistics;

    // Parse duration
    const durationSeconds = parseDuration(contentDetails.duration);

    // Get best thumbnail
    const thumbnails = snippet.thumbnails;
    const thumbnailUrl = thumbnails.maxres?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || '';

    const metadata: YouTubeMetadata = {
      title: snippet.title,
      description: snippet.description,
      thumbnail_url: thumbnailUrl,
      duration_seconds: durationSeconds,
      channel_name: snippet.channelTitle,
      channel_id: snippet.channelId,
      view_count: statistics.viewCount ? parseInt(statistics.viewCount, 10) : undefined,
      published_at: snippet.publishedAt,
      captions_available: contentDetails.caption === 'true',
    };

    console.log(`✅ YouTube API: "${metadata.title}" (${durationSeconds}s, ${metadata.description.length} chars)`);

    return metadata;

  } catch (err) {
    console.error(`❌ YouTube API error:`, err);
    return null;
  }
}

/**
 * Get available caption tracks for a video
 *
 * Cost: 1 quota unit per request
 *
 * @param videoId - YouTube video ID
 * @returns Array of caption track IDs, or empty array if none/error
 */
async function getCaptionTrackId(videoId: string): Promise<string | null> {
  if (!YOUTUBE_API_KEY) return null;

  try {
    const url = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${YOUTUBE_API_KEY}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return null;

    const data = await response.json();

    if (!data.items || data.items.length === 0) return null;

    // Prefer English captions
    const englishTrack = data.items.find((item: any) =>
      item.snippet.language === 'en' || item.snippet.language.startsWith('en')
    );

    if (englishTrack) return englishTrack.id;

    // Fallback to first available track
    return data.items[0].id;

  } catch {
    return null;
  }
}

/**
 * Download caption/transcript for a video
 *
 * Cost: 200 quota units per request (expensive!)
 *
 * Note: This requires OAuth2 authentication, which is complex.
 * For now, we'll use the timedtext scraping method instead.
 *
 * @param videoId - YouTube video ID
 * @returns Transcript text or null
 */
export async function getYouTubeCaptions(videoId: string): Promise<string | null> {
  try {
    console.log(`📝 YouTube: Fetching captions for ${videoId} (via timedtext)...`);

    // Use the timedtext API (unofficial but works without auth)
    // This is the same endpoint that YouTube uses internally
    const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`⚠️  YouTube captions not available for ${videoId}`);
      return null;
    }

    const data = await response.json();

    if (!data.events || data.events.length === 0) {
      return null;
    }

    // Extract text from events
    const transcript = data.events
      .filter((event: any) => event.segs) // Only events with text segments
      .map((event: any) =>
        event.segs.map((seg: any) => seg.utf8 || '').join('')
      )
      .join(' ')
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    if (transcript.length > 0) {
      console.log(`✅ YouTube: Fetched ${transcript.length} chars of captions`);
      return transcript;
    }

    return null;

  } catch (err) {
    console.error(`❌ YouTube captions error:`, err);
    return null;
  }
}

/**
 * Check if YouTube API is configured and accessible
 */
export async function checkYouTubeAPIAvailable(): Promise<boolean> {
  if (!YOUTUBE_API_KEY) {
    console.warn('⚠️  YouTube API key not configured');
    return false;
  }

  try {
    // Test with a known video (YouTube's own "How YouTube Works" video)
    const testVideoId = 'opaxq7sv4o8';
    const metadata = await getYouTubeMetadata(testVideoId);

    if (metadata) {
      console.log('✅ YouTube Data API available');
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
