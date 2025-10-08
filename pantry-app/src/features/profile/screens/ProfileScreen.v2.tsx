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

export const ProfileScreenV2: React.FC = () => {
  const navigation = useNavigation();
  const { signOut, user } = useAuth();
  const { currentHousehold, householdMembers } = useHousehold();
  const { data: spending } = useMonthlySpending();

  const [recentReceipts, setRecentReceipts] = useState<RecentReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSpent, setTotalSpent] = useState(0);

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

        // Calculate total spent all-time
        const { data: allReceipts } = await supabase
          .from('receipts')
          .select('total_amount_cents')
          .eq('household_id', currentHousehold.id);

        const total = (allReceipts || []).reduce(
          (sum, r) => sum + (r.total_amount_cents || 0),
          0
        );
        setTotalSpent(total);
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
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
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
        {/* Compact Header with Stats */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getUserInitials()}</Text>
              </View>
              <View style={styles.headerInfo}>
                <Text style={styles.userName}>{getUserFirstName()}</Text>
                {currentHousehold && (
                  <View style={styles.householdRow}>
                    <Ionicons name="home" size={12} color="#6B7280" />
                    <Text style={styles.householdText}>{currentHousehold.name}</Text>
                  </View>
                )}
              </View>
            </View>
            <Pressable
              style={styles.settingsButton}
              onPress={() => {
                // Navigate to settings
              }}
            >
              <Ionicons name="settings-outline" size={24} color="#6B7280" />
            </Pressable>
          </View>

          {/* Quick Stats Bar */}
          {!loading && (
            <View style={styles.statsBar}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{formatCompactCurrency(totalSpent)}</Text>
                <Text style={styles.statLabel}>Total Tracked</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{recentReceipts.length}</Text>
                <Text style={styles.statLabel}>Receipts</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{householdMembers?.length || 0}</Text>
                <Text style={styles.statLabel}>Members</Text>
              </View>
            </View>
          )}
        </View>

        {/* Quick Actions Grid */}
        <View style={styles.section}>
          <View style={styles.actionsGrid}>
            <Pressable
              style={styles.actionCard}
              onPress={() => navigation.navigate('Scanner')}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#DBEAFE' }]}>
                <Ionicons name="camera" size={28} color="#2563EB" />
              </View>
              <Text style={styles.actionLabel}>Scan Receipt</Text>
            </Pressable>

            <Pressable
              style={styles.actionCard}
              onPress={() => navigation.navigate('Inventory')}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="cube" size={28} color="#16A34A" />
              </View>
              <Text style={styles.actionLabel}>Pantry</Text>
            </Pressable>

            <Pressable
              style={styles.actionCard}
              onPress={() => navigation.navigate('Shopping')}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="cart" size={28} color="#D97706" />
              </View>
              <Text style={styles.actionLabel}>Shopping</Text>
            </Pressable>

            <Pressable
              style={styles.actionCard}
              onPress={() => navigation.navigate('PurchaseHistory')}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#F3E8FF' }]}>
                <Ionicons name="receipt" size={28} color="#9333EA" />
              </View>
              <Text style={styles.actionLabel}>History</Text>
            </Pressable>
          </View>
        </View>

        {/* My Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>

          <View style={styles.preferencesList}>
            <Pressable style={styles.preferenceRow}>
              <Ionicons name="restaurant-outline" size={20} color="#6B7280" />
              <Text style={styles.preferenceText}>Dietary Preferences</Text>
              <View style={styles.preferenceBadge}>
                <Text style={styles.preferenceBadgeText}>Not set</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
            </Pressable>

            <View style={styles.preferenceDivider} />

            <Pressable style={styles.preferenceRow}>
              <Ionicons name="notifications-outline" size={20} color="#6B7280" />
              <Text style={styles.preferenceText}>Notifications</Text>
              <View style={[styles.preferenceBadge, styles.preferenceBadgeActive]}>
                <Text style={styles.preferenceBadgeActiveText}>On</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
            </Pressable>

            <View style={styles.preferenceDivider} />

            <Pressable style={styles.preferenceRow}>
              <Ionicons name="storefront-outline" size={20} color="#6B7280" />
              <Text style={styles.preferenceText}>Favorite Stores</Text>
              <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
            </Pressable>
          </View>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <Pressable onPress={() => navigation.navigate('PurchaseHistory')}>
              <Text style={styles.viewAllLink}>View All</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : recentReceipts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={40} color="#D1D5DB" />
              <Text style={styles.emptyStateText}>No activity yet</Text>
            </View>
          ) : (
            <View style={styles.activityList}>
              {recentReceipts.map((receipt) => (
                <Pressable
                  key={receipt.id}
                  style={styles.activityRow}
                  onPress={() => navigation.navigate('PurchaseHistory')}
                >
                  <View style={styles.activityIcon}>
                    <Ionicons name="receipt" size={16} color={theme.colors.primary} />
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityTitle}>{receipt.store_name}</Text>
                    <Text style={styles.activityDate}>{formatDate(receipt.receipt_date)}</Text>
                  </View>
                  <Text style={styles.activityAmount}>
                    {formatCurrency(receipt.total_amount_cents)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          <View style={styles.accountList}>
            <Pressable style={styles.accountRow}>
              <Ionicons name="people-outline" size={20} color="#6B7280" />
              <Text style={styles.accountText}>Household Settings</Text>
              <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
            </Pressable>

            <View style={styles.accountDivider} />

            <Pressable style={styles.accountRow}>
              <Ionicons name="shield-outline" size={20} color="#6B7280" />
              <Text style={styles.accountText}>Privacy</Text>
              <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
            </Pressable>

            <View style={styles.accountDivider} />

            <Pressable style={styles.accountRow}>
              <Ionicons name="help-circle-outline" size={20} color="#6B7280" />
              <Text style={styles.accountText}>Help</Text>
              <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
            </Pressable>
          </View>
        </View>

        {/* Sign Out */}
        <View style={styles.section}>
          <Pressable style={styles.signOutButton} onPress={signOut}>
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
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
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
    justifyContent: 'center',
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
    fontSize: 13,
    color: '#6B7280',
  },
  settingsButton: {
    padding: 8,
  },
  statsBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  viewAllLink: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.primary,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    textAlign: 'center',
  },
  preferencesList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  preferenceText: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
    fontWeight: '400',
  },
  preferenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  preferenceBadgeText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  preferenceBadgeActive: {
    backgroundColor: '#DCFCE7',
  },
  preferenceBadgeActiveText: {
    color: '#16A34A',
  },
  preferenceDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginLeft: 48,
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  },
  activityList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  activityDate: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  activityAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  accountList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  accountText: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
    fontWeight: '400',
  },
  accountDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginLeft: 48,
  },
  signOutButton: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FEE2E2',
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
