import { ParsedIngredient } from '../types';

export class IngredientParser {
  private unicodeFractions: Record<string, number> = {
    '½': 0.5, '⅓': 0.333, '⅔': 0.667,
    '¼': 0.25, '¾': 0.75, '⅕': 0.2,
    '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
    '⅙': 0.167, '⅚': 0.833,
    '⅐': 0.143, '⅛': 0.125, '⅜': 0.375,
    '⅝': 0.625, '⅞': 0.875, '⅑': 0.111, '⅒': 0.1
  };

  private commonUnits = [
    'cup', 'cups', 'c',
    'tablespoon', 'tablespoons', 'tbsp', 'tbs', 'T',
    'teaspoon', 'teaspoons', 'tsp', 't',
    'ounce', 'ounces', 'oz',
    'pound', 'pounds', 'lb', 'lbs',
    'gram', 'grams', 'g',
    'kilogram', 'kilograms', 'kg',
    'milliliter', 'milliliters', 'ml',
    'liter', 'liters', 'l',
    'quart', 'quarts', 'qt',
    'pint', 'pints', 'pt',
    'gallon', 'gallons', 'gal',
    'fluid ounce', 'fluid ounces', 'fl oz',
    'pinch', 'pinches',
    'dash', 'dashes',
    'handful', 'handfuls',
    'clove', 'cloves',
    'piece', 'pieces',
    'slice', 'slices',
    'can', 'cans',
    'package', 'packages', 'pkg',
    'jar', 'jars',
    'bottle', 'bottles',
    'bunch', 'bunches',
    'head', 'heads',
    'stalk', 'stalks',
    'stick', 'sticks',
    'sprig', 'sprigs'
  ];

  private preparationTerms = [
    'chopped', 'diced', 'minced', 'sliced', 'grated',
    'shredded', 'crushed', 'ground', 'melted', 'softened',
    'cubed', 'julienned', 'halved', 'quartered', 'peeled',
    'trimmed', 'drained', 'rinsed', 'packed', 'sifted',
    'room temperature', 'cold', 'warm', 'cooled', 'chilled',
    'frozen', 'thawed', 'toasted', 'roasted', 'cooked',
    'uncooked', 'raw', 'fresh', 'dried', 'canned',
    'finely chopped', 'coarsely chopped', 'roughly chopped',
    'thinly sliced', 'thickly sliced'
  ];

  parse(line: string): ParsedIngredient {
    const original = line;
    let workingLine = line.toLowerCase().trim();

    let quantity: number | null = null;
    let unit: string | null = null;
    let ingredient = '';
    let preparation: string | undefined;
    let confidence = 1.0;

    try {
      const extractedPrep = this.extractPreparation(workingLine);
      preparation = extractedPrep.preparation;
      workingLine = extractedPrep.cleaned;

      const quantityResult = this.extractQuantity(workingLine);
      quantity = quantityResult.quantity;
      workingLine = quantityResult.remaining;

      const unitResult = this.extractUnit(workingLine);
      unit = unitResult.unit;
      workingLine = unitResult.remaining;

      ingredient = this.cleanIngredient(workingLine);

      confidence = this.calculateConfidence(quantity, unit, ingredient);

    } catch (error) {
      ingredient = this.cleanIngredient(workingLine);
      confidence = 0.3;
    }

    return {
      quantity,
      unit,
      ingredient,
      preparation,
      original,
      confidence
    };
  }

