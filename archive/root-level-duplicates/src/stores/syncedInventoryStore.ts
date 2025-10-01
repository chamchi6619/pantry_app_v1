import { create } from 'zustand';
import { useInventoryStore } from './inventoryStore';
import { syncService } from '../services/supabaseSync';

interface SyncedInventoryStore {
  householdId: string | null;
  syncEnabled: boolean;
  isOnline: boolean;

  // Initialize sync
  initializeSync: (householdId: string) => Promise<void>;

  // Wrapped actions that sync with Supabase
  addItemWithSync: (item: any) => Promise<void>;
  updateItemWithSync: (id: string, updates: any) => Promise<void>;
  deleteItemWithSync: (id: string) => Promise<void>;

  // Toggle sync on/off
  setSyncEnabled: (enabled: boolean) => void;
  setOnlineStatus: (online: boolean) => void;
}

export const useSyncedInventoryStore = create<SyncedInventoryStore>((set, get) => ({
  householdId: null,
  syncEnabled: false, // Start with sync disabled for gradual migration
  isOnline: true,

  initializeSync: async (householdId: string) => {
    set({ householdId });

    if (get().syncEnabled) {
      try {
        await syncService.initialize(householdId);
        set({ syncEnabled: true });
      } catch (error) {
        console.error('Failed to initialize sync:', error);
        set({ syncEnabled: false });
      }
    }
  },

  addItemWithSync: async (item: any) => {
    const inventoryStore = useInventoryStore.getState();

    // Always update local store first (immediate UI update)
    inventoryStore.addItem(item);

    // Sync to Supabase if enabled
    if (get().syncEnabled && get().isOnline && get().householdId) {
      try {
        await syncService.syncInventoryItem('add', item, get().householdId!);
      } catch (error) {
        console.error('Sync failed, but local update succeeded:', error);
        // Item is already in local store, sync will retry later
      }
    }
  },

  updateItemWithSync: async (id: string, updates: any) => {
    const inventoryStore = useInventoryStore.getState();

    // Update local store first
    inventoryStore.updateItem(id, updates);

    // Sync to Supabase if enabled
    if (get().syncEnabled && get().isOnline && get().householdId) {
      try {
        const item = inventoryStore.getItemById(id);
        if (item) {
          await syncService.syncInventoryItem('update', { ...item, ...updates }, get().householdId!);
        }
      } catch (error) {
        console.error('Sync failed, but local update succeeded:', error);
      }
    }
  },

  deleteItemWithSync: async (id: string) => {
    const inventoryStore = useInventoryStore.getState();

    // Delete from local store first
    inventoryStore.deleteItem(id);

    // Sync to Supabase if enabled
    if (get().syncEnabled && get().isOnline && get().householdId) {
      try {
        await syncService.syncInventoryItem('delete', { id }, get().householdId!);
      } catch (error) {
        console.error('Sync failed, but local delete succeeded:', error);
      }
    }
  },

  setSyncEnabled: (enabled: boolean) => {
    set({ syncEnabled: enabled });

    // If enabling sync, initialize it
    if (enabled && get().householdId) {
      get().initializeSync(get().householdId!);
    }
  },

  setOnlineStatus: (online: boolean) => {
    set({ isOnline: online });

    // If coming back online, process sync queue
    if (online && get().syncEnabled) {
      syncService.processQueue();
    }
  },
}));

// Feature flag to gradually enable sync
export const ENABLE_SUPABASE_SYNC = true; // Set to true to enable sync