import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { smartSyncService } from '../services/smartSyncService';
import { matchIngredient } from '../services/ingredientMatcher';

export interface InventoryItem {
  id: string;
  name: string;
  normalized?: string;
  canonicalItemId?: string; // Link to canonical_items for recipe matching
  quantity: number;
  unit: string;
  category: string;
  location: 'fridge' | 'freezer' | 'pantry';
  expirationDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;

  // Sync metadata
  syncStatus?: 'synced' | 'pending' | 'error';
  lastSyncedAt?: string;
}

interface InventoryState {
  // Data
  items: InventoryItem[];

  // UI State
  searchQuery: string;
  selectedCategory: string | null;
  selectedLocation: string | null;
  sortBy: 'name' | 'expiration' | 'quantity' | 'recent';

  // Sync State
  isLoading: boolean;
  isSyncing: boolean;
  syncError: string | null;
  lastSync: Date | null;
  householdId: string | null;

  // Actions - Local
  setItems: (items: InventoryItem[]) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string | null) => void;
  setSelectedLocation: (location: string | null) => void;
  setSortBy: (sortBy: 'name' | 'expiration' | 'quantity' | 'recent') => void;

  // Actions - Sync
  initialize: (householdId: string) => Promise<void>;
  loadFromSupabase: () => Promise<void>;
  addItem: (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<InventoryItem | null>;
  updateItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  syncPendingItems: () => Promise<void>;
  forceSync: () => void;

  // Computed
  getFilteredItems: () => InventoryItem[];
  getItemById: (id: string) => InventoryItem | undefined;
  getCategories: () => string[];
  getItemsByLocation: (location: string) => InventoryItem[];
  getExpiringItems: (daysAhead: number) => InventoryItem[];
  getLowStockItems: (threshold: number) => InventoryItem[];
}

