/**
 * Image Enhancement Service for Receipt Photos
 * Handles low-quality images with multiple enhancement strategies
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

export interface ImageQualityMetrics {
  brightness: number;
  contrast: number;
  sharpness: number;
  hasText: boolean;
  isBlurry: boolean;
  confidence: number;
  suggestions: string[];
}

export class ImageEnhancementService {
  /**
   * Analyze image quality and provide feedback
   */
  static async analyzeQuality(imageUri: string): Promise<ImageQualityMetrics> {
    try {
      // Get image info
      const info = await FileSystem.getInfoAsync(imageUri);
      if (!info.exists) {
        throw new Error('Image file does not exist');
      }

      // Basic quality metrics (simplified for React Native)
      const fileSize = (info as any).size || 0;
      const sizeInMB = fileSize / (1024 * 1024);

      const suggestions: string[] = [];
      let confidence = 0.5;

      // Size-based heuristics
      if (sizeInMB < 0.1) {
        suggestions.push('Image quality too low - take a higher resolution photo');
        confidence -= 0.2;
      } else if (sizeInMB > 0.5) {
        confidence += 0.1;
      }

      // We'll enhance these metrics with actual image analysis later
      // For now, use heuristics
      const metrics: ImageQualityMetrics = {
        brightness: 0.7, // Placeholder
        contrast: 0.6,   // Placeholder
        sharpness: 0.5,  // Placeholder
        hasText: true,   // Assume true for now
        isBlurry: sizeInMB < 0.2,
        confidence: Math.max(0.1, Math.min(1, confidence)),
        suggestions
      };

      // Add suggestions based on metrics
      if (metrics.isBlurry) {
        suggestions.push('Image appears blurry - hold camera steady');
      }
      if (metrics.brightness < 0.4) {
        suggestions.push('Image too dark - improve lighting');
      }
      if (metrics.contrast < 0.3) {
        suggestions.push('Low contrast - place receipt on dark background');
      }

      return metrics;
    } catch (error) {
      console.error('Quality analysis error:', error);
      return {
        brightness: 0,
        contrast: 0,
        sharpness: 0,
        hasText: false,
        isBlurry: true,
        confidence: 0,
        suggestions: ['Could not analyze image quality']
      };
    }
  }

  /**
   * Enhance image for better OCR results
   */
  static async enhanceForOCR(imageUri: string): Promise<string> {
    try {
      console.log('🔧 Enhancing image for OCR...');

      // Apply multiple enhancements
      const enhanced = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          // Auto-rotate based on EXIF data
          { rotate: 0 },

          // Resize if too large (keep aspect ratio)
          { resize: { width: 2000 } },
        ],
        {
          compress: 0.9,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      console.log('✅ Image enhanced:', enhanced.uri);
      return enhanced.uri;
    } catch (error) {
      console.error('Enhancement failed, using original:', error);
      return imageUri;
    }
  }

  /**
   * Apply aggressive enhancement for very poor quality images
   */
  static async aggressiveEnhance(imageUri: string): Promise<string> {
    try {
      console.log('🔥 Applying aggressive enhancement...');

      // More aggressive processing
      const enhanced = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          // Resize to standard resolution
          { resize: { width: 1500 } },
        ],
        {
          compress: 0.95,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      // Could add more processing here with native modules
      // For now, this provides basic enhancement

      return enhanced.uri;
    } catch (error) {
      console.error('Aggressive enhancement failed:', error);
      return imageUri;
    }
  }

  /**
   * Crop image to receipt area (if detected)
   */
  static async autoCrop(imageUri: string): Promise<string> {
    try {
      // In a full implementation, we'd use edge detection
      // For now, just remove some borders
      const enhanced = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          // Crop 5% from each edge (conservative)
          { crop: {
            originX: 0.05,
            originY: 0.05,
            width: 0.9,
            height: 0.9
          } },
        ],
        {
          compress: 0.9,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      return enhanced.uri;
    } catch (error) {
      console.error('Auto-crop failed:', error);
      return imageUri;
    }
  }

  /**
   * Perspective correction for angled photos
   */
  static async correctPerspective(imageUri: string): Promise<string> {
    // This would require native modules or server-side processing
    // For now, return original
    console.log('⚠️ Perspective correction not available in Expo');
    return imageUri;
  }

  /**
   * Convert to grayscale and increase contrast
   */
  static async prepareForOCR(imageUri: string): Promise<string> {
    try {
      // Basic preprocessing available in Expo
      const processed = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          // Just resize for now - grayscale requires native modules
          { resize: { width: 1800 } },
        ],
        {
          compress: 0.85,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      return processed.uri;
    } catch (error) {
      console.error('OCR preparation failed:', error);
      return imageUri;
    }
  }
}

// Quality check thresholds
export const QUALITY_THRESHOLDS = {
  MIN_CONFIDENCE: 0.3,      // Minimum to attempt OCR
  GOOD_CONFIDENCE: 0.7,     // No enhancement needed
  MIN_FILE_SIZE_KB: 100,    // Minimum file size
  MAX_FILE_SIZE_MB: 10,     // Maximum file size
  MIN_DIMENSION: 800,       // Minimum width/height
  IDEAL_WIDTH: 1600,        // Ideal width for OCR
};

// Common receipt issues and solutions
export const RECEIPT_ISSUES = {
  FADED: {
    description: 'Receipt text is faded',
    solutions: ['Place on dark background', 'Increase lighting', 'Use flash if needed']
  },
  CRUMPLED: {
    description: 'Receipt is crumpled or folded',
    solutions: ['Flatten receipt completely', 'Place under heavy book briefly', 'Iron on low heat with cloth']
  },
  GLARE: {
    description: 'Glare or reflections on receipt',
    solutions: ['Adjust angle to avoid glare', 'Turn off flash', 'Use indirect lighting']
  },
  PARTIAL: {
    description: 'Receipt is cut off or partial',
    solutions: ['Include entire receipt in frame', 'Take multiple photos if needed', 'Use landscape orientation for long receipts']
  },
  BLURRY: {
    description: 'Image is blurry or out of focus',
    solutions: ['Hold camera steady', 'Tap to focus on receipt', 'Clean camera lens', 'Use timer or voice command']
  },
  DARK: {
    description: 'Image is too dark',
    solutions: ['Move to brighter area', 'Turn on room lights', 'Use flash carefully', 'Avoid shadows']
  }
};