  private extractQuantity(line: string): { quantity: number | null; remaining: string } {
    for (const [unicode, value] of Object.entries(this.unicodeFractions)) {
      if (line.includes(unicode)) {
        const beforeUnicode = line.substring(0, line.indexOf(unicode)).trim();
        const wholeMatch = beforeUnicode.match(/(\d+)\s*$/);
        const wholeNumber = wholeMatch ? parseInt(wholeMatch[1]) : 0;

        const quantity = wholeNumber + value;
        const remaining = line.substring(line.indexOf(unicode) + 1).trim();
        return { quantity, remaining };
      }
    }

    const rangePattern = /^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s+/;
    const rangeMatch = line.match(rangePattern);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1]);
      const max = parseFloat(rangeMatch[2]);
      const quantity = (min + max) / 2;
      const remaining = line.substring(rangeMatch[0].length).trim();
      return { quantity, remaining };
    }

    const mixedNumberPattern = /^(\d+)\s+(\d+)\s*\/\s*(\d+)\s+/;
    const mixedMatch = line.match(mixedNumberPattern);
    if (mixedMatch) {
      const whole = parseInt(mixedMatch[1]);
      const numerator = parseInt(mixedMatch[2]);
      const denominator = parseInt(mixedMatch[3]);
      const quantity = whole + (numerator / denominator);
      const remaining = line.substring(mixedMatch[0].length).trim();
      return { quantity, remaining };
    }

    const fractionPattern = /^(\d+)\s*\/\s*(\d+)\s+/;
    const fractionMatch = line.match(fractionPattern);
    if (fractionMatch) {
      const numerator = parseInt(fractionMatch[1]);
      const denominator = parseInt(fractionMatch[2]);
      const quantity = numerator / denominator;
      const remaining = line.substring(fractionMatch[0].length).trim();
      return { quantity, remaining };
    }

    const decimalPattern = /^(\d+(?:\.\d+)?)\s+/;
    const decimalMatch = line.match(decimalPattern);
    if (decimalMatch) {
      const quantity = parseFloat(decimalMatch[1]);
      const remaining = line.substring(decimalMatch[0].length).trim();
      return { quantity, remaining };
    }

    const parentheticalPattern = /^(\d+)\s*\(([^)]+)\)\s*/;
    const parenMatch = line.match(parentheticalPattern);
    if (parenMatch) {
      const count = parseInt(parenMatch[1]);
      const innerContent = parenMatch[2];
      const innerQuantity = this.extractQuantity(innerContent + ' ');

      if (innerQuantity.quantity) {
        const quantity = count * innerQuantity.quantity;
        const remaining = line.substring(parenMatch[0].length).trim();
        return { quantity, remaining };
      }
    }

    if (line.match(/^(a|an|one)\s+/i)) {
      const remaining = line.replace(/^(a|an|one)\s+/i, '').trim();
      return { quantity: 1, remaining };
    }

    return { quantity: null, remaining: line };
  }

  private extractUnit(line: string): { unit: string | null; remaining: string } {
    const sortedUnits = [...this.commonUnits].sort((a, b) => b.length - a.length);

    for (const unit of sortedUnits) {
      const pattern = new RegExp(`^${this.escapeRegex(unit)}\\s+`, 'i');
      const match = line.match(pattern);
      if (match) {
        return {
          unit: this.normalizeUnit(unit),
          remaining: line.substring(match[0].length).trim()
        };
      }
    }

    const sizePattern = /^(small|medium|large|extra large|xl)\s+/i;
    const sizeMatch = line.match(sizePattern);
    if (sizeMatch) {
      return {
        unit: null,
        remaining: line
      };
    }

    return { unit: null, remaining: line };
  }

  private extractPreparation(line: string): { preparation?: string; cleaned: string } {
    const preparations: string[] = [];
    let cleaned = line;

    const commaMatch = line.match(/,\s*(.+)$/);
    if (commaMatch) {
      const possiblePrep = commaMatch[1].toLowerCase();
      for (const term of this.preparationTerms) {
        if (possiblePrep.includes(term)) {
          preparations.push(possiblePrep.trim());
          cleaned = line.substring(0, line.indexOf(',')).trim();
          break;
        }
      }
    }

    for (const term of this.preparationTerms) {
      const pattern = new RegExp(`\\b${this.escapeRegex(term)}\\b`, 'gi');
      if (cleaned.match(pattern)) {
        if (!preparations.includes(term)) {
          preparations.push(term);
        }
        cleaned = cleaned.replace(pattern, '').trim();
      }
    }

    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return {
      preparation: preparations.length > 0 ? preparations.join(', ') : undefined,
      cleaned
    };
  }

  private cleanIngredient(text: string): string {
    let cleaned = text
      .replace(/^\s*of\s+/i, '')
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/[,.]$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    const unnecessaryWords = ['of', 'the', 'or', 'to taste', 'as needed', 'optional'];
    for (const word of unnecessaryWords) {
      const pattern = new RegExp(`\\b${word}\\b`, 'gi');
      cleaned = cleaned.replace(pattern, '').trim();
    }

    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned || text.trim();
  }

  private normalizeUnit(unit: string): string {
    const normalizations: Record<string, string> = {
      'tablespoons': 'tbsp',
      'tablespoon': 'tbsp',
      'tbs': 'tbsp',
      'T': 'tbsp',
      'teaspoons': 'tsp',
      'teaspoon': 'tsp',
      't': 'tsp',
      'cups': 'cup',
      'c': 'cup',
      'ounces': 'oz',
      'ounce': 'oz',
      'pounds': 'lb',
      'pound': 'lb',
      'lbs': 'lb',
      'grams': 'g',
      'gram': 'g',
      'kilograms': 'kg',
      'kilogram': 'kg',
      'milliliters': 'ml',
      'milliliter': 'ml',
      'liters': 'L',
      'liter': 'L',
      'l': 'L',
      'quarts': 'qt',
      'quart': 'qt',
      'pints': 'pt',
      'pint': 'pt',
      'gallons': 'gal',
      'gallon': 'gal',
      'fluid ounces': 'fl oz',
      'fluid ounce': 'fl oz',
      'cloves': 'clove',
      'pieces': 'piece',
      'slices': 'slice',
      'cans': 'can',
      'packages': 'package',
      'pkg': 'package',
      'jars': 'jar',
      'bottles': 'bottle',
      'bunches': 'bunch',
      'heads': 'head',
      'stalks': 'stalk',
      'sticks': 'stick',
      'sprigs': 'sprig',
      'pinches': 'pinch',
      'dashes': 'dash',
      'handfuls': 'handful'
    };

    return normalizations[unit.toLowerCase()] || unit.toLowerCase();
  }

  private calculateConfidence(quantity: number | null, unit: string | null, ingredient: string): number {
    let confidence = 1.0;

    if (quantity === null) {
      confidence -= 0.2;
    }

    if (unit === null && quantity !== null) {
      confidence -= 0.1;
    }

    if (!ingredient || ingredient.length < 2) {
      confidence -= 0.3;
    }

    if (ingredient.split(' ').length > 5) {
      confidence -= 0.1;
    }

    return Math.max(0.1, confidence);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export const ingredientParser = new IngredientParser();