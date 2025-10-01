import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { SYNC_MODES, shouldEnableRealtime, getSyncInterval } from '../config/syncModes';
import { presenceService } from './presenceService';
import { useInventoryStore } from '../stores/inventoryStore';
import { useShoppingListStore } from '../stores/shoppingListStore';

interface SyncMetadata {
  lastSync: number | null;
  lastBackup: number | null;
  pendingChanges: number;
  syncMode: 'off' | 'lite' | 'smart' | 'realtime';
  isOnline: boolean;
  activeUsers: number;
}

interface SyncOperation {
  id: string;
  type: 'add' | 'update' | 'delete';
  table: string;
  data: any;
  timestamp: number;
  retries: number;
}

class SmartSyncService {
  private metadata: SyncMetadata = {
    lastSync: null,
    lastBackup: null,
    pendingChanges: 0,
    syncMode: 'lite',
    isOnline: true,
    activeUsers: 1,
  };

  private syncQueue: SyncOperation[] = [];
  private preInitQueue: SyncOperation[] = []; // Store operations before initialization
  private syncTimers = new Map<string, NodeJS.Timeout>();
  private realtimeSubscriptions = new Map<string, any>();
  private householdId: string | null = null;
  private userId: string | null = null;
  private isInitialized: boolean = false;

  /**
   * Initialize smart sync service
   */
  async initialize(householdId: string, userId: string) {
    console.log(`[Sync] Initializing smart sync for household: ${householdId}, user: ${userId}`);
    this.householdId = householdId;
    this.userId = userId;

    // Load metadata from storage
    await this.loadMetadata();

    // Monitor network status
    NetInfo.addEventListener(state => {
      this.metadata.isOnline = state.isConnected ?? false;
      console.log(`[Sync] Network status: ${this.metadata.isOnline ? 'online' : 'offline'}`);
      if (this.metadata.isOnline) {
        this.processPendingSync();
      }
    });

    // Set up sync based on mode
    console.log(`[Sync] Setting up sync modes - Inventory: ${SYNC_MODES.INVENTORY_MODE}, Shopping: ${SYNC_MODES.SHOPPING_MODE}`);
    await this.setupSyncMode('inventory', SYNC_MODES.INVENTORY_MODE);
    // Don't auto-setup shopping presence - let user control it
    // await this.setupSyncMode('shopping', SYNC_MODES.SHOPPING_MODE);

    // Mark as initialized
    this.isInitialized = true;

    // Process any operations that were queued before initialization
    if (this.preInitQueue.length > 0) {
      console.log(`[Sync] Processing ${this.preInitQueue.length} pre-initialization operations`);
      this.syncQueue.push(...this.preInitQueue);
      this.preInitQueue = [];
      this.metadata.pendingChanges = this.syncQueue.length;
      this.processPendingSync();
    }

    console.log(`[Sync] Smart sync initialized`);
  }

  /**
   * Set up sync for a specific feature based on mode
   */
  private async setupSyncMode(feature: 'inventory' | 'shopping', mode: string) {
    // Clear existing timers
    const timerId = `${feature}_sync`;
    if (this.syncTimers.has(timerId)) {
      clearInterval(this.syncTimers.get(timerId));
      this.syncTimers.delete(timerId);
    }

    // Clear existing realtime subscriptions
    const subId = `${feature}_realtime`;
    if (this.realtimeSubscriptions.has(subId)) {
      await this.realtimeSubscriptions.get(subId).unsubscribe();
      this.realtimeSubscriptions.delete(subId);
    }

    switch (mode) {
      case 'off':
        // No sync
        break;

      case 'lite':
        // Periodic sync
        const interval = getSyncInterval('lite');
        if (interval) {
          const timer = setInterval(() => {
            this.performLiteSync(feature);
          }, interval);
          this.syncTimers.set(timerId, timer);
        }

        // Daily backup for inventory
        if (feature === 'inventory') {
          const backupTimer = setInterval(() => {
            this.performBackup();
          }, SYNC_MODES.BACKUP_INTERVAL_MS);
          this.syncTimers.set(`${feature}_backup`, backupTimer);
        }
        break;

      case 'smart':
        // Set up presence-based sync for shopping
        if (feature === 'shopping') {
          await this.setupSmartShoppingSync();
        } else {
          // Fallback to lite for inventory
          await this.setupSyncMode(feature, 'lite');
        }
        break;

      case 'realtime':
        // Always-on realtime
        await this.enableRealtimeSync(feature);
        break;
    }
  }

