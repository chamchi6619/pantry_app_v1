/**
 * Platform Video URL Scrapers
 *
 * Extracts direct video URLs from social media platforms for File API upload.
 *
 * Supported Platforms:
 * - Instagram (Reels, Posts)
 * - TikTok (Videos)
 * - Xiaohongshu/Little Red Book (Videos)
 * - Facebook (Videos)
 *
 * Note: Only works with PUBLIC posts. Private/login-required content will fail.
 */

interface VideoExtractionResult {
  videoUrl: string;
  platform: string;
  thumbnail?: string;
  duration?: number;
}

/**
 * Extracts video URL from Instagram post/reel
 *
 * @param postUrl - Instagram post URL (e.g., https://www.instagram.com/reel/ABC123/)
 * @returns Direct video URL
 */
export async function getInstagramVideoUrl(postUrl: string): Promise<string> {
  try {
    const response = await fetch(postUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Instagram post: ${response.status}`);
    }

    const html = await response.text();

    // Method 1: Try to find video URL in og:video meta tag
    const ogVideoMatch = html.match(/<meta property="og:video" content="(.*?)"/);
    if (ogVideoMatch) {
      return ogVideoMatch[1].replace(/&amp;/g, '&');
    }

    // Method 2: Look for video_url in embedded JSON
    const videoUrlMatch = html.match(/"video_url":"(.*?)"/);
    if (videoUrlMatch) {
      return videoUrlMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
    }

    // Method 3: Look in __additionalDataLoaded
    const additionalDataMatch = html.match(/window\.__additionalDataLoaded\([^)]+,({.*?})\);/s);
    if (additionalDataMatch) {
      try {
        const data = JSON.parse(additionalDataMatch[1]);
        const videoUrl = findVideoUrlInObject(data);
        if (videoUrl) return videoUrl;
      } catch {
        // Continue to next method
      }
    }

    throw new Error('No video found in Instagram post. Post may be private or not contain a video.');
  } catch (error) {
    throw new Error(`Instagram extraction failed: ${error.message}`);
  }
}

/**
 * Extracts video URL from TikTok post
 *
 * @param postUrl - TikTok video URL (e.g., https://www.tiktok.com/@user/video/123456)
 * @returns Direct video URL
 */
export async function getTikTokVideoUrl(postUrl: string): Promise<string> {
  try {
    // TikTok often redirects short URLs, follow redirects
    const response = await fetch(postUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch TikTok post: ${response.status}`);
    }

    const html = await response.text();

    // Method 1: Look for downloadAddr in page data
    const downloadAddrMatch = html.match(/"downloadAddr":"(.*?)"/);
    if (downloadAddrMatch) {
      return decodeUnicodeEscapes(downloadAddrMatch[1]);
    }

    // Method 2: Look in SIGI_STATE (TikTok's data store)
    const sigiStateMatch = html.match(/<script id="SIGI_STATE"[^>]*>(.*?)<\/script>/s);
    if (sigiStateMatch) {
      try {
        const data = JSON.parse(sigiStateMatch[1]);
        const videoUrl = findVideoUrlInObject(data);
        if (videoUrl) return videoUrl;
      } catch {
        // Continue to next method
      }
    }

    // Method 3: Look for og:video
    const ogVideoMatch = html.match(/<meta property="og:video" content="(.*?)"/);
    if (ogVideoMatch) {
      return ogVideoMatch[1].replace(/&amp;/g, '&');
    }

    throw new Error('No video found in TikTok post. Post may be private or region-locked.');
  } catch (error) {
    throw new Error(`TikTok extraction failed: ${error.message}`);
  }
}

/**
 * Extracts video URL from Xiaohongshu (Little Red Book) post
 *
 * @param postUrl - Xiaohongshu post URL (e.g., https://www.xiaohongshu.com/explore/123456)
 * @returns Direct video URL
 */
