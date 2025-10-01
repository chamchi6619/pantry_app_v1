import { supabase } from '../lib/supabase';
import { useInventoryStore, InventoryItem } from '../stores/inventoryStore';
import { useShoppingListStore, ShoppingItem } from '../stores/shoppingListStore';
import { FEATURE_FLAGS } from '../config/featureFlags';
import NetInfo from '@react-native-community/netinfo';

interface SyncStatus {
  syncing: boolean;
  lastSync: Date | null;
  error: string | null;
  pendingOperations: number;
}

interface QueuedOperation {
  id: string;
  operation: 'add' | 'update' | 'delete';
  table: string;
  data: any;
  timestamp: Date;
  retries: number;
  maxRetries: number;
}

class SupabaseSyncService {
  private syncStatus: SyncStatus = {
    syncing: false,
    lastSync: null,
    error: null,
    pendingOperations: 0,
  };

  private syncQueue: QueuedOperation[] = [];
  private isOnline: boolean = true;
  private retryTimeout: NodeJS.Timeout | null = null;
  private activeListId: string | null = null;
  private subscribers: Set<(status: SyncStatus) => void> = new Set();

  constructor() {
    // Monitor network status
    NetInfo.addEventListener(state => {
      this.isOnline = state.isConnected ?? false;
      if (this.isOnline && this.syncQueue.length > 0) {
        this.processQueue();
      }
    });
  }

  /**
   * Subscribe to sync status changes
   */
  subscribe(callback: (status: SyncStatus) => void) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers() {
    this.subscribers.forEach(callback => callback(this.syncStatus));
  }

  /**
   * Initialize sync service and load data from Supabase
   */
  async initialize(householdId: string) {
    if (!householdId) {
      console.error('No household ID provided');
      return;
    }

    try {
      this.syncStatus.syncing = true;
      this.notifySubscribers();

      // Load inventory items
      await this.loadInventoryItems(householdId);

      // Load shopping list
      await this.loadShoppingList(householdId);

      // Set up realtime subscriptions
      this.setupRealtimeSubscriptions(householdId);

      this.syncStatus.lastSync = new Date();
      this.syncStatus.error = null;
    } catch (error: any) {
      console.error('Sync initialization failed:', error);
      this.syncStatus.error = error.message;
    } finally {
      this.syncStatus.syncing = false;
      this.notifySubscribers();
    }
  }

  /**
   * Load inventory items from Supabase
   */
  private async loadInventoryItems(householdId: string) {
    const { data, error } = await supabase
      .from('pantry_items')
      .select('*')
      .eq('household_id', householdId)
      .eq('status', 'active');

    if (error) {
      console.error('Error loading inventory:', error);
      throw error;
    }

    if (data) {
      // Convert Supabase format to app format
      const items: InventoryItem[] = data.map(item => ({
        id: item.id,
        name: item.name,
        normalized: item.normalized,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category || '',
        location: item.location,
        expirationDate: item.expiry_date || undefined,
        notes: item.notes || undefined,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }));

      // Update Zustand store
      const store = useInventoryStore.getState();
      store.addBatchItems(items.map(({ id, ...rest }) => rest));
    }
  }

  /**
   * Load shopping list from Supabase
   */
  private async loadShoppingList(householdId: string) {
    // Get active shopping list
    const { data: listData, error: listError } = await supabase
      .from('shopping_lists')
      .select('id')
      .eq('household_id', householdId)
      .eq('is_active', true)
      .single();

    if (listError && listError.code !== 'PGRST116') { // Not found is ok
      console.error('Error loading shopping list:', listError);
      return;
    }

    if (listData) {
      // Load items for this list
      const { data: itemsData, error: itemsError } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('list_id', listData.id);

      if (itemsError) {
        console.error('Error loading shopping items:', itemsError);
        return;
      }

      if (itemsData) {
        const shoppingStore = useShoppingListStore.getState();
        // Convert and update store
        itemsData.forEach(item => {
          shoppingStore.addItem({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit || '',
            category: item.category || '',
            status: item.status as 'pending' | 'done',
          });
        });
      }
    }
  }

  /**
   * Set up realtime subscriptions for live updates
   */
  private setupRealtimeSubscriptions(householdId: string) {
    // Subscribe to pantry items changes
    supabase
      .channel(`pantry_items:${householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pantry_items',
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          this.handleRealtimeUpdate('pantry_items', payload);
        }
      )
      .subscribe();

    // Subscribe to shopping list changes
    supabase
      .channel(`shopping_lists:${householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopping_list_items',
        },
        (payload) => {
          this.handleRealtimeUpdate('shopping_list_items', payload);
        }
      )
      .subscribe();
  }

  /**
   * Handle realtime updates from Supabase
   */
  private handleRealtimeUpdate(table: string, payload: any) {
    console.log('Realtime update:', table, payload);
    // Update local store based on the change
    // This enables real-time sync across devices
  }

  /**
   * Sync local changes to Supabase (dual-write pattern)
   */
  async syncInventoryItem(
    operation: 'add' | 'update' | 'delete',
    item: Partial<InventoryItem>,
    householdId: string
  ) {
    try {
      switch (operation) {
        case 'add':
          const { data, error: addError } = await supabase
            .from('pantry_items')
            .insert({
              household_id: householdId,
              name: item.name!,
              quantity: item.quantity || 1,
              unit: item.unit || 'piece',
              location: item.location || 'pantry',
              category: item.category || null,
              notes: item.notes || null,
              expiry_date: item.expirationDate || null,
              status: 'active',
            })
            .select()
            .single();

          if (addError) throw addError;
          return data;

        case 'update':
          const { error: updateError } = await supabase
            .from('pantry_items')
            .update({
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              location: item.location,
              category: item.category,
              notes: item.notes,
              expiry_date: item.expirationDate,
            })
            .eq('id', item.id);

          if (updateError) throw updateError;
          break;

        case 'delete':
          const { error: deleteError } = await supabase
            .from('pantry_items')
            .update({ status: 'consumed' })
            .eq('id', item.id);

          if (deleteError) throw deleteError;
          break;
      }
    } catch (error: any) {
      console.error(`Sync error (${operation}):`, error);
      // Add to retry queue
      this.syncQueue.push({
        operation,
        table: 'pantry_items',
        data: { item, householdId },
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Process queued sync operations
   */
  async processQueue() {
    if (this.syncQueue.length === 0) return;

    const queue = [...this.syncQueue];
    this.syncQueue = [];

    for (const item of queue) {
      try {
        // Retry the operation
        if (item.table === 'pantry_items') {
          await this.syncInventoryItem(
            item.operation,
            item.data.item,
            item.data.householdId
          );
        }
      } catch (error) {
        // If it fails again, add back to queue
        this.syncQueue.push(item);
      }
    }
  }

  /**
   * Clean up subscriptions
   */
  cleanup() {
    supabase.removeAllChannels();
  }
}

export const syncService = new SupabaseSyncService();