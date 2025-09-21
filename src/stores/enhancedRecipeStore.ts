import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Recipe,
  RecipeScore,
  RecipeIngredient,
  InventoryItem as RecipeInventoryItem
} from '../features/recipes/types';
import { recipeScorer } from '../features/recipes/utils/recipeScorer';
import { recipeMatchCache } from '../features/recipes/utils/recipeMatchCache';
import { ingredientParser } from '../features/recipes/utils/ingredientParser';
import { ingredientMatcher } from '../features/recipes/utils/ingredientMatcher';
import recipeConfig from '../features/recipes/config/recipeConfig.json';
import { InventoryItem } from './inventoryStore';
import { sampleRecipes } from '../features/recipes/data/sampleRecipes';

// Convert old RecipeIngredient format to new format
function convertToNewIngredientFormat(
  oldIngredient: { name: string; quantity: number; unit: string; optional?: boolean },
  index: number
): RecipeIngredient {
  const recipeText = `${oldIngredient.quantity} ${oldIngredient.unit} ${oldIngredient.name}`;
  const parsed = ingredientParser.parse(recipeText);

  return {
    id: `ing-${index}`,
    recipeText,
    parsed,
    requiredQuantity: oldIngredient.quantity,
    requiredUnit: oldIngredient.unit
  };
}

// Convert inventory item to recipe system format
function convertInventoryItem(item: InventoryItem): RecipeInventoryItem {
  // Try to find canonical ID for the item
  const matchResult = ingredientMatcher.match(item.name, item.name);

  return {
    id: item.id,
    name: item.name,
    canonicalId: matchResult.canonicalId || undefined,
    quantity: item.quantity || 0,
    unit: item.unit || 'piece',
    expirationDate: item.expirationDate ? new Date(item.expirationDate) : undefined,
    category: item.category,
    location: item.location
  };
}

interface EnhancedRecipeState {
  recipes: Recipe[];
  searchQuery: string;
  selectedTags: string[];
  scoreCache: Map<string, RecipeScore>;

  // Actions
  addRecipe: (recipe: Omit<Recipe, 'id'>) => void;
  updateRecipe: (id: string, updates: Partial<Recipe>) => void;
  deleteRecipe: (id: string) => void;
  setSearchQuery: (query: string) => void;
  setSelectedTags: (tags: string[]) => void;

  // Enhanced matching functions
  getRecipeScores: (inventory: InventoryItem[]) => RecipeScore[];
  getExpiringRecipes: (inventory: InventoryItem[], daysAhead?: number) => RecipeScore[];
  getRecipesByMatchPercentage: (inventory: InventoryItem[], minMatch?: number) => RecipeScore[];
  getRecipeById: (id: string) => Recipe | undefined;
  getAllTags: () => string[];
  clearScoreCache: () => void;

  // Shopping list integration
  getMissingIngredientsForRecipe: (recipeId: string, inventory: InventoryItem[]) => string[];
}

// Use imported sample recipes directly

export const useEnhancedRecipeStore = create<EnhancedRecipeState>()(
  persist(
    (set, get) => ({
      recipes: sampleRecipes,
      searchQuery: '',
      selectedTags: [],
      scoreCache: new Map(),

      addRecipe: (recipeData) => {
        const newRecipe: Recipe = {
          ...recipeData,
          id: Date.now().toString()
        };

        set((state) => ({
          recipes: [...state.recipes, newRecipe],
          scoreCache: new Map() // Clear cache when recipes change
        }));
      },

      updateRecipe: (id, updates) => {
        set((state) => ({
          recipes: state.recipes.map((recipe) =>
            recipe.id === id ? { ...recipe, ...updates } : recipe
          ),
          scoreCache: new Map() // Clear cache when recipes change
        }));

        // Invalidate cache for this recipe
        recipeMatchCache.invalidateRecipe(id);
      },

      deleteRecipe: (id) => {
        set((state) => ({
          recipes: state.recipes.filter((recipe) => recipe.id !== id),
          scoreCache: new Map()
        }));

        // Invalidate cache for this recipe
        recipeMatchCache.invalidateRecipe(id);
      },

      setSearchQuery: (query) => set({ searchQuery: query }),
      setSelectedTags: (tags) => set({ selectedTags: tags }),

      getRecipeScores: (inventory) => {
        const state = get();
        const convertedInventory = inventory.map(convertInventoryItem);

        // Check cache first
        const cachedScores: RecipeScore[] = [];
        const recipesToScore: Recipe[] = [];

        for (const recipe of state.recipes) {
          const cached = recipeMatchCache.get(recipe.id, convertedInventory);
          if (cached) {
            cachedScores.push(cached);
          } else {
            recipesToScore.push(recipe);
          }
        }

        // Score uncached recipes
        const newScores = recipeScorer.scoreRecipes(recipesToScore, convertedInventory);

        // Cache the new scores
        recipeMatchCache.setBatch(newScores, convertedInventory);

        // Combine and sort all scores
        const allScores = [...cachedScores, ...newScores];
        return allScores.sort((a, b) => b.totalScore - a.totalScore);
      },

      getExpiringRecipes: (inventory, daysAhead = 7) => {
        const convertedInventory = inventory.map(convertInventoryItem);
        const expiringInventory = convertedInventory.filter(item => {
          if (!item.expirationDate) return false;
          const daysUntil = Math.ceil(
            (item.expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          return daysUntil <= daysAhead;
        });

        const state = get();
        const scores = recipeScorer.getExpiringRecipes(state.recipes, expiringInventory);
        return scores;
      },

      getRecipesByMatchPercentage: (inventory, minMatch = 50) => {
        const convertedInventory = inventory.map(convertInventoryItem);
        const state = get();
        const scores = recipeScorer.getMatchingRecipes(
          state.recipes,
          convertedInventory,
          minMatch
        );
        return scores;
      },

      getRecipeById: (id) => {
        return get().recipes.find((recipe) => recipe.id === id);
      },

      getAllTags: () => {
        const tags = new Set<string>();
        get().recipes.forEach((recipe) => {
          recipe.tags.forEach((tag) => tags.add(tag));
        });
        return Array.from(tags).sort();
      },

      clearScoreCache: () => {
        set({ scoreCache: new Map() });
        recipeMatchCache.clear();
      },

      getMissingIngredientsForRecipe: (recipeId, inventory) => {
        const recipe = get().recipes.find(r => r.id === recipeId);
        if (!recipe) return [];

        const convertedInventory = inventory.map(convertInventoryItem);
        const score = recipeScorer.scoreRecipe(recipe, convertedInventory);
        return score.missingIngredients;
      }
    }),
    {
      name: 'enhanced-recipe-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        recipes: state.recipes,
        searchQuery: state.searchQuery,
        selectedTags: state.selectedTags
      })
    }
  )
);