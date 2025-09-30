import * as FileSystem from 'expo-file-system/legacy';
import { Alert } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { ImageEnhancementService, QUALITY_THRESHOLDS } from './imageEnhancementService';

// Get API key from environment or use the configured key
const GOOGLE_VISION_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY || 'AIzaSyDL6gsVXM-H7bwIiBV2EkrgXvsBO2OR2K4';

interface VisionResponse {
  responses: Array<{
    textAnnotations?: Array<{
      description: string;
      boundingPoly: any;
    }>;
    fullTextAnnotation?: {
      text: string;
    };
    error?: {
      message: string;
      code: number;
    };
  }>;
}

interface OCRResult {
  text: string;
  confidence: number;
  method: 'google-vision' | 'google-enhanced' | 'google-aggressive' | 'partial' | 'failed';
  attempts: number;
  warnings?: string[];
}

export class CloudVisionService {
  /**
   * Extract text with multiple fallback strategies
   */
  static async extractText(imageUri: string): Promise<string> {
    try {
      // Check if API key is configured
      if (!GOOGLE_VISION_API_KEY || GOOGLE_VISION_API_KEY === 'YOUR_API_KEY_HERE') {
        console.log('📸 Google Vision API not configured');
        throw new Error('Google Vision API key not configured. Please configure the API key.');
      }

      console.log('🔍 Starting OCR process with quality checks...');

      // Analyze image quality first
      const quality = await ImageEnhancementService.analyzeQuality(imageUri);
      console.log('📊 Image quality:', quality);

      if (quality.confidence < QUALITY_THRESHOLDS.MIN_CONFIDENCE) {
        console.warn('⚠️ Image quality too poor for OCR');
        Alert.alert(
          'Poor Image Quality',
          'The image quality is too low. Please retake the photo.\n\nTips:\n' + quality.suggestions.join('\n'),
          [{ text: 'OK' }]
        );
        throw new Error('Image quality too poor for OCR');
      }

      // Attempt OCR with progressive enhancement
      const result = await this.performProgressiveOCR(imageUri, quality.confidence);

      if (result.warnings && result.warnings.length > 0) {
        console.warn('OCR Warnings:', result.warnings);
      }

      console.log(`✅ OCR Complete: Method=${result.method}, Confidence=${result.confidence}, Attempts=${result.attempts}`);

      // If we completely failed, throw error instead of returning mock
      if (result.method === 'failed' || !result.text) {
        throw new Error('OCR failed after all attempts. Please try taking a clearer photo.');
      }

      return result.text;

    } catch (error: any) {
      console.error('OCR failed completely:', error);

      // Provide helpful error message
      let message = 'Could not read the receipt. ';

      if (error.message?.includes('API key')) {
        message += 'Google Vision API key is invalid or not configured.';
      } else if (error.message?.includes('quota')) {
        message += 'Daily OCR limit reached.';
      } else if (error.message?.includes('quality')) {
        message += error.message;
      } else {
        message += 'Please try:\n• Better lighting\n• Steady camera\n• Clear, flat receipt';
      }

      Alert.alert('OCR Failed', message, [{ text: 'OK' }]);

      // Throw error - DO NOT return mock data
      throw error;
    }
  }