  /**
   * Set up smart shopping sync with presence detection
   */
  private async setupSmartShoppingSync() {
    if (!this.householdId || !this.userId) return;

    // Initialize presence
    await presenceService.initialize(this.userId);

    // Join shopping list presence channel
    const activeUsers = await presenceService.joinChannel(`shopping_${this.householdId}`);
    this.metadata.activeUsers = activeUsers;

    // Subscribe to presence changes
    presenceService.onPresenceChange(`shopping_${this.householdId}`, (users) => {
      this.metadata.activeUsers = users.length;

      // Enable/disable realtime based on presence
      if (shouldEnableRealtime('smart', users.length, this.metadata.isOnline)) {
        this.enableRealtimeSync('shopping');
      } else {
        this.disableRealtimeSync('shopping');
        // Fall back to lite sync
        this.setupSyncMode('shopping', 'lite');
      }
    });

    // Initial sync decision
    if (shouldEnableRealtime('smart', activeUsers, this.metadata.isOnline)) {
      await this.enableRealtimeSync('shopping');
    } else {
      await this.setupSyncMode('shopping', 'lite');
    }
  }

  /**
   * Perform lite sync for a feature
   */
  private async performLiteSync(feature: 'inventory' | 'shopping') {
    if (!this.metadata.isOnline || !this.householdId) {
      console.log(`[Sync] Cannot perform lite sync - online: ${this.metadata.isOnline}, householdId: ${this.householdId}`);
      return;
    }

    const now = Date.now();

    // Check if enough time has passed
    if (this.metadata.lastSync && (now - this.metadata.lastSync) < SYNC_MODES.LITE_SYNC_INTERVAL_MS) {
      const timeLeft = SYNC_MODES.LITE_SYNC_INTERVAL_MS - (now - this.metadata.lastSync);
      console.log(`[Sync] Skipping lite sync - ${Math.round(timeLeft / 1000)}s until next sync`);
      return;
    }

    console.log(`[Sync] Performing lite sync for ${feature}`);

    try {
      // Pull changes from server
      await this.pullChanges(feature);

      // Push local changes
      await this.pushChanges(feature);

      this.metadata.lastSync = now;
      await this.saveMetadata();
      console.log(`[Sync] Lite sync completed for ${feature}`);
    } catch (error) {
      console.error(`[Sync] Lite sync failed for ${feature}:`, error);
    }
  }

  /**
   * Pull changes from server
   */
  private async pullChanges(feature: 'inventory' | 'shopping') {
    if (!this.householdId) return;

    if (feature === 'inventory') {
      const { data, error } = await supabase
        .from('pantry_items')
        .select('*')
        .eq('household_id', this.householdId)
        .eq('status', 'active')
        .gte('updated_at', new Date(this.metadata.lastSync || 0).toISOString());

      if (!error && data) {
        // Merge with local store
        const store = useInventoryStore.getState();
        data.forEach(item => {
          const localItem = store.items.find(i => i.id === item.id);
          if (!localItem || new Date(item.updated_at) > new Date(localItem.updatedAt || 0)) {
            // Server version is newer
            store.updateItem(item.id, {
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              location: item.location,
              category: item.category,
              expirationDate: item.expiry_date,
              notes: item.notes,
            });
          }
        });
      }
    }

    if (feature === 'shopping') {
      // Similar logic for shopping list
      // ... implementation
    }
  }

  /**
   * Push local changes to server
   */
  private async pushChanges(feature: 'inventory' | 'shopping') {
    if (!this.householdId || this.syncQueue.length === 0) {
      console.log(`[Sync] pushChanges skipped - householdId: ${this.householdId}, queue: ${this.syncQueue.length}`);
      return;
    }

    console.log(`[Sync] Pushing ${feature} changes - Queue has ${this.syncQueue.length} operations`);

    // Process queue in batches
    const batch = this.syncQueue.filter(op => {
      if (feature === 'inventory') return op.table === 'pantry_items';
      if (feature === 'shopping') return op.table === 'shopping_list_items';
      return false;
    });

    console.log(`[Sync] Found ${batch.length} ${feature} operations to sync`);

    for (const operation of batch) {
      console.log(`[Sync] Executing operation: ${operation.type} on ${operation.table}`);
      await this.executeOperation(operation);
      // Remove the operation from queue after successful execution
      const index = this.syncQueue.findIndex(op => op.id === operation.id);
      if (index !== -1) {
        this.syncQueue.splice(index, 1);
      }
    }

    this.metadata.pendingChanges = this.syncQueue.length;
    console.log(`[Sync] Push completed - Remaining queue: ${this.syncQueue.length}`);
  }

