import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';

// OCR Service that uses Supabase Edge Function
// Processes receipts with Google Vision API + Gemini AI

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
}

interface ParsedReceipt {
  id: string;
  storeName: string;
  date: string;
  total: number;
  currency: string;
  items: ParsedReceiptItem[];
}

class OCRService {
  // Process image for better OCR results
  async preprocessImage(uri: string): Promise<string> {
    try {
      // Enhance image for better OCR
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [
          { resize: { width: 1600 } }, // Higher res for OCR
          // Convert to grayscale and increase contrast
        ],
        {
          compress: 0.9,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true, // Get base64 for API
        }
      );

      return manipulated.base64 || manipulated.uri;
    } catch (error) {
      console.error('Image preprocessing error:', error);
      return uri;
    }
  }

  // Perform OCR using Supabase Edge Function
  async performOCR(imageUri: string, householdId?: string): Promise<OCRResult> {
    try {
      // Preprocess the image
      const processedImage = await this.preprocessImage(imageUri);

      // Get current user and household
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Fallback to mock for testing
        return await this.mockOCR(processedImage);
      }

      // Get household ID if not provided
      if (!householdId) {
        const { data: member } = await supabase
          .from('household_members')
          .select('household_id')
          .eq('user_id', user.id)
          .single();
        householdId = member?.household_id;
      }

      if (!householdId) {
        throw new Error('No household found');
      }

      // Call Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('process-receipt', {
        body: {
          image_base64: processedImage,
          household_id: householdId,
          user_id: user.id,
          use_gemini: false
        }
      });

      if (error) {
        console.error('OCR Edge Function error:', error);
        // Fallback to mock
        return await this.mockOCR(processedImage);
      }

      // Convert Edge Function response to OCRResult format
      const ocrText = data.items.map((item: any) =>
        `${item.normalized_name} ${item.quantity} ${item.unit} ${item.price || ''}`
      ).join('\n');

      return {
        text: ocrText,
        blocks: this.textToBlocks(ocrText),
        confidence: data.confidence || 0.8
      };
    } catch (error) {
      console.error('OCR error:', error);
      // Fallback to mock for testing
      return await this.mockOCR('');
    }
  }

  // Mock OCR for testing (replace with real OCR service)
  private async mockOCR(imageData: string): Promise<OCRResult> {
    // Simulate OCR processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Return mock receipt text that looks realistic
    const mockText = `
WHOLE FOODS MARKET
365 Main Street
San Francisco, CA 94102
(415) 555-0123

Date: ${new Date().toLocaleDateString()}
Time: ${new Date().toLocaleTimeString()}

GROCERY
ORGANIC MILK         5.99
LETTUCE HEAD         2.49
ROMA TOMATOES 2LB    4.99
CHICKEN BREAST       12.50
PASTA BARILLA        2.99
BREAD WHOLE WHEAT    3.99
GREEK YOGURT 2X      6.99
BANANAS 2.5LB        3.75
OLIVE OIL            8.99
EGGS DOZEN           4.99

SUBTOTAL            57.67
TAX                  4.33
TOTAL              $62.00

CASH                70.00
CHANGE               8.00

Thank you for shopping!
    `.trim();

    const blocks = this.textToBlocks(mockText);

    return {
      text: mockText,
      blocks,
      confidence: 0.85,
    };
  }

  // Convert text to blocks for parsing
  private textToBlocks(text: string): TextBlock[] {
    const lines = text.split('\n');
    return lines.map((line, index) => ({
      text: line,
      boundingBox: {
        x: 0,
        y: index * 20,
        width: 100,
        height: 20,
      },
      confidence: 0.8 + Math.random() * 0.2,
    }));
  }

  // Parse OCR text into structured receipt data
  async parseReceipt(ocrResult: OCRResult, householdId?: string): Promise<ParsedReceipt> {
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

          const item = {
            id: Date.now().toString() + '_' + i,
            rawText: line,
            name: this.cleanItemName(cleanName),
            quantity,
            unit,
            price,
            confidence: this.calculateItemConfidence(cleanName, price),
            needsReview: this.needsReview(cleanName, price),
            location: this.guessLocation(cleanName),
          };
          items.push(item);

          // Auto-add high confidence items to pantry if authenticated
          if (householdId && item.confidence >= 0.8 && !item.needsReview) {
            this.addToPantry(item, householdId).catch(console.error);
          }
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

  // Add item to pantry inventory
  private async addToPantry(item: ParsedReceiptItem, householdId: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const category = this.detectCategory(item.name);
      const location = item.location || this.guessLocation(item.name);

      await supabase
        .from('pantry_items')
        .insert({
          household_id: householdId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category,
          location,
          source: 'receipt',
          added_by: user.id
        });
    } catch (error) {
      console.error('Failed to add item to pantry:', error);
    }
  }

  // Guess storage location based on item name
  private guessLocation(itemName: string): string {
    const lower = itemName.toLowerCase();

    // Frozen items
    if (lower.includes('frozen') || lower.includes('ice cream')) {
      return 'freezer';
    }

    // Fridge items
    const fridgeItems = ['milk', 'yogurt', 'cheese', 'meat', 'chicken', 'beef', 'fish', 'lettuce', 'tomato'];
    if (fridgeItems.some(item => lower.includes(item))) {
      return 'fridge';
    }

    // Default to pantry
    return 'pantry';
  }

  // Enhanced parsing with category detection
  detectCategory(itemName: string): string {
    const categories: Record<string, string[]> = {
      'Dairy': ['milk', 'yogurt', 'cheese', 'butter', 'cream'],
      'Meat': ['chicken', 'beef', 'pork', 'turkey', 'fish', 'salmon', 'shrimp'],
      'Produce': ['lettuce', 'tomato', 'banana', 'apple', 'orange', 'carrot', 'broccoli'],
      'Bakery': ['bread', 'bagel', 'muffin', 'croissant', 'cake'],
      'Pantry': ['pasta', 'rice', 'cereal', 'oil', 'vinegar', 'sauce'],
      'Frozen': ['frozen', 'ice cream'],
      'Beverages': ['juice', 'soda', 'water', 'coffee', 'tea'],
    };

    const lowerName = itemName.toLowerCase();

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => lowerName.includes(keyword))) {
        return category;
      }
    }

    return 'Other';
  }
}

// Export singleton instance
export const ocrService = new OCRService();

// Export types
export type { OCRResult, TextBlock, ParsedReceiptItem, ParsedReceipt };