  /**
   * Perform OCR with progressive enhancement
   */
  private static async performProgressiveOCR(imageUri: string, initialConfidence: number): Promise<OCRResult> {
    let attempts = 0;
    let lastError: Error | null = null;
    let partialText = '';
    const warnings: string[] = [];

    // Strategy 1: Try original image
    attempts++;
    console.log(`🔄 Attempt ${attempts}: Original image`);
    try {
      const result = await this.callVisionAPI(imageUri);
      if (result && result.length > 50) { // Minimum viable text
        return {
          text: result,
          confidence: initialConfidence,
          method: 'google-vision',
          attempts,
          warnings
        };
      }
      partialText = result; // Save partial result
      warnings.push('Limited text extracted from original image');
    } catch (error: any) {
      console.error(`Attempt ${attempts} failed:`, error.message);
      lastError = error;
    }

    // Strategy 2: Always try enhanced image if original failed
    if (!partialText || partialText.length < 50) {
      attempts++;
      console.log(`🔄 Attempt ${attempts}: Enhanced image`);
      try {
        const enhancedUri = await ImageEnhancementService.enhanceForOCR(imageUri);
        const result = await this.callVisionAPI(enhancedUri);
        if (result && result.length > 50) {
          return {
            text: result,
            confidence: initialConfidence * 0.9,
            method: 'google-enhanced',
            attempts,
            warnings
          };
        }
        if (result.length > partialText.length) {
          partialText = result;
        }
      } catch (enhanceError: any) {
        console.error(`Attempt ${attempts} failed:`, enhanceError.message);
        warnings.push('Image enhancement failed');
      }
    }

    // Strategy 3: Try aggressive enhancement
    if (initialConfidence < 0.5) {
      attempts++;
      console.log(`🔄 Attempt ${attempts}: Aggressive enhancement`);
      try {
        const aggressiveUri = await ImageEnhancementService.aggressiveEnhance(imageUri);
        const result = await this.callVisionAPI(aggressiveUri);
        if (result && result.length > 50) {
          return {
            text: result,
            confidence: initialConfidence * 0.8,
            method: 'google-aggressive',
            attempts,
            warnings: [...warnings, 'Used aggressive image enhancement']
          };
        }
        if (result.length > partialText.length) {
          partialText = result;
        }
      } catch (error: any) {
        console.error(`Attempt ${attempts} failed:`, error.message);
      }
    }

    // Strategy 4: Try auto-cropped image
    attempts++;
    console.log(`🔄 Attempt ${attempts}: Auto-cropped image`);
    try {
      const croppedUri = await ImageEnhancementService.autoCrop(imageUri);
      const result = await this.callVisionAPI(croppedUri);
      if (result && result.length > 50) {
        return {
          text: result,
          confidence: initialConfidence * 0.85,
          method: 'google-enhanced',
          attempts,
          warnings: [...warnings, 'Used cropped image']
        };
      }
      if (result.length > partialText.length) {
        partialText = result;
      }
    } catch (error: any) {
      console.error(`Attempt ${attempts} failed:`, error.message);
    }

    // If we have any partial text, try to use it
    if (partialText && partialText.length > 20) {
      console.log('📝 Using partial extraction:', partialText.substring(0, 100));

      // Try to extract at least prices and totals
      const enrichedText = this.enrichPartialText(partialText);

      return {
        text: enrichedText,
        confidence: 0.3,
        method: 'partial',
        attempts,
        warnings: [...warnings, 'Only partial text could be extracted']
      };
    }

    // All attempts failed
    return {
      text: '',
      confidence: 0,
      method: 'failed',
      attempts,
      warnings: [...warnings, 'All OCR attempts failed']
    };
  }

  /**
   * Call Google Vision API with proper error handling
   */
  private static async callVisionAPI(imageUri: string): Promise<string> {
    // Check if file exists
    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    if (!fileInfo.exists) {
      throw new Error('Image file does not exist');
    }

    // Log file info for debugging
    console.log('📁 File info:', fileInfo);
    const fileSize = (fileInfo as any).size || 0;
    console.log(`📁 File size: ${(fileSize / 1024).toFixed(2)} KB`);
    console.log(`📁 File URI: ${imageUri}`);

    // Try to process/normalize the image first with ImageManipulator
    let processedUri = imageUri;
    try {
      console.log('🔧 Processing image with ImageManipulator...');

      const processed = await ImageManipulator.manipulateAsync(
        imageUri,
        [], // No operations, just re-encode
        {
          compress: 0.95,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      processedUri = processed.uri;
      console.log('✅ Image processed:', processedUri);
    } catch (processError) {
      console.warn('⚠️ Could not process image, using original:', processError);
    }

    // Convert to base64 with error handling
    let base64Image: string;
    try {
      base64Image = await FileSystem.readAsStringAsync(processedUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (readError: any) {
      console.error('File read error:', readError);

      // Try alternative encoding
      try {
        console.log('Trying alternative read method...');
        base64Image = await FileSystem.readAsStringAsync(processedUri, {
          encoding: 'base64' as any,
        });
      } catch (altError) {
        throw new Error('Cannot read image file. File may be corrupted.');
      }
    }

    // Validate base64
    if (!base64Image || base64Image.length < 100) {
      throw new Error('Invalid image data - too small');
    }

    console.log(`📊 Base64 size: ${(base64Image.length / 1024).toFixed(2)} KB`);

    // Check for common base64 issues
    if (base64Image.includes('data:image')) {
      // Remove data URI prefix if present
      base64Image = base64Image.split(',')[1] || base64Image;
      console.log('Removed data URI prefix');
    }

    // Make API call with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            requests: [{
              image: {
                content: base64Image
              },
              features: [
                {
                  type: 'TEXT_DETECTION',
                  maxResults: 1
                },
                {
                  type: 'DOCUMENT_TEXT_DETECTION',
                  maxResults: 1
                }
              ],
              imageContext: {
                languageHints: ['en'],
                textDetectionParams: {
                  enableTextDetectionConfidenceScore: true
                }
              }
            }]
          }),
          signal: controller.signal
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);

