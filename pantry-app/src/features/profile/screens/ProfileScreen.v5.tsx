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

export const ProfileScreenV5: React.FC = () => {
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

        const { data: receipts, error } = await supabase
          .from('receipts')
          .select('id, store_name, receipt_date, total_amount_cents')
          .eq('household_id', currentHousehold.id)
          .order('receipt_date', { ascending: false })
          .limit(5);

        if (error) throw error;
        setRecentReceipts(receipts || []);

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
        {/* Simple Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getUserInitials()}</Text>
            </View>
            <View>
              <Text style={styles.headerName}>{getUserFirstName()}</Text>
              {currentHousehold && (
                <Text style={styles.headerSubtext}>{currentHousehold.name}</Text>
              )}
            </View>
          </View>
          <Pressable onPress={() => {}}>
            <Ionicons name="settings-outline" size={24} color="#6B7280" />
          </Pressable>
        </View>

        {/* Stats Overview */}
        {!loading && (
          <View style={styles.statsOverview}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Lifetime</Text>
              <Text style={styles.statValue}>{formatCompactCurrency(totalSpent)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>This Month</Text>
              <Text style={styles.statValue}>
                {spending?.total_cents ? formatCompactCurrency(spending.total_cents) : '$0'}
              </Text>
            </View>
          </View>
        )}

        {/* Main Action Card */}
        <View style={styles.section}>
          <Pressable
            style={styles.mainActionCard}
            onPress={() => navigation.navigate('Scanner')}
          >
            <View style={styles.mainActionContent}>
              <View style={styles.mainActionLeft}>
                <Text style={styles.mainActionTitle}>Scan Receipt</Text>
                <Text style={styles.mainActionSubtitle}>Track your purchases instantly</Text>
              </View>
              <View style={styles.mainActionIcon}>
                <Ionicons name="camera" size={28} color="#FFFFFF" />
              </View>
            </View>
          </Pressable>
        </View>

        {/* Quick Links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Links</Text>

          <Pressable
            style={styles.quickLinkItem}
            onPress={() => navigation.navigate('Inventory')}
          >
            <View style={styles.quickLinkIcon}>
              <Ionicons name="cube" size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.quickLinkText}>My Pantry</Text>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>

          <Pressable
            style={styles.quickLinkItem}
            onPress={() => navigation.navigate('Shopping')}
          >
            <View style={styles.quickLinkIcon}>
              <Ionicons name="cart" size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.quickLinkText}>Shopping List</Text>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>

          <Pressable
            style={styles.quickLinkItem}
            onPress={() => navigation.navigate('PurchaseHistory')}
          >
            <View style={styles.quickLinkIcon}>
              <Ionicons name="receipt" size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.quickLinkText}>Purchase History</Text>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>
        </View>

        {/* Recent Purchases */}
        {recentReceipts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Purchases</Text>
              <Pressable onPress={() => navigation.navigate('PurchaseHistory')}>
                <Ionicons name="arrow-forward" size={20} color={theme.colors.primary} />
              </Pressable>
            </View>

            {recentReceipts.slice(0, 3).map((receipt, index) => (
              <Pressable
                key={receipt.id}
                style={[
                  styles.purchaseItem,
                  index === 0 && styles.purchaseItemFirst,
                ]}
                onPress={() => navigation.navigate('PurchaseHistory')}
              >
                <View style={styles.purchaseLeft}>
                  <Text style={styles.purchaseStore}>{receipt.store_name}</Text>
                  <Text style={styles.purchaseDate}>
                    {new Date(receipt.receipt_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </View>
                <Text style={styles.purchaseAmount}>
                  {formatCurrency(receipt.total_amount_cents)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>

          <Pressable style={styles.prefItem}>
            <View style={styles.prefLeft}>
              <Ionicons name="restaurant" size={20} color="#6B7280" />
              <Text style={styles.prefText}>Dietary Preferences</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>

          <Pressable style={styles.prefItem}>
            <View style={styles.prefLeft}>
              <Ionicons name="notifications" size={20} color="#6B7280" />
              <Text style={styles.prefText}>Notifications</Text>
            </View>
            <View style={styles.prefBadge}>
              <Text style={styles.prefBadgeText}>On</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>

          <Pressable style={styles.prefItem}>
            <View style={styles.prefLeft}>
              <Ionicons name="people" size={20} color="#6B7280" />
              <Text style={styles.prefText}>Household</Text>
            </View>
            <Text style={styles.prefValue}>{householdMembers?.length || 0} members</Text>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          <Pressable style={styles.accountItem}>
            <Ionicons name="shield-outline" size={20} color="#6B7280" />
            <Text style={styles.accountText}>Privacy & Security</Text>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>

          <Pressable style={styles.accountItem}>
            <Ionicons name="help-circle-outline" size={20} color="#6B7280" />
            <Text style={styles.accountText}>Help & Support</Text>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>

          <Pressable style={styles.accountItem} onPress={signOut}>
            <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
            <Text style={[styles.accountText, { color: theme.colors.error }]}>Sign Out</Text>
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
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  statsOverview: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 6,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  mainActionCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    padding: 20,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  mainActionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mainActionLeft: {
    flex: 1,
  },
  mainActionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  mainActionSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  mainActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  quickLinkIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  quickLinkText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  purchaseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  purchaseItemFirst: {
    paddingTop: 0,
  },
  purchaseLeft: {
    flex: 1,
  },
  purchaseStore: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  purchaseDate: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  purchaseAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  prefItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  prefLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  prefText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  prefBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  prefBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16A34A',
  },
  prefValue: {
    fontSize: 14,
    color: '#9CA3AF',
    marginRight: 8,
  },
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  accountText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  bottomSpacer: {
    height: 40,
  },
});
