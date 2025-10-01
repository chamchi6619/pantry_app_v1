import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeName } from '../features/recipes/utils/normalizer';

export interface InventoryItem {
  id: string;
  name: string;
  normalized?: string; // Pre-computed normalized name for fast matching
  quantity: number;
  unit: string;
  category: string;
  location: 'fridge' | 'freezer' | 'pantry';
  expirationDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface InventoryState {
  items: InventoryItem[];
  version: number; // Version counter for cache invalidation
  searchQuery: string;
  selectedCategory: string | null;
  selectedLocation: string | null;
  sortBy: 'name' | 'expiration' | 'quantity' | 'recent';

  // Actions
  addItem: (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'normalized'>) => void;
  addBatchItems: (items: Array<Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'normalized'>>) => void;
  updateItem: (id: string, updates: Partial<Omit<InventoryItem, 'normalized'>>) => void;
  deleteItem: (id: string) => void;
  clearAll: () => void;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string | null) => void;
  setSelectedLocation: (location: string | null) => void;
  setSortBy: (sortBy: 'name' | 'expiration' | 'quantity' | 'recent') => void;

  // Computed
  getFilteredItems: () => InventoryItem[];
  getItemById: (id: string) => InventoryItem | undefined;
  getCategories: () => string[];
  getItemsByLocation: (location: string) => InventoryItem[];
  getExpiringItems: (daysAhead: number) => InventoryItem[];
  getLowStockItems: (threshold: number) => InventoryItem[];
}