        // Parse error for better messaging
        try {
          const errorJson = JSON.parse(errorText);
          const apiError = errorJson.error;

          if (apiError?.code === 400) {
            throw new Error('Bad image data. Image may be corrupted or in unsupported format.');
          } else if (apiError?.code === 403) {
            throw new Error('API key not valid or Vision API not enabled.');
          } else if (apiError?.code === 429) {
            throw new Error('API quota exceeded. Please try again later.');
          }

          throw new Error(apiError?.message || `API error: ${response.status}`);
        } catch (e) {
          throw new Error(`Vision API error: ${response.status}`);
        }
      }

      const result: VisionResponse = await response.json();

      // Check for API errors in response
      if (result.responses[0]?.error) {
        const error = result.responses[0].error;
        console.error('Vision API error in response:', error);

        if (error.message?.includes('Bad image data')) {
          throw new Error('Image cannot be processed. Try taking a clearer photo.');
        }
        throw new Error(error.message);
      }

      // Extract text from both detection types
      const textDetection = result.responses[0]?.textAnnotations?.[0]?.description || '';
      const documentDetection = result.responses[0]?.fullTextAnnotation?.text || '';

      // Use the longer result
      const extractedText = documentDetection.length > textDetection.length
        ? documentDetection
        : textDetection;

      if (!extractedText) {
        console.warn('No text detected in image');
        return '';
      }

      console.log(`✅ Extracted ${extractedText.length} characters`);
      return extractedText;

    } catch (error: any) {
      clearTimeout(timeout);

      if (error.name === 'AbortError') {
        throw new Error('Request timeout - image may be too large');
      }

      throw error;
    }
  }

  /**
   * Try to extract useful information from partial text
   */
  private static enrichPartialText(partialText: string): string {
    const lines = partialText.split('\n').filter(l => l.trim());
    const enriched: string[] = [];

    // Look for prices and items
    const pricePattern = /\$?\d+\.?\d{0,2}/g;
    const itemPattern = /[A-Z]{2,}/g;

    for (const line of lines) {
      // Skip obvious non-item lines
      if (line.length < 3) continue;

      // Look for lines with prices
      if (pricePattern.test(line)) {
        enriched.push(line);
      }
      // Look for lines that might be items (uppercase words)
      else if (itemPattern.test(line) && line.length > 4) {
        enriched.push(line);
      }
    }

    // If we found very little, include everything
    if (enriched.length < 5) {
      return partialText;
    }

    return enriched.join('\n');
  }
}

// Export setup instructions
export const setupInstructions = `
🔑 To Enable Real OCR:

1. Go to: https://console.cloud.google.com
2. Enable "Cloud Vision API"
3. Create API Key
4. Test with provided key or use your own

📸 Tips for Better Results:
• Flatten receipt completely
• Use good lighting
• Avoid shadows and glare
• Include entire receipt
• Hold camera steady
`;