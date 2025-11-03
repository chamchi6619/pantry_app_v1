import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { FEATURE_FLAGS } from '../config/featureFlags';

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  checked: boolean;
  notes?: string;
  addedAt: string;
  checkedAt?: string;
  listId?: string;

  // Sync metadata
  syncStatus?: 'synced' | 'pending' | 'error';
  lastSyncedAt?: string;
}

interface ShoppingListState {
  // Data
  items: ShoppingItem[];
  activeListId: string | null;

  // UI State
  searchQuery: string;
  showChecked: boolean;
  selectedCategory: string | null;

  // Sync State
  isLoading: boolean;
  isSyncing: boolean;
  syncError: string | null;
  lastSync: Date | null;
  householdId: string | null;

  // Actions - Local
  setItems: (items: ShoppingItem[]) => void;
  setSearchQuery: (query: string) => void;
  setShowChecked: (show: boolean) => void;
  setSelectedCategory: (category: string | null) => void;

  // Actions - Sync
  initialize: (householdId: string) => Promise<void>;
  loadFromSupabase: () => Promise<void>;
  addItem: (item: Omit<ShoppingItem, 'id' | 'checked' | 'addedAt'>) => Promise<ShoppingItem | null>;
  addBatchItems: (items: Array<Omit<ShoppingItem, 'id' | 'checked' | 'addedAt'>>) => Promise<void>;
  updateItem: (id: string, updates: Partial<ShoppingItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  toggleItem: (id: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
  moveToInventory: (locationAssignments?: Record<string, 'fridge' | 'freezer' | 'pantry'>) => Promise<number>;
  syncPendingItems: () => Promise<void>;

  // Computed
  getFilteredItems: () => ShoppingItem[];
  getItemById: (id: string) => ShoppingItem | undefined;
  getCategories: () => string[];
  getCheckedItems: () => ShoppingItem[];
  getUncheckedItems: () => ShoppingItem[];
  getItemsByCategory: () => Record<string, ShoppingItem[]>;
}

// Mock data for offline/demo mode
const getMockItems = (): ShoppingItem[] => [
  {
    id: '1',
    name: 'Avocados',
    quantity: 3,
    unit: 'pieces',
    category: 'Produce',
    checked: false,
    addedAt: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'Almond Milk',
    quantity: 2,
    unit: 'cartons',
    category: 'Dairy',
    checked: false,
    addedAt: new Date().toISOString(),
  },
];

export const useShoppingListSupabaseStore = create<ShoppingListState>()(
  persist(
    (set, get) => ({
      // Initial state
      items: FEATURE_FLAGS.SYNC_MODE_SHOPPING !== 'off' ? [] : getMockItems(),
      activeListId: null,
      searchQuery: '',
      showChecked: true,
      selectedCategory: null,

      isLoading: false,
      isSyncing: false,
      syncError: null,
      lastSync: null,
      householdId: null,

      // Local actions
      setItems: (items) => set({ items }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setShowChecked: (show) => set({ showChecked: show }),
      setSelectedCategory: (category) => set({ selectedCategory: category }),

      // Initialize with household
      initialize: async (householdId: string) => {
        set({ householdId, isLoading: true, syncError: null });

        if (FEATURE_FLAGS.SYNC_MODE_SHOPPING === 'off') {
          // Use mock data if sync is disabled
          set({ items: getMockItems(), isLoading: false });
          return;
        }

        try {
          await get().loadFromSupabase();
        } catch (error: any) {
          console.error('Failed to initialize shopping list:', error);
          set({ syncError: error.message });
        } finally {
          set({ isLoading: false });
        }
      },

      // Load items from Supabase
      loadFromSupabase: async () => {
        const { householdId } = get();
        if (!householdId || FEATURE_FLAGS.SYNC_MODE_SHOPPING === 'off') return;

        set({ isLoading: true, syncError: null });

        try {
          // Get or create active shopping list
          let { data: listData, error: listError } = await supabase
            .from('shopping_lists')
            .select('id')
            .eq('household_id', householdId)
            .eq('is_active', true)
            .single();

          if (listError && listError.code === 'PGRST116') {
            // No active list exists, create one
            const { data: newList, error: createError } = await supabase
              .from('shopping_lists')
              .insert({
                household_id: householdId,
                name: 'Shopping List',
                is_active: true,
              })
              .select()
              .single();

            if (createError) throw createError;
            listData = newList;
          }

          if (!listData) throw new Error('Could not get or create shopping list');

          set({ activeListId: listData.id });

          // Load items for this list
          const { data: itemsData, error: itemsError } = await supabase
            .from('shopping_list_items')
            .select('*')
            .eq('list_id', listData.id)
            .order('created_at', { ascending: true });

          if (itemsError) throw itemsError;

          if (itemsData) {
            const items: ShoppingItem[] = itemsData.map(item => ({
              id: item.id,
              name: item.name,
              quantity: Number(item.quantity),
              unit: item.unit,
              category: item.category || '',
              checked: item.status === 'done',
              notes: item.notes,
              addedAt: item.created_at,
              checkedAt: item.status === 'done' ? item.updated_at : undefined,
              listId: item.list_id,
              syncStatus: 'synced',
              lastSyncedAt: new Date().toISOString(),
            }));

            set({ items, lastSync: new Date() });
          }
        } catch (error: any) {
          console.error('Error loading shopping list:', error);
          set({ syncError: error.message });
        } finally {
          set({ isLoading: false });
        }
      },

      // Add item with sync
      addItem: async (itemData) => {
        const { activeListId, items } = get();

        // Create optimistic item (preserve user's exact text)
        const tempId = `temp-${Date.now()}`;
        const newItem: ShoppingItem = {
          ...itemData,
          name: itemData.name,  // Keep user's exact wording
          id: tempId,
          checked: false,
          addedAt: new Date().toISOString(),
          syncStatus: FEATURE_FLAGS.SYNC_MODE_SHOPPING !== 'off' ? 'pending' : 'synced',
        };

        // Update local state immediately
        set({ items: [...items, newItem] });

        if (FEATURE_FLAGS.SYNC_MODE_SHOPPING === 'off' || !activeListId) {
          // If sync is disabled, just use local ID
          newItem.id = Date.now().toString();
          newItem.syncStatus = 'synced';
          set({ items: [...items, newItem] });
          return newItem;
        }

        // Sync to Supabase
        set({ isSyncing: true });

        try {
          const { data, error } = await supabase
            .from('shopping_list_items')
            .insert({
              list_id: activeListId,
              name: itemData.name,  // User's exact text
              quantity: itemData.quantity,
              unit: itemData.unit,
              category: itemData.category,
              notes: itemData.notes,
              checked: false,  // Write to 'checked', 'status' is auto-generated
            })
            .select()
            .single();

          if (error) throw error;

          // Update with real ID from Supabase
          const syncedItem: ShoppingItem = {
            ...newItem,
            id: data.id,
            listId: activeListId,
            syncStatus: 'synced',
            lastSyncedAt: new Date().toISOString(),
          };

          set({
            items: [...items, syncedItem],
            lastSync: new Date(),
          });

          return syncedItem;
        } catch (error: any) {
          console.error('Error adding shopping item:', error);
          // Mark as error but keep in local state
          newItem.syncStatus = 'error';
          set({
            items: [...items, newItem],
            syncError: error.message,
          });
          return null;
        } finally {
          set({ isSyncing: false });
        }
      },

      // Add batch items
      addBatchItems: async (itemsData) => {
        const { activeListId, items: existingItems } = get();
        const timestamp = Date.now();
        const newItems: ShoppingItem[] = [];

        itemsData.forEach((itemData, index) => {
          // Check if item already exists (by name and unit)
          const exists = existingItems.some(
            existing =>
              existing.name.toLowerCase() === itemData.name.toLowerCase() &&
              existing.unit === itemData.unit &&
              !existing.checked
          );

          if (!exists) {
            newItems.push({
              ...itemData,
              id: `temp-${timestamp}-${index}`,
              checked: false,
              addedAt: new Date().toISOString(),
              syncStatus: FEATURE_FLAGS.SYNC_MODE_SHOPPING !== 'off' ? 'pending' : 'synced',
            });
          }
        });

        if (newItems.length === 0) return;

        // Update local state immediately
        set({ items: [...existingItems, ...newItems] });

        if (FEATURE_FLAGS.SYNC_MODE_SHOPPING === 'off' || !activeListId) {
          // If sync is disabled, just use local IDs
          const localItems = newItems.map((item, index) => ({
            ...item,
            id: `${timestamp}-${index}`,
            syncStatus: 'synced' as const,
          }));
          set({ items: [...existingItems, ...localItems] });
          return;
        }

        // Sync to Supabase
        set({ isSyncing: true });

        try {
          const { data, error } = await supabase
            .from('shopping_list_items')
            .insert(
              newItems.map(item => ({
                list_id: activeListId,
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                category: item.category,
                notes: item.notes,
                checked: false,  // Write to 'checked', 'status' is auto-generated
              }))
            )
            .select();

          if (error) throw error;

          // Update with real IDs from Supabase
          const syncedItems = data.map((dbItem, index) => ({
            ...newItems[index],
            id: dbItem.id,
            listId: activeListId,
            syncStatus: 'synced' as const,
            lastSyncedAt: new Date().toISOString(),
          }));

          set({
            items: [...existingItems, ...syncedItems],
            lastSync: new Date(),
          });
        } catch (error: any) {
          console.error('Error adding batch items:', error);
          set({ syncError: error.message });
        } finally {
          set({ isSyncing: false });
        }
      },

      // Update item with sync
      updateItem: async (id, updates) => {
        const { activeListId, items } = get();

        // Optimistic update
        set({
          items: items.map(item =>
            item.id === id
              ? {
                  ...item,
                  ...updates,
                  syncStatus: FEATURE_FLAGS.SYNC_MODE_SHOPPING !== 'off' ? 'pending' : 'synced',
                }
              : item
          ),
        });

        if (FEATURE_FLAGS.SYNC_MODE_SHOPPING === 'off' || !activeListId) return;

        // Sync to Supabase
        set({ isSyncing: true });

        try {
          const { error } = await supabase
            .from('shopping_list_items')
            .update({
              name: updates.name,
              quantity: updates.quantity,
              unit: updates.unit,
              category: updates.category,
              notes: updates.notes,
              checked: updates.checked ?? undefined,  // Write to 'checked', 'status' is auto-generated
            })
            .eq('id', id);

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
          console.error('Error updating shopping item:', error);
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

      // Toggle item checked state
      toggleItem: async (id) => {
        const item = get().items.find(i => i.id === id);
        if (!item) return;

        const updates = {
          checked: !item.checked,
          checkedAt: !item.checked ? new Date().toISOString() : undefined,
        };

        await get().updateItem(id, updates);
      },

      // Delete item with sync
      deleteItem: async (id) => {
        const { activeListId, items } = get();

        // Optimistic delete
        set({ items: items.filter(item => item.id !== id) });

        if (FEATURE_FLAGS.SYNC_MODE_SHOPPING === 'off' || !activeListId) return;

        // Sync to Supabase
        set({ isSyncing: true });

        try {
          const { error } = await supabase
            .from('shopping_list_items')
            .delete()
            .eq('id', id);

          if (error) throw error;

          set({ lastSync: new Date() });
        } catch (error: any) {
          console.error('Error deleting shopping item:', error);
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

      // Clear completed items
      clearCompleted: async () => {
        const { items } = get();
        const checkedItems = items.filter(item => item.checked);

        // Optimistic update
        set({ items: items.filter(item => !item.checked) });

        if (FEATURE_FLAGS.SYNC_MODE_SHOPPING === 'off') return;

        // Delete all checked items from Supabase
        for (const item of checkedItems) {
          await get().deleteItem(item.id);
        }
      },

      // Move checked items to inventory
      moveToInventory: async (locationAssignments) => {
        const checkedItems = get().items.filter(item => item.checked);

        if (checkedItems.length === 0) return 0;

        try {
          // Lazy import to avoid circular dependency
          const { useInventorySupabaseStore } = require('./inventorySupabaseStore');
          const inventoryStore = useInventorySupabaseStore.getState();

          // Convert shopping items to inventory items with assigned locations
          for (const item of checkedItems) {
            await inventoryStore.addItem({
              name: item.name,  // Pass user's text - inventory will match
              quantity: item.quantity,
              unit: item.unit,
              category: item.category,
              location: locationAssignments?.[item.id] || 'pantry',
              notes: item.notes,
            });
          }

          // Remove checked items from shopping list
          await get().clearCompleted();

          return checkedItems.length;
        } catch (error) {
          console.error('[Shopping] Error moving items to inventory:', error);
          return 0;
        }
      },

      // Sync pending items
      syncPendingItems: async () => {
        const { items, activeListId } = get();
        if (!activeListId || FEATURE_FLAGS.SYNC_MODE_SHOPPING === 'off') return;

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

      // Computed getters
      getFilteredItems: () => {
        const { items, searchQuery, showChecked, selectedCategory } = get();
        let filtered = [...items];

        // Apply checked filter
        if (!showChecked) {
          filtered = filtered.filter(item => !item.checked);
        }

        // Apply search filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          filtered = filtered.filter(
            item =>
              item.name.toLowerCase().includes(query) ||
              item.category.toLowerCase().includes(query) ||
              item.notes?.toLowerCase().includes(query)
          );
        }

        // Apply category filter
        if (selectedCategory) {
          filtered = filtered.filter(item => item.category === selectedCategory);
        }

        // Sort: unchecked first, then by name
        filtered.sort((a, b) => {
          if (a.checked !== b.checked) {
            return a.checked ? 1 : -1;
          }
          return a.name.localeCompare(b.name);
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

      getCheckedItems: () => {
        return get().items.filter(item => item.checked);
      },

      getUncheckedItems: () => {
        return get().items.filter(item => !item.checked);
      },

      getItemsByCategory: () => {
        const items = get().items;
        const grouped: Record<string, ShoppingItem[]> = {};

        items.forEach(item => {
          if (!grouped[item.category]) {
            grouped[item.category] = [];
          }
          grouped[item.category].push(item);
        });

        // Sort items within each category
        Object.keys(grouped).forEach(category => {
          grouped[category].sort((a, b) => {
            if (a.checked !== b.checked) {
              return a.checked ? 1 : -1;
            }
            return a.name.localeCompare(b.name);
          });
        });

        return grouped;
      },
    }),
    {
      name: 'shopping-list-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        items: state.items.filter(item => item.syncStatus !== 'pending'),
        lastSync: state.lastSync,
      }),
    }
  )
);