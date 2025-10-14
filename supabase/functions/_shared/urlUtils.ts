/**
 * URL Utilities for Recipe URL Handling
 *
 * Purpose: Normalize and validate recipe URLs from social platforms
 * Used by: extract-cook-card Edge Function, React Native paste flow
 */

export async function normalizeRecipeURL(rawUrl: string, _visitedUrls: Set<string> = new Set()): Promise<string> {
  try {
    // 1. Decode URL encoding (Instagram often copies as encoded)
    let decoded = decodeURIComponent(rawUrl.trim());

    // 2. Upgrade HTTP to HTTPS (Xiaohongshu short links use http://)
    if (decoded.startsWith('http://')) {
      decoded = decoded.replace('http://', 'https://');
    }

    // 3. Parse URL
    const url = new URL(decoded);
    const normalizedUrl = url.toString();

    // Prevent infinite redirect loops
    if (_visitedUrls.has(normalizedUrl)) {
      console.warn(`⚠️  Redirect loop detected, stopping at: ${normalizedUrl.substring(0, 80)}...`);
      return normalizedUrl;
    }
    _visitedUrls.add(normalizedUrl);

    // 3. Check if this is a short URL that needs redirect resolution
    const shortUrlHosts = [
      'xhslink.com',      // Xiaohongshu short links
      'vm.tiktok.com',    // TikTok short links
      'vt.tiktok.com',    // TikTok short links
    ];

    if (shortUrlHosts.some(host => url.hostname.includes(host))) {
      console.log(`🔗 Resolving short URL: ${url.toString()}`);
      const resolvedUrl = await resolveRedirect(url.toString());
      if (resolvedUrl && resolvedUrl !== normalizedUrl) {
        console.log(`   ✅ Resolved to: ${resolvedUrl.substring(0, 80)}...`);
        return normalizeRecipeURL(resolvedUrl, _visitedUrls); // Recursively normalize the resolved URL
      } else {
        console.warn(`   ⚠️  Short URL did not redirect, using as-is`);
      }
    }

    // TikTok /t/ short URLs (e.g., tiktok.com/t/ABC123/)
    if (url.hostname.includes('tiktok.com') && url.pathname.startsWith('/t/')) {
      console.log(`🔗 Resolving TikTok short URL: ${url.toString()}`);
      const resolvedUrl = await resolveRedirect(url.toString());
      if (resolvedUrl && resolvedUrl !== normalizedUrl) {
        console.log(`   ✅ Resolved to: ${resolvedUrl.substring(0, 80)}...`);
        return normalizeRecipeURL(resolvedUrl, _visitedUrls);
      } else {
        console.warn(`   ⚠️  TikTok short URL did not redirect, using as-is`);
      }
    }

    // 4. Strip tracking parameters
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'igshid', 'igsh', // Instagram share ID
      'fbclid',        // Facebook click ID
      'gclid',         // Google click ID
      '_ga',           // Google Analytics
      'ref',           // Generic referrer
      'app_platform', 'app_version', 'share_from_user_hidden', 'xsec_source',
      'type', 'xsec_token', 'author_share', 'xhsshare', 'shareRedId',
      'apptime', 'share_id', // Xiaohongshu tracking
    ];
    trackingParams.forEach(param => url.searchParams.delete(param));

    // 5. Normalize mobile → desktop
    const mobileHosts: Record<string, string> = {
      'm.youtube.com': 'youtube.com',
      'm.tiktok.com': 'tiktok.com',
      'm.instagram.com': 'instagram.com',
    };
    if (url.hostname in mobileHosts) {
      url.hostname = mobileHosts[url.hostname];
    }

    // 6. Expand short URLs
    if (url.hostname === 'youtu.be') {
      // youtu.be/abc123 → youtube.com/watch?v=abc123
      const videoId = url.pathname.slice(1);
      return `https://youtube.com/watch?v=${videoId}`;
    }

    return url.toString();
  } catch (error) {
    // Invalid URL - return as-is, validation will catch it
    return rawUrl;
  }
}

/**
 * Resolve HTTP redirects for short URLs
 * @param url - Short URL to resolve
 * @returns Final URL after following redirects, or null if failed
 */
async function resolveRedirect(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    // Return the final URL after all redirects
    return response.url;
  } catch (error) {
    console.error(`   ❌ Failed to resolve redirect: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

export function detectPlatform(url: string): 'youtube' | 'instagram' | 'tiktok' | 'xiaohongshu' | 'facebook' | 'unknown' {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube';
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('tiktok.com')) return 'tiktok';
    if (host.includes('xiaohongshu.com') || host.includes('xhslink.com')) return 'xiaohongshu';
    if (host.includes('facebook.com') || host.includes('fb.com') || host.includes('fb.watch')) return 'facebook';

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function validateRecipeURL(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);

    // Must be https
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'URL must use HTTPS' };
    }

    // Must be from supported platform
    const platform = detectPlatform(url);
    if (platform === 'unknown') {
      return { valid: false, error: 'Unsupported platform. We support YouTube, Instagram, TikTok, Xiaohongshu, and Facebook.' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
