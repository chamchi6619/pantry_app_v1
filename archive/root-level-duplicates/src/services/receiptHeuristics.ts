/**
 * Deterministic receipt heuristics engine
 * Processes receipts without LLM when possible
 */

import { Normalizers } from './normalizers';

export interface OcrBlock {
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
  lineIndex: number;
  confidence?: number;
}

export interface ParsedLine {
  text: string;
  priceText?: string;
  price?: number;
  lineIndex: number;
  isItem: boolean;
}

export interface ParsedItem {
  raw_name: string;
  qty: number;
  unit: string;
  price_each?: number;
  price_total: number;
  confidence: number;
}

export interface DiscountLine {
  raw_text: string;
  amount: number;
  type: 'coupon' | 'discount' | 'savings' | 'other';
}

export interface ReconciliationResult {
  ok: boolean;
  delta: number | null;
  computed: number;
  actual: number;
}

export interface HeuristicsResult {
  merchant: string | null;
  date: string | null;
  items: ParsedItem[];
  discounts: DiscountLine[];
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  total: number | null;
  currency: string;
  reconciliation: ReconciliationResult;
  linesPairedRatio: number;
  confidence: number;
  needsReview: boolean;
}

export class ReceiptHeuristics {
  private normalizer: Normalizers;

  // Price patterns (comprehensive)
  private PRICE_PATTERNS = [
    /\\$?\\s*(\\d{1,3}(?:,\\d{3})*\\.?\\d{0,2})\\s*$/,     // 1,299.00 at end
    /\\$?\\s*(\\d+\\.\\d{3})\\s*$/,                        // European 12.500
    /\\$?\\s*-(\\d+\\.?\\d{0,2})\\s*$/,                    // Negative prices
    /(\\d+\\.?\\d{0,2})-\\s*$/,                          // Discount format
    /(\\d+\\.?\\d*)\\s*@\\s*\\$?(\\d+\\.?\\d{0,2})/,        // Weighted @ price
    /COUPON\\s+(-?\\d+\\.?\\d{0,2})/i,                   // Coupon lines
    /(\\d+\\.?\\d{0,2})\\s*%\\s*OFF$/i,                  // Percentage off
  ];

  // Total keywords (search bottom-up)
  private TOTAL_KEYWORDS = [
    'GRAND TOTAL',
    'AMOUNT DUE',
    'BALANCE DUE',
    'TOTAL'
  ];

  // Exclude these from total detection
  private EXCLUDE_FROM_TOTAL = [
    'POINTS', 'BALANCE', 'REWARDS', 'SAVINGS',
    'LOYALTY', 'EARNED', 'ACCUMULATED'
  ];

  // Tax line patterns
  private TAX_PATTERNS = [
    /^(TAX\\d*|STATE TAX|CITY TAX|PST|GST|HST|VAT)\\s+\\$?(\\d+\\.\\d{2})$/i,
    /^TAX\\s+@?\\s*(\\d+\\.?\\d*)%?\\s+\\$?(\\d+\\.\\d{2})$/i,
  ];

  constructor(locale: string = 'en-US') {
    this.normalizer = new Normalizers(locale);
  }

  /**
   * Main processing function
   */
  process(blocks: OcrBlock[]): HeuristicsResult {
    // Extract basic fields
    const merchant = this.extractMerchant(blocks);
    const date = this.extractDate(blocks);

    // Parse lines with prices
    const parsedLines = this.parseLines(blocks);

    // Process discounts and items
    const { items, discounts, computedSubtotal, totalDiscount } = this.processDiscounts(parsedLines);

    // Find totals
    const total = this.findTotal(blocks);
    const { subtotal, tax, tip } = this.extractTotals(parsedLines);

    // Calculate actual subtotal (after discounts)
    const actualSubtotal = computedSubtotal - totalDiscount;

    // Reconcile math
    const reconciliation = this.reconcile({
      subtotal: actualSubtotal,
      tax,
      tip,
      total
    });

    // Calculate pairing ratio
    const linesPairedRatio = this.calculatePairingRatio(parsedLines);

    // Overall confidence
    const confidence = this.calculateConfidence({
      merchant,
      date,
      total,
      reconciliation,
      linesPairedRatio
    });

    // Determine if review needed
    const needsReview = !reconciliation.ok || confidence < 0.7 || linesPairedRatio < 0.5;

    return {
      merchant,
      date,
      items,
      discounts,
      subtotal: actualSubtotal,
      tax,
      tip,
      total,
      currency: this.detectCurrency(blocks),
      reconciliation,
      linesPairedRatio,
      confidence,
      needsReview
    };
  }

