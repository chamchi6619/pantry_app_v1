import { create } from 'zustand';
import { InteractionManager } from 'react-native';
import { normalizeName } from '../features/recipes/utils/normalizer';
import { matchIngredientToInventory } from '../features/recipes/utils/simpleMatcher';
import type { Recipe } from '../features/recipes/types';
import type { InventoryItem } from './inventoryStore';

export interface MatchResult {
  pct: number;
  hasExpiring: boolean;
}

interface MatchJobState {
  // Job tracking
  jobId: string | null;
  status: 'idle' | 'running' | 'completed' | 'cancelled';
  progress: { total: number; done: number };
  results: Record<string, MatchResult>;
  invVersion: number;

  // Actions
  startJob: (recipes: Recipe[], inventory: InventoryItem[], invVersion: number) => Promise<void>;
  cancelJob: () => void;
  clearResults: () => void;
  getResult: (recipeId: string) => MatchResult | undefined;
}

// Chunk array into smaller batches
const chunk = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

// Generate unique job ID
const generateJobId = () => `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const useMatchJobStore = create<MatchJobState>((set, get) => ({
  jobId: null,
  status: 'idle',
  progress: { total: 0, done: 0 },
  results: {},
  invVersion: 0,

  startJob: async (recipes, inventory, invVersion) => {
    // Cancel any existing job
    get().cancelJob();

    console.log('Starting match job with:', {
      recipeCount: recipes.length,
      inventoryCount: inventory.length,
      invVersion
    });

    // Initialize new job
    const jobId = generateJobId();
    set({
      jobId,
      status: 'running',
      progress: { total: recipes.length, done: 0 },
      results: {},
      invVersion,
    });

    // Pre-compute normalized inventory for faster matching
    const inventoryNorms = inventory.map(item =>
      item.normalized || normalizeName(item.name)
    );

    console.log('Normalized inventory items:', inventoryNorms);

    // Create map of expiring inventory items
    const expiringInventory = new Map<string, boolean>();
    const now = Date.now();
    inventory.forEach(item => {
      const normalized = item.normalized || normalizeName(item.name);
      if (item.expirationDate) {
        const daysUntilExpiry = Math.ceil(
          (new Date(item.expirationDate).getTime() - now) / (1000 * 60 * 60 * 24)
        );
        expiringInventory.set(normalized, daysUntilExpiry <= 7 && daysUntilExpiry > 0);
      } else {
        expiringInventory.set(normalized, false);
      }
    });

    // Helper to process a batch of recipes
    const processBatch = async (batch: Recipe[]) => {
      const batchResults: Record<string, MatchResult> = {};

      for (const recipe of batch) {
        // Skip recipes without ingredients
        if (!recipe || !recipe.ingredients || !Array.isArray(recipe.ingredients)) {
          console.log(`\nSkipping recipe without ingredients: ${recipe?.name || 'Unknown'}`);
          batchResults[`${recipe?.id || 'unknown'}|${invVersion}`] = { pct: 0, hasExpiring: false };
          continue;
        }

        let matchCount = 0;
        let hasExpiring = false;
        const totalIngredients = recipe.ingredients.length;

        console.log(`\nMatching recipe: ${recipe.name}`);

        // Match each ingredient
        for (const ing of recipe.ingredients) {
          const ingNorm = normalizeName(ing.parsed?.ingredient || ing.recipeText);
          const match = matchIngredientToInventory(ingNorm, inventoryNorms);

          console.log(`  Ingredient: "${ingNorm}" -> ${match.isAvailable ? 'FOUND' : 'NOT FOUND'} (${match.reason})`);

          if (match.isAvailable) {
            matchCount++;
            // Check if any matching inventory item is expiring
            for (const invNorm of inventoryNorms) {
              if ((ingNorm === invNorm || ingNorm.includes(invNorm) || invNorm.includes(ingNorm)) &&
                  expiringInventory.get(invNorm)) {
                hasExpiring = true;
                break;
              }
            }
          }
        }

        const pct = totalIngredients > 0
          ? Math.round((matchCount / totalIngredients) * 100)
          : 0;

        console.log(`  Result: ${matchCount}/${totalIngredients} = ${pct}%${hasExpiring ? ' (has expiring)' : ''}`);

        batchResults[`${recipe.id}|${invVersion}`] = { pct, hasExpiring };

        // Update progress after each recipe (not just after batch)
        set(state => ({
          results: { ...state.results, ...batchResults },
          progress: { ...state.progress, done: state.progress.done + 1 },
        }));

        // Add artificial delay to make computation visible (remove in production)
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms per recipe
      }

      return batchResults;
    };

    // Process recipes in phases
    try {
      // Phase 1: First 10 recipes (visible) - immediate
      const visible = recipes.slice(0, 10);
      if (visible.length > 0) {
        await processBatch(visible);

        // Check if job was cancelled
        if (get().jobId !== jobId || get().status === 'cancelled') return;
      }

      // Phase 2: Next 10 recipes - after interactions
      const nextBatch = recipes.slice(10, 20);
      if (nextBatch.length > 0) {
        // Wait for interactions to complete
        await new Promise(resolve => {
          InteractionManager.runAfterInteractions(() => resolve(null));
        });

        // Check if cancelled
        if (get().jobId !== jobId || get().status === 'cancelled') return;

        await processBatch(nextBatch);

        if (get().jobId !== jobId || get().status === 'cancelled') return;
      }

      // Phase 3: Remaining recipes in chunks
      const remaining = recipes.slice(20);
      const chunks = chunk(remaining, 5); // Smaller chunks for responsiveness

      for (const batch of chunks) {
        // Yield to UI
        await new Promise(resolve => setTimeout(resolve, 0));

        // Wait for interactions to complete
        await new Promise(resolve => {
          InteractionManager.runAfterInteractions(() => resolve(null));
        });

        // Check if cancelled
        if (get().jobId !== jobId || get().status === 'cancelled') return;

        await processBatch(batch);

        // Double-check after processing
        if (get().jobId !== jobId || get().status === 'cancelled') return;
      }

      // Mark as completed if we made it through all batches
      if (get().jobId === jobId && get().status === 'running') {
        set({ status: 'completed' });
      }
    } catch (error) {
      console.error('Match job error:', error);
      if (get().jobId === jobId) {
        set({ status: 'cancelled' });
      }
    }
  },

  cancelJob: () => {
    set({
      jobId: null,
      status: 'cancelled',
    });
  },

  clearResults: () => {
    set({
      jobId: null,
      status: 'idle',
      progress: { total: 0, done: 0 },
      results: {},
    });
  },

  getResult: (recipeId) => {
    const state = get();
    const key = `${recipeId}|${state.invVersion}`;
    return state.results[key];
  },
}));