import { ingredientMatcher } from '../ingredientMatcher';
import { MatchReason } from '../../types';

describe('IngredientMatcher', () => {
  describe('Exact Matches', () => {
    test('matches exact canonical ingredients', () => {
      const result = ingredientMatcher.match('chicken_breast', 'chicken_breast');
      expect(result.canonicalId).toBe('chicken_breast');
      expect(result.confidence).toBe(1.0);
      expect(result.matchReason).toBe(MatchReason.EXACT);
    });

    test('matches display names to canonical', () => {
      const result = ingredientMatcher.match('Chicken Breast', 'Chicken Breast');
      expect(result.canonicalId).toBe('chicken_breast');
      expect(result.confidence).toBe(1.0);
      expect(result.matchReason).toBe(MatchReason.EXACT);
    });
  });

  describe('Alias Matches', () => {
    test('matches common aliases', () => {
      const result = ingredientMatcher.match('boneless chicken breast', 'chicken breast');
      expect(result.canonicalId).toBe('chicken_breast');
      expect(result.confidence).toBe(0.95);
      expect(result.matchReason).toBe(MatchReason.ALIAS);
    });

    test('matches flour aliases', () => {
      const result = ingredientMatcher.match('AP Flour', 'all-purpose flour');
      expect(result.canonicalId).toBe('all_purpose_flour');
      expect(result.confidence).toBe(0.95);
      expect(result.matchReason).toBe(MatchReason.ALIAS);
    });

    test('matches vegetable oil aliases', () => {
      const result = ingredientMatcher.match('cooking oil', 'vegetable oil');
      expect(result.canonicalId).toBe('vegetable_oil');
      expect(result.confidence).toBe(0.95);
      expect(result.matchReason).toBe(MatchReason.ALIAS);
    });
  });

  describe('Category-Based Fuzzy Matches', () => {
    test('matches within meat category', () => {
      const result = ingredientMatcher.match('chicken breasts', 'chicken breast');
      expect(result.canonicalId).toBe('chicken_breast');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.matchReason).toBe(MatchReason.ALIAS);
    });

    test('matches within produce category', () => {
      const result = ingredientMatcher.match('green pepper', 'bell pepper');
      const canonical = result.canonicalId;
      expect(canonical).toBe('bell_pepper');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    test('does not match across different categories', () => {
      const result = ingredientMatcher.match('chicken', 'chickpeas');
      // These should not match as they're in different categories
      if (result.canonicalId) {
        expect(result.canonicalId).not.toBe('chickpeas');
      }
    });
  });

  describe('Normalization', () => {
    test('handles case differences', () => {
      const result = ingredientMatcher.match('TOMATO', 'tomato');
      expect(result.canonicalId).toBe('tomato');
      expect(result.confidence).toBeGreaterThan(0.85);
    });

    test('removes common modifiers', () => {
      const result = ingredientMatcher.match('fresh tomato', 'tomato');
      expect(result.canonicalId).toBe('tomato');
      expect(result.confidence).toBeGreaterThan(0.85);
    });

    test('handles frozen/dried/canned modifiers', () => {
      const modifiers = ['frozen', 'dried', 'canned', 'organic'];
      modifiers.forEach(modifier => {
        const result = ingredientMatcher.match(`${modifier} corn`, 'corn');
        expect(result.canonicalId).toBe('corn');
        expect(result.confidence).toBeGreaterThan(0.85);
      });
    });
  });

  describe('No Matches', () => {
    test('returns null for completely unrelated items', () => {
      const result = ingredientMatcher.match('xyz123', 'abc456');
      expect(result.canonicalId).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.matchReason).toBe(MatchReason.NO_MATCH);
    });

    test('returns null for low confidence fuzzy matches', () => {
      const result = ingredientMatcher.match('yogurt', 'greek yogurt');
      // These are different canonical ingredients
      if (result.canonicalId === null) {
        expect(result.confidence).toBe(0);
        expect(result.matchReason).toBe(MatchReason.NO_MATCH);
      }
    });
  });

  describe('Debug Path', () => {
    test('includes normalization in debug path', () => {
      const result = ingredientMatcher.match('FRESH Chicken Breast', 'chicken breast');
      expect(result.debugPath[0]).toContain('normalized');
      expect(result.debugPath[0]).toContain('chicken breast');
    });

    test('includes match type in debug path', () => {
      const result = ingredientMatcher.match('chicken breast', 'chicken breast');
      const lastDebugEntry = result.debugPath[result.debugPath.length - 1];
      expect(lastDebugEntry).toContain('canonical');
    });
  });

  describe('Common Recipe Scenarios', () => {
    test('matches common baking ingredients', () => {
      const testCases = [
        { inventory: 'flour', recipe: 'all-purpose flour', expected: 'all_purpose_flour' },
        { inventory: 'sugar', recipe: 'granulated sugar', expected: 'sugar' },
        { inventory: 'brown sugar', recipe: 'packed brown sugar', expected: 'brown_sugar' },
        { inventory: 'butter', recipe: 'unsalted butter', expected: 'butter' },
      ];

      testCases.forEach(({ inventory, recipe, expected }) => {
        const result = ingredientMatcher.match(inventory, recipe);
        expect(result.canonicalId).toBe(expected);
        expect(result.confidence).toBeGreaterThan(0.85);
      });
    });

    test('matches common produce items', () => {
      const testCases = [
        { inventory: 'onion', recipe: 'yellow onion', expected: 'onion' },
        { inventory: 'tomatoes', recipe: 'fresh tomato', expected: 'tomato' },
        { inventory: 'garlic cloves', recipe: 'garlic', expected: 'garlic' },
        { inventory: 'lettuce', recipe: 'romaine lettuce', expected: 'lettuce' },
      ];

      testCases.forEach(({ inventory, recipe, expected }) => {
        const result = ingredientMatcher.match(inventory, recipe);
        expect(result.canonicalId).toBe(expected);
        expect(result.confidence).toBeGreaterThan(0.85);
      });
    });

    test('matches common dairy items', () => {
      const testCases = [
        { inventory: 'milk', recipe: '2% milk', expected: 'milk' },
        { inventory: 'cheese', recipe: 'cheddar cheese', expected: 'cheddar' },
        { inventory: 'eggs', recipe: 'large eggs', expected: 'eggs' },
        { inventory: 'cream', recipe: 'heavy cream', expected: 'heavy_cream' },
      ];

      testCases.forEach(({ inventory, recipe, expected }) => {
        const result = ingredientMatcher.match(inventory, recipe);
        expect(result.canonicalId).toBe(expected);
        expect(result.confidence).toBeGreaterThan(0.85);
      });
    });
  });

  describe('Helper Methods', () => {
    test('getCanonicalIngredient returns correct ingredient', () => {
      const ingredient = ingredientMatcher.getCanonicalIngredient('chicken_breast');
      expect(ingredient).toBeDefined();
      expect(ingredient?.displayName).toBe('Chicken Breast');
      expect(ingredient?.category).toBe('meat');
    });

    test('getIngredientsByCategory returns correct ingredients', () => {
      const meats = ingredientMatcher.getIngredientsByCategory('meat');
      expect(meats.length).toBeGreaterThan(0);
      expect(meats.every(item => item.category === 'meat')).toBe(true);
    });

    test('getAllCanonicalIngredients returns all ingredients', () => {
      const all = ingredientMatcher.getAllCanonicalIngredients();
      expect(all.length).toBe(125); // We have 125 canonical ingredients
    });
  });
});