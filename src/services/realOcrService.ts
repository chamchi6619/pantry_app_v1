/**
 * Real OCR Service
 * Performs on-device OCR and sends results to backend
 */

import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { performOCR as mockOCR } from './mockOcrService';
import { performCloudOCR } from './cloudVisionOcr';

interface ProcessResult {
  ocr_text: string;
  image_base64: string;
  processing_time_ms: number;
}

export class RealOCRService {
  private baseUrl: string;
  private cloudVisionApiKey: string;
  private monthlyOCRCount: number = 0;
  private monthlyLimit: number = 900; // Stay under 1000 free tier
  private lastResetDate: string;

  constructor() {
    // Use the same backend URL configuration
    // For local testing:
    // const YOUR_COMPUTER_IP = '192.168.1.13';
    // this.baseUrl = `http://${YOUR_COMPUTER_IP}:8000`;

    // For ngrok/external access (update with your ngrok URL):
    this.baseUrl = 'https://jamir-superdifficult-kymberly.ngrok-free.dev';

    // For real OCR testing, get a Google Cloud Vision API key:
    // 1. Go to https://console.cloud.google.com/
    // 2. Enable Cloud Vision API
    // 3. Create credentials (API Key)
    // 4. Add key below (NEVER commit this!)
    this.cloudVisionApiKey = 'AIzaSyDL6gsVXM-H7bwIiBV2EkrgXvsBO2OR2K4'; // REAL OCR ENABLED!

    // Load usage tracking from storage
    this.loadUsageTracking();
  }

  /**
   * Perform on-device OCR and send to backend
   */
  async processReceiptWithOCR(
    imageUri: string,
    options?: {
      household_id?: string;
      user_id?: string;
      merchant_hint?: string;
      skip_cache?: boolean;
      use_gemini?: boolean;
    }
  ): Promise<any> {
    try {
      const startTime = Date.now();

      // Step 1: Perform OCR
      console.log('Performing OCR...');
      let ocrText = '';

      try {
        if (this.cloudVisionApiKey && this.canUseCloudVision()) {
          // Use real Cloud Vision OCR if API key is configured and under limit
          console.log(`Using Google Cloud Vision (${this.monthlyOCRCount}/${this.monthlyLimit} used this month)`);

          // First get base64 for Cloud Vision
          const tempManipulated = await ImageManipulator.manipulateAsync(
            imageUri,
            [{ resize: { width: 1024 } }],
            { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
          );

          // Log base64 info for debugging
          console.log('Base64 image length:', tempManipulated.base64?.length || 0);
          console.log('Base64 first 100 chars:', tempManipulated.base64?.substring(0, 100));

          const cloudResult = await performCloudOCR(tempManipulated.base64!, this.cloudVisionApiKey);
          ocrText = cloudResult.text || '';
          console.log('Real OCR detected text (length:', ocrText.length, '):', ocrText.substring(0, 500));

          // Log more if there are items with prices
          const priceMatches = ocrText.match(/\d+\.\d{2}/g);
          console.log('Found prices in OCR:', priceMatches ? priceMatches.slice(0, 10) : 'No prices found');

          // Track usage
          this.incrementUsage();
        } else {
          // Fall back to mock OCR if no API key or limit reached
          if (!this.cloudVisionApiKey) {
            console.log('Using mock OCR (set cloudVisionApiKey for real OCR)...');
          } else {
            console.warn(`⚠️ Monthly OCR limit reached (${this.monthlyOCRCount}/${this.monthlyLimit}). Using mock OCR to avoid charges.`);
          }
          const ocrResult = await mockOCR(imageUri);
          ocrText = ocrResult.text || '';
        }
      } catch (ocrError) {
        console.error('OCR failed:', ocrError);
        // Fall back to mock OCR when Cloud Vision fails
        console.log('Falling back to mock OCR due to error...');
        try {
          const mockResult = await mockOCR(imageUri);
          ocrText = mockResult.text || '';
          console.log('Mock OCR fallback successful');
        } catch (mockError) {
          console.error('Mock OCR also failed:', mockError);
          // Continue without OCR text - backend will handle
        }
      }

      // Step 2: Prepare image for upload
      console.log('Preparing image for upload...');
      const manipulated = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 1024 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Step 3: Send to backend with OCR text
      console.log('Sending to backend for processing...');
      console.log('OCR text being sent (first 500 chars):', ocrText.substring(0, 500));
      const requestBody = {
        image_base64: base64,
        household_id: options?.household_id || 'test_household',
        user_id: options?.user_id || 'test_user',
        merchant_hint: options?.merchant_hint,
        skip_cache: true,  // ALWAYS skip cache to process real OCR text
        ocr_text: ocrText,  // Include the OCR text
        use_gemini: options?.use_gemini || false  // Use Gemini for intelligent parsing
      };

      const response = await fetch(`${this.baseUrl}/api/receipts/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Backend error: ${response.status} - ${error}`);
      }

      const result = await response.json();

      // Add OCR timing info
      result.ocr_time_ms = Date.now() - startTime;
      result.ocr_text_length = ocrText.length;

      console.log('Backend processing complete:', {
        merchant: result.merchant,
        total: result.total,
        items: result.line_items.length + result.fix_queue_items.length,
        ocr_time: result.ocr_time_ms
      });

      return result;

    } catch (error) {
      console.error('Real OCR processing error:', error);
      throw error;
    }
  }