  /**
   * Parse lines and extract prices
   */
  private parseLines(blocks: OcrBlock[]): ParsedLine[] {
    const lines: ParsedLine[] = [];

    // Group blocks by lineIndex
    const lineGroups = new Map<number, OcrBlock[]>();
    for (const block of blocks) {
      if (!lineGroups.has(block.lineIndex)) {
        lineGroups.set(block.lineIndex, []);
      }
      lineGroups.get(block.lineIndex)!.push(block);
    }

    // Process each line
    for (const [lineIndex, lineBlocks] of lineGroups) {
      // Sort blocks by x position (left to right)
      lineBlocks.sort((a, b) => a.bbox.x - b.bbox.x);

      // Find rightmost price-like block
      let priceBlock: OcrBlock | null = null;
      let priceValue: number | null = null;

      for (let i = lineBlocks.length - 1; i >= 0; i--) {
        const block = lineBlocks[i];
        for (const pattern of this.PRICE_PATTERNS) {
          const match = block.text.match(pattern);
          if (match) {
            priceBlock = block;
            // Handle @ pricing
            if (pattern.source.includes('@')) {
              const qty = parseFloat(match[1]);
              const unitPrice = parseFloat(match[2]);
              priceValue = qty * unitPrice;
            } else {
              priceValue = this.normalizer.normalizeNumber(match[1] || match[0]);
            }
            break;
          }
        }
        if (priceBlock) break;
      }

      // Combine non-price blocks as item text
      const textBlocks = priceBlock
        ? lineBlocks.filter(b => b !== priceBlock)
        : lineBlocks;

      const lineText = textBlocks.map(b => b.text).join(' ').trim();

      lines.push({
        text: lineText,
        priceText: priceBlock?.text,
        price: priceValue || undefined,
        lineIndex,
        isItem: !!priceValue && !this.isTaxLine(lineText) && !this.isTotalLine(lineText)
      });
    }

    return lines;
  }

  /**
   * Find total with disambiguation
   */
  private findTotal(blocks: OcrBlock[]): number | null {
    // Search from bottom up
    const sortedBlocks = [...blocks].sort((a, b) => b.lineIndex - a.lineIndex);

    for (const block of sortedBlocks) {
      const upperText = block.text.toUpperCase();

      // Check for total keywords
      const hasTotal = this.TOTAL_KEYWORDS.some(kw => upperText.includes(kw));
      if (!hasTotal) continue;

      // Exclude loyalty/rewards lines
      const isExcluded = this.EXCLUDE_FROM_TOTAL.some(kw => upperText.includes(kw));
      if (isExcluded) continue;

      // Find price within 120px to the right
      const priceBlock = blocks.find(b =>
        b.lineIndex === block.lineIndex &&
        b.bbox.x > block.bbox.x + block.bbox.w &&
        b.bbox.x - (block.bbox.x + block.bbox.w) <= 120
      );

      if (priceBlock) {
        const price = this.extractPrice(priceBlock.text);
        if (price !== null && price > 0) {
          return price;
        }
      }

      // Also check if price is in same block
      const priceInSame = this.extractPrice(block.text);
      if (priceInSame !== null && priceInSame > 0) {
        return priceInSame;
      }
    }

    return null;
  }

