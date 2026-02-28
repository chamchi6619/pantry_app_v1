/**
 * OCR service with image preprocessing and result formatting
 * Vision Camera dependency removed (incompatible with RN 0.81)
 * On-device OCR now handled by deviceOcrService.ts
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
   * Format OCR result into OcrPayload
   */
  formatOCRResult(result: TextRecognitionResult, imageHash: string): OcrPayload {
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
