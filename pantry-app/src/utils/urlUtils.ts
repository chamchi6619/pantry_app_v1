/**
 * URL Utilities for Recipe URL Handling (React Native)
 *
 * Purpose: Normalize and validate recipe URLs from social platforms
 * Used by: PasteLinkScreen, ShareHandlerScreen
 *
 * Note: This is a mirror of supabase/functions/_shared/urlUtils.ts
 */

export function normalizeRecipeURL(rawUrl: string): string {
  try {
    // 1. Decode URL encoding (Instagram often copies as encoded)
    let decoded = decodeURIComponent(rawUrl.trim());

    // 2. Upgrade HTTP to HTTPS (Xiaohongshu short links use http://)
    if (decoded.startsWith('http://')) {
      decoded = decoded.replace('http://', 'https://');
    }

    // 3. Parse URL
    const url = new URL(decoded);

    // 3. Strip tracking parameters
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'igshid', 'igsh', // Instagram share ID
      'fbclid',        // Facebook click ID
      'gclid',         // Google click ID
      '_ga',           // Google Analytics
      'ref',           // Generic referrer
    ];
    trackingParams.forEach(param => url.searchParams.delete(param));

    // 4. Normalize mobile → desktop
    const mobileHosts: Record<string, string> = {
      'm.youtube.com': 'youtube.com',
      'm.tiktok.com': 'tiktok.com',
      'm.instagram.com': 'instagram.com',
    };
    if (url.hostname in mobileHosts) {
      url.hostname = mobileHosts[url.hostname];
    }

    // 5. Expand short URLs
    if (url.hostname === 'youtu.be') {
      // youtu.be/abc123 → youtube.com/watch?v=abc123
      const videoId = url.pathname.slice(1);
      return `https://youtube.com/watch?v=${videoId}`;
    }

    // TikTok short links (vm.tiktok.com, vt.tiktok.com)
    // Note: These redirect to full URLs, but we keep as-is for now
    // (Could add redirect resolution here, but adds latency)

    return url.toString();
  } catch (error) {
    // Invalid URL - return as-is, validation will catch it
    return rawUrl;
  }
}

export function detectPlatform(url: string): 'youtube' | 'instagram' | 'tiktok' | 'xiaohongshu' | 'unknown' {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube';
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('tiktok.com')) return 'tiktok';
    if (host.includes('xiaohongshu.com') || host.includes('xhslink.com')) return 'xiaohongshu';

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function validateRecipeURL(url: string): { isValid: boolean; error?: string; normalizedUrl?: string } {
  try {
    const normalized = normalizeRecipeURL(url);
    const parsed = new URL(normalized);

    // Must be https
    if (parsed.protocol !== 'https:') {
      return { isValid: false, error: 'URL must use HTTPS' };
    }

    // Must be from supported platform
    const platform = detectPlatform(normalized);
    if (platform === 'unknown') {
      return { isValid: false, error: "That doesn't look like a recipe link. Try Copy Link from the app and paste again." };
    }

    return { isValid: true, normalizedUrl: normalized };
  } catch {
    return { isValid: false, error: 'Invalid URL format' };
  }
}

export function isSupportedRecipeURL(url: string): boolean {
  return validateRecipeURL(url).isValid;
}

export function getPlatformFromURL(url: string): string {
  return detectPlatform(url);
}