  /**
   * Process discounts and separate from items
   */
  private processDiscounts(lines: ParsedLine[]): {
    items: ParsedItem[];
    discounts: DiscountLine[];
    computedSubtotal: number;
    totalDiscount: number;
  } {
    const items: ParsedItem[] = [];
    const discounts: DiscountLine[] = [];

    for (const line of lines) {
      if (!line.price) continue;

      // Check if it's a discount
      const isDiscount = line.price < 0 ||
                        /COUPON|DISCOUNT|SAVINGS|OFF|REBATE/i.test(line.text);

      if (isDiscount) {
        discounts.push({
          raw_text: line.text,
          amount: Math.abs(line.price),
          type: this.detectDiscountType(line.text)
        });
      } else if (line.isItem) {
        // Parse weighted items
        const weighted = this.parseWeightedItem(line);
        items.push(weighted || {
          raw_name: line.text,
          qty: 1,
          unit: 'ea',
          price_total: line.price,
          confidence: 0.8
        });
      }
    }

    const computedSubtotal = items.reduce((sum, i) => sum + i.price_total, 0);
    const totalDiscount = discounts.reduce((sum, d) => sum + d.amount, 0);

    return { items, discounts, computedSubtotal, totalDiscount };
  }

  /**
   * Parse weighted produce (2.45 @ $0.69/lb)
   */
  private parseWeightedItem(line: ParsedLine): ParsedItem | null {
    const match = line.text.match(/(\\d+\\.?\\d*)\\s*(?:LB|KG)?\\s*@\\s*\\$?(\\d+\\.?\\d{2})/i);
    if (match) {
      const qty = parseFloat(match[1]);
      const priceEach = parseFloat(match[2]);
      const itemName = line.text.replace(match[0], '').trim();

      return {
        raw_name: itemName || line.text,
        qty,
        unit: 'lb',
        price_each: priceEach,
        price_total: qty * priceEach,
        confidence: 0.9
      };
    }
    return null;
  }

  /**
   * Extract merchant name (usually first few lines)
   */
  private extractMerchant(blocks: OcrBlock[]): string | null {
    const topBlocks = blocks
      .filter(b => b.lineIndex < 5)
      .sort((a, b) => a.lineIndex - b.lineIndex);

    for (const block of topBlocks) {
      const text = block.text.trim();
      // Look for store-like patterns
      if (/^[A-Z][A-Z\\s&']{2,}/.test(text) &&
          text.length > 3 &&
          text.length < 50 &&
          !/\\d{3,}/.test(text)) { // No long numbers
        return text;
      }
    }

    return null;
  }

  /**
   * Extract date from receipt
   */
  private extractDate(blocks: OcrBlock[]): string | null {
    for (const block of blocks) {
      // Look for date patterns
      const normalized = this.normalizer.normalizeDate(block.text);
      if (normalized) return normalized;

      // Also check for "Date:" prefix
      if (/Date:?\\s*(.+)/i.test(block.text)) {
        const match = block.text.match(/Date:?\\s*(.+)/i);
        if (match) {
          const date = this.normalizer.normalizeDate(match[1]);
          if (date) return date;
        }
      }
    }

    return null;
  }

  /**
   * Extract subtotal, tax, tip
   */
  private extractTotals(lines: ParsedLine[]): {
    subtotal: number | null;
    tax: number | null;
    tip: number | null;
  } {
    let subtotal: number | null = null;
    let tax: number | null = null;
    let tip: number | null = null;

    for (const line of lines) {
      const upperText = line.text.toUpperCase();

      if (upperText.includes('SUBTOTAL') && line.price) {
        subtotal = line.price;
      } else if (this.isTaxLine(line.text) && line.price) {
        tax = (tax || 0) + line.price;  // Sum multiple taxes
      } else if ((upperText.includes('TIP') || upperText.includes('GRATUITY')) && line.price) {
        tip = line.price;
      }
    }

    return { subtotal, tax, tip };
  }

  /**
   * Check if line is a tax line
   */
  private isTaxLine(text: string): boolean {
    return this.TAX_PATTERNS.some(pattern => pattern.test(text));
  }

  /**
   * Check if line is a total line
   */
  private isTotalLine(text: string): boolean {
    const upper = text.toUpperCase();
    return this.TOTAL_KEYWORDS.some(kw => upper.includes(kw)) &&
           !this.EXCLUDE_FROM_TOTAL.some(ex => upper.includes(ex));
  }

  /**
   * Detect discount type
   */
  private detectDiscountType(text: string): 'coupon' | 'discount' | 'savings' | 'other' {
    const upper = text.toUpperCase();
    if (upper.includes('COUPON')) return 'coupon';
    if (upper.includes('DISCOUNT')) return 'discount';
    if (upper.includes('SAVINGS')) return 'savings';
    return 'other';
  }

  /**
   * Extract price from text
   */
  private extractPrice(text: string): number | null {
    for (const pattern of this.PRICE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        return this.normalizer.normalizeNumber(match[1] || match[0]);
      }
    }
    return null;
  }

