import { Camera, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera';
import { useRunOnJS } from 'react-native-worklets-core';
import { scanOCR } from 'react-native-vision-camera-v3-text-recognition';

// Native OCR Service using react-native-vision-camera
// This requires a development build with native modules

interface OCRResult {
  text: string;
  blocks: TextBlock[];
  confidence: number;
}

interface TextBlock {
  text: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

interface ParsedReceiptItem {
  id: string;
  rawText: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
  confidence: number;
  needsReview: boolean;
  location?: string;
  category?: string;
}

interface ParsedReceipt {
  id: string;
  storeName: string;
  date: string;
  total: number;
  currency: string;
  items: ParsedReceiptItem[];
}

class NativeOCRService {
  // Process OCR results from frame processor
  processOCRFrame(frame: any): OCRResult | null {
    'worklet';
    try {
      const data = scanOCR(frame);

      if (!data || !data.resultText) {
        return null;
      }

      // Convert native OCR data to our format
      const blocks: TextBlock[] = (data.blocks || []).map((block: any) => ({
        text: block.text || '',
        boundingBox: block.frame ? {
          x: block.frame.x,
          y: block.frame.y,
          width: block.frame.width,
          height: block.frame.height,
        } : undefined,
        confidence: block.confidence || 0.5,
      }));

      return {
        text: data.resultText,
        blocks,
        confidence: data.confidence || 0.85,
      };
    } catch (error) {
      console.error('OCR frame processing error:', error);
      return null;
    }
  }

  // Parse OCR text into structured receipt data
  parseReceipt(ocrResult: OCRResult): ParsedReceipt {
    const lines = ocrResult.text.split('\n');
    const items: ParsedReceiptItem[] = [];
    let storeName = 'Unknown Store';
    let total = 0;
    let currency = 'USD';

    // Patterns for parsing
    const patterns = {
      price: /\$?\s*(\d+\.?\d{0,2})\s*$/,
      quantity: /^(\d+(?:\.\d+)?)\s*(LB|KG|OZ|X|DOZEN|EA|PC|PCS)/i,
      storeName: /^[A-Z][A-Z\s&]{2,}/,
      total: /TOTAL\s+\$?\s*(\d+\.\d{2})/i,
      itemLine: /^([A-Z\s]+)\s+(\d+\.\d{2})$/,
    };

    // Find store name (usually in first few lines)
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i].trim();
      if (patterns.storeName.test(line) && line.length > 5) {
        storeName = line;
        break;
      }
    }

    // Parse items
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Skip header/footer lines
      if (
        line.includes('Date:') ||
        line.includes('Time:') ||
        line.includes('TAX') ||
        line.includes('SUBTOTAL') ||
        line.includes('CHANGE') ||
        line.includes('Thank you')
      ) {
        continue;
      }

      // Check for total
      const totalMatch = line.match(patterns.total);
      if (totalMatch) {
        total = parseFloat(totalMatch[1]);
        continue;
      }

      // Try to parse as item
      const priceMatch = line.match(patterns.price);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1]);
        const name = line.replace(patterns.price, '').trim();

        if (name && price > 0) {
          // Extract quantity and unit from name
          let quantity = 1;
          let unit = 'pcs';
          let cleanName = name;

          const quantityMatch = name.match(patterns.quantity);
          if (quantityMatch) {
            quantity = parseFloat(quantityMatch[1]);
            unit = this.normalizeUnit(quantityMatch[2]);
            cleanName = name.replace(patterns.quantity, '').trim();
          }

          // Check for common quantity indicators
          if (name.includes('2X') || name.includes('2x')) {
            quantity = 2;
            cleanName = cleanName.replace(/2X/i, '').trim();
          }

          const itemData: ParsedReceiptItem = {
            id: Date.now().toString() + '_' + i,
            rawText: line,
            name: this.cleanItemName(cleanName),
            quantity,
            unit,
            price,
            confidence: this.calculateItemConfidence(cleanName, price),
            needsReview: this.needsReview(cleanName, price),
            category: this.detectCategory(cleanName),
          };

          items.push(itemData);
        }
      }
    }

    // If no total found, calculate from items
    if (total === 0 && items.length > 0) {
      total = items.reduce((sum, item) => sum + item.price, 0);
    }

    return {
      id: Date.now().toString(),
      storeName,
      date: new Date().toISOString(),
      total,
      currency,
      items,
    };
  }

  // Clean and normalize item names
  private cleanItemName(name: string): string {
    // Remove common prefixes
    name = name.replace(/^(ORGANIC|FRESH|FROZEN)\s+/i, '');

    // Convert to title case
    return name
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Normalize units
  private normalizeUnit(unit: string): string {
    const unitMap: Record<string, string> = {
      'LB': 'lb',
      'LBS': 'lb',
      'KG': 'kg',
      'OZ': 'oz',
      'DOZEN': 'dozen',
      'EA': 'pcs',
      'PC': 'pcs',
      'PCS': 'pcs',
      'X': 'pcs',
    };

    return unitMap[unit.toUpperCase()] || 'pcs';
  }

  // Calculate confidence score for an item
  private calculateItemConfidence(name: string, price: number): number {
    let confidence = 0.5;

    // Name checks
    if (name.length > 2) confidence += 0.2;
    if (name.length < 50) confidence += 0.1;
    if (!/\d{3,}/.test(name)) confidence += 0.1; // No long numbers

    // Price checks
    if (price > 0 && price < 1000) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  // Determine if item needs review
  private needsReview(name: string, price: number): boolean {
    // Flag for review if:
    // - Name is too short
    // - Price seems unusual
    // - Contains unusual characters
    return (
      name.length < 3 ||
      price <= 0 ||
      price > 100 ||
      /[^A-Za-z0-9\s\-.]/.test(name)
    );
  }

  // Enhanced parsing with category detection
  detectCategory(itemName: string): string {
    const categories: Record<string, string[]> = {
      'Dairy': ['milk', 'yogurt', 'cheese', 'butter', 'cream', 'eggs'],
      'Meat': ['chicken', 'beef', 'pork', 'turkey', 'fish', 'salmon', 'shrimp', 'steak', 'bacon'],
      'Produce': ['lettuce', 'tomato', 'banana', 'apple', 'orange', 'carrot', 'broccoli', 'potato', 'onion'],
      'Bakery': ['bread', 'bagel', 'muffin', 'croissant', 'cake', 'donut', 'roll'],
      'Pantry': ['pasta', 'rice', 'cereal', 'oil', 'vinegar', 'sauce', 'flour', 'sugar'],
      'Frozen': ['frozen', 'ice cream', 'popsicle'],
      'Beverages': ['juice', 'soda', 'water', 'coffee', 'tea', 'milk', 'wine', 'beer'],
      'Snacks': ['chips', 'cookies', 'crackers', 'popcorn', 'nuts', 'candy'],
    };

    const lowerName = itemName.toLowerCase();

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => lowerName.includes(keyword))) {
        return category;
      }
    }

    return 'Other';
  }

  // Process accumulated text from multiple frames
  processAccumulatedText(texts: string[]): string {
    // Combine and deduplicate text from multiple frames
    const allLines = texts.flatMap(text => text.split('\n'));
    const uniqueLines = [...new Set(allLines)];
    return uniqueLines.join('\n');
  }
}

// Export singleton instance
export const nativeOCRService = new NativeOCRService();

// Export types
export type { OCRResult, TextBlock, ParsedReceiptItem, ParsedReceipt };