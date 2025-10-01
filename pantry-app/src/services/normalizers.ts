/**
 * Centralized normalization utilities for receipt OCR
 * Handles numbers, dates, and text across different locales
 */

export class Normalizers {
  constructor(private locale: string = 'en-US') {}

  /**
   * Normalize number strings from OCR text
   * Handles different decimal/thousand separators by locale
   */
  normalizeNumber(text: string): number | null {
    if (!text || typeof text !== 'string') return null;

    // Strip currency symbols
    let cleaned = text.replace(/[$£€¥₹¢]/g, '').trim();

    // Handle different formats by locale
    if (this.locale.includes('de') || this.locale.includes('fr')) {
      // European format: 1.234,56 -> 1234.56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (this.locale.includes('en')) {
      // English format: 1,234.56 -> 1234.56
      cleaned = cleaned.replace(/,/g, '');
    }

    // Handle European three-decimal quirk (12.500 for thousands)
    if (/^\d+\.\d{3}$/.test(cleaned) && !this.locale.includes('en')) {
      cleaned = cleaned.replace('.', '');
    }

    // Handle negatives (various formats)
    const isNegative = /^-|^\\(|\\)$|\-$/.test(cleaned);
    cleaned = cleaned.replace(/[()\\-]/g, '');

    // Handle percentage off
    const isPercentage = cleaned.includes('%');
    cleaned = cleaned.replace('%', '');

    const num = parseFloat(cleaned);
    if (isNaN(num)) return null;

    let result = isNegative ? -num : num;
    if (isPercentage) result = result / 100;

    // Round to 2 decimals for currency
    return Math.round(result * 100) / 100;
  }

  /**
   * Normalize date strings from OCR text to ISO format
   * Handles MM/DD/YY, DD.MM.YYYY, YYYY-MM-DD, etc.
   */
  normalizeDate(text: string): string | null {
    if (!text || typeof text !== 'string') return null;

    const patterns = [
      // MM/DD/YY or MM/DD/YYYY (US)
      {
        regex: /^(\\d{1,2})[/\\-](\\d{1,2})[/\\-](\\d{2,4})$/,
        format: 'US',
        parse: (m: RegExpMatchArray) => {
          const month = m[1].padStart(2, '0');
          const day = m[2].padStart(2, '0');
          const year = m[3].length === 2 ? `20${m[3]}` : m[3];
          return { year, month, day };
        }
      },
      // DD.MM.YYYY or DD-MM-YYYY (EU)
      {
        regex: /^(\\d{1,2})[\\.\\-](\\d{1,2})[\\.\\-](\\d{4})$/,
        format: 'EU',
        parse: (m: RegExpMatchArray) => ({
          day: m[1].padStart(2, '0'),
          month: m[2].padStart(2, '0'),
          year: m[3]
        })
      },
      // YYYY-MM-DD (ISO)
      {
        regex: /^(\\d{4})-(\\d{2})-(\\d{2})$/,
        format: 'ISO',
        parse: (m: RegExpMatchArray) => ({
          year: m[1],
          month: m[2],
          day: m[3]
        })
      },
      // MMM DD, YYYY (Jan 15, 2025)
      {
        regex: /^([A-Za-z]{3})\\s+(\\d{1,2}),?\\s+(\\d{4})$/,
        format: 'TEXT',
        parse: (m: RegExpMatchArray) => {
          const months: Record<string, string> = {
            'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
            'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
            'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
          };
          return {
            year: m[3],
            month: months[m[1]] || '01',
            day: m[2].padStart(2, '0')
          };
        }
      }
    ];

    const trimmed = text.trim();
    for (const { regex, parse } of patterns) {
      const match = trimmed.match(regex);
      if (match) {
        const { year, month, day } = parse(match);

        // Validate date
        const date = new Date(`${year}-${month}-${day}`);
        if (isNaN(date.getTime())) return null;

        return `${year}-${month}-${day}`;
      }
    }

    return null;
  }

  /**
   * Compare normalized numbers with tolerance for reconciliation
   */
  numbersMatch(num1: number | null, num2: number | null, tolerance: number = 0.02): boolean {
    if (num1 === null || num2 === null) return false;
    const delta = Math.abs(num1 - num2);
    return delta <= Math.max(tolerance * Math.max(num1, num2), 0.05);
  }

  /**
   * Normalize text for comparison (removes OCR noise)
   */
  normalizeText(text: string): string {
    return text
      .toUpperCase()
      .replace(/[^A-Z0-9\\s]/g, '') // Remove special chars
      .replace(/\\s+/g, ' ')         // Normalize whitespace
      .trim();
  }

  /**
   * Check if text exists in OCR output (with normalization)
   */
  existsInOCR(value: string | number, ocrText: string): boolean {
    if (typeof value === 'number') {
      // Try multiple number formats
      const formats = [
        value.toFixed(2),
        value.toFixed(0),
        '$' + value.toFixed(2),
        value.toFixed(2).replace('.', ','), // European
      ];
      return formats.some(f => ocrText.includes(f));
    }

    // For text, normalize both
    const normalizedValue = this.normalizeText(value);
    const normalizedOCR = this.normalizeText(ocrText);
    return normalizedOCR.includes(normalizedValue);
  }
}

// Export singleton for default locale
export const normalizer = new Normalizers();

// Export function to create locale-specific normalizer
export function createNormalizer(locale: string): Normalizers {
  return new Normalizers(locale);
}