// Mock data for offline/demo mode
const getMockItems = (): InventoryItem[] => [
  {
    id: '1',
    name: 'Whole Milk',
    normalized: 'milk',
    quantity: 1,
    unit: 'gallon',
    category: 'Dairy',
    location: 'fridge',
    expirationDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'Greek Yogurt',
    normalized: 'yogurt',
    quantity: 4,
    unit: 'containers',
    category: 'Dairy',
    location: 'fridge',
    expirationDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // Add more mock items as needed
];

export const useInventorySupabaseStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      // Initial state
      items: (FEATURE_FLAGS.SYNC_MODE_INVENTORY && FEATURE_FLAGS.SYNC_MODE_INVENTORY !== 'off') ? [] : getMockItems(),
      searchQuery: '',
      selectedCategory: null,
      selectedLocation: null,
      sortBy: 'name',

      isLoading: false,
      isSyncing: false,
      syncError: null,
      lastSync: null,
      householdId: null,

      // Local actions
      setItems: (items) => set({ items }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSelectedCategory: (category) => set({ selectedCategory: category }),
      setSelectedLocation: (location) => set({ selectedLocation: location }),
      setSortBy: (sortBy) => set({ sortBy }),

      // Initialize with household
      initialize: async (householdId: string) => {
        set({ householdId, isLoading: true, syncError: null });

        if (!FEATURE_FLAGS.SYNC_MODE_INVENTORY || FEATURE_FLAGS.SYNC_MODE_INVENTORY === 'off') {
          // Use mock data if sync is disabled
          set({ items: getMockItems(), isLoading: false });
          return;
        }

        try {
          await get().loadFromSupabase();
        } catch (error: any) {
          console.error('Failed to initialize inventory:', error);
          set({ syncError: error.message });
        } finally {
          set({ isLoading: false });
        }
      },

      // Load items from Supabase
      loadFromSupabase: async () => {
        const { householdId } = get();
        if (!householdId || !FEATURE_FLAGS.SYNC_MODE_INVENTORY || FEATURE_FLAGS.SYNC_MODE_INVENTORY === 'off') return;

        set({ isLoading: true, syncError: null });

        try {
          const { data, error } = await supabase
            .from('pantry_items')
            .select('*')
            .eq('household_id', householdId)
            .eq('status', 'active')
            .order('created_at', { ascending: false });

          if (error) throw error;

          if (data) {
            const items: InventoryItem[] = data.map(item => ({
              id: item.id,
              name: item.name,
              normalized: item.normalized || item.normalized_name,
              canonicalItemId: item.canonical_item_id,
              quantity: Number(item.quantity),
              unit: item.unit,
              category: item.category || '',
              location: item.location,
              expirationDate: item.expiry_date || item.expiration_date,
              notes: item.notes,
              createdAt: item.created_at,
              updatedAt: item.updated_at,
              syncStatus: 'synced',
              lastSyncedAt: new Date().toISOString(),
            }));

            set({ items, lastSync: new Date() });
          }
        } catch (error: any) {
          console.error('Error loading inventory:', error);
          set({ syncError: error.message });
          // Fall back to local data on error
        } finally {
          set({ isLoading: false });
        }
      },

      // Add item with sync
      addItem: async (item) => {
        const { householdId, items } = get();

        // ✅ TRUST PROVIDED CANONICAL ID (from receipt processing or other sources)
        // Only do client-side matching if no canonical ID provided
        let canonical_item_id = item.canonicalItemId || null;
        let normalized_name = null;

        if (!canonical_item_id) {
          // No canonical ID provided - client will query server for matching
          // This is a fallback for manual adds without receipt processing
          console.log(`ℹ️ No canonical ID provided for "${item.name}", server will match`);
        } else {
          console.log(`✅ Using provided canonical ID for "${item.name}": ${canonical_item_id}`);
        }

        // Create optimistic item
        const tempId = `temp-${Date.now()}`;
        const newItem: InventoryItem = {
          ...item,
          name: item.name,  // ✅ PRESERVE user's exact text (don't overwrite with canonical name)
          canonicalItemId: canonical_item_id,
          normalized: normalized_name,
          id: tempId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          syncStatus: (FEATURE_FLAGS.SYNC_MODE_INVENTORY && FEATURE_FLAGS.SYNC_MODE_INVENTORY !== 'off') ? 'pending' : 'synced',
        };

        // Update local state immediately
        set({ items: [newItem, ...items] });

        if (!FEATURE_FLAGS.SYNC_MODE_INVENTORY || FEATURE_FLAGS.SYNC_MODE_INVENTORY === 'off' || !householdId) {
          // If sync is disabled, just use local ID
          newItem.id = Date.now().toString();
          newItem.syncStatus = 'synced';
          set({ items: [newItem, ...items] });
          return newItem;
        }

        // ALWAYS use Edge Function for canonical matching (skip lite sync for inventory)
        // Lite sync doesn't support canonical matching, so we must use Edge Function

        // Sync to Supabase via centralized Edge Function
        set({ isSyncing: true });

        try {
          // Call add-to-pantry Edge Function with matched canonical_item_id
          const { data: response, error: edgeFunctionError } = await supabase.functions.invoke('add-to-pantry', {
            body: {
              household_id: householdId,
              name: item.name,  // ✅ Send user's original text (not canonical name)
              quantity: item.quantity,
              unit: item.unit,
              location: item.location,
              category: item.category,
              notes: item.notes,
              expiry_date: item.expirationDate,
              source: 'manual',
              canonical_item_id,  // ✅ Pass matched canonical ID (or null)
            },
          });

          if (edgeFunctionError) throw edgeFunctionError;
          if (!response?.success) throw new Error(response?.error || 'Failed to add item');

          const data = response.item;

          // Log canonical matching result
          if (response.canonical_match) {
            console.log(`✓ Item matched to canonical: ${response.canonical_match.canonical_name}`);
          }

          // Update with real ID from Supabase
          const syncedItem: InventoryItem = {
            ...newItem,
            id: data.id,
            syncStatus: 'synced',
            lastSyncedAt: new Date().toISOString(),
          };

          set({
            items: [syncedItem, ...items],
            lastSync: new Date(),
          });

          return syncedItem;
        } catch (error: any) {
          console.error('Error adding item:', error);
          // Mark as error but keep in local state
          newItem.syncStatus = 'error';
          set({
            items: [newItem, ...items],
            syncError: error.message,
          });
          return null;
        } finally {
          set({ isSyncing: false });
        }
      },

      // Update item with sync
      updateItem: async (id, updates) => {
        const { householdId, items } = get();

        // Optimistic update
        set({
          items: items.map(item =>
            item.id === id
              ? {
                  ...item,
                  ...updates,
                  updatedAt: new Date().toISOString(),
                  syncStatus: (FEATURE_FLAGS.SYNC_MODE_INVENTORY && FEATURE_FLAGS.SYNC_MODE_INVENTORY !== 'off') ? 'pending' : 'synced',
                }
              : item
          ),
        });

        if (!FEATURE_FLAGS.SYNC_MODE_INVENTORY || FEATURE_FLAGS.SYNC_MODE_INVENTORY === 'off' || !householdId) return;

        // Check if ID is a valid UUID (not a temp ID or timestamp)
        const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

        if (!isValidUUID) {
          // Item has temp ID, skip Supabase sync but mark as pending
          console.log(`Skipping Supabase update for temp ID: ${id}`);
          return;
        }

        // Sync to Supabase
        set({ isSyncing: true });

        try {
          // Build update object with only defined fields
          const updateData: any = {};
          if (updates.name !== undefined) updateData.name = updates.name;
          if (updates.quantity !== undefined) updateData.quantity = updates.quantity;
          if (updates.unit !== undefined) updateData.unit = updates.unit;
          if (updates.location !== undefined) updateData.location = updates.location;
          if (updates.category !== undefined) updateData.category = updates.category;
          if (updates.notes !== undefined) updateData.notes = updates.notes;
          if (updates.expirationDate !== undefined) updateData.expiry_date = updates.expirationDate;

          const { error } = await supabase
            .from('pantry_items')
            .update(updateData)
            .eq('id', id)
            .eq('household_id', householdId);

          if (error) throw error;

          // Mark as synced
          set({
            items: items.map(item =>
              item.id === id
                ? { ...item, ...updates, syncStatus: 'synced', lastSyncedAt: new Date().toISOString() }
                : item
            ),
            lastSync: new Date(),
          });
        } catch (error: any) {
          console.error('Error updating item:', error);
          // Mark as error
          set({
            items: items.map(item =>
              item.id === id ? { ...item, syncStatus: 'error' } : item
            ),
            syncError: error.message,
          });
        } finally {
          set({ isSyncing: false });
        }
      },

      // Delete item with sync
      deleteItem: async (id) => {
        const { householdId, items } = get();

        // Optimistic delete
        set({ items: items.filter(item => item.id !== id) });

        if (!FEATURE_FLAGS.SYNC_MODE_INVENTORY || FEATURE_FLAGS.SYNC_MODE_INVENTORY === 'off' || !householdId) return;

        // Check if ID is a valid UUID (not a temp ID or timestamp)
        // UUID format: 8-4-4-4-12 hex characters
        const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

        if (!isValidUUID) {
          // Item has temp ID (timestamp or 'temp-xxx'), skip Supabase sync
          console.log(`Skipping Supabase delete for temp ID: ${id}`);
          return;
        }

        // Sync to Supabase (mark as consumed, not hard delete)
        set({ isSyncing: true });

        try {
          const { error } = await supabase
            .from('pantry_items')
            .update({ status: 'consumed' })
            .eq('id', id)
            .eq('household_id', householdId);

          if (error) throw error;

          set({ lastSync: new Date() });
        } catch (error: any) {
          console.error('Error deleting item:', error);
          // Re-add item on error
          const deletedItem = items.find(item => item.id === id);
          if (deletedItem) {
            set({
              items: [...get().items, { ...deletedItem, syncStatus: 'error' }],
              syncError: error.message,
            });
          }
        } finally {
          set({ isSyncing: false });
        }
      },

      // Sync pending items
      syncPendingItems: async () => {
        const { items, householdId } = get();
        if (!householdId || !FEATURE_FLAGS.SYNC_MODE_INVENTORY || FEATURE_FLAGS.SYNC_MODE_INVENTORY === 'off') return;

        const pendingItems = items.filter(item => item.syncStatus === 'pending' || item.syncStatus === 'error');
        if (pendingItems.length === 0) return;

        set({ isSyncing: true });

        for (const item of pendingItems) {
          // Retry sync for each pending item
          if (item.id.startsWith('temp-')) {
            // This is a new item that needs to be created
            await get().addItem(item);
          } else {
            // This is an update
            await get().updateItem(item.id, item);
          }
        }

        set({ isSyncing: false });
      },

      forceSync: () => {
        // Trigger immediate sync via smartSyncService
        smartSyncService.queueOperation('sync', 'force_sync', {
          timestamp: Date.now(),
          feature: 'inventory'
        });
      },

      // Computed getters
      getFilteredItems: () => {
        const { items, searchQuery, selectedCategory, selectedLocation, sortBy } = get();

        let filtered = [...items];

        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          filtered = filtered.filter(item =>
            item.name.toLowerCase().includes(query) ||
            item.category.toLowerCase().includes(query)
          );
        }

        if (selectedCategory) {
          filtered = filtered.filter(item => item.category === selectedCategory);
        }

        if (selectedLocation && selectedLocation !== 'all') {
          filtered = filtered.filter(item => item.location === selectedLocation);
        }

        // Sort
        filtered.sort((a, b) => {
          switch (sortBy) {
            case 'name':
              return a.name.localeCompare(b.name);
            case 'expiration':
              if (!a.expirationDate) return 1;
              if (!b.expirationDate) return -1;
              return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
            case 'quantity':
              return b.quantity - a.quantity;
            case 'recent':
              return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            default:
              return 0;
          }
        });

        return filtered;
      },

      getItemById: (id) => {
        return get().items.find(item => item.id === id);
      },

      getCategories: () => {
        const categories = new Set(get().items.map(item => item.category).filter(Boolean));
        return Array.from(categories).sort();
      },

      getItemsByLocation: (location) => {
        return get().items.filter(item => item.location === location);
      },

      getExpiringItems: (daysAhead) => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + daysAhead);

        return get().items.filter(item => {
          if (!item.expirationDate) return false;
          const expiryDate = new Date(item.expirationDate);
          return expiryDate <= futureDate && expiryDate >= new Date();
        });
      },

      getLowStockItems: (threshold) => {
        return get().items.filter(item => item.quantity <= threshold);
      },
    }),
    {
      name: 'inventory-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        items: state.items.filter(item => item.syncStatus !== 'pending'),
        lastSync: state.lastSync,
      }),
    }
  )
);