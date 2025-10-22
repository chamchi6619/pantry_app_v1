/**
 * URL Utilities Unit Tests
 * Tests normalization, validation, and platform detection
 */

import {
  normalizeRecipeURL,
  validateRecipeURL,
  detectPlatform,
  isSupportedRecipeURL,
} from '../urlUtils';

describe('normalizeRecipeURL', () => {
  test('expands youtu.be short URLs to youtube.com/watch', () => {
    const input = 'https://youtu.be/dQw4w9WgXcQ';
    const expected = 'https://youtube.com/watch?v=dQw4w9WgXcQ';
    expect(normalizeRecipeURL(input)).toBe(expected);
  });

  test('converts m.youtube.com to youtube.com', () => {
    const input = 'https://m.youtube.com/watch?v=dQw4w9WgXcQ';
    const expected = 'https://youtube.com/watch?v=dQw4w9WgXcQ';
    expect(normalizeRecipeURL(input)).toBe(expected);
  });

  test('strips utm_* tracking parameters', () => {
    const input = 'https://youtube.com/watch?v=dQw4w9WgXcQ&utm_source=share&utm_campaign=test&utm_medium=web';
    const expected = 'https://youtube.com/watch?v=dQw4w9WgXcQ';
    expect(normalizeRecipeURL(input)).toBe(expected);
  });

  test('strips Instagram igshid tracking parameter', () => {
    const input = 'https://instagram.com/p/ABC123xyz/?igshid=MzRlODBiNWFlZA==';
    const expected = 'https://instagram.com/p/ABC123xyz/';
    expect(normalizeRecipeURL(input)).toBe(expected);
  });

  test('strips fbclid tracking parameter', () => {
    const input = 'https://youtube.com/watch?v=dQw4w9WgXcQ&fbclid=IwAR123abc';
    const expected = 'https://youtube.com/watch?v=dQw4w9WgXcQ';
    expect(normalizeRecipeURL(input)).toBe(expected);
  });

  test('decodes URL-encoded characters', () => {
    const input = 'https://instagram.com/p/ABC123xyz%2F%3Figshid%3Dtest';
    const normalized = normalizeRecipeURL(input);
    expect(normalized).not.toContain('%2F');
    expect(normalized).not.toContain('%3F');
  });

  test('handles multiple tracking params together', () => {
    const input = 'https://youtube.com/watch?v=dQw4w9WgXcQ&utm_source=twitter&fbclid=123&gclid=456&ref=share';
    const expected = 'https://youtube.com/watch?v=dQw4w9WgXcQ';
    expect(normalizeRecipeURL(input)).toBe(expected);
  });

  test('preserves valid query parameters (non-tracking)', () => {
    const input = 'https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s';
    const expected = 'https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s';
    expect(normalizeRecipeURL(input)).toBe(expected);
  });
});

describe('detectPlatform', () => {
  test('detects YouTube from youtube.com', () => {
    expect(detectPlatform('https://youtube.com/watch?v=abc')).toBe('youtube');
  });

  test('detects YouTube from youtu.be', () => {
    expect(detectPlatform('https://youtu.be/abc')).toBe('youtube');
  });

  test('detects YouTube from m.youtube.com', () => {
    expect(detectPlatform('https://m.youtube.com/watch?v=abc')).toBe('youtube');
  });

  test('detects Instagram from instagram.com', () => {
    expect(detectPlatform('https://instagram.com/p/ABC123/')).toBe('instagram');
  });

  test('detects Instagram from m.instagram.com', () => {
    expect(detectPlatform('https://m.instagram.com/p/ABC123/')).toBe('instagram');
  });

  test('detects TikTok from tiktok.com', () => {
    expect(detectPlatform('https://tiktok.com/@user/video/123')).toBe('tiktok');
  });

  test('detects TikTok from vm.tiktok.com (short URL)', () => {
    expect(detectPlatform('https://vm.tiktok.com/ZMhK8v9R2/')).toBe('tiktok');
  });

  test('returns unknown for unsupported platform', () => {
    expect(detectPlatform('https://example.com/recipe')).toBe('unknown');
  });

  test('returns unknown for invalid URL', () => {
    expect(detectPlatform('not-a-url')).toBe('unknown');
  });
});

describe('validateRecipeURL', () => {
  test('accepts valid YouTube URL', () => {
    const result = validateRecipeURL('https://youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.isValid).toBe(true);
    expect(result.normalizedUrl).toBe('https://youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.error).toBeUndefined();
  });

  test('accepts valid Instagram URL', () => {
    const result = validateRecipeURL('https://instagram.com/p/ABC123/');
    expect(result.isValid).toBe(true);
    expect(result.normalizedUrl).toBe('https://instagram.com/p/ABC123/');
  });

  test('accepts valid TikTok URL', () => {
    const result = validateRecipeURL('https://tiktok.com/@user/video/123');
    expect(result.isValid).toBe(true);
  });

  test('rejects HTTP URLs (not HTTPS)', () => {
    const result = validateRecipeURL('http://youtube.com/watch?v=abc');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('URL must use HTTPS');
  });

  test('rejects unsupported platforms', () => {
    const result = validateRecipeURL('https://example.com/recipe');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("doesn't look like a recipe link");
  });

  test('rejects invalid URL format', () => {
    const result = validateRecipeURL('not-a-valid-url');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Invalid URL format');
  });

  test('normalizes URL before validation', () => {
    const result = validateRecipeURL('https://youtu.be/dQw4w9WgXcQ?utm_source=test');
    expect(result.isValid).toBe(true);
    expect(result.normalizedUrl).toBe('https://youtube.com/watch?v=dQw4w9WgXcQ');
  });
});

describe('isSupportedRecipeURL', () => {
  test('returns true for YouTube URL', () => {
    expect(isSupportedRecipeURL('https://youtube.com/watch?v=abc')).toBe(true);
  });

  test('returns true for Instagram URL', () => {
    expect(isSupportedRecipeURL('https://instagram.com/p/ABC/')).toBe(true);
  });

  test('returns true for TikTok URL', () => {
    expect(isSupportedRecipeURL('https://tiktok.com/@user/video/123')).toBe(true);
  });

  test('returns false for unsupported URL', () => {
    expect(isSupportedRecipeURL('https://example.com/recipe')).toBe(false);
  });

  test('returns false for invalid URL', () => {
    expect(isSupportedRecipeURL('not-a-url')).toBe(false);
  });

  test('returns false for HTTP URL', () => {
    expect(isSupportedRecipeURL('http://youtube.com/watch?v=abc')).toBe(false);
  });
});
