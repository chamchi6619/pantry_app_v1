import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../core/constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useHousehold } from '../../../hooks/useHousehold';
import { useMonthlySpending } from '../../../hooks/useMonthlySpending';
import { supabase } from '../../../lib/supabase';

interface RecentReceipt {
  id: string;
  store_name: string;
  receipt_date: string;
  total_amount_cents: number;
}

export const ProfileScreenV3: React.FC = () => {
  const navigation = useNavigation();
  const { signOut, user } = useAuth();
  const { currentHousehold, householdMembers } = useHousehold();
  const { data: spending } = useMonthlySpending();

  const [recentReceipts, setRecentReceipts] = useState<RecentReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSpent, setTotalSpent] = useState(0);
  const [receiptCount, setReceiptCount] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      if (!currentHousehold?.id) return;

      try {
        setLoading(true);

        // Get recent receipts
        const { data: receipts, error } = await supabase
          .from('receipts')
          .select('id, store_name, receipt_date, total_amount_cents')
          .eq('household_id', currentHousehold.id)
          .order('receipt_date', { ascending: false })
          .limit(3);

        if (error) throw error;
        setRecentReceipts(receipts || []);

        // Get total count and sum
        const { data: allReceipts, count } = await supabase
          .from('receipts')
          .select('total_amount_cents', { count: 'exact' })
          .eq('household_id', currentHousehold.id);

        const total = (allReceipts || []).reduce(
          (sum, r) => sum + (r.total_amount_cents || 0),
          0
        );
        setTotalSpent(total);
        setReceiptCount(count || 0);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentHousehold?.id]);

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatCompactCurrency = (cents: number) => {
    const dollars = cents / 100;
    if (dollars >= 1000) {
      return `$${(dollars / 1000).toFixed(1)}k`;
    }
    return `$${dollars.toFixed(0)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getUserInitials = () => {
    const email = user?.email || '';
    const name = email.split('@')[0];
    return name.substring(0, 2).toUpperCase();
  };

  const getUserFirstName = () => {
    return user?.email?.split('@')[0] || 'User';
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Compact Header */}
        <View style={styles.header}>
          <View style={styles.headerMain}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getUserInitials()}</Text>
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.userName}>{getUserFirstName()}</Text>
              {currentHousehold && (
                <View style={styles.householdRow}>
                  <Ionicons name="home" size={12} color="#9CA3AF" />
                  <Text style={styles.householdText}>{currentHousehold.name}</Text>
                </View>
              )}
            </View>
            <Pressable
              style={styles.settingsButton}
              onPress={() => {
                // Navigate to settings
              }}
            >
              <Ionicons name="settings-outline" size={22} color="#6B7280" />
            </Pressable>
          </View>

          {/* Inline Stats */}
          {!loading && (
            <View style={styles.statsRow}>
              <View style={styles.statChip}>
                <Text style={styles.statChipValue}>{formatCompactCurrency(totalSpent)}</Text>
                <Text style={styles.statChipLabel}>tracked</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statChipValue}>{receiptCount}</Text>
                <Text style={styles.statChipLabel}>receipts</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statChipValue}>{householdMembers?.length || 0}</Text>
                <Text style={styles.statChipLabel}>members</Text>
              </View>
            </View>
          )}
        </View>

        {/* Quick Actions - Prominent */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <Pressable
              style={({ pressed }) => [
                styles.actionCard,
                pressed && styles.actionCardPressed,
              ]}
              onPress={() => navigation.navigate('Scanner')}
            >
              <View style={[styles.actionIconLarge, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="camera" size={32} color="#3B82F6" />
              </View>
              <Text style={styles.actionTitle}>Scan Receipt</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionCard,
                pressed && styles.actionCardPressed,
              ]}
              onPress={() => navigation.navigate('Inventory')}
            >
              <View style={[styles.actionIconLarge, { backgroundColor: '#F0FDF4' }]}>
                <Ionicons name="cube" size={32} color={theme.colors.primary} />
              </View>
              <Text style={styles.actionTitle}>My Pantry</Text>
            </Pressable>
          </View>

          <View style={styles.actionsGrid}>
            <Pressable
              style={({ pressed }) => [
                styles.actionCard,
                pressed && styles.actionCardPressed,
              ]}
              onPress={() => navigation.navigate('Shopping')}
            >
              <View style={[styles.actionIconLarge, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="cart" size={32} color="#F59E0B" />
              </View>
              <Text style={styles.actionTitle}>Shopping List</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionCard,
                pressed && styles.actionCardPressed,
              ]}
              onPress={() => navigation.navigate('PurchaseHistory')}
            >
              <View style={[styles.actionIconLarge, { backgroundColor: '#F5F3FF' }]}>
                <Ionicons name="bar-chart" size={32} color="#8B5CF6" />
              </View>
              <Text style={styles.actionTitle}>Analytics</Text>
            </Pressable>
          </View>
        </View>

        {/* Recent Purchases - Timeline Style */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Purchases</Text>
            <Pressable onPress={() => navigation.navigate('PurchaseHistory')}>
              <Text style={styles.viewAllLink}>See All</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : recentReceipts.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="receipt-outline" size={40} color="#D1D5DB" />
              </View>
              <Text style={styles.emptyStateText}>No purchases yet</Text>
              <Pressable
                style={styles.emptyStateCTA}
                onPress={() => navigation.navigate('Scanner')}
              >
                <Text style={styles.emptyStateCTAText}>Scan Your First Receipt</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.timeline}>
              {recentReceipts.map((receipt, index) => (
                <Pressable
                  key={receipt.id}
                  style={styles.timelineItem}
                  onPress={() => navigation.navigate('PurchaseHistory')}
                >
                  <View style={styles.timelineDot} />
                  {index < recentReceipts.length - 1 && <View style={styles.timelineLine} />}
                  <View style={styles.timelineContent}>
                    <View style={styles.timelineHeader}>
                      <Text style={styles.timelineStore}>{receipt.store_name}</Text>
                      <Text style={styles.timelineAmount}>
                        {formatCurrency(receipt.total_amount_cents)}
                      </Text>
                    </View>
                    <Text style={styles.timelineDate}>{formatDate(receipt.receipt_date)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Preferences - Compact Cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>

          <View style={styles.preferencesGrid}>
            <Pressable style={styles.preferenceCard}>
              <Ionicons name="restaurant" size={20} color={theme.colors.primary} />
              <Text style={styles.preferenceCardLabel}>Diet</Text>
              <View style={styles.preferenceCardBadge}>
                <Text style={styles.preferenceCardBadgeText}>Set</Text>
              </View>
            </Pressable>

            <Pressable style={styles.preferenceCard}>
              <Ionicons name="notifications" size={20} color="#3B82F6" />
              <Text style={styles.preferenceCardLabel}>Alerts</Text>
              <View style={[styles.preferenceCardBadge, { backgroundColor: '#DCFCE7' }]}>
                <Text style={[styles.preferenceCardBadgeText, { color: '#16A34A' }]}>On</Text>
              </View>
            </Pressable>

            <Pressable style={styles.preferenceCard}>
              <Ionicons name="storefront" size={20} color="#F59E0B" />
              <Text style={styles.preferenceCardLabel}>Stores</Text>
            </Pressable>
          </View>
        </View>

        {/* Account Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          <View style={styles.accountOptions}>
            <Pressable style={styles.accountOption}>
              <Ionicons name="people-outline" size={20} color="#6B7280" />
              <Text style={styles.accountOptionText}>Household</Text>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </Pressable>

            <Pressable style={styles.accountOption}>
              <Ionicons name="shield-outline" size={20} color="#6B7280" />
              <Text style={styles.accountOptionText}>Privacy</Text>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </Pressable>

            <Pressable style={styles.accountOption}>
              <Ionicons name="help-circle-outline" size={20} color="#6B7280" />
              <Text style={styles.accountOptionText}>Help</Text>
              <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
            </Pressable>
          </View>
        </View>

        {/* Sign Out */}
        <View style={styles.section}>
          <Pressable style={styles.signOutButton} onPress={signOut}>
            <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  householdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  householdText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  settingsButton: {
    padding: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  statChipValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  statChipLabel: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  actionsSection: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  actionCardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  actionIconLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  viewAllLink: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.primary,
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
  },
  emptyIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 16,
  },
  emptyStateCTA: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyStateCTAText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  timeline: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
  },
  timelineItem: {
    position: 'relative',
    flexDirection: 'row',
    paddingLeft: 32,
    paddingBottom: 20,
  },
  timelineDot: {
    position: 'absolute',
    left: 0,
    top: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
  },
  timelineLine: {
    position: 'absolute',
    left: 5.5,
    top: 16,
    width: 1,
    height: '100%',
    backgroundColor: '#E5E7EB',
  },
  timelineContent: {
    flex: 1,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  timelineStore: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  timelineAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
  },
  timelineDate: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  preferencesGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  preferenceCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    position: 'relative',
  },
  preferenceCardLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    marginTop: 8,
  },
  preferenceCardBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  preferenceCardBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
  },
  accountOptions: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  accountOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  accountOptionText: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    gap: 8,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.error,
  },
  bottomSpacer: {
    height: 40,
  },
});
