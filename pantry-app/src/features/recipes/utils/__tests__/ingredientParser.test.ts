import { ingredientParser } from '../ingredientParser';

describe('IngredientParser', () => {
  describe('Quantity Extraction', () => {
    test('parses whole numbers', () => {
      const result = ingredientParser.parse('2 cups flour');
      expect(result.quantity).toBe(2);
      expect(result.unit).toBe('cup');
      expect(result.ingredient).toBe('flour');
    });

    test('parses decimal numbers', () => {
      const result = ingredientParser.parse('1.5 cups milk');
      expect(result.quantity).toBe(1.5);
      expect(result.unit).toBe('cup');
      expect(result.ingredient).toBe('milk');
    });

    test('parses fractions', () => {
      const result = ingredientParser.parse('1/2 cup sugar');
      expect(result.quantity).toBe(0.5);
      expect(result.unit).toBe('cup');
      expect(result.ingredient).toBe('sugar');
    });

    test('parses mixed numbers', () => {
      const result = ingredientParser.parse('1 1/2 cups flour');
      expect(result.quantity).toBe(1.5);
      expect(result.unit).toBe('cup');
      expect(result.ingredient).toBe('flour');
    });

    test('parses Unicode fractions', () => {
      const result = ingredientParser.parse('½ cup butter');
      expect(result.quantity).toBe(0.5);
      expect(result.unit).toBe('cup');
      expect(result.ingredient).toBe('butter');
    });

    test('parses mixed Unicode fractions', () => {
      const result = ingredientParser.parse('1½ tsp vanilla');
      expect(result.quantity).toBe(1.5);
      expect(result.unit).toBe('tsp');
      expect(result.ingredient).toBe('vanilla');
    });

    test('parses ranges', () => {
      const result = ingredientParser.parse('1-2 cups water');
      expect(result.quantity).toBe(1.5); // Average of range
      expect(result.unit).toBe('cup');
      expect(result.ingredient).toBe('water');
    });

    test('parses parenthetical quantities', () => {
      const result = ingredientParser.parse('2 (14.5 oz) cans tomatoes');
      expect(result.quantity).toBe(29); // 2 * 14.5
      expect(result.unit).toBe('oz');
      expect(result.ingredient).toBe('cans tomatoes');
    });
  });

  describe('Unit Normalization', () => {
    test('normalizes tablespoons', () => {
      const variations = ['tablespoon', 'tablespoons', 'tbsp', 'tbs', 'T'];
      variations.forEach(unit => {
        const result = ingredientParser.parse(`1 ${unit} oil`);
        expect(result.unit).toBe('tbsp');
      });
    });

    test('normalizes teaspoons', () => {
      const variations = ['teaspoon', 'teaspoons', 'tsp', 't'];
      variations.forEach(unit => {
        const result = ingredientParser.parse(`1 ${unit} salt`);
        expect(result.unit).toBe('tsp');
      });
    });

    test('normalizes cups', () => {
      const variations = ['cup', 'cups', 'c'];
      variations.forEach(unit => {
        const result = ingredientParser.parse(`2 ${unit} flour`);
        expect(result.unit).toBe('cup');
      });
    });

    test('normalizes pounds', () => {
      const variations = ['pound', 'pounds', 'lb', 'lbs'];
      variations.forEach(unit => {
        const result = ingredientParser.parse(`1 ${unit} chicken`);
        expect(result.unit).toBe('lb');
      });
    });
  });

  describe('Preparation Extraction', () => {
    test('extracts comma-separated preparation', () => {
      const result = ingredientParser.parse('1 large onion, diced');
      expect(result.ingredient).toBe('onion');
      expect(result.preparation).toBe('diced');
    });

    test('extracts inline preparation', () => {
      const result = ingredientParser.parse('2 cups chopped carrots');
      expect(result.ingredient).toBe('carrots');
      expect(result.preparation).toBe('chopped');
    });

    test('extracts multiple preparations', () => {
      const result = ingredientParser.parse('1 cup grated fresh parmesan');
      expect(result.ingredient).toBe('parmesan');
      expect(result.preparation).toContain('grated');
      expect(result.preparation).toContain('fresh');
    });
  });

  describe('Edge Cases', () => {
    test('handles no quantity', () => {
      const result = ingredientParser.parse('Salt to taste');
      expect(result.quantity).toBeNull();
      expect(result.unit).toBeNull();
      expect(result.ingredient).toBe('salt');
    });

    test('handles "a" or "an" as 1', () => {
      const result1 = ingredientParser.parse('a pinch of salt');
      expect(result1.quantity).toBe(1);
      expect(result1.unit).toBe('pinch');

      const result2 = ingredientParser.parse('an apple');
      expect(result2.quantity).toBe(1);
      expect(result2.unit).toBeNull();
      expect(result2.ingredient).toBe('apple');
    });

    test('handles count items without units', () => {
      const result = ingredientParser.parse('2 eggs');
      expect(result.quantity).toBe(2);
      expect(result.unit).toBeNull();
      expect(result.ingredient).toBe('eggs');
    });

    test('handles complex ingredients', () => {
      const result = ingredientParser.parse('1 (15 oz) can black beans, drained and rinsed');
      expect(result.quantity).toBe(15);
      expect(result.unit).toBe('oz');
      expect(result.ingredient).toBe('can black beans');
      expect(result.preparation).toContain('drained');
      expect(result.preparation).toContain('rinsed');
    });
  });

  describe('Colloquial Units', () => {
    test('parses pinch', () => {
      const result = ingredientParser.parse('1 pinch salt');
      expect(result.quantity).toBe(1);
      expect(result.unit).toBe('pinch');
    });

    test('parses dash', () => {
      const result = ingredientParser.parse('2 dashes hot sauce');
      expect(result.quantity).toBe(2);
      expect(result.unit).toBe('dash');
    });

    test('parses handful', () => {
      const result = ingredientParser.parse('1 handful spinach');
      expect(result.quantity).toBe(1);
      expect(result.unit).toBe('handful');
    });
  });

  describe('Confidence Scoring', () => {
    test('high confidence for complete ingredients', () => {
      const result = ingredientParser.parse('2 cups all-purpose flour');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('lower confidence for missing quantity', () => {
      const result = ingredientParser.parse('salt to taste');
      expect(result.confidence).toBeLessThan(0.8);
    });

    test('lower confidence for very long ingredients', () => {
      const result = ingredientParser.parse('some very long ingredient name that goes on and on');
      expect(result.confidence).toBeLessThan(0.9);
    });
  });

  describe('Special Characters', () => {
    test('handles various Unicode fractions', () => {
      const fractions = {
        '¼': 0.25,
        '½': 0.5,
        '¾': 0.75,
        '⅓': 0.333,
        '⅔': 0.667,
        '⅕': 0.2,
        '⅖': 0.4,
        '⅗': 0.6,
        '⅘': 0.8,
        '⅙': 0.167,
        '⅚': 0.833,
        '⅛': 0.125,
        '⅜': 0.375,
        '⅝': 0.625,
        '⅞': 0.875
      };

      Object.entries(fractions).forEach(([unicode, value]) => {
        const result = ingredientParser.parse(`${unicode} cup sugar`);
        expect(result.quantity).toBeCloseTo(value, 2);
      });
    });

    test('handles em-dash in ranges', () => {
      const result = ingredientParser.parse('2–3 tablespoons honey');
      expect(result.quantity).toBe(2.5);
      expect(result.unit).toBe('tbsp');
    });
  });
});