/**
 * Fuzzy Receipt Parser
 * Handles partial, degraded, and low-quality receipt text
 */

interface PartialItem {
  raw_text: string;
  parsed_name?: string;
  price_cents?: number;
  quantity?: number;
  confidence: number;
  issues: string[];
}

interface PartialReceipt {
  store_name?: string;
  store_confidence: number;
  items: PartialItem[];
  total_cents?: number;
  tax_cents?: number;
  subtotal_cents?: number;
  date?: string;
  extraction_quality: 'high' | 'medium' | 'low' | 'partial';
  warnings: string[];
}

export class FuzzyReceiptParser {
  // Common store name variations and misspellings
  private static storePatterns = new Map([
    ['walmart', ['WALMART', 'WAL MART', 'WALMAR', 'WLMRT', 'WMT', 'WAL★MART']],
    ['target', ['TARGET', 'TRGT', 'TARGE', 'TARGT']],
    ['kroger', ['KROGER', 'KROGR', 'KRGER', 'KRO']],
    ['cvs', ['CVS', 'CVS PHARMACY', 'CVS/PHARMACY', 'CVSPHARMACY']],
    ['walgreens', ['WALGREENS', 'WALGREEN', 'WLGRNS', 'WAL GREENS']],
    ['whole_foods', ['WHOLE FOODS', 'WHOLEFOODS', 'WF', 'WHOLE FOOD', 'WFM']],
    ['trader_joes', ['TRADER JOE\'S', 'TRADER JOES', 'TJ\'S', 'TRADERJOES']],
    ['costco', ['COSTCO', 'COSTCO WHOLESALE', 'COST CO', 'CSTCO']],
    ['safeway', ['SAFEWAY', 'SAFE WAY', 'SFWY']],
    ['albertsons', ['ALBERTSONS', 'ALBERTSON\'S', 'ALBERT SONS', 'ALBRTSNS']],
    ['publix', ['PUBLIX', 'PUBLX', 'PUB LIX']],
    ['heb', ['H-E-B', 'HEB', 'H E B', 'H.E.B']],
  ]);

  // Common receipt words that help identify text as a receipt
  private static receiptMarkers = [
    'RECEIPT', 'RCPT', 'INVOICE', 'BILL',
    'TOTAL', 'SUBTOTAL', 'TAX', 'CASH', 'CHANGE',
    'THANK YOU', 'THANKS', 'CUSTOMER COPY',
    'STORE #', 'ST#', 'REG', 'CASHIER', 'TRN',
    'ITEM', 'QTY', 'PRICE', 'AMOUNT'
  ];

  /**
   * Parse with fuzzy matching and partial extraction
   */
  static parse(text: string): PartialReceipt {
    const warnings: string[] = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    // Check if this looks like receipt text
    const receiptConfidence = this.calculateReceiptConfidence(text);
    if (receiptConfidence < 0.2) {
      warnings.push('Text does not appear to be a receipt');
    }

    // Extract store name with fuzzy matching
    const { storeName, storeConfidence } = this.extractStoreName(lines);
    if (storeConfidence < 0.5) {
      warnings.push('Store name uncertain');
    }

    // Extract items with various strategies
    const items = this.extractItems(lines);
    if (items.length === 0) {
      warnings.push('No items could be extracted');
    }

    // Extract totals
    const totals = this.extractTotals(lines);
    if (!totals.total) {
      warnings.push('Total amount not found');
    }

    // Extract date
    const date = this.extractDate(lines);
    if (!date) {
      warnings.push('Date not found');
    }

    // Determine extraction quality
    const quality = this.determineQuality(items.length, storeConfidence, warnings.length);

    return {
      store_name: storeName,
      store_confidence: storeConfidence,
      items,
      total_cents: totals.total,
      tax_cents: totals.tax,
      subtotal_cents: totals.subtotal,
      date,
      extraction_quality: quality,
      warnings
    };
  }

