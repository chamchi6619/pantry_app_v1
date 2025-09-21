import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
}

interface ShoppingListState {
  items: ShoppingItem[];
  searchQuery: string;
  showChecked: boolean;
  selectedCategory: string | null;

  // Actions
  addItem: (item: Omit<ShoppingItem, 'id' | 'checked' | 'addedAt'>) => void;
  addBatchItems: (items: Array<Omit<ShoppingItem, 'id' | 'checked' | 'addedAt'>>) => void;
  updateItem: (id: string, updates: Partial<ShoppingItem>) => void;
  deleteItem: (id: string) => void;
  toggleItem: (id: string) => void;
  clearChecked: () => void;
  moveToInventory: (itemIds: string[]) => void;
  setSearchQuery: (query: string) => void;
  setShowChecked: (show: boolean) => void;
  setSelectedCategory: (category: string | null) => void;

  // Computed
  getFilteredItems: () => ShoppingItem[];
  getItemById: (id: string) => ShoppingItem | undefined;
  getCategories: () => string[];
  getCheckedItems: () => ShoppingItem[];
  getUncheckedItems: () => ShoppingItem[];
  getItemsByCategory: () => Record<string, ShoppingItem[]>;
}

export const useShoppingListStore = create<ShoppingListState>()(
  persist(
    (set, get) => ({
      items: [],
      searchQuery: '',
      showChecked: true,
      selectedCategory: null,

      addItem: (itemData) => {
        const newItem: ShoppingItem = {
          ...itemData,
          id: Date.now().toString(),
          checked: false,
          addedAt: new Date().toISOString(),
        };

        set((state) => ({
          items: [...state.items, newItem],
        }));
      },

      addBatchItems: (itemsData) => {
        const existingItems = get().items;
        const newItems: ShoppingItem[] = [];
        const timestamp = Date.now();

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
              id: `${timestamp}-${index}`,
              checked: false,
              addedAt: new Date().toISOString(),
            });
          } else {
            // Optionally update quantity for existing item
            const existingItem = existingItems.find(
              existing =>
                existing.name.toLowerCase() === itemData.name.toLowerCase() &&
                existing.unit === itemData.unit &&
                !existing.checked
            );

            if (existingItem) {
              // Update quantity by adding the new quantity
              set((state) => ({
                items: state.items.map((item) =>
                  item.id === existingItem.id
                    ? { ...item, quantity: item.quantity + itemData.quantity }
                    : item
                ),
              }));
            }
          }
        });

        if (newItems.length > 0) {
          set((state) => ({
            items: [...state.items, ...newItems],
          }));
        }
      },

      updateItem: (id, updates) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          ),
        }));
      },

      deleteItem: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));
      },

      toggleItem: (id) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  checked: !item.checked,
                  checkedAt: !item.checked ? new Date().toISOString() : undefined,
                }
              : item
          ),
        }));
      },

      clearChecked: () => {
        set((state) => ({
          items: state.items.filter((item) => !item.checked),
        }));
      },

      moveToInventory: (itemIds) => {
        // This will be connected to inventory store
        // For now, just remove from shopping list
        set((state) => ({
          items: state.items.filter((item) => !itemIds.includes(item.id)),
        }));
      },

      setSearchQuery: (query) => set({ searchQuery: query }),
      setShowChecked: (show) => set({ showChecked: show }),
      setSelectedCategory: (category) => set({ selectedCategory: category }),

      getFilteredItems: () => {
        const state = get();
        let filtered = [...state.items];

        // Apply checked filter
        if (!state.showChecked) {
          filtered = filtered.filter((item) => !item.checked);
        }

        // Apply search filter
        if (state.searchQuery) {
          const query = state.searchQuery.toLowerCase();
          filtered = filtered.filter(
            (item) =>
              item.name.toLowerCase().includes(query) ||
              item.category.toLowerCase().includes(query) ||
              item.notes?.toLowerCase().includes(query)
          );
        }

        // Apply category filter
        if (state.selectedCategory) {
          filtered = filtered.filter(
            (item) => item.category === state.selectedCategory
          );
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
        return get().items.find((item) => item.id === id);
      },

      getCategories: () => {
        const categories = new Set(get().items.map((item) => item.category));
        return Array.from(categories).sort();
      },

      getCheckedItems: () => {
        return get().items.filter((item) => item.checked);
      },

      getUncheckedItems: () => {
        return get().items.filter((item) => !item.checked);
      },

      getItemsByCategory: () => {
        const items = get().items;
        const grouped: Record<string, ShoppingItem[]> = {};

        items.forEach((item) => {
          if (!grouped[item.category]) {
            grouped[item.category] = [];
          }
          grouped[item.category].push(item);
        });

        // Sort items within each category
        Object.keys(grouped).forEach((category) => {
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
      name: 'pantry-shopping-list-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);