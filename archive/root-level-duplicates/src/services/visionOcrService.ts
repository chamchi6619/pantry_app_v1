/**
 * On-device OCR service using Vision Camera
 * Platform-specific text recognition for receipts
 */

import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import { OcrBlock } from './receiptHeuristics';

export interface OcrPayload {
  pageWidth: number;
  pageHeight: number;
  blocks: OcrBlock[];
  fullText: string;
  imageHash: string;
  capturedAt: string;
}

export interface TextRecognitionResult {
  text: string;
  blocks: Array<{
    text: string;
    frame: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    confidence?: number;
  }>;
}

export class VisionOCRService {
  private isInitialized = false;
  private textRecognizer: any = null;

  /**
   * Initialize the OCR service
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      // Check if Vision Camera and text recognition are available
      const VisionCamera = await this.loadVisionCamera();
      if (!VisionCamera) {
        console.log('Vision Camera not available - using fallback');
        return false;
      }

      // Platform-specific initialization
      if (Platform.OS === 'ios') {
        await this.initializeIOS();
      } else if (Platform.OS === 'android') {
        await this.initializeAndroid();
      }

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize OCR service:', error);
      return false;
    }
  }

  /**
   * Load Vision Camera dynamically
   */
  private async loadVisionCamera(): Promise<any> {
    try {
      // Dynamic import for development builds
      const module = await import('react-native-vision-camera');
      return module;
    } catch {
      return null;
    }
  }

  /**
   * Initialize iOS Vision framework
   */
  private async initializeIOS(): Promise<void> {
    // In a real implementation, this would set up VNRecognizeTextRequest
    // For now, we'll use the text recognition plugin
    try {
      const TextRecognition = await import('react-native-vision-camera-v3-text-recognition');
      this.textRecognizer = TextRecognition;
    } catch (error) {
      console.error('iOS text recognition not available:', error);
    }
  }

  /**
   * Initialize Android ML Kit
   */
  private async initializeAndroid(): Promise<void> {
    // In a real implementation, this would set up ML Kit Text Recognition v2
    try {
      const TextRecognition = await import('react-native-vision-camera-v3-text-recognition');
      this.textRecognizer = TextRecognition;
    } catch (error) {
      console.error('Android text recognition not available:', error);
    }
  }

