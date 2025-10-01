import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSyncedInventoryStore } from '../stores/syncedInventoryStore';
import { useSyncedShoppingStore } from '../stores/syncedShoppingStore';
import { useInventoryStore } from '../stores/inventoryStore';
import { useShoppingStore } from '../stores/shoppingStore';

/**
 * Hook to automatically use synced stores when authenticated
 * Falls back to local stores when offline or not authenticated
 */
export function useSupabaseStores() {
  const { user, householdId } = useAuth();
  const syncedInventory = useSyncedInventoryStore();
  const syncedShopping = useSyncedShoppingStore();
  const localInventory = useInventoryStore();
  const localShopping = useShoppingStore();

  // Initialize synced stores when authenticated
  useEffect(() => {
    if (user && householdId) {
      // Initialize inventory sync
      syncedInventory.initializeSync(householdId).catch(error => {
        console.error('Failed to initialize inventory sync:', error);
      });

      // Initialize shopping sync
      syncedShopping.initialize(householdId).catch(error => {
        console.error('Failed to initialize shopping sync:', error);
      });
    }
  }, [user, householdId]);

  // Return appropriate stores based on auth state
  const isAuthenticated = !!user && !!householdId;
  const useSynced = isAuthenticated && syncedInventory.syncEnabled;

  return {
    // Inventory operations
    inventory: {
      items: useSynced ? syncedInventory.items : localInventory.items,
      addItem: useSynced
        ? (item: any) => syncedInventory.addItemWithSync(item)
        : (item: any) => localInventory.addItem(item),
      updateItem: useSynced
        ? (id: string, updates: any) => syncedInventory.updateItemWithSync(id, updates)
        : (id: string, updates: any) => localInventory.updateItem(id, updates),
      deleteItem: useSynced
        ? (id: string) => syncedInventory.deleteItemWithSync(id)
        : (id: string) => localInventory.deleteItem(id),
      isLoading: useSynced ? syncedInventory.isLoading : false,
      isSynced: useSynced
    },

    // Shopping operations
    shopping: {
      items: useSynced ? syncedShopping.items : localShopping.items,
      addItem: useSynced
        ? (item: any) => syncedShopping.addItem(item)
        : (item: any) => localShopping.addItem(item),
      updateItem: useSynced
        ? (id: string, updates: any) => syncedShopping.updateItem(id, updates)
        : (id: string, updates: any) => localShopping.updateItem(id, updates),
      deleteItem: useSynced
        ? (id: string) => syncedShopping.deleteItem(id)
        : (id: string) => localShopping.deleteItem(id),
      toggleItem: useSynced
        ? (id: string) => syncedShopping.toggleItem(id)
        : (id: string) => localShopping.toggleItem(id),
      clearChecked: useSynced
        ? () => syncedShopping.clearChecked()
        : () => localShopping.clearCompleted(),
      moveToInventory: useSynced
        ? () => syncedShopping.moveCheckedToInventory()
        : () => localShopping.moveCompletedToInventory(),
      isLoading: useSynced ? syncedShopping.loading : false,
      isSynced: useSynced
    },

    // Sync status
    syncStatus: {
      isAuthenticated,
      isSynced: useSynced,
      isOnline: syncedInventory.isOnline,
      householdId
    }
  };
}