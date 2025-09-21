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
        // Sample inventory items - 6 items with realistic expiration dates
        {
          id: '1',
          name: 'Milk',
          quantity: 1,
          unit: 'gallon',
          category: 'Dairy',
          location: 'fridge',
          expirationDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // Expired 2 days ago
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '2',
          name: 'Yogurt',
          quantity: 3,
          unit: 'cups',
          category: 'Dairy',
          location: 'fridge',
          expirationDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // Expired 5 days ago
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '3',
          name: 'Chicken Breast',
          quantity: 2,
          unit: 'lbs',
          category: 'Meat',
          location: 'freezer',
          expirationDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // Expired 1 day ago
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '4',
          name: 'Lettuce',
          quantity: 1,
          unit: 'head',
          category: 'Vegetables',
          location: 'fridge',
          expirationDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // Expired 3 days ago
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '5',
          name: 'Pasta',
          quantity: 2,
          unit: 'boxes',
          category: 'Grains',
          location: 'pantry',
          expirationDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(), // Expires in 6 months
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '6',
          name: 'Olive Oil',
          quantity: 1,
          unit: 'bottle',
          category: 'Oils',
          location: 'pantry',
          expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // Expires in 1 year
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