  /**
   * Execute a single sync operation
   */
  private async executeOperation(operation: SyncOperation) {
    try {
      console.log(`[Sync] Executing ${operation.type} on ${operation.table}`, operation.data);

      let result;
      switch (operation.type) {
        case 'add':
          result = await supabase.from(operation.table).insert(operation.data);
          console.log(`[Sync] Insert result:`, result.error ? `Error: ${result.error.message}` : 'Success');
          if (result.error) {
            console.error(`[Sync] Insert failed:`, result.error);
            throw result.error;
          }
          break;
        case 'update':
          result = await supabase
            .from(operation.table)
            .update(operation.data)
            .eq('id', operation.data.id);
          console.log(`[Sync] Update result:`, result.error ? `Error: ${result.error.message}` : 'Success');
          if (result.error) {
            console.error(`[Sync] Update failed:`, result.error);
            throw result.error;
          }
          break;
        case 'delete':
          result = await supabase
            .from(operation.table)
            .update({ status: 'deleted' })
            .eq('id', operation.data.id);
          console.log(`[Sync] Delete result:`, result.error || 'Success');
          if (result.error) throw result.error;
          break;
      }

      console.log(`[Sync] Operation completed successfully`);
      this.metadata.lastSync = Date.now();
    } catch (error: any) {
      console.error(`[Sync] Operation failed:`, error);
      console.error(`[Sync] Operation details:`, {
        type: operation.type,
        table: operation.table,
        retries: operation.retries,
        data: operation.data
      });

      operation.retries++;

      if (operation.retries < SYNC_MODES.MAX_RETRY_ATTEMPTS) {
        // Re-queue for retry with delay
        console.log(`[Sync] Retrying operation (attempt ${operation.retries}/${SYNC_MODES.MAX_RETRY_ATTEMPTS})`);
        setTimeout(() => {
          this.syncQueue.push(operation);
        }, SYNC_MODES.RETRY_DELAY_MS * operation.retries);
      } else {
        console.error(`[Sync] Operation failed permanently after ${operation.retries} attempts. Removing from queue.`);
        // Don't re-queue after max retries to prevent infinite loop
      }
    }
  }

