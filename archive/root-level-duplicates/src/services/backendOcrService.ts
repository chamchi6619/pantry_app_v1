/**
 * Backend OCR Service
 * Connects to the Python backend for OCR processing
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';  // Use legacy API for now
import { Platform } from 'react-native';

interface OCRLineItem {
  raw_text: string;
  parsed_name?: string;
  quantity: number;
  unit: string;
  price?: number;
  category?: string;
  confidence: number;
  needs_review: boolean;
}

interface OCRResponse {
  receipt_id: string;
  merchant?: string;
  date?: string;
  total?: number;
  tax?: number;
  subtotal?: number;
  line_items: OCRLineItem[];
  fix_queue_items: OCRLineItem[];
  processing_time_ms: number;
  confidence: number;
  source: string;
  needs_review: boolean;
  debug_info?: any;
}

export class BackendOCRService {
  private baseUrl: string;

  constructor() {
    // Get the backend URL from environment or use localhost
    // In production, this should come from env config
    if (__DEV__) {
      // For Expo Go app running on your phone:
      // Replace 'YOUR_COMPUTER_IP' with your computer's IP address (from ipconfig)
      // This should be your Windows WiFi adapter IPv4 address
      const YOUR_COMPUTER_IP = '192.168.1.13'; // Your computer's IP address

      const deviceIP = Platform.select({
        ios: YOUR_COMPUTER_IP,
        android: YOUR_COMPUTER_IP,
        default: 'localhost'
      });

      this.baseUrl = `http://${deviceIP}:8000`;
      console.log('Backend URL:', this.baseUrl);

      // If testing on physical device, you MUST replace 'localhost' above with your computer's IP
      if (deviceIP === 'localhost') {
        console.warn('⚠️ Using localhost - this will only work in web browser, not on physical device!');
        console.warn('⚠️ Replace "localhost" with your computer IP address for phone testing');
      }
    } else {
      // Production URL
      this.baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
    }
  }

  /**
   * Process receipt image through backend OCR
   */
  async processReceipt(
    imageUri: string,
    options?: {
      household_id?: string;
      user_id?: string;
      merchant_hint?: string;
      skip_cache?: boolean;
    }
  ): Promise<OCRResponse> {
    try {
      // Resize image to reduce bandwidth
      const manipulated = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 1024 } }], // Max width 1024px
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Convert to base64
      const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Prepare request
      const requestBody = {
        image_base64: base64,
        household_id: options?.household_id || 'test_household',
        user_id: options?.user_id || 'test_user',
        merchant_hint: options?.merchant_hint,
        skip_cache: options?.skip_cache || false
      };

      // Call backend API
      const response = await fetch(`${this.baseUrl}/api/receipts/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Add auth header if available
          // 'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OCR API error: ${response.status} - ${error}`);
      }

      const result: OCRResponse = await response.json();
      return result;

    } catch (error) {
      console.error('Backend OCR error:', error);
      throw error;
    }
  }

  /**
   * Update fix queue item with corrections
   */
  async updateFixQueueItem(
    fixQueueId: string,
    updates: {
      name?: string;
      quantity?: number;
      unit?: string;
      category?: string;
      price?: number;
      deleted?: boolean;
    }
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/receipts/fix-queue/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fix_queue_id: fixQueueId,
          ...updates
        })
      });

      if (!response.ok) {
        throw new Error(`Fix queue update failed: ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      console.error('Fix queue update error:', error);
      throw error;
    }
  }

  /**
   * Get OCR statistics
   */
  async getStats(household_id: string): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/receipts/stats/${household_id}`
      );

      if (!response.ok) {
        throw new Error(`Stats fetch failed: ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      console.error('Stats fetch error:', error);
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
}

// Export singleton instance
export const backendOCR = new BackendOCRService();