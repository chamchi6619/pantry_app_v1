/**
 * Feature flags for smart sync configuration
 * Uses intelligent sync modes instead of simple on/off
 */

import { SyncMode } from './syncModes';

export const FEATURE_FLAGS = {
  // Core Infrastructure
  ENABLE_SUPABASE_AUTH: true, // Authentication enabled

  // Smart Sync Modes (not just on/off anymore)
  SYNC_MODE_INVENTORY: 'lite' as SyncMode,     // 'off' | 'lite' | 'realtime'
  SYNC_MODE_SHOPPING: 'smart' as SyncMode,     // 'off' | 'lite' | 'smart' | 'realtime'
  SYNC_MODE_RECEIPTS: 'cloud',                 // Always cloud for OCR

  // Feature-specific flags
  USE_DB_RECIPES: false,           // Load recipes from Supabase
  SAVE_RECEIPTS_TO_DB: true,       // Save receipt OCR results

  // OCR Configuration
  OCR_METHOD: 'cloud' as 'cloud' | 'device',  // 'cloud' = Google Cloud Vision API, 'device' = On-device (iOS/ML Kit)
  SHOW_OCR_METHOD_NOTICE: __DEV__,           // Show OCR method notice in dev mode

  // Sync Configuration
  ENABLE_PRESENCE: true,           // Enable presence detection for co-shopping
  ENABLE_BACKUP: true,            // Enable daily backups
  ENABLE_OFFLINE_QUEUE: true,     // Queue operations when offline

  // Performance
  BATCH_SYNC_OPERATIONS: true,    // Batch multiple operations
  SYNC_BATCH_SIZE: 50,            // Items per batch

  // UI Configuration
  SHOW_SYNC_STATUS: true,         // Show sync indicators in UI
  SHOW_ACTIVE_USERS: true,        // Show who's actively shopping
  SHOW_BACKUP_STATUS: true,       // Show last backup time

  // Debug flags
  LOG_SYNC_OPERATIONS: false,     // Log sync operations (disable in production)
  LOG_PRESENCE_EVENTS: false,     // Log presence changes
};

// Helper to check if any sync is enabled
export const isSyncEnabled = () => {
  return FEATURE_FLAGS.SYNC_MODE_INVENTORY !== 'off' ||
         FEATURE_FLAGS.SYNC_MODE_SHOPPING !== 'off' ||
         FEATURE_FLAGS.USE_DB_RECIPES ||
         FEATURE_FLAGS.SAVE_RECEIPTS_TO_DB;
};

// Helper to check if we should initialize Supabase
export const shouldInitializeSupabase = () => {
  return FEATURE_FLAGS.ENABLE_SUPABASE_AUTH || isSyncEnabled();
};

// Helper to check if realtime is needed
export const isRealtimeNeeded = () => {
  return FEATURE_FLAGS.SYNC_MODE_INVENTORY === 'realtime' ||
         FEATURE_FLAGS.SYNC_MODE_SHOPPING === 'realtime' ||
         FEATURE_FLAGS.SYNC_MODE_SHOPPING === 'smart';
};