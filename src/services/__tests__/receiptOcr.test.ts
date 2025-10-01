/**
 * Comprehensive test suite for Receipt OCR system
 */

import { Normalizers } from '../normalizers';
import { ReceiptHeuristics } from '../receiptHeuristics';
import { OcrBlock } from '../receiptHeuristics';

describe('Receipt OCR System Tests', () => {
  let normalizer: Normalizers;
  let heuristics: ReceiptHeuristics;

  beforeEach(() => {
    normalizer = new Normalizers('en-US');
    heuristics = new ReceiptHeuristics('en-US');
  });

  describe('Number Normalization', () => {
    test('handles US format with thousands separator', () => {
      expect(normalizer.normalizeNumber('1,234.56')).toBe(1234.56);
      expect(normalizer.normalizeNumber('$1,234.56')).toBe(1234.56);
    });

    test('handles European format', () => {
      const euNormalizer = new Normalizers('de-DE');
      expect(euNormalizer.normalizeNumber('1.234,56')).toBe(1234.56);
      expect(euNormalizer.normalizeNumber('€1.234,56')).toBe(1234.56);
    });

    test('handles European three-decimal quirk', () => {
      const euNormalizer = new Normalizers('fr-FR');
      expect(euNormalizer.normalizeNumber('12.500')).toBe(12500); // Thousands
    });

    test('handles negative prices', () => {
      expect(normalizer.normalizeNumber('-5.99')).toBe(-5.99);
      expect(normalizer.normalizeNumber('(5.99)')).toBe(-5.99);
      expect(normalizer.normalizeNumber('5.99-')).toBe(-5.99);
    });

    test('handles percentages', () => {
      expect(normalizer.normalizeNumber('8.75%')).toBe(0.0875);
      expect(normalizer.normalizeNumber('100%')).toBe(1.0);
    });
  });

  describe('Date Normalization', () => {
    test('handles US date format', () => {
      expect(normalizer.normalizeDate('09/25/25')).toBe('2025-09-25');
      expect(normalizer.normalizeDate('9/5/2025')).toBe('2025-09-05');
      expect(normalizer.normalizeDate('12/31/2024')).toBe('2024-12-31');
    });

    test('handles European date format', () => {
      expect(normalizer.normalizeDate('25.09.2025')).toBe('2025-09-25');
      expect(normalizer.normalizeDate('31-12-2024')).toBe('2024-12-31');
    });

    test('handles ISO format', () => {
      expect(normalizer.normalizeDate('2025-09-25')).toBe('2025-09-25');
    });

    test('handles text month format', () => {
      expect(normalizer.normalizeDate('Sep 25, 2025')).toBe('2025-09-25');
      expect(normalizer.normalizeDate('Jan 1, 2025')).toBe('2025-01-01');
    });
  });

  describe('Total Detection with Disambiguation', () => {
    test('avoids TOTAL POINTS confusion', () => {
      const blocks: OcrBlock[] = [
        { text: 'GROCERIES', bbox: { x: 0.1, y: 0.5, w: 0.4, h: 0.03 }, lineIndex: 10, confidence: 0.9 },
        { text: '45.67', bbox: { x: 0.7, y: 0.5, w: 0.2, h: 0.03 }, lineIndex: 10, confidence: 0.9 },
        { text: 'TOTAL POINTS', bbox: { x: 0.1, y: 0.6, w: 0.4, h: 0.03 }, lineIndex: 12, confidence: 0.9 },
        { text: '1,234', bbox: { x: 0.7, y: 0.6, w: 0.2, h: 0.03 }, lineIndex: 12, confidence: 0.9 },
        { text: 'REWARD BALANCE', bbox: { x: 0.1, y: 0.65, w: 0.4, h: 0.03 }, lineIndex: 13, confidence: 0.9 },
        { text: '5,678', bbox: { x: 0.7, y: 0.65, w: 0.2, h: 0.03 }, lineIndex: 13, confidence: 0.9 },
        { text: 'TOTAL', bbox: { x: 0.1, y: 0.7, w: 0.2, h: 0.03 }, lineIndex: 14, confidence: 0.9 },
        { text: '$45.67', bbox: { x: 0.7, y: 0.7, w: 0.2, h: 0.03 }, lineIndex: 14, confidence: 0.9 }
      ];

      const result = heuristics.process(blocks);
      expect(result.total).toBe(45.67); // Not 1234 or 5678
    });

    test('finds GRAND TOTAL over TOTAL', () => {
      const blocks: OcrBlock[] = [
        { text: 'SUBTOTAL', bbox: { x: 0.1, y: 0.5, w: 0.3, h: 0.03 }, lineIndex: 10 },
        { text: '50.00', bbox: { x: 0.7, y: 0.5, w: 0.2, h: 0.03 }, lineIndex: 10 },
        { text: 'TOTAL SAVINGS', bbox: { x: 0.1, y: 0.55, w: 0.3, h: 0.03 }, lineIndex: 11 },
        { text: '5.00', bbox: { x: 0.7, y: 0.55, w: 0.2, h: 0.03 }, lineIndex: 11 },
        { text: 'GRAND TOTAL', bbox: { x: 0.1, y: 0.6, w: 0.3, h: 0.03 }, lineIndex: 12 },
        { text: '45.00', bbox: { x: 0.7, y: 0.6, w: 0.2, h: 0.03 }, lineIndex: 12 }
      ];

      const result = heuristics.process(blocks);
      expect(result.total).toBe(45.00);
    });
  });

  describe('Weighted Produce Handling', () => {
    test('parses @ pricing correctly', () => {
      const blocks: OcrBlock[] = [
        { text: 'BANANAS', bbox: { x: 0.1, y: 0.3, w: 0.3, h: 0.03 }, lineIndex: 5 },
        { text: '2.45 @ 0.69', bbox: { x: 0.5, y: 0.3, w: 0.3, h: 0.03 }, lineIndex: 5 },
        { text: 'APPLES', bbox: { x: 0.1, y: 0.35, w: 0.3, h: 0.03 }, lineIndex: 6 },
        { text: '3.2LB @ $1.99', bbox: { x: 0.5, y: 0.35, w: 0.3, h: 0.03 }, lineIndex: 6 }
      ];

      const result = heuristics.process(blocks);

      const bananas = result.items.find(i => i.raw_name.includes('BANANA'));
      expect(bananas?.qty).toBeCloseTo(2.45);
      expect(bananas?.unit).toBe('lb');
      expect(bananas?.price_each).toBeCloseTo(0.69);
      expect(bananas?.price_total).toBeCloseTo(1.69);

      const apples = result.items.find(i => i.raw_name.includes('APPLE'));
      expect(apples?.qty).toBeCloseTo(3.2);
      expect(apples?.price_total).toBeCloseTo(6.37);
    });
  });

  describe('Discount and Coupon Processing', () => {
    test('separates discounts from items', () => {
      const blocks: OcrBlock[] = [
        { text: 'MILK', bbox: { x: 0.1, y: 0.3, w: 0.3, h: 0.03 }, lineIndex: 5 },
        { text: '3.99', bbox: { x: 0.7, y: 0.3, w: 0.2, h: 0.03 }, lineIndex: 5 },
        { text: 'COUPON MILK', bbox: { x: 0.1, y: 0.35, w: 0.3, h: 0.03 }, lineIndex: 6 },
        { text: '-0.50', bbox: { x: 0.7, y: 0.35, w: 0.2, h: 0.03 }, lineIndex: 6 },
        { text: 'MFR DISCOUNT', bbox: { x: 0.1, y: 0.4, w: 0.3, h: 0.03 }, lineIndex: 7 },
        { text: '1.00-', bbox: { x: 0.7, y: 0.4, w: 0.2, h: 0.03 }, lineIndex: 7 }
      ];

      const result = heuristics.process(blocks);

      expect(result.items.length).toBe(1);
      expect(result.items[0].price_total).toBe(3.99);

      expect(result.discounts.length).toBe(2);
      expect(result.discounts[0].amount).toBe(0.50);
      expect(result.discounts[1].amount).toBe(1.00);
    });
  });

  describe('Multi-Tax Handling', () => {
    test('handles Canadian multi-tax (GST/PST)', () => {
      const blocks: OcrBlock[] = [
        { text: 'SUBTOTAL', bbox: { x: 0.1, y: 0.5, w: 0.3, h: 0.03 }, lineIndex: 10 },
        { text: '100.00', bbox: { x: 0.7, y: 0.5, w: 0.2, h: 0.03 }, lineIndex: 10 },
        { text: 'GST 5%', bbox: { x: 0.1, y: 0.55, w: 0.3, h: 0.03 }, lineIndex: 11 },
        { text: '5.00', bbox: { x: 0.7, y: 0.55, w: 0.2, h: 0.03 }, lineIndex: 11 },
        { text: 'PST 7%', bbox: { x: 0.1, y: 0.6, w: 0.3, h: 0.03 }, lineIndex: 12 },
        { text: '7.00', bbox: { x: 0.7, y: 0.6, w: 0.2, h: 0.03 }, lineIndex: 12 },
        { text: 'TOTAL', bbox: { x: 0.1, y: 0.65, w: 0.3, h: 0.03 }, lineIndex: 13 },
        { text: '112.00', bbox: { x: 0.7, y: 0.65, w: 0.2, h: 0.03 }, lineIndex: 13 }
      ];

      const result = heuristics.process(blocks);

      expect(result.tax).toBe(12.00); // Combined taxes
      expect(result.total).toBe(112.00);
      expect(result.reconciliation.ok).toBe(true);
    });
  });

  describe('Reconciliation Logic', () => {
    test('passes within 2% tolerance', () => {
      const result1 = heuristics.reconcile({
        subtotal: 100,
        tax: 8.75,
        tip: 0,
        total: 109.00 // Actual: 108.75, within 2%
      });
      expect(result1.ok).toBe(true);
      expect(result1.delta).toBeCloseTo(0.25);
    });

    test('passes within 5 cent tolerance', () => {
      const result2 = heuristics.reconcile({
        subtotal: 1.50,
        tax: 0.12,
        tip: 0,
        total: 1.65 // Actual: 1.62, within 5¢
      });
      expect(result2.ok).toBe(true);
      expect(result2.delta).toBeCloseTo(0.03);
    });

    test('fails outside tolerance', () => {
      const result3 = heuristics.reconcile({
        subtotal: 100,
        tax: 8.75,
        tip: 0,
        total: 115.00 // Too far off
      });
      expect(result3.ok).toBe(false);
    });
  });

  describe('Skip-LLM Decision', () => {
    test('skips LLM when heuristics are sufficient', () => {
      const mockResult = {
        merchant: 'WHOLE FOODS',
        date: '2025-09-25',
        items: Array(10).fill({ price_total: 5.00 }),
        discounts: [],
        subtotal: 50.00,
        tax: 4.38,
        tip: null,
        total: 54.38,
        currency: 'USD',
        reconciliation: { ok: true, delta: 0, computed: 54.38, actual: 54.38 },
        linesPairedRatio: 0.85,
        confidence: 0.9,
        needsReview: false
      };

      expect(heuristics.shouldSkipLLM(mockResult)).toBe(true);
    });

    test('uses LLM when reconciliation fails', () => {
      const mockResult = {
        merchant: 'STORE',
        date: '2025-09-25',
        items: [],
        discounts: [],
        subtotal: 50.00,
        tax: 4.38,
        tip: null,
        total: 60.00, // Wrong total
        currency: 'USD',
        reconciliation: { ok: false, delta: 5.62, computed: 54.38, actual: 60.00 },
        linesPairedRatio: 0.85,
        confidence: 0.5,
        needsReview: true
      };

      expect(heuristics.shouldSkipLLM(mockResult)).toBe(false);
    });

    test('uses LLM when pairing ratio is low', () => {
      const mockResult = {
        merchant: 'STORE',
        date: '2025-09-25',
        items: [],
        discounts: [],
        subtotal: 50.00,
        tax: 4.38,
        tip: null,
        total: 54.38,
        currency: 'USD',
        reconciliation: { ok: true, delta: 0, computed: 54.38, actual: 54.38 },
        linesPairedRatio: 0.45, // Too low
        confidence: 0.5,
        needsReview: true
      };

      expect(heuristics.shouldSkipLLM(mockResult)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('handles receipts with tips', () => {
      const blocks: OcrBlock[] = [
        { text: 'SUBTOTAL', bbox: { x: 0.1, y: 0.5, w: 0.3, h: 0.03 }, lineIndex: 10 },
        { text: '50.00', bbox: { x: 0.7, y: 0.5, w: 0.2, h: 0.03 }, lineIndex: 10 },
        { text: 'TAX', bbox: { x: 0.1, y: 0.55, w: 0.3, h: 0.03 }, lineIndex: 11 },
        { text: '4.38', bbox: { x: 0.7, y: 0.55, w: 0.2, h: 0.03 }, lineIndex: 11 },
        { text: 'TIP', bbox: { x: 0.1, y: 0.6, w: 0.3, h: 0.03 }, lineIndex: 12 },
        { text: '10.00', bbox: { x: 0.7, y: 0.6, w: 0.2, h: 0.03 }, lineIndex: 12 },
        { text: 'TOTAL', bbox: { x: 0.1, y: 0.65, w: 0.3, h: 0.03 }, lineIndex: 13 },
        { text: '64.38', bbox: { x: 0.7, y: 0.65, w: 0.2, h: 0.03 }, lineIndex: 13 }
      ];

      const result = heuristics.process(blocks);
      expect(result.tip).toBe(10.00);
      expect(result.total).toBe(64.38);
      expect(result.reconciliation.ok).toBe(true);
    });

    test('handles split tender payments', () => {
      const blocks: OcrBlock[] = [
        { text: 'TOTAL', bbox: { x: 0.1, y: 0.5, w: 0.3, h: 0.03 }, lineIndex: 10 },
        { text: '50.00', bbox: { x: 0.7, y: 0.5, w: 0.2, h: 0.03 }, lineIndex: 10 },
        { text: 'CASH', bbox: { x: 0.1, y: 0.55, w: 0.3, h: 0.03 }, lineIndex: 11 },
        { text: '30.00', bbox: { x: 0.7, y: 0.55, w: 0.2, h: 0.03 }, lineIndex: 11 },
        { text: 'CARD', bbox: { x: 0.1, y: 0.6, w: 0.3, h: 0.03 }, lineIndex: 12 },
        { text: '20.00', bbox: { x: 0.7, y: 0.6, w: 0.2, h: 0.03 }, lineIndex: 12 }
      ];

      const result = heuristics.process(blocks);
      expect(result.total).toBe(50.00);
    });

    test('handles empty receipt', () => {
      const result = heuristics.process([]);
      expect(result.merchant).toBe(null);
      expect(result.total).toBe(null);
      expect(result.items.length).toBe(0);
      expect(result.needsReview).toBe(true);
    });
  });
});

describe('Receipt Normalization', () => {
  test('verifies literal existence in OCR text', () => {
    const normalizer = new Normalizers();
    const ocrText = 'WHOLE FOODS MARKET\\n09/25/2025\\nTOTAL $63.74';

    expect(normalizer.existsInOCR('WHOLE FOODS', ocrText)).toBe(true);
    expect(normalizer.existsInOCR(63.74, ocrText)).toBe(true);
    expect(normalizer.existsInOCR('SAFEWAY', ocrText)).toBe(false);
    expect(normalizer.existsInOCR(100.00, ocrText)).toBe(false);
  });

  test('handles number comparison with tolerance', () => {
    const normalizer = new Normalizers();

    expect(normalizer.numbersMatch(100.00, 100.02, 0.02)).toBe(true);
    expect(normalizer.numbersMatch(1.00, 1.04, 0.02)).toBe(false);
    expect(normalizer.numbersMatch(0.50, 0.54, 0.05)).toBe(true); // Within 5¢
  });
});