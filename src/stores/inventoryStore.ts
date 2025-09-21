import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface InventoryItem {
  id: string;
  name: string;
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
  searchQuery: string;
  selectedCategory: string | null;
  selectedLocation: string | null;
  sortBy: 'name' | 'expiration' | 'quantity' | 'recent';

  // Actions
  addItem: (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  addBatchItems: (items: Array<Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  updateItem: (id: string, updates: Partial<InventoryItem>) => void;
  deleteItem: (id: string) => void;
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

export const useInventoryStore = create<InventoryState>()(
  // Temporarily disable persistence to use fresh data
  // persist(
    (set, get) => ({
      items: [
        // Sample inventory items - diverse items with various expiration dates
        {
          id: '1',
          name: 'Whole Milk',
          quantity: 1,
          unit: 'gallon',
          category: 'Dairy',
          location: 'fridge',
          expirationDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // Expires in 3 days
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '2',
          name: 'Greek Yogurt',
          quantity: 4,
          unit: 'containers',
          category: 'Dairy',
          location: 'fridge',
          expirationDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // Expires in 5 days
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '3',
          name: 'Chicken Thighs',
          quantity: 3,
          unit: 'lbs',
          category: 'Meat',
          location: 'freezer',
          expirationDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // Expires in 2 months
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '4',
          name: 'Romaine Lettuce',
          quantity: 2,
          unit: 'heads',
          category: 'Vegetables',
          location: 'fridge',
          expirationDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(), // Expires in 4 days
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '5',
          name: 'Penne Pasta',
          quantity: 3,
          unit: 'boxes',
          category: 'Grains',
          location: 'pantry',
          expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // Expires in 1 year
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '6',
          name: 'Extra Virgin Olive Oil',
          quantity: 1,
          unit: 'bottle',
          category: 'Oils',
          location: 'pantry',
          expirationDate: new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toISOString(), // Expires in 2 years
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '7',
          name: 'Sourdough Bread',
          quantity: 1,
          unit: 'loaf',
          category: 'Bakery',
          location: 'pantry',
          expirationDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // Expires in 2 days
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '8',
          name: 'Cherry Tomatoes',
          quantity: 2,
          unit: 'containers',
          category: 'Vegetables',
          location: 'fridge',
          expirationDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(), // Expires in 6 days
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '9',
          name: 'Cheddar Cheese',
          quantity: 1,
          unit: 'block',
          category: 'Dairy',
          location: 'fridge',
          expirationDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(), // Expires in 3 weeks
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '10',
          name: 'Ground Beef',
          quantity: 2,
          unit: 'lbs',
          category: 'Meat',
          location: 'freezer',
          expirationDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // Expires in 3 months
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '11',
          name: 'Bananas',
          quantity: 6,
          unit: 'pieces',
          category: 'Fruits',
          location: 'pantry',
          expirationDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // Expires in 3 days
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '12',
          name: 'Eggs',
          quantity: 12,
          unit: 'pieces',
          category: 'Dairy',
          location: 'fridge',
          expirationDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // Expires in 2 weeks
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          items: [...state.items, newItem],
        }));
      },

      addBatchItems: (itemsData) => {
        const timestamp = Date.now();
        const newItems: InventoryItem[] = itemsData.map((itemData, index) => ({
          ...itemData,
          id: `${timestamp}-${index}-${Math.random().toString(36).substr(2, 9)}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

        set((state) => ({
          items: [...state.items, ...newItems],
        }));
      },

      updateItem: (id, updates) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, ...updates, updatedAt: new Date().toISOString() }
              : item
          ),
        }));
      },

      deleteItem: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));
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
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + daysAhead);

        return get().items.filter((item) => {
          if (!item.expirationDate) return false;
          const expDate = new Date(item.expirationDate);
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