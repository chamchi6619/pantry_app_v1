import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../../core/constants/theme';
import { useReceiptStore } from '../../../stores/receiptStore';
import { useInventoryStore } from '../../../stores/inventoryStore';
import { useShoppingListStore } from '../../../stores/shoppingListStore';
import { useAuth } from '../../../contexts/AuthContext';

export const ProfileScreen: React.FC = () => {
  const { signOut, user } = useAuth();
  const receipts = useReceiptStore((state) => state.receipts);
  const deleteReceipt = useReceiptStore((state) => state.deleteReceipt);

  const inventoryCount = useInventoryStore((state) => state.items.length);
  const shoppingCount = useShoppingListStore((state) => state.items.length);

  // Calculate derived values with useMemo to prevent infinite loops
  const totalSpent = React.useMemo(() => {
    return receipts.reduce((sum, receipt) => sum + receipt.totalAmount, 0);
  }, [receipts]);

  const recentReceipts = React.useMemo(() => {
    return [...receipts]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [receipts]);

  const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const handleDeleteReceipt = (id: string) => {
    Alert.alert(
      'Delete Receipt',
      'Are you sure you want to delete this receipt?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteReceipt(id),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>👤</Text>
          </View>
          <Text style={styles.userEmail}>{user?.email || 'Not signed in'}</Text>
        </View>

        {/* Sign Out Button */}
        <Pressable style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

        {/* Stats Section */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{inventoryCount}</Text>
            <Text style={styles.statLabel}>Inventory Items</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{shoppingCount}</Text>
            <Text style={styles.statLabel}>Shopping Items</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{receipts.length}</Text>
            <Text style={styles.statLabel}>Receipts</Text>
          </View>
        </View>

        {/* Spending Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Spending Overview</Text>
          <View style={styles.spendingCard}>
            <Text style={styles.spendingLabel}>Total Spent</Text>
            <Text style={styles.spendingAmount}>{formatCurrency(totalSpent)}</Text>
            <Text style={styles.spendingSubtext}>
              From {receipts.length} receipt{receipts.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {/* Receipt History */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Receipt History</Text>
            {receipts.length > 5 && (
              <Pressable>
                <Text style={styles.viewAllText}>View All</Text>
              </Pressable>
            )}
          </View>

          {recentReceipts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🧾</Text>
              <Text style={styles.emptyText}>No receipts yet</Text>
              <Text style={styles.emptySubtext}>
                Scan your first receipt to start tracking expenses
              </Text>
            </View>
          ) : (
            recentReceipts.map((receipt) => (
              <Pressable
                key={receipt.id}
                style={styles.receiptCard}
                onPress={() => setExpandedReceipt(
                  expandedReceipt === receipt.id ? null : receipt.id
                )}
              >
                <View style={styles.receiptHeader}>
                  <View style={styles.receiptInfo}>
                    <Text style={styles.storeName}>{receipt.storeName}</Text>
                    <Text style={styles.receiptDate}>{formatDate(receipt.date)}</Text>
                  </View>
                  <View style={styles.receiptRight}>
                    <Text style={styles.receiptTotal}>{formatCurrency(receipt.totalAmount)}</Text>
                    <Text style={styles.chevron}>
                      {expandedReceipt === receipt.id ? '⌃' : '⌄'}
                    </Text>
                  </View>
                </View>

                {expandedReceipt === receipt.id && (
                  <View style={styles.receiptDetails}>
                    <View style={styles.itemsList}>
                      {receipt.items.slice(0, 5).map((item, index) => (
                        <View key={index} style={styles.receiptItem}>
                          <Text style={styles.itemName}>
                            {item.quantity} {item.unit} - {item.name}
                          </Text>
                          {item.price && (
                            <Text style={styles.itemPrice}>{formatCurrency(item.price)}</Text>
                          )}
                        </View>
                      ))}
                      {receipt.items.length > 5 && (
                        <Text style={styles.moreItems}>
                          +{receipt.items.length - 5} more items
                        </Text>
                      )}
                    </View>
                    <Pressable
                      style={styles.deleteButton}
                      onPress={() => handleDeleteReceipt(receipt.id)}
                    >
                      <Text style={styles.deleteText}>Delete Receipt</Text>
                    </Pressable>
                  </View>
                )}
              </Pressable>
            ))
          )}
        </View>

        {/* Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <Pressable style={styles.settingRow}>
            <Text style={styles.settingIcon}>🔔</Text>
            <Text style={styles.settingText}>Notifications</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <Pressable style={styles.settingRow}>
            <Text style={styles.settingIcon}>🎨</Text>
            <Text style={styles.settingText}>Appearance</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <Pressable style={styles.settingRow}>
            <Text style={styles.settingIcon}>📊</Text>
            <Text style={styles.settingText}>Export Data</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <Pressable style={styles.settingRow}>
            <Text style={styles.settingIcon}>ℹ️</Text>
            <Text style={styles.settingText}>About</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 40,
  },
  userEmail: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  signOutButton: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.error,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  signOutText: {
    ...theme.typography.body,
    color: '#fff',
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    flex: 1,
    marginHorizontal: theme.spacing.xs,
  },
  statValue: {
    ...theme.typography.h2,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  statLabel: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
  },
  section: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    ...theme.typography.h3,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  viewAllText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  spendingCard: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
  },
  spendingLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    opacity: 0.9,
    marginBottom: theme.spacing.xs,
  },
  spendingAmount: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: theme.spacing.xs,
  },
  spendingSubtext: {
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.8,
  },
  receiptCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptInfo: {
    flex: 1,
  },
  storeName: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontWeight: '600',
  },
  receiptDate: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    marginTop: 2,
  },
  receiptRight: {
    alignItems: 'flex-end',
  },
  receiptTotal: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  receiptDetails: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  itemsList: {
    marginBottom: theme.spacing.sm,
  },
  receiptItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
  },
  itemName: {
    ...theme.typography.caption,
    color: theme.colors.text,
    flex: 1,
  },
  itemPrice: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  moreItems: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    fontStyle: 'italic',
    marginTop: theme.spacing.xs,
  },
  deleteButton: {
    alignSelf: 'center',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  deleteText: {
    color: theme.colors.error,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl * 2,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  emptySubtext: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
  },
  settingIcon: {
    fontSize: 20,
    marginRight: theme.spacing.md,
  },
  settingText: {
    ...theme.typography.body,
    color: theme.colors.text,
    flex: 1,
  },
});