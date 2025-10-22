/**
 * Deep Link Service
 *
 * Handles opening native platform apps for recipe browsing
 * Supports: TikTok, Instagram, Xiaohongshu
 */

import { Linking, Platform as RNPlatform, Alert } from 'react-native';

export type SupportedPlatform = 'tiktok' | 'instagram' | 'xiaohongshu' | 'youtube';

interface DeepLinkConfig {
  appScheme: string;
  fallbackUrl: string;
  searchPath?: string;
  browsePath?: string;
}

const DEEP_LINK_CONFIGS: Record<SupportedPlatform, DeepLinkConfig> = {
  tiktok: {
    appScheme: 'tiktok://',
    fallbackUrl: 'https://www.tiktok.com',
    browsePath: 'tiktok://search?q=recipe',
    searchPath: 'tiktok://search?q=',
  },
  instagram: {
    appScheme: 'instagram://',
    fallbackUrl: 'https://www.instagram.com',
    browsePath: 'instagram://search?q=recipe',
    searchPath: 'instagram://search?q=',
  },
  xiaohongshu: {
    appScheme: 'xhslink://',
    fallbackUrl: 'https://www.xiaohongshu.com',
    browsePath: 'xhsdiscover://search?q=recipe',
    searchPath: 'xhsdiscover://search?q=',
  },
  youtube: {
    appScheme: 'youtube://',
    fallbackUrl: 'https://www.youtube.com',
    browsePath: 'youtube://results?search_query=recipe',
    searchPath: 'youtube://results?search_query=',
  },
};

/**
 * Opens a platform app for browsing recipes
 * Falls back to web browser if app is not installed
 */
export async function openPlatformApp(
  platform: SupportedPlatform,
  searchQuery?: string
): Promise<{ success: boolean; method: 'app' | 'browser' | 'none' }> {
  const config = DEEP_LINK_CONFIGS[platform];

  if (!config) {
    console.error(`Unknown platform: ${platform}`);
    return { success: false, method: 'none' };
  }

  // Determine URL to open
  let url = config.browsePath || config.appScheme;

  if (searchQuery && config.searchPath) {
    const encodedQuery = encodeURIComponent(searchQuery);
    url = config.searchPath + encodedQuery;
  }

  try {
    // Check if app is installed
    const canOpenApp = await Linking.canOpenURL(url);

    if (canOpenApp) {
      await Linking.openURL(url);
      console.log(`✅ Opened ${platform} app via deep-link: ${url}`);
      return { success: true, method: 'app' };
    } else {
      // Fallback to browser
      console.log(`⚠️ ${platform} app not installed, opening browser`);
      await Linking.openURL(config.fallbackUrl);
      return { success: true, method: 'browser' };
    }
  } catch (error) {
    console.error(`Failed to open ${platform}:`, error);

    // Last resort: try fallback URL
    try {
      await Linking.openURL(config.fallbackUrl);
      return { success: true, method: 'browser' };
    } catch (fallbackError) {
      console.error(`Fallback also failed:`, fallbackError);
      return { success: false, method: 'none' };
    }
  }
}

/**
 * Gets friendly platform name for UI display
 */
export function getPlatformDisplayName(platform: SupportedPlatform): string {
  const names: Record<SupportedPlatform, string> = {
    tiktok: 'TikTok',
    instagram: 'Instagram',
    xiaohongshu: 'Xiaohongshu (小红书)',
    youtube: 'YouTube',
  };
  return names[platform] || platform;
}

/**
 * Gets platform icon/emoji for UI display
 */
export function getPlatformIcon(platform: SupportedPlatform): string {
  const icons: Record<SupportedPlatform, string> = {
    tiktok: '🎵',
    instagram: '📷',
    xiaohongshu: '📕',
    youtube: '▶️',
  };
  return icons[platform] || '📱';
}

/**
 * Shows user instructions for sharing a recipe back
 */
export function showShareInstructions(platform: SupportedPlatform): void {
  const platformName = getPlatformDisplayName(platform);

  const instructions = {
    tiktok: `In TikTok:\n1. Find a recipe video you like\n2. Tap the Share button\n3. Select "Pantry App" from the share menu`,
    instagram: `In Instagram:\n1. Find a recipe Reel you like\n2. Tap the Share button (paper airplane)\n3. Select "Pantry App" from the share menu`,
    xiaohongshu: `在小红书中:\n1. 找到你喜欢的食谱视频\n2. 点击分享按钮\n3. 选择"Pantry App"`,
    youtube: `In YouTube:\n1. Find a recipe video you like\n2. Tap Share\n3. Select "Pantry App" from the share menu`,
  };

  Alert.alert(
    `Share from ${platformName}`,
    instructions[platform],
    [{ text: 'Got it!', style: 'default' }]
  );
}

/**
 * Checks if sharing is supported on this device
 */
export async function isSharingSupported(): Promise<boolean> {
  // Sharing is supported on all iOS and Android devices
  // Just need to verify Linking is available
  try {
    await Linking.canOpenURL('https://');
    return true;
  } catch {
    return false;
  }
}

/**
 * Platform-specific URL validation
 * Returns true if URL is from the expected platform
 */
export function validatePlatformUrl(url: string, expectedPlatform: SupportedPlatform): boolean {
  const platformPatterns: Record<SupportedPlatform, RegExp[]> = {
    tiktok: [
      /tiktok\.com\/@[\w.-]+\/video\/\d+/,
      /vm\.tiktok\.com\/[\w-]+/,
      /vt\.tiktok\.com\/[\w-]+/,
    ],
    instagram: [
      /instagram\.com\/reel\/[\w-]+/,
      /instagram\.com\/p\/[\w-]+/,
      /instagram\.com\/tv\/[\w-]+/,
    ],
    xiaohongshu: [
      /xiaohongshu\.com\/discovery\/item\/[\w-]+/,
      /xhslink\.com\/[\w-]+/,
      /xiaohongshu\.com\/explore\/[\w-]+/,
    ],
    youtube: [
      /youtube\.com\/watch\?v=[\w-]+/,
      /youtu\.be\/[\w-]+/,
      /youtube\.com\/shorts\/[\w-]+/,
    ],
  };

  const patterns = platformPatterns[expectedPlatform];
  return patterns.some(pattern => pattern.test(url));
}