  /**
   * Enable realtime sync for a feature
   */
  private async enableRealtimeSync(feature: 'inventory' | 'shopping') {
    if (!this.householdId) return;

    const table = feature === 'inventory' ? 'pantry_items' : 'shopping_list_items';
    const subId = `${feature}_realtime`;

    // Avoid duplicate subscriptions
    if (this.realtimeSubscriptions.has(subId)) return;

    const subscription = supabase
      .channel(`${table}:${this.householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
          filter: `household_id=eq.${this.householdId}`,
        },
        (payload) => {
          this.handleRealtimeChange(feature, payload);
        }
      )
      .subscribe();

    this.realtimeSubscriptions.set(subId, subscription);
    console.log(`Realtime enabled for ${feature}`);
  }

  /**
   * Disable realtime sync for a feature
   */
  private async disableRealtimeSync(feature: 'inventory' | 'shopping') {
    const subId = `${feature}_realtime`;
    const subscription = this.realtimeSubscriptions.get(subId);

    if (subscription) {
      await subscription.unsubscribe();
      this.realtimeSubscriptions.delete(subId);
      console.log(`Realtime disabled for ${feature}`);
    }
  }

  /**
   * Handle realtime changes
   */
  private handleRealtimeChange(feature: 'inventory' | 'shopping', payload: any) {
    console.log(`Realtime update for ${feature}:`, payload.eventType);

    // Update local store based on change
    if (feature === 'inventory' && payload.new) {
      const store = useInventoryStore.getState();
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        store.updateItem(payload.new.id, payload.new);
      } else if (payload.eventType === 'DELETE') {
        store.deleteItem(payload.old.id);
      }
    }
  }

  /**
   * Perform daily backup
   */
  private async performBackup() {
    if (!this.householdId) return;

    const now = Date.now();

    // Check if enough time has passed
    if (this.metadata.lastBackup && (now - this.metadata.lastBackup) < SYNC_MODES.BACKUP_INTERVAL_MS) {
      return;
    }

    try {
      const inventoryStore = useInventoryStore.getState();
      const shoppingStore = useShoppingListStore.getState();

      const backup = {
        timestamp: now,
        version: '1.0',
        inventory: inventoryStore.items,
        shopping: shoppingStore.items,
        metadata: this.metadata,
      };

      // Save to Supabase Storage
      const fileName = `${this.householdId}/backup_${new Date().toISOString().split('T')[0]}.json`;
      const { error } = await supabase.storage
        .from('backups')
        .upload(fileName, JSON.stringify(backup), {
          contentType: 'application/json',
          upsert: true,
        });

      if (!error) {
        this.metadata.lastBackup = now;
        await this.saveMetadata();
        console.log('Backup completed successfully');
      }
    } catch (error) {
      console.error('Backup failed:', error);
    }
  }

  /**
   * Queue an operation for sync
   */
  queueOperation(type: 'add' | 'update' | 'delete' | 'sync', table: string, data: any) {
    console.log(`[Sync] Queuing operation: ${type} for ${table}`);

    // Handle force sync
    if (type === 'sync' && table === 'force_sync') {
      console.log('[Sync] Force sync requested');
      if (this.isInitialized) {
        this.processPendingSync();
      }
      return;
    }

    // Filter out invalid operations like sync_trigger
    const supportedTables = ['pantry_items', 'shopping_list_items', 'shopping_lists'];
    if (!supportedTables.includes(table)) {
      console.log(`[Sync] Ignoring operation for unsupported table: ${table}`);
      return;
    }

    const operation: SyncOperation = {
      id: `${Date.now()}_${Math.random()}`,
      type: type as 'add' | 'update' | 'delete',
      table,
      data,
      timestamp: Date.now(),
      retries: 0,
    };

    // If not initialized yet, store in pre-init queue
    if (!this.isInitialized || !this.householdId) {
      console.log('[Sync] Service not initialized, queuing for later');
      this.preInitQueue.push(operation);
      console.log(`[Sync] Pre-init queue size: ${this.preInitQueue.length}`);
      return;
    }

    this.syncQueue.push(operation);
    this.metadata.pendingChanges = this.syncQueue.length;
    console.log(`[Sync] Queue size: ${this.syncQueue.length}`);

    // Try immediate sync if online
    if (this.metadata.isOnline) {
      this.processPendingSync();
    }
  }

  /**
   * Process pending sync operations
   */
  private async processPendingSync() {
    console.log(`[Sync] Processing pending sync - Queue: ${this.syncQueue.length}, HouseholdId: ${this.householdId}`);

    if (this.syncQueue.length === 0) {
      console.log('[Sync] No pending operations to sync');
      return;
    }

    if (!this.householdId) {
      console.log('[Sync] Cannot sync - no householdId set');
      return;
    }

    await this.pushChanges('inventory');
    await this.pushChanges('shopping');
  }

  /**
   * Load metadata from storage
   */
  private async loadMetadata() {
    try {
      const stored = await AsyncStorage.getItem('sync_metadata');
      if (stored) {
        this.metadata = { ...this.metadata, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Failed to load sync metadata:', error);
    }
  }

  /**
   * Save metadata to storage
   */
  private async saveMetadata() {
    try {
      await AsyncStorage.setItem('sync_metadata', JSON.stringify(this.metadata));
    } catch (error) {
      console.error('Failed to save sync metadata:', error);
    }
  }

  /**
   * Get sync status for UI
   */
  getSyncStatus() {
    return {
      mode: this.metadata.syncMode,
      isOnline: this.metadata.isOnline,
      lastSync: this.metadata.lastSync,
      lastBackup: this.metadata.lastBackup,
      pendingChanges: this.metadata.pendingChanges,
      activeUsers: this.metadata.activeUsers,
      isRealtime: this.realtimeSubscriptions.size > 0,
    };
  }

  /**
   * Manually enable co-shopping mode
   */
  async enableCoShopping() {
    if (!this.householdId || !this.userId) {
      console.log('[Sync] Cannot enable co-shopping - not initialized');
      return false;
    }

    console.log('[Sync] Enabling co-shopping mode');

    // Initialize presence if not already done
    await presenceService.initialize(this.userId);

    // Join shopping presence channel
    const activeUsers = await presenceService.joinChannel(`shopping_${this.householdId}`);
    this.metadata.activeUsers = activeUsers;

    // If 2+ users, enable realtime
    if (activeUsers >= 2) {
      console.log(`[Sync] ${activeUsers} users active - enabling realtime`);
      await this.enableRealtimeSync('shopping');
    }

    return activeUsers;
  }

  /**
   * Manually disable co-shopping mode
   */
  async disableCoShopping() {
    console.log('[Sync] Disabling co-shopping mode');

    // Leave presence channel
    await presenceService.leaveChannel(`shopping_${this.householdId}`);

    // Disable realtime
    await this.disableRealtimeSync('shopping');

    // Reset active users
    this.metadata.activeUsers = 1;

    return true;
  }

  /**
   * Clean up all subscriptions and timers
   */
  async cleanup() {
    // Clear all timers
    this.syncTimers.forEach(timer => clearInterval(timer));
    this.syncTimers.clear();

    // Unsubscribe from all realtime
    for (const sub of this.realtimeSubscriptions.values()) {
      await sub.unsubscribe();
    }
    this.realtimeSubscriptions.clear();

    // Clean up presence
    await presenceService.cleanup();
  }
}

// Export singleton instance
export const smartSyncService = new SmartSyncService();