export async function getXiaohongshuVideoUrl(postUrl: string): Promise<string> {
  try {
    const response = await fetch(postUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.xiaohongshu.com/',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Xiaohongshu post: ${response.status}`);
    }

    const html = await response.text();

    // Method 1: Look for __INITIAL_STATE__ (primary data store)
    const initialStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?})<\/script>/s);
    if (initialStateMatch) {
      try {
        // Remove any trailing script tag content
        const jsonStr = initialStateMatch[1].replace(/<\/script>.*$/s, '');
        const data = JSON.parse(jsonStr);

        // Navigate to video URL: note.video.url or note.video.media.stream.h264[0].masterUrl
        const videoUrl = data?.note?.video?.url ||
                        data?.note?.video?.media?.stream?.h264?.[0]?.masterUrl ||
                        findVideoUrlInObject(data);

        if (videoUrl) return videoUrl;
      } catch (e) {
        console.error('Failed to parse Xiaohongshu __INITIAL_STATE__:', e);
      }
    }

    // Method 2: Look for og:video
    const ogVideoMatch = html.match(/<meta property="og:video" content="(.*?)"/);
    if (ogVideoMatch) {
      return ogVideoMatch[1].replace(/&amp;/g, '&');
    }

    // Method 3: Look for video tag with src
    const videoSrcMatch = html.match(/<video[^>]+src="(.*?)"/);
    if (videoSrcMatch) {
      return videoSrcMatch[1].replace(/&amp;/g, '&');
    }

    throw new Error('No video found in Xiaohongshu post. Post may require login or not contain a video.');
  } catch (error) {
    throw new Error(`Xiaohongshu extraction failed: ${error.message}`);
  }
}

/**
 * Extracts video URL from Facebook post
 *
 * @param postUrl - Facebook video URL
 * @returns Direct video URL
 */
export async function getFacebookVideoUrl(postUrl: string): Promise<string> {
  try {
    const response = await fetch(postUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Facebook post: ${response.status}`);
    }

    const html = await response.text();

    // Method 1: Look for og:video meta tag (HD quality)
    const ogVideoHdMatch = html.match(/<meta property="og:video" content="(.*?)"/);
    if (ogVideoHdMatch) {
      return ogVideoHdMatch[1].replace(/&amp;/g, '&');
    }

    // Method 2: Look for sd_src in embedded video data
    const sdSrcMatch = html.match(/"sd_src":"(.*?)"/);
    if (sdSrcMatch) {
      return sdSrcMatch[1].replace(/\\/g, '');
    }

    // Method 3: Look for hd_src in embedded video data
    const hdSrcMatch = html.match(/"hd_src":"(.*?)"/);
    if (hdSrcMatch) {
      return hdSrcMatch[1].replace(/\\/g, '');
    }

    throw new Error('No video found in Facebook post. Post may be private or not contain a video.');
  } catch (error) {
    throw new Error(`Facebook extraction failed: ${error.message}`);
  }
}

/**
 * Decodes Unicode escapes in strings (e.g., \\u002f → /, \\u0026 → &)
 */
function decodeUnicodeEscapes(str: string): string {
  return str.replace(/\\u([\da-fA-F]{4})/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
}

/**
 * Recursively searches for video URL in nested object
 * Looks for common video URL patterns
 */
function findVideoUrlInObject(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null;

  // Check if current object has video URL properties
  const urlKeys = ['video_url', 'videoUrl', 'downloadAddr', 'playAddr', 'url', 'src', 'masterUrl'];
  for (const key of urlKeys) {
    if (obj[key] && typeof obj[key] === 'string') {
      const decoded = decodeUnicodeEscapes(obj[key]);
      if (isVideoUrl(decoded)) {
        return decoded;
      }
    }
  }

  // Recursively search nested objects
  for (const value of Object.values(obj)) {
    if (typeof value === 'object') {
      const found = findVideoUrlInObject(value);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Checks if string looks like a video URL
 */
function isVideoUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;

  // Must start with http/https
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;

  // Common video file extensions or streaming patterns
  const videoPatterns = [
    /\.mp4/i,
    /\.m3u8/i,
    /\.webm/i,
    /\.mov/i,
    /video\//i,
    /\/v\d+\//i, // TikTok pattern
    /cdninstagram\.com/i,
    /fbcdn\.net/i,
    /tiktokcdn\.com/i,
  ];

  return videoPatterns.some(pattern => pattern.test(url));
}

/**
 * Generic video extraction router
 * Detects platform and routes to appropriate scraper
 *
 * @param url - Social media post URL
 * @param platform - Platform identifier (detected from URL if not provided)
 * @returns Direct video URL
 */
export async function extractVideoUrl(url: string, platform?: string): Promise<string> {
  // Auto-detect platform if not provided
  if (!platform) {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('instagram.com')) platform = 'instagram';
    else if (host.includes('tiktok.com')) platform = 'tiktok';
    else if (host.includes('xiaohongshu.com') || host.includes('xhslink.com')) platform = 'xiaohongshu';
    else if (host.includes('facebook.com') || host.includes('fb.com')) platform = 'facebook';
    else throw new Error(`Unsupported platform: ${host}`);
  }

  switch (platform) {
    case 'instagram':
      return await getInstagramVideoUrl(url);
    case 'tiktok':
      return await getTikTokVideoUrl(url);
    case 'xiaohongshu':
      return await getXiaohongshuVideoUrl(url);
    case 'facebook':
      return await getFacebookVideoUrl(url);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}
