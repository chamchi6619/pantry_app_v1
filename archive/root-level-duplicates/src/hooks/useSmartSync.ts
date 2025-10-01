import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { smartSyncService } from '../services/smartSyncService';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { getSyncModeDescription } from '../config/syncModes';

export interface SyncStatus {
  mode: string;
  modeDescription: string;
  isOnline: boolean;
  isRealtime: boolean;
  lastSync: number | null;
  lastBackup: number | null;
  pendingChanges: number;
  activeUsers: number;
  syncHealthy: boolean;
}

/**
 * Hook to manage smart sync and provide sync status
 */
export function useSmartSync() {
  const { user, householdId } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    mode: 'off',
    modeDescription: 'Local only',
    isOnline: true,
    isRealtime: false,
    lastSync: null,
    lastBackup: null,
    pendingChanges: 0,
    activeUsers: 1,
    syncHealthy: true,
  });

  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    console.log(`[useSmartSync] Effect running - user: ${user?.id}, householdId: ${householdId}, isInitialized: ${isInitialized}`);

    if (!user || !householdId || isInitialized) {
      if (!user) console.log('[useSmartSync] No user, skipping init');
      if (!householdId) console.log('[useSmartSync] No householdId, skipping init');
      if (isInitialized) console.log('[useSmartSync] Already initialized, skipping');
      return;
    }

    const initializeSync = async () => {
      try {
        console.log(`[useSmartSync] Initializing smart sync service with household: ${householdId}`);
        // Initialize smart sync service
        await smartSyncService.initialize(householdId, user.id);
        setIsInitialized(true);
        console.log(`[useSmartSync] Smart sync service initialized successfully`);

        // Update status periodically
        const updateStatus = () => {
          const status = smartSyncService.getSyncStatus();
          setSyncStatus({
            mode: status.mode,
            modeDescription: getSyncModeDescription(status.mode as any),
            isOnline: status.isOnline,
            isRealtime: status.isRealtime,
            lastSync: status.lastSync,
            lastBackup: status.lastBackup,
            pendingChanges: status.pendingChanges,
            activeUsers: status.activeUsers,
            syncHealthy: status.isOnline && status.pendingChanges < 10,
          });
        };

        // Initial update
        updateStatus();

        // Update every 10 seconds
        const interval = setInterval(updateStatus, 10000);

        return () => {
          clearInterval(interval);
          smartSyncService.cleanup();
        };
      } catch (error) {
        console.error('Failed to initialize smart sync:', error);
      }
    };

    initializeSync();
  }, [user, householdId, isInitialized]);

  // Format time for display
  const formatLastSync = () => {
    if (!syncStatus.lastSync) return 'Never';

    const diff = Date.now() - syncStatus.lastSync;
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;

    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;

    return 'More than a day ago';
  };

  const formatLastBackup = () => {
    if (!syncStatus.lastBackup) return 'Never';

    const date = new Date(syncStatus.lastBackup);
    return date.toLocaleDateString();
  };

  // Force sync now
  const syncNow = async () => {
    // This will trigger immediate sync
    smartSyncService.queueOperation('update', 'sync_trigger', { timestamp: Date.now() });
  };

  return {
    syncStatus,
    isInitialized,
    formatLastSync,
    formatLastBackup,
    syncNow,

    // Computed properties
    isCoShopping: syncStatus.activeUsers > 1,
    hasPendingChanges: syncStatus.pendingChanges > 0,
    isSyncHealthy: syncStatus.syncHealthy,

    // Feature flags
    showSyncStatus: FEATURE_FLAGS.SHOW_SYNC_STATUS,
    showActiveUsers: FEATURE_FLAGS.SHOW_ACTIVE_USERS,
    showBackupStatus: FEATURE_FLAGS.SHOW_BACKUP_STATUS,
  };
}