  /**
   * Calculate confidence that text is a receipt
   */
  private static calculateReceiptConfidence(text: string): number {
    const upperText = text.toUpperCase();
    let score = 0;
    let maxScore = this.receiptMarkers.length;

    for (const marker of this.receiptMarkers) {
      if (upperText.includes(marker)) {
        score++;
      }
    }

    // Check for price patterns
    const pricePattern = /\$?\d+\.?\d{0,2}/g;
    const priceMatches = text.match(pricePattern);
    if (priceMatches && priceMatches.length > 2) {
      score += 2;
      maxScore += 2;
    }

    // Check for date patterns
    const datePattern = /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/;
    if (datePattern.test(text)) {
      score++;
      maxScore++;
    }

    return score / maxScore;
  }

  /**
   * Extract store name with fuzzy matching
   */
  private static extractStoreName(lines: string[]): { storeName?: string, storeConfidence: number } {
    // Check first few lines for store name
    const headerLines = lines.slice(0, 5).join(' ').toUpperCase();

    for (const [canonical, variations] of this.storePatterns) {
      for (const variation of variations) {
        if (headerLines.includes(variation)) {
          return {
            storeName: canonical.toUpperCase().replace('_', ' '),
            storeConfidence: 0.95
          };
        }

        // Fuzzy match - allow 1-2 character differences
        if (this.fuzzyMatch(headerLines, variation, 2)) {
          return {
            storeName: canonical.toUpperCase().replace('_', ' '),
            storeConfidence: 0.7
          };
        }
      }
    }

    // Try to find any capitalized text in first line
    const firstLine = lines[0]?.toUpperCase();
    if (firstLine && firstLine.length > 2 && firstLine.length < 30) {
      // Remove common non-store patterns
      if (!firstLine.match(/^\d+|^STORE|^#|^REG|^RECEIPT/)) {
        return {
          storeName: firstLine,
          storeConfidence: 0.4
        };
      }
    }

    return { storeConfidence: 0 };
  }

  /**
   * Extract items using multiple strategies
   */
  private static extractItems(lines: string[]): PartialItem[] {
    const items: PartialItem[] = [];
    const skipPatterns = [
      /^(SUBTOTAL|TOTAL|TAX|CASH|CHANGE|DEBIT|CREDIT)/i,
      /^#\s*ITEMS?\s+SOLD/i,
      /^THANK/i,
      /^CUSTOMER/i,
      /^STORE\s*#/i,
      /^\d{10,}$/, // Long numbers (barcodes)
      /^[A-Z]{1,2}\d{2,}/, // Register/transaction codes
    ];

    for (const line of lines) {
      // Skip non-item lines
      if (skipPatterns.some(p => p.test(line))) continue;
      if (line.length < 3) continue;

      const item = this.parseItemLine(line);
      if (item) {
        items.push(item);
      }
    }

    // If we found very few items, try alternative parsing
    if (items.length < 3) {
      const alternativeItems = this.alternativeItemExtraction(lines);
      items.push(...alternativeItems);
    }

    return items;
  }

  /**
   * Parse a single line as an item
   */
  private static parseItemLine(line: string): PartialItem | null {
    const issues: string[] = [];

    // Try various price patterns
    const pricePatterns = [
      /^(.+?)\s+\$?(\d+\.\d{2})$/, // Item $9.99
      /^(.+?)\s+(\d+\.\d{2})\s*[A-Z]?$/, // Item 9.99 X
      /^(.+?)\s+\$?(\d+)$/, // Item $9 or Item 9
      /(\$?\d+\.\d{2})/, // Any price in line
    ];

    for (const pattern of pricePatterns) {
      const match = line.match(pattern);
      if (match) {
        const rawName = match[1] || line.replace(match[0], '').trim();
        const priceStr = match[2] || match[1];

        // Clean up name
        let name = rawName
          .replace(/^\d{12,}\s*/, '') // Remove barcodes
          .replace(/\s+\d{12,}$/, '')
          .replace(/\s{2,}/g, ' ')
          .trim();

        // Skip if name is too short or just numbers
        if (name.length < 2 || /^\d+$/.test(name)) {
          continue;
        }

        // Parse price
        const price = parseFloat(priceStr.replace('$', ''));
        if (isNaN(price) || price <= 0 || price > 10000) {
          issues.push('Unusual price');
          continue;
        }

        return {
          raw_text: line,
          parsed_name: this.cleanItemName(name),
          price_cents: Math.round(price * 100),
          quantity: 1,
          confidence: issues.length === 0 ? 0.8 : 0.5,
          issues
        };
      }
    }

    // If no price found, but line looks like an item
    if (line.length > 4 && line.match(/^[A-Z]/)) {
      // Check if it's not a header or footer line
      if (!line.match(/^(STORE|REG|CASHIER|DATE|TIME|RECEIPT)/i)) {
        return {
          raw_text: line,
          parsed_name: this.cleanItemName(line),
          confidence: 0.3,
          issues: ['No price found']
        };
      }
    }

    return null;
  }

  /**
   * Alternative item extraction for very poor quality
   */
  private static alternativeItemExtraction(lines: string[]): PartialItem[] {
    const items: PartialItem[] = [];

    // Look for lines between "header" and "footer" sections
    let inItemSection = false;
    let foundTotal = false;

    for (const line of lines) {
      // Start of items (after store info)
      if (!inItemSection && line.match(/\$?\d+\.\d{2}/)) {
        inItemSection = true;
      }

      // End of items (at totals)
      if (line.match(/^(SUBTOTAL|TOTAL|TAX)/i)) {
        foundTotal = true;
        inItemSection = false;
      }

      if (inItemSection && !foundTotal) {
        // Extract anything that looks like it could be an item
        if (line.length > 3 && !line.match(/^\d{10,}$/)) {
          const price = this.extractPrice(line);
          items.push({
            raw_text: line,
            parsed_name: this.cleanItemName(line),
            price_cents: price,
            quantity: 1,
            confidence: 0.4,
            issues: ['Extracted with low confidence']
          });
        }
      }
    }

    return items;
  }

  /**
   * Clean item name
   */
  private static cleanItemName(name: string): string {
    return name
      .replace(/\$?\d+\.\d{2}/, '') // Remove prices
      .replace(/\d{10,}/g, '') // Remove barcodes
      .replace(/^[A-Z]{1,2}\d+\s*/, '') // Remove item codes
      .replace(/\s+[A-Z]$/, '') // Remove tax codes
      .replace(/\s{2,}/g, ' ')
      .trim()
      .toUpperCase();
  }

  /**
   * Extract price from text
   */
  private static extractPrice(text: string): number | undefined {
    const priceMatch = text.match(/\$?(\d+\.?\d{0,2})/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1]);
      if (!isNaN(price) && price > 0 && price < 1000) {
        return Math.round(price * 100);
      }
    }
    return undefined;
  }

  /**
   * Extract totals from receipt
   */
  private static extractTotals(lines: string[]): {
    total?: number;
    tax?: number;
    subtotal?: number;
  } {
    const result: any = {};

    for (const line of lines) {
      const upperLine = line.toUpperCase();

      // Total
      if (upperLine.includes('TOTAL') && !upperLine.includes('SUBTOTAL')) {
        const price = this.extractPrice(line);
        if (price && price > result.subtotal) {
          result.total = price;
        }
      }

      // Subtotal
      if (upperLine.includes('SUBTOTAL')) {
        const price = this.extractPrice(line);
        if (price) {
          result.subtotal = price;
        }
      }

      // Tax
      if (upperLine.includes('TAX')) {
        const price = this.extractPrice(line);
        if (price && price < 10000) { // Tax shouldn't be huge
          result.tax = price;
        }
      }
    }

    // If we have subtotal and tax but no total, calculate it
    if (!result.total && result.subtotal && result.tax) {
      result.total = result.subtotal + result.tax;
    }

    return result;
  }

  /**
   * Extract date from receipt
   */
  private static extractDate(lines: string[]): string | undefined {
    const datePatterns = [
      /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/, // MM/DD/YYYY or MM-DD-YY
      /(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})/, // YYYY-MM-DD
      /([A-Z]{3})\s+(\d{1,2}),?\s+(\d{4})/, // JAN 15 2024
      /(\d{1,2})\s+([A-Z]{3})\s+(\d{4})/, // 15 JAN 2024
    ];

    for (const line of lines.slice(0, 10)) { // Check header area
      for (const pattern of datePatterns) {
        const match = line.match(pattern);
        if (match) {
          // Try to parse and format the date
          try {
            const dateStr = match[0];
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
              return date.toISOString().split('T')[0];
            }
          } catch {
            // Continue to next pattern
          }
        }
      }
    }

    // Default to today if no date found
    return undefined;
  }

  /**
   * Determine extraction quality
   */
  private static determineQuality(
    itemCount: number,
    storeConfidence: number,
    warningCount: number
  ): 'high' | 'medium' | 'low' | 'partial' {
    if (itemCount > 5 && storeConfidence > 0.8 && warningCount < 2) {
      return 'high';
    }
    if (itemCount > 2 && storeConfidence > 0.5 && warningCount < 4) {
      return 'medium';
    }
    if (itemCount > 0 || storeConfidence > 0.3) {
      return 'low';
    }
    return 'partial';
  }

  /**
   * Fuzzy string matching
   */
  private static fuzzyMatch(text: string, pattern: string, maxDistance: number): boolean {
    // Simple fuzzy match - check if pattern exists with some variations
    const regex = new RegExp(
      pattern.split('').map(c => c + '?').join('.?'),
      'i'
    );
    return regex.test(text);
  }

  /**
   * Enhance partial results with context
   */
  static enhancePartialResults(partial: PartialReceipt): PartialReceipt {
    // If we have items but no store, try to guess from items
    if (!partial.store_name && partial.items.length > 0) {
      const itemNames = partial.items.map(i => i.parsed_name || i.raw_text).join(' ');

      // Check for store-specific item patterns
      if (itemNames.includes('GREAT VALUE')) {
        partial.store_name = 'WALMART';
        partial.store_confidence = 0.7;
      } else if (itemNames.includes('UP&UP') || itemNames.includes('GOOD & GATHER')) {
        partial.store_name = 'TARGET';
        partial.store_confidence = 0.7;
      } else if (itemNames.includes('KIRKLAND')) {
        partial.store_name = 'COSTCO';
        partial.store_confidence = 0.8;
      } else if (itemNames.includes('365')) {
        partial.store_name = 'WHOLE FOODS';
        partial.store_confidence = 0.6;
      }
    }

    // If no date found, use today
    if (!partial.date) {
      partial.date = new Date().toISOString().split('T')[0];
      partial.warnings.push('Date defaulted to today');
    }

    // Validate and fix item prices
    for (const item of partial.items) {
      if (!item.price_cents && partial.items.length === 1 && partial.total_cents) {
        // Single item, use total as price
        item.price_cents = partial.total_cents;
        item.confidence = Math.max(0.5, item.confidence * 0.8);
        item.issues.push('Price inferred from total');
      }

      // Set default quantity
      if (!item.quantity) {
        item.quantity = 1;
      }

      // Clean up name
      if (item.parsed_name) {
        item.parsed_name = item.parsed_name
          .replace(/[^\w\s-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        // If name is too short, mark as uncertain
        if (item.parsed_name.length < 3) {
          item.confidence *= 0.7;
          item.issues.push('Name too short');
        }
      }
    }

    return partial;
  }
}

// Export for use in Edge Functions
export function parseWithFuzzyMatching(text: string): PartialReceipt {
  const result = FuzzyReceiptParser.parse(text);
  return FuzzyReceiptParser.enhancePartialResults(result);
}