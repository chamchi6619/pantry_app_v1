import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
  optional?: boolean;
}

export interface Recipe {
  id: string;
  title: string;
  servings: string;
  prepTime?: string;
  cookTime?: string;
  totalTime: string;
  ingredients: RecipeIngredient[];
  instructions: string[];
  tags: string[];
  imageUrl?: string;
  notes?: string;
  isFavorite: boolean;
  lastMade?: string;
  createdAt: string;
  updatedAt: string;
}

interface RecipeMatch {
  recipe: Recipe;
  matchPercent: number;
  haveIngredients: string[];
  missingIngredients: string[];
}

interface RecipeState {
  recipes: Recipe[];
  searchQuery: string;
  selectedTags: string[];

  // Actions
  addRecipe: (recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt' | 'isFavorite'>) => void;
  updateRecipe: (id: string, updates: Partial<Recipe>) => void;
  deleteRecipe: (id: string) => void;
  toggleFavorite: (id: string) => void;
  markAsMade: (id: string) => void;
  setSearchQuery: (query: string) => void;
  setSelectedTags: (tags: string[]) => void;

  // Computed
  getFilteredRecipes: () => Recipe[];
  getRecipeById: (id: string) => Recipe | undefined;
  getFavoriteRecipes: () => Recipe[];
  getAllTags: () => string[];
  getRecipeMatches: (inventoryItems: string[]) => RecipeMatch[];
  getUseItUpRecipes: (expiringItems: string[]) => RecipeMatch[];
}

export const useRecipeStore = create<RecipeState>()(
  persist(
    (set, get) => ({
      recipes: [
        // Pre-populated with sample recipes
        {
          id: '1',
          title: 'Quick Lettuce Wraps',
          servings: '2-3',
          totalTime: '15min',
          ingredients: [
            { name: 'Lettuce', quantity: 1, unit: 'head' },
            { name: 'Ground Chicken', quantity: 1, unit: 'lb' },
            { name: 'Soy Sauce', quantity: 2, unit: 'tbsp' },
            { name: 'Garlic', quantity: 2, unit: 'cloves' },
            { name: 'Ginger', quantity: 1, unit: 'tsp' },
          ],
          instructions: [
            'Cook ground chicken in a pan until browned',
            'Add garlic and ginger, cook for 1 minute',
            'Add soy sauce and stir',
            'Separate lettuce leaves',
            'Fill lettuce cups with chicken mixture',
          ],
          tags: ['Asian', 'Light', 'Quick'],
          isFavorite: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '2',
          title: 'Carrot Ginger Soup',
          servings: '4',
          totalTime: '25min',
          ingredients: [
            { name: 'Carrots', quantity: 2, unit: 'lb' },
            { name: 'Ginger', quantity: 2, unit: 'tbsp' },
            { name: 'Onion', quantity: 1, unit: 'medium' },
            { name: 'Vegetable Broth', quantity: 4, unit: 'cups' },
            { name: 'Coconut Milk', quantity: 1, unit: 'cup', optional: true },
          ],
          instructions: [
            'Chop carrots and onion',
            'Sauté onion until soft',
            'Add carrots and ginger, cook for 5 minutes',
            'Add broth and simmer for 15 minutes',
            'Blend until smooth',
            'Stir in coconut milk if using',
          ],
          tags: ['Vegetarian', 'Healthy', 'Soup'],
          isFavorite: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '3',
          title: 'Classic Pasta',
          servings: '4',
          totalTime: '20min',
          ingredients: [
            { name: 'Pasta', quantity: 1, unit: 'lb' },
            { name: 'Tomato Sauce', quantity: 2, unit: 'cups' },
            { name: 'Garlic', quantity: 3, unit: 'cloves' },
            { name: 'Basil', quantity: 0.5, unit: 'cup' },
            { name: 'Parmesan', quantity: 0.5, unit: 'cup' },
          ],
          instructions: [
            'Boil water and cook pasta according to package',
            'Heat tomato sauce with garlic',
            'Drain pasta and mix with sauce',
            'Top with basil and parmesan',
          ],
          tags: ['Italian', 'Classic', 'Easy'],
          isFavorite: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      searchQuery: '',
      selectedTags: [],

      addRecipe: (recipeData) => {
        const newRecipe: Recipe = {
          ...recipeData,
          id: Date.now().toString(),
          isFavorite: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          recipes: [...state.recipes, newRecipe],
        }));
      },

      updateRecipe: (id, updates) => {
        set((state) => ({
          recipes: state.recipes.map((recipe) =>
            recipe.id === id
              ? { ...recipe, ...updates, updatedAt: new Date().toISOString() }
              : recipe
          ),
        }));
      },

      deleteRecipe: (id) => {
        set((state) => ({
          recipes: state.recipes.filter((recipe) => recipe.id !== id),
        }));
      },

      toggleFavorite: (id) => {
        set((state) => ({
          recipes: state.recipes.map((recipe) =>
            recipe.id === id
              ? { ...recipe, isFavorite: !recipe.isFavorite }
              : recipe
          ),
        }));
      },

      markAsMade: (id) => {
        set((state) => ({
          recipes: state.recipes.map((recipe) =>
            recipe.id === id
              ? { ...recipe, lastMade: new Date().toISOString() }
              : recipe
          ),
        }));
      },

      setSearchQuery: (query) => set({ searchQuery: query }),
      setSelectedTags: (tags) => set({ selectedTags: tags }),

      getFilteredRecipes: () => {
        const state = get();
        let filtered = [...state.recipes];

        // Apply search filter
        if (state.searchQuery) {
          const query = state.searchQuery.toLowerCase();
          filtered = filtered.filter(
            (recipe) =>
              recipe.title.toLowerCase().includes(query) ||
              recipe.ingredients.some((ing) =>
                ing.name.toLowerCase().includes(query)
              ) ||
              recipe.tags.some((tag) => tag.toLowerCase().includes(query))
          );
        }

        // Apply tag filter
        if (state.selectedTags.length > 0) {
          filtered = filtered.filter((recipe) =>
            state.selectedTags.some((tag) => recipe.tags.includes(tag))
          );
        }

        return filtered;
      },

      getRecipeById: (id) => {
        return get().recipes.find((recipe) => recipe.id === id);
      },

      getFavoriteRecipes: () => {
        return get().recipes.filter((recipe) => recipe.isFavorite);
      },

      getAllTags: () => {
        const tags = new Set<string>();
        get().recipes.forEach((recipe) => {
          recipe.tags.forEach((tag) => tags.add(tag));
        });
        return Array.from(tags).sort();
      },

      getRecipeMatches: (inventoryItems) => {
        const recipes = get().recipes;
        const itemsLower = inventoryItems.map((item) => item.toLowerCase());

        return recipes
          .map((recipe) => {
            const requiredIngredients = recipe.ingredients.filter(
              (ing) => !ing.optional
            );
            const haveIngredients = requiredIngredients.filter((ing) =>
              itemsLower.some((item) => item.includes(ing.name.toLowerCase()))
            );
            const missingIngredients = requiredIngredients.filter(
              (ing) =>
                !itemsLower.some((item) => item.includes(ing.name.toLowerCase()))
            );

            const matchPercent = Math.round(
              (haveIngredients.length / requiredIngredients.length) * 100
            );

            return {
              recipe,
              matchPercent,
              haveIngredients: haveIngredients.map((ing) => ing.name),
              missingIngredients: missingIngredients.map((ing) => ing.name),
            };
          })
          .sort((a, b) => b.matchPercent - a.matchPercent);
      },

      getUseItUpRecipes: (expiringItems) => {
        const recipes = get().recipes;
        const itemsLower = expiringItems.map((item) => item.toLowerCase());

        return recipes
          .map((recipe) => {
            const usesExpiringItems = recipe.ingredients.filter((ing) =>
              itemsLower.some((item) => item.includes(ing.name.toLowerCase()))
            );

            if (usesExpiringItems.length === 0) {
              return null;
            }

            const requiredIngredients = recipe.ingredients.filter(
              (ing) => !ing.optional
            );
            const matchPercent = Math.round(
              (usesExpiringItems.length / requiredIngredients.length) * 100
            );

            return {
              recipe,
              matchPercent,
              haveIngredients: usesExpiringItems.map((ing) => ing.name),
              missingIngredients: [],
            };
          })
          .filter((match): match is RecipeMatch => match !== null)
          .sort((a, b) => b.haveIngredients.length - a.haveIngredients.length);
      },
    }),
    {
      name: 'pantry-recipes-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);