// Helper to create date string in YYYY-MM-DD format
const getDateString = (daysFromNow: number): string => {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const useInventoryStore = create<InventoryState>()(
  // Temporarily disable persistence to use fresh data
  // persist(
    (set, get) => ({
      version: 0, // Initialize version counter
      items: [
        // Sample inventory items - diverse items with various expiration dates
        {
          id: '1',
          name: 'Whole Milk',
          normalized: 'milk',
          quantity: 1,
          unit: 'gallon',
          category: 'Dairy',
          location: 'fridge',
          expirationDate: getDateString(3), // Expires in 3 days
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
          expirationDate: getDateString(5), // Expires in 5 days
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '3',
          name: 'Chicken Thighs',
          normalized: 'chicken thigh',
          quantity: 3,
          unit: 'lbs',
          category: 'Meat',
          location: 'freezer',
          expirationDate: getDateString(60), // Expires in 2 months
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '4',
          name: 'Romaine Lettuce',
          normalized: 'lettuce',
          quantity: 2,
          unit: 'heads',
          category: 'Vegetables',
          location: 'fridge',
          expirationDate: getDateString(4), // Expires in 4 days
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '5',
          name: 'Penne Pasta',
          normalized: 'pasta',
          quantity: 3,
          unit: 'boxes',
          category: 'Grains',
          location: 'pantry',
          expirationDate: getDateString(365), // Expires in 1 year
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '6',
          name: 'Extra Virgin Olive Oil',
          normalized: 'olive oil',
          quantity: 1,
          unit: 'bottle',
          category: 'Oils',
          location: 'pantry',
          expirationDate: getDateString(730), // Expires in 2 years
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '7',
          name: 'Sourdough Bread',
          normalized: 'bread',
          quantity: 1,
          unit: 'loaf',
          category: 'Bakery',
          location: 'pantry',
          expirationDate: getDateString(2), // Expires in 2 days
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '8',
          name: 'Cherry Tomatoes',
          normalized: 'tomato',
          quantity: 2,
          unit: 'containers',
          category: 'Vegetables',
          location: 'fridge',
          expirationDate: getDateString(6), // Expires in 6 days
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '9',
          name: 'Cheddar Cheese',
          normalized: 'cheese',
          quantity: 1,
          unit: 'block',
          category: 'Dairy',
          location: 'fridge',
          expirationDate: getDateString(21), // Expires in 3 weeks
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '10',
          name: 'Ground Beef',
          normalized: 'beef',
          quantity: 2,
          unit: 'lbs',
          category: 'Meat',
          location: 'freezer',
          expirationDate: getDateString(90), // Expires in 3 months
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '11',
          name: 'Bananas',
          normalized: 'banana',
          quantity: 6,
          unit: 'pieces',
          category: 'Fruits',
          location: 'pantry',
          expirationDate: getDateString(3), // Expires in 3 days
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '12',
          name: 'Eggs',
          normalized: 'egg',
          quantity: 12,
          unit: 'pieces',
          category: 'Dairy',
          location: 'fridge',
          expirationDate: getDateString(14), // Expires in 2 weeks
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      ],
      searchQuery: '',
      selectedCategory: null,
      selectedLocation: null,
      sortBy: 'name',

      addItem: (itemData) => {
        const newItem: InventoryItem = {
          ...itemData,
          id: Date.now().toString(),
          normalized: normalizeName(itemData.name),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          items: [...state.items, newItem],
          version: state.version + 1, // Increment version for cache invalidation
        }));
      },

      addBatchItems: (itemsData) => {
        const timestamp = Date.now();
        const newItems: InventoryItem[] = itemsData.map((itemData, index) => ({
          ...itemData,
          id: `${timestamp}-${index}-${Math.random().toString(36).substr(2, 9)}`,
          normalized: normalizeName(itemData.name),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

        set((state) => ({
          items: [...state.items, ...newItems],
          version: state.version + 1, // Increment version for cache invalidation
        }));
      },

      updateItem: (id, updates) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...updates,
                  normalized: updates.name ? normalizeName(updates.name) : item.normalized,
                  updatedAt: new Date().toISOString()
                }
              : item
          ),
          version: state.version + 1, // Increment version for cache invalidation
        }));
      },

      deleteItem: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
          version: state.version + 1, // Increment version for cache invalidation
        }));
      },

      clearAll: () => {
        set({
          items: [],
          version: 0,
          searchQuery: '',
          selectedCategory: null,
          selectedLocation: null,
        });
      },

      setSearchQuery: (query) => set({ searchQuery: query }),
      setSelectedCategory: (category) => set({ selectedCategory: category }),
      setSelectedLocation: (location) => set({ selectedLocation: location }),
      setSortBy: (sortBy) => set({ sortBy }),

      getFilteredItems: () => {
        const state = get();
        let filtered = [...state.items];

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

        // Apply location filter
        if (state.selectedLocation) {
          filtered = filtered.filter(
            (item) => item.location === state.selectedLocation
          );
        }

        // Apply sorting
        switch (state.sortBy) {
          case 'name':
            filtered.sort((a, b) => a.name.localeCompare(b.name));
            break;
          case 'expiration':
            filtered.sort((a, b) => {
              if (!a.expirationDate) return 1;
              if (!b.expirationDate) return -1;
              return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
            });
            break;
          case 'quantity':
            filtered.sort((a, b) => a.quantity - b.quantity);
            break;
          case 'recent':
            filtered.sort((a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
            break;
        }

        return filtered;
      },

      getItemById: (id) => {
        return get().items.find((item) => item.id === id);
      },

      getCategories: () => {
        const categories = new Set(get().items.map((item) => item.category));
        return Array.from(categories).sort();
      },

      getItemsByLocation: (location) => {
        return get().items.filter((item) => item.location === location);
      },

      getExpiringItems: (daysAhead) => {
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Start of today

        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + daysAhead);
        futureDate.setHours(23, 59, 59, 999); // End of future date

        return get().items.filter((item) => {
          if (!item.expirationDate) return false;

          // Parse YYYY-MM-DD format properly
          const [year, month, day] = item.expirationDate.split('-').map(Number);
          if (!year || !month || !day) return false;

          const expDate = new Date(year, month - 1, day);
          return expDate >= now && expDate <= futureDate;
        });
      },

      getLowStockItems: (threshold = 2) => {
        return get().items.filter((item) => item.quantity <= threshold);
      },
    })
    // {
    //   name: 'pantry-inventory-storage',
    //   storage: createJSONStorage(() => AsyncStorage),
    // }
  // )
);