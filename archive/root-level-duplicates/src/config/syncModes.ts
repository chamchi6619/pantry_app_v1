/**
 * Smart Sync Configuration
 * Defines sync strategies for different features to optimize performance and cost
 */

export type SyncMode = 'off' | 'lite' | 'smart' | 'realtime';

export interface SyncConfig {
  // Feature-specific modes
  INVENTORY_MODE: SyncMode;
  SHOPPING_MODE: SyncMode;
  RECEIPTS_MODE: 'cloud'; // Always cloud

  // Timing intervals
  LITE_SYNC_INTERVAL_MS: number;
  BACKUP_INTERVAL_MS: number;
  PRESENCE_TIMEOUT_MS: number;
  PRESENCE_CHECK_INTERVAL_MS: number;

  // Performance settings
  MAX_RETRY_ATTEMPTS: number;
  RETRY_DELAY_MS: number;
  BATCH_SIZE: number;

  // Cost optimization
  MIN_USERS_FOR_REALTIME: number;
  AUTO_DOWNGRADE_AFTER_MS: number;
}

export const SYNC_MODES: SyncConfig = {
  // Smart defaults: Local-first with selective sync
  INVENTORY_MODE: 'lite',        // Periodic sync every 5 min + daily backup
  SHOPPING_MODE: 'smart',         // Realtime only when co-shopping
  RECEIPTS_MODE: 'cloud',         // Always process in cloud

  // Sync intervals
  LITE_SYNC_INTERVAL_MS: 5 * 60 * 1000,      // 5 minutes
  BACKUP_INTERVAL_MS: 24 * 60 * 60 * 1000,   // 24 hours
  PRESENCE_TIMEOUT_MS: 30 * 1000,            // 30 seconds inactive = offline
  PRESENCE_CHECK_INTERVAL_MS: 10 * 1000,     // Check presence every 10 seconds

  // Performance
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
  BATCH_SIZE: 50,                            // Sync items in batches

  // Cost optimization
  MIN_USERS_FOR_REALTIME: 2,                 // Need 2+ users for realtime
  AUTO_DOWNGRADE_AFTER_MS: 5 * 60 * 1000,    // Downgrade to lite after 5 min solo
};

/**
 * Get human-readable sync mode description
 */
export function getSyncModeDescription(mode: SyncMode): string {
  switch (mode) {
    case 'off':
      return 'Local only';
    case 'lite':
      return 'Periodic sync';
    case 'smart':
      return 'Adaptive sync';
    case 'realtime':
      return 'Live sync';
    default:
      return mode;
  }
}

/**
 * Determine if realtime should be enabled based on mode and context
 */
export function shouldEnableRealtime(
  mode: SyncMode,
  activeUsers: number = 1,
  isOnline: boolean = true
): boolean {
  if (!isOnline) return false;

  switch (mode) {
    case 'off':
    case 'lite':
      return false;
    case 'smart':
      return activeUsers >= SYNC_MODES.MIN_USERS_FOR_REALTIME;
    case 'realtime':
      return true;
    default:
      return false;
  }
}

/**
 * Get sync interval based on mode
 */
export function getSyncInterval(mode: SyncMode): number | null {
  switch (mode) {
    case 'off':
      return null;
    case 'lite':
    case 'smart':
      return SYNC_MODES.LITE_SYNC_INTERVAL_MS;
    case 'realtime':
      return 0; // Immediate
    default:
      return null;
  }
}

/**
 * Sync mode recommendations based on usage patterns
 */
export const SYNC_RECOMMENDATIONS = {
  solo: {
    inventory: 'lite' as SyncMode,
    shopping: 'lite' as SyncMode,
  },
  couple: {
    inventory: 'lite' as SyncMode,
    shopping: 'smart' as SyncMode,
  },
  family: {
    inventory: 'smart' as SyncMode,
    shopping: 'realtime' as SyncMode,
  },
  powerUser: {
    inventory: 'realtime' as SyncMode,
    shopping: 'realtime' as SyncMode,
  },
};