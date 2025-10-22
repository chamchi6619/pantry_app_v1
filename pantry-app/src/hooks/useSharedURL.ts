/**
 * useSharedURL Hook
 *
 * Purpose: Handle incoming URLs from:
 * - iOS Share Extension
 * - Android Share Intent
 * - Deep links from social media apps
 *
 * PRD Reference: COOKCARD_PRD_V1.md Task 2.1, 2.2
 */

import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

interface SharedURLData {
  url: string | null;
  isLoading: boolean;
  error: string | null;
}

export const useSharedURL = () => {
  const [sharedData, setSharedData] = useState<SharedURLData>({
    url: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    // Handle initial URL (when app is opened from share)
    const handleInitialURL = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();

        if (initialUrl) {
          const extractedUrl = extractRecipeURL(initialUrl);
          setSharedData({
            url: extractedUrl,
            isLoading: false,
            error: null,
          });
        } else {
          setSharedData({
            url: null,
            isLoading: false,
            error: null,
          });
        }
      } catch (err) {
        console.error('Error handling initial URL:', err);
        setSharedData({
          url: null,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    };

    // Handle URL changes (when app is already open and receives a share)
    const subscription = Linking.addEventListener('url', (event) => {
      const extractedUrl = extractRecipeURL(event.url);
      setSharedData({
        url: extractedUrl,
        isLoading: false,
        error: null,
      });
    });

    handleInitialURL();

    return () => {
      subscription.remove();
    };
  }, []);

  /**
   * Clear the shared URL after processing
   */
  const clearSharedURL = () => {
    setSharedData({
      url: null,
      isLoading: false,
      error: null,
    });
  };

  return {
    sharedURL: sharedData.url,
    isLoading: sharedData.isLoading,
    error: sharedData.error,
    clearSharedURL,
  };
};

/**
 * Extract recipe URL from various share formats
 */
function extractRecipeURL(rawUrl: string): string | null {
  try {
    // Handle custom URL schemes (pantryapp://share?url=...)
    if (rawUrl.startsWith('pantryapp://')) {
      const parsed = Linking.parse(rawUrl);
      const sharedUrl = parsed.queryParams?.url;
      if (typeof sharedUrl === 'string') {
        return decodeURIComponent(sharedUrl);
      }
    }

    // Handle direct social media URLs
    if (
      rawUrl.includes('instagram.com') ||
      rawUrl.includes('tiktok.com') ||
      rawUrl.includes('youtube.com') ||
      rawUrl.includes('youtu.be') ||
      rawUrl.includes('xiaohongshu.com') ||
      rawUrl.includes('xhslink.com')
    ) {
      return rawUrl;
    }

    // Handle Android share intent (text/plain with URL in body)
    // This comes through as the raw URL
    const urlPattern = /(https?:\/\/[^\s]+)/;
    const match = rawUrl.match(urlPattern);
    if (match) {
      return match[1];
    }

    console.warn('Could not extract URL from:', rawUrl);
    return null;
  } catch (err) {
    console.error('Error extracting URL:', err);
    return null;
  }
}

/**
 * Validate that URL is from a supported platform
 */
export function isSupportedRecipeURL(url: string): boolean {
  const supportedDomains = [
    'instagram.com',
    'www.instagram.com',
    'tiktok.com',
    'www.tiktok.com',
    'vm.tiktok.com',
    'vt.tiktok.com',
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
    'xiaohongshu.com',
    'www.xiaohongshu.com',
    'xhslink.com',
  ];

  try {
    const urlObj = new URL(url);
    return supportedDomains.includes(urlObj.hostname);
  } catch {
    return false;
  }
}

/**
 * Get platform name from URL
 */
export function getPlatformFromURL(url: string): 'instagram' | 'tiktok' | 'youtube' | 'xiaohongshu' | 'web' {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    if (hostname.includes('instagram')) return 'instagram';
    if (hostname.includes('tiktok')) return 'tiktok';
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) return 'youtube';
    if (hostname.includes('xiaohongshu') || hostname.includes('xhslink')) return 'xiaohongshu';
    return 'web';
  } catch {
    return 'web';
  }
}