  /**
   * Preprocess image for better OCR results
   */
  async preprocessImage(uri: string): Promise<string> {
    try {
      // Get image info
      const info = await ImageManipulator.manipulateAsync(uri, [], { base64: false });

      // Calculate optimal width (cap at 1600px)
      const targetWidth = Math.min(info.width, 1600);

      const operations = [
        // Resize if needed
        ...(info.width > targetWidth
          ? [{ resize: { width: targetWidth } }]
          : []),
      ];

      // Apply preprocessing
      const processed = await ImageManipulator.manipulateAsync(
        uri,
        operations,
        {
          compress: 0.9,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      return processed.uri;
    } catch (error) {
      console.error('Image preprocessing failed:', error);
      return uri; // Return original if preprocessing fails
    }
  }

  /**
   * Perform OCR on image
   */
  async performOCR(imageUri: string): Promise<OcrPayload> {
    try {
      // Preprocess the image
      const processedUri = await this.preprocessImage(imageUri);

      // Generate image hash for caching
      const imageData = await fetch(processedUri).then(r => r.blob());
      const arrayBuffer = await new Response(imageData).arrayBuffer();
      const imageHash = await Crypto.digest(
        Crypto.CryptoDigestAlgorithm.SHA256,
        new Uint8Array(arrayBuffer)
      );

      // Perform text recognition
      let result: TextRecognitionResult;

      if (this.isInitialized && this.textRecognizer) {
        // Use real OCR
        result = await this.recognizeText(processedUri);
      } else {
        // Fallback to mock for Expo Go
        result = await this.mockOCR(processedUri);
      }

      // Convert to OcrPayload format
      const ocrPayload = this.formatOCRResult(result, imageHash);

      return ocrPayload;
    } catch (error) {
      console.error('OCR failed:', error);
      throw error;
    }
  }

  /**
   * Perform actual text recognition
   */
  private async recognizeText(uri: string): Promise<TextRecognitionResult> {
    if (!this.textRecognizer) {
      throw new Error('Text recognizer not initialized');
    }

    try {
      // Use the text recognition plugin
      const result = await this.textRecognizer.scanImage(uri);

      // Format the result
      const blocks = result.blocks || [];
      const fullText = blocks.map((b: any) => b.text).join('\n');

      return {
        text: fullText,
        blocks: blocks.map((block: any) => ({
          text: block.text,
          frame: block.frame || { x: 0, y: 0, width: 100, height: 20 },
          confidence: block.confidence
        }))
      };
    } catch (error) {
      console.error('Text recognition failed:', error);
      throw error;
    }
  }

  /**
   * Mock OCR for testing in Expo Go
   */
  private async mockOCR(uri: string): Promise<TextRecognitionResult> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    const mockReceipt = `
WHOLE FOODS MARKET
365 Main Street
San Francisco, CA 94102
(415) 555-0123

09/25/2025 14:32

GROCERY
ORGANIC MILK GAL     5.99
BANANAS 2.5 @ 0.69   1.73
WHOLE WHEAT BREAD    3.99
CHICKEN BREAST       12.50
PASTA BARILLA 2X     5.98
GREEK YOGURT         4.99
LETTUCE HEAD         2.49
TOMATOES 3LB @ 1.99  5.97
OLIVE OIL EVOO       8.99
EGGS DOZEN ORGANIC   5.99

SUBTOTAL            58.61
TAX 8.75%            5.13
TOTAL              $63.74

CASH                70.00
CHANGE               6.26

TOTAL POINTS EARNED  127
REWARDS BALANCE    $5.00

Thank you for shopping!
`.trim();

    // Create blocks with simulated bbox data
    const lines = mockReceipt.split('\n');
    const blocks = lines.map((line, index) => {
      // Simulate different x positions for prices
      const hasPrice = /\d+\.\d{2}$/.test(line);
      const x = hasPrice ? 0.6 : 0.1;

      return {
        text: line,
        frame: {
          x: x,
          y: index * 0.03,
          width: hasPrice ? 0.3 : 0.5,
          height: 0.025
        },
        confidence: 0.85 + Math.random() * 0.14
      };
    });

    return {
      text: mockReceipt,
      blocks
    };
  }

  /**
   * Format OCR result into OcrPayload
   */
  private formatOCRResult(result: TextRecognitionResult, imageHash: string): OcrPayload {
    // Convert blocks to normalized format
    const ocrBlocks: OcrBlock[] = result.blocks.map((block, index) => ({
      text: block.text.trim(),
      bbox: {
        x: block.frame.x,
        y: block.frame.y,
        w: block.frame.width,
        h: block.frame.height
      },
      lineIndex: Math.floor(block.frame.y * 100), // Approximate line index from y position
      confidence: block.confidence
    }));

    // Sort blocks by lineIndex to maintain reading order
    ocrBlocks.sort((a, b) => {
      if (Math.abs(a.lineIndex - b.lineIndex) < 2) {
        // Same line, sort by x position
        return a.bbox.x - b.bbox.x;
      }
      return a.lineIndex - b.lineIndex;
    });

    // Reassign sequential line indices
    let currentLineY = -1;
    let currentLineIndex = 0;
    ocrBlocks.forEach(block => {
      if (Math.abs(block.lineIndex - currentLineY) > 2) {
        currentLineIndex++;
        currentLineY = block.lineIndex;
      }
      block.lineIndex = currentLineIndex;
    });

    return {
      pageWidth: 1000, // Normalized width
      pageHeight: 1400, // Normalized height
      blocks: ocrBlocks,
      fullText: result.text,
      imageHash,
      capturedAt: new Date().toISOString()
    };
  }

  /**
   * Extract quick info for immediate display
   */
  extractQuickInfo(payload: OcrPayload): {
    merchant?: string;
    total?: number;
    date?: string;
  } {
    const info: any = {};

    // Quick merchant extraction (first few lines)
    const topBlocks = payload.blocks.filter(b => b.lineIndex < 3);
    for (const block of topBlocks) {
      if (/^[A-Z][A-Z\s&']{2,}/.test(block.text) && block.text.length > 3) {
        info.merchant = block.text;
        break;
      }
    }

    // Quick total extraction (look for TOTAL keyword)
    const totalBlock = payload.blocks.find(b =>
      b.text.toUpperCase().includes('TOTAL') &&
      !b.text.toUpperCase().includes('POINTS')
    );

    if (totalBlock) {
      const match = totalBlock.text.match(/\$?\s*(\d+\.\d{2})/);
      if (match) {
        info.total = parseFloat(match[1]);
      }
    }

    // Quick date extraction
    const datePatterns = [
      /\d{1,2}\/\d{1,2}\/\d{2,4}/,
      /\d{4}-\d{2}-\d{2}/
    ];

    for (const block of payload.blocks.slice(0, 10)) {
      for (const pattern of datePatterns) {
        if (pattern.test(block.text)) {
          info.date = block.text.match(pattern)?.[0];
          break;
        }
      }
      if (info.date) break;
    }

    return info;
  }
}

// Export singleton instance
export const visionOCRService = new VisionOCRService();

// Export types
export type { TextRecognitionResult };