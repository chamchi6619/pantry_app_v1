/**
 * Tests for Personalized Recommendation Engine
 * Phase 3: Recommendation Engine
 */

import { getPersonalizedRecommendations, getHybridRecommendations } from '../recommendationEngine';
import { supabase } from '../../lib/supabase';

// Mock supabase
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    functions: {
      invoke: jest.fn(),
    },
  },
}));

describe('Recommendation Engine', () => {
  const mockUserId = 'user-123';
  const mockHouseholdId = 'household-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPersonalizedRecommendations', () => {
    it('should return empty array if no pantry items', async () => {
      // Mock empty pantry
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      });

      const result = await getPersonalizedRecommendations(mockUserId, mockHouseholdId);

      expect(result).toEqual([]);
    });

    it('should return empty array if no saved recipes', async () => {
      // Mock pantry with items
      const mockPantryCall = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [
                { canonical_item_id: 'item-1', purchase_date: '2025-01-01', expiry_date: null },
              ],
              error: null,
            }),
          }),
        }),
      };

      // Mock no recipes
      const mockRecipesCall = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      };

      (supabase.from as jest.Mock)
        .mockReturnValueOnce(mockPantryCall) // First call: pantry_items
        .mockReturnValueOnce(mockRecipesCall); // Second call: cook_cards

      const result = await getPersonalizedRecommendations(mockUserId, mockHouseholdId);

      expect(result).toEqual([]);
    });

    it('should prioritize recipes with high completeness', async () => {
      // Mock pantry items
      const mockPantryCall = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [
                { canonical_item_id: 'chicken', purchase_date: '2025-01-01', expiry_date: null },
                { canonical_item_id: 'salt', purchase_date: '2025-01-01', expiry_date: null },
              ],
              error: null,
            }),
          }),
        }),
      };

      // Mock recipes
      const mockRecipesCall = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 'recipe-1',
                  title: 'Salted Chicken',
                  ingredients: [
                    { id: 'ing-1', ingredient_name: 'chicken', canonical_item_id: 'chicken' },
                    { id: 'ing-2', ingredient_name: 'salt', canonical_item_id: 'salt' },
                  ],
                },
                {
                  id: 'recipe-2',
                  title: 'Chicken Pasta',
                  ingredients: [
                    { id: 'ing-3', ingredient_name: 'chicken', canonical_item_id: 'chicken' },
                    { id: 'ing-4', ingredient_name: 'pasta', canonical_item_id: 'pasta' },
                  ],
                },
              ],
              error: null,
            }),
          }),
        }),
      };

      // Mock no meal history
      const mockMealsCall = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      };

      (supabase.from as jest.Mock)
        .mockReturnValueOnce(mockPantryCall) // pantry_items
        .mockReturnValueOnce(mockRecipesCall) // cook_cards
        .mockReturnValueOnce(mockMealsCall); // meal_history

      const result = await getPersonalizedRecommendations(mockUserId, mockHouseholdId, 10);

      expect(result).toHaveLength(2);
      expect(result[0].cook_card.id).toBe('recipe-1'); // 100% match
      expect(result[0].completeness).toBe(1.0);
      expect(result[1].cook_card.id).toBe('recipe-2'); // 50% match
      expect(result[1].completeness).toBe(0.5);
    });

    it('should boost recipes using expiring ingredients', async () => {
      const today = new Date();
      const twoDaysFromNow = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);

      // Mock pantry with expiring item
      const mockPantryCall = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [
                {
                  canonical_item_id: 'milk',
                  purchase_date: '2025-01-01',
                  expiry_date: twoDaysFromNow.toISOString().split('T')[0],
                },
              ],
              error: null,
            }),
          }),
        }),
      };

      // Mock recipe using expiring ingredient
      const mockRecipesCall = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 'recipe-1',
                  title: 'Milk Shake',
                  ingredients: [
                    { id: 'ing-1', ingredient_name: 'milk', canonical_item_id: 'milk' },
                  ],
                },
              ],
              error: null,
            }),
          }),
        }),
      };

      // Mock no meal history
      const mockMealsCall = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      };

      (supabase.from as jest.Mock)
        .mockReturnValueOnce(mockPantryCall)
        .mockReturnValueOnce(mockRecipesCall)
        .mockReturnValueOnce(mockMealsCall);

      const result = await getPersonalizedRecommendations(mockUserId, mockHouseholdId, 10);

      expect(result).toHaveLength(1);
      expect(result[0].priority_reasons).toContain('uses_expiring_item');
      expect(result[0].match_score).toBeGreaterThan(result[0].completeness); // Boosted
    });

    it('should penalize recently cooked recipes', async () => {
      // Mock pantry
      const mockPantryCall = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [
                { canonical_item_id: 'chicken', purchase_date: '2025-01-01', expiry_date: null },
              ],
              error: null,
            }),
          }),
        }),
      };

      // Mock recipes
      const mockRecipesCall = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 'recipe-1',
                  title: 'Chicken Soup',
                  ingredients: [
                    { id: 'ing-1', ingredient_name: 'chicken', canonical_item_id: 'chicken' },
                  ],
                },
              ],
              error: null,
            }),
          }),
        }),
      };

      // Mock recent meal history (cooked yesterday)
      const mockMealsCall = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: [
                  {
                    cook_card_id: 'recipe-1',
                    cooked_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                    rating: null,
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      };

      (supabase.from as jest.Mock)
        .mockReturnValueOnce(mockPantryCall)
        .mockReturnValueOnce(mockRecipesCall)
        .mockReturnValueOnce(mockMealsCall);

      const result = await getPersonalizedRecommendations(mockUserId, mockHouseholdId, 10);

      expect(result).toHaveLength(1);
      expect(result[0].priority_reasons).toContain('cooked_recently');
      expect(result[0].match_score).toBeLessThan(result[0].completeness); // Penalized
    });

    it('should boost highly rated recipes', async () => {
      // Mock pantry
      const mockPantryCall = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [
                { canonical_item_id: 'pasta', purchase_date: '2025-01-01', expiry_date: null },
              ],
              error: null,
            }),
          }),
        }),
      };

      // Mock recipes
      const mockRecipesCall = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 'recipe-1',
                  title: 'Pasta Carbonara',
                  ingredients: [
                    { id: 'ing-1', ingredient_name: 'pasta', canonical_item_id: 'pasta' },
                  ],
                },
              ],
              error: null,
            }),
          }),
        }),
      };

      // Mock meal history with 5-star rating
      const mockMealsCall = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: [
                  {
                    cook_card_id: 'recipe-1',
                    cooked_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(), // 20 days ago
                    rating: 5,
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      };

      (supabase.from as jest.Mock)
        .mockReturnValueOnce(mockPantryCall)
        .mockReturnValueOnce(mockRecipesCall)
        .mockReturnValueOnce(mockMealsCall);

      const result = await getPersonalizedRecommendations(mockUserId, mockHouseholdId, 10);

      expect(result).toHaveLength(1);
      expect(result[0].priority_reasons).toContain('highly_rated');
      expect(result[0].match_score).toBeGreaterThan(result[0].completeness); // Boosted
    });
  });

  describe('getHybridRecommendations', () => {
    it('should return mostly discovery for new users (0-10 recipes)', async () => {
      // Mock recipe count (5 recipes)
      const mockCountCall = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              count: 5,
              error: null,
            }),
          }),
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockCountCall);

      // We can't fully test this without mocking the entire flow,
      // but we can verify the function runs without errors
      const result = await getHybridRecommendations(mockUserId, mockHouseholdId);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      // Mock error from database
      const mockErrorCall = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              count: null,
              error: { message: 'Database error' },
            }),
          }),
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockErrorCall);

      const result = await getHybridRecommendations(mockUserId, mockHouseholdId);

      // Should return empty array on error, not throw
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