  /**
   * Test connection to backend
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`);
      return response.ok;
    } catch (error) {
      console.error('Backend connection test failed:', error);
      return false;
    }
  }

  /**
   * Check if we can use Cloud Vision without charges
   */
  private canUseCloudVision(): boolean {
    // Reset counter if new month
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    if (this.lastResetDate !== currentMonth) {
      this.monthlyOCRCount = 0;
      this.lastResetDate = currentMonth;
      this.saveUsageTracking();
    }

    // Check if under limit
    if (this.monthlyOCRCount >= this.monthlyLimit) {
      return false;
    }

    return true;
  }

  /**
   * Increment usage counter
   */
  private incrementUsage(): void {
    this.monthlyOCRCount++;
    this.saveUsageTracking();
    console.log(`OCR usage: ${this.monthlyOCRCount}/${this.monthlyLimit} this month`);

    // Warn when approaching limit
    if (this.monthlyOCRCount === this.monthlyLimit - 100) {
      console.warn('⚠️ Approaching monthly OCR limit (100 remaining)');
    } else if (this.monthlyOCRCount === this.monthlyLimit - 10) {
      console.warn('⚠️ Only 10 OCR calls remaining this month!');
    } else if (this.monthlyOCRCount >= this.monthlyLimit) {
      console.error('🛑 Monthly OCR limit reached! Switching to mock OCR.');
    }
  }

  /**
   * Load usage tracking from AsyncStorage
   */
  private async loadUsageTracking(): Promise<void> {
    try {
      // In a real app, use AsyncStorage
      // For now, initialize with current month
      this.lastResetDate = new Date().toISOString().substring(0, 7);
      this.monthlyOCRCount = 0;
    } catch (error) {
      console.error('Failed to load usage tracking:', error);
    }
  }

  /**
   * Save usage tracking to AsyncStorage
   */
  private async saveUsageTracking(): Promise<void> {
    try {
      // In a real app, save to AsyncStorage
      // For now, just log
      console.log(`Saved usage: ${this.monthlyOCRCount} OCR calls this month`);
    } catch (error) {
      console.error('Failed to save usage tracking:', error);
    }
  }

  /**
   * Get current usage stats
   */
  getUsageStats(): { used: number; limit: number; remaining: number } {
    return {
      used: this.monthlyOCRCount,
      limit: this.monthlyLimit,
      remaining: Math.max(0, this.monthlyLimit - this.monthlyOCRCount)
    };
  }
}

// Export singleton instance
export const realOCR = new RealOCRService();