  /**
   * Detect currency from receipt
   */
  private detectCurrency(blocks: OcrBlock[]): string {
    const text = blocks.map(b => b.text).join(' ');
    if (text.includes('$')) return 'USD';
    if (text.includes('£')) return 'GBP';
    if (text.includes('€')) return 'EUR';
    if (text.includes('¥')) return 'JPY';
    return 'USD';  // Default
  }

  /**
   * Calculate line pairing ratio
   */
  private calculatePairingRatio(lines: ParsedLine[]): number {
    const itemLines = lines.filter(l => l.isItem);
    const pairedLines = itemLines.filter(l => l.price !== undefined);

    if (itemLines.length === 0) return 0;
    return pairedLines.length / itemLines.length;
  }

  /**
   * Calculate overall confidence
   */
  private calculateConfidence(params: {
    merchant: string | null;
    date: string | null;
    total: number | null;
    reconciliation: ReconciliationResult;
    linesPairedRatio: number;
  }): number {
    let confidence = 0;

    if (params.merchant) confidence += 0.2;
    if (params.date) confidence += 0.2;
    if (params.total) confidence += 0.2;
    if (params.reconciliation.ok) confidence += 0.2;
    if (params.linesPairedRatio > 0.7) confidence += 0.2;

    return Math.min(confidence, 1.0);
  }

  /**
   * Core reconciliation function
   */
  reconcile(t: {
    subtotal?: number | null;
    tax?: number | null;
    tip?: number | null;
    total?: number | null;
  }): ReconciliationResult {
    const subtotal = t.subtotal ?? 0;
    const tax = t.tax ?? 0;
    const tip = t.tip ?? 0;
    const total = t.total ?? 0;

    if (!total) {
      return {
        ok: false,
        delta: null,
        computed: 0,
        actual: 0
      };
    }

    const computed = +(subtotal + tax + tip).toFixed(2);
    const delta = Math.abs(computed - total);
    const tolerance = Math.max(0.02 * total, 0.05); // 2% OR 5¢

    return {
      ok: delta <= tolerance,
      delta,
      computed,
      actual: total
    };
  }

  /**
   * Determine if we can skip LLM
   */
  shouldSkipLLM(result: HeuristicsResult): boolean {
    return (
      result.merchant !== null &&
      result.date !== null &&
      result.total !== null &&
      result.linesPairedRatio >= 0.70 &&
      result.reconciliation.ok &&
      result.confidence >= 0.8
    );
  }
}

// Export singleton instance
export const heuristics = new ReceiptHeuristics();

// Export function to create locale-specific instance
export function createHeuristics(locale: string): ReceiptHeuristics {
  return new ReceiptHeuristics(locale);
}