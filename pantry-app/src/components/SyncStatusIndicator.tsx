import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSmartSync } from '../hooks/useSmartSync';

export function SyncStatusIndicator() {
  const {
    syncStatus,
    formatLastSync,
    formatLastBackup,
    syncNow,
    isCoShopping,
    hasPendingChanges,
    isSyncHealthy,
    showSyncStatus,
    showActiveUsers,
    showBackupStatus,
  } = useSmartSync();

  if (!showSyncStatus) return null;

  const getSyncIcon = () => {
    if (!syncStatus.isOnline) {
      return { name: 'cloud-offline', color: '#6B7280' };
    }
    if (syncStatus.isRealtime) {
      return { name: 'flash', color: '#10B981' };
    }
    if (hasPendingChanges) {
      return { name: 'sync', color: '#F59E0B' };
    }
    return { name: 'cloud-done', color: '#10B981' };
  };

  const { name: iconName, color: iconColor } = getSyncIcon();

  return (
    <View style={styles.container}>
      {/* Main sync status */}
      <TouchableOpacity onPress={syncNow} style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <Ionicons
            name={iconName as any}
            size={16}
            color={iconColor}
          />
          <Text style={[styles.statusText, { color: iconColor }]}>
            {syncStatus.modeDescription}
          </Text>
        </View>

        <View style={styles.statusRight}>
          {/* Pending changes indicator */}
          {hasPendingChanges && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingText}>{syncStatus.pendingChanges}</Text>
            </View>
          )}

          {/* Active users for co-shopping */}
          {showActiveUsers && isCoShopping && (
            <View style={styles.usersBadge}>
              <Ionicons name="people" size={12} color="#FFF" />
              <Text style={styles.usersText}>{syncStatus.activeUsers}</Text>
            </View>
          )}

          {/* Realtime indicator */}
          {syncStatus.isRealtime && (
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Expanded details (collapsible) */}
      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Last sync:</Text>
          <Text style={styles.detailValue}>{formatLastSync()}</Text>
        </View>

        {showBackupStatus && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Last backup:</Text>
            <Text style={styles.detailValue}>{formatLastBackup()}</Text>
          </View>
        )}

        {!syncStatus.isOnline && (
          <View style={styles.offlineWarning}>
            <Ionicons name="warning" size={14} color="#EF4444" />
            <Text style={styles.offlineText}>Offline - changes will sync when connected</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingBadge: {
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pendingText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
  usersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 2,
  },
  usersText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
  liveBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  liveText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700',
  },
  details: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  detailLabel: {
    fontSize: 11,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 11,
    color: '#374151',
    fontWeight: '500',
  },
  offlineWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    padding: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 4,
  },
  offlineText: {
    fontSize: 11,
    color: '#991B1B',
  },
});

/**
 * Minimal sync badge for inline use
 */
export function SyncBadge() {
  const { syncStatus, isCoShopping } = useSmartSync();

  if (!syncStatus.isOnline) {
    return (
      <View style={badgeStyles.badge}>
        <Ionicons name="cloud-offline" size={12} color="#6B7280" />
      </View>
    );
  }

  if (syncStatus.isRealtime) {
    return (
      <View style={[badgeStyles.badge, badgeStyles.live]}>
        <Ionicons name="flash" size={12} color="#FFF" />
        <Text style={badgeStyles.liveText}>LIVE</Text>
      </View>
    );
  }

  if (isCoShopping) {
    return (
      <View style={[badgeStyles.badge, badgeStyles.collab]}>
        <Ionicons name="people" size={12} color="#FFF" />
        <Text style={badgeStyles.collabText}>{syncStatus.activeUsers}</Text>
      </View>
    );
  }

  return null;
}

const badgeStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    gap: 2,
  },
  live: {
    backgroundColor: '#EF4444',
  },
  liveText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
  collab: {
    backgroundColor: '#3B82F6',
  },
  collabText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
});