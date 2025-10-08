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

export const ProfileScreenV4: React.FC = () => {
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
          .limit(4);

        if (error) throw error;
        setRecentReceipts(receipts || []);

        // Get total spent
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
    const today = new Date();
    const diffDays = Math.floor(
      (today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
        {/* Hero Header with Avatar */}
        <View style={styles.heroHeader}>
          <View style={styles.avatarSection}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarText}>{getUserInitials()}</Text>
            </View>
            <View style={styles.heroInfo}>
              <Text style={styles.heroName}>{getUserFirstName()}</Text>
              {currentHousehold && (
                <View style={styles.heroBadge}>
                  <Ionicons name="home" size={14} color={theme.colors.primary} />
                  <Text style={styles.heroBadgeText}>{currentHousehold.name}</Text>
                </View>
              )}
            </View>
          </View>

          <Pressable
            style={styles.settingsIconButton}
            onPress={() => {
              // Navigate to settings
            }}
          >
            <Ionicons name="settings-sharp" size={24} color="#374151" />
          </Pressable>
        </View>

        {/* Summary Card */}
        {!loading && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Spent</Text>
                <Text style={styles.summaryValue}>{formatCompactCurrency(totalSpent)}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>This Month</Text>
                <Text style={styles.summaryValue}>
                  {spending?.total_cents ? formatCompactCurrency(spending.total_cents) : '$0'}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Members</Text>
                <Text style={styles.summaryValue}>{householdMembers?.length || 0}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Primary Actions */}
        <View style={styles.primaryActions}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryActionButton,
              { backgroundColor: theme.colors.primary },
              pressed && styles.buttonPressed,
            ]}
            onPress={() => navigation.navigate('Scanner')}
          >
            <Ionicons name="camera" size={24} color="#FFFFFF" />
            <Text style={styles.primaryActionText}>Scan Receipt</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.primaryActionButton,
              { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: theme.colors.primary },
              pressed && styles.buttonPressed,
            ]}
            onPress={() => navigation.navigate('Inventory')}
          >
            <Ionicons name="cube" size={24} color={theme.colors.primary} />
            <Text style={[styles.primaryActionText, { color: theme.colors.primary }]}>
              View Pantry
            </Text>
          </Pressable>
        </View>

        {/* Navigation Grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Navigate</Text>
          <View style={styles.navGrid}>
            <Pressable
              style={styles.navCard}
              onPress={() => navigation.navigate('Shopping')}
            >
              <View style={[styles.navIcon, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="cart-outline" size={24} color="#D97706" />
              </View>
              <Text style={styles.navLabel}>Shopping List</Text>
            </Pressable>

            <Pressable
              style={styles.navCard}
              onPress={() => navigation.navigate('PurchaseHistory')}
            >
              <View style={[styles.navIcon, { backgroundColor: '#E0E7FF' }]}>
                <Ionicons name="receipt-outline" size={24} color="#4F46E5" />
              </View>
              <Text style={styles.navLabel}>Purchase History</Text>
            </Pressable>

            <Pressable style={styles.navCard}>
              <View style={[styles.navIcon, { backgroundColor: '#FCE7F3' }]}>
                <Ionicons name="book-outline" size={24} color="#DB2777" />
              </View>
              <Text style={styles.navLabel}>Recipes</Text>
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>Soon</Text>
              </View>
            </Pressable>

            <Pressable style={styles.navCard}>
              <View style={[styles.navIcon, { backgroundColor: '#DBEAFE' }]}>
                <Ionicons name="bar-chart-outline" size={24} color="#2563EB" />
              </View>
              <Text style={styles.navLabel}>Analytics</Text>
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>Soon</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            {recentReceipts.length > 0 && (
              <Pressable onPress={() => navigation.navigate('PurchaseHistory')}>
                <Text style={styles.seeAllLink}>See All</Text>
              </Pressable>
            )}
          </View>

          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : recentReceipts.length === 0 ? (
            <View style={styles.emptyActivity}>
              <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyActivityText}>No activity yet</Text>
              <Text style={styles.emptyActivitySubtext}>
                Scan a receipt to start tracking
              </Text>
            </View>
          ) : (
            <View style={styles.activityList}>
              {recentReceipts.map((receipt) => (
                <Pressable
                  key={receipt.id}
                  style={styles.activityItem}
                  onPress={() => navigation.navigate('PurchaseHistory')}
                >
                  <View style={styles.activityIconContainer}>
                    <Ionicons name="receipt" size={18} color={theme.colors.primary} />
                  </View>
                  <View style={styles.activityDetails}>
                    <Text style={styles.activityStore}>{receipt.store_name}</Text>
                    <Text style={styles.activityDate}>{formatDate(receipt.receipt_date)}</Text>
                  </View>
                  <Text style={styles.activityAmount}>
                    {formatCurrency(receipt.total_amount_cents)}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Preferences & Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences & Settings</Text>
          <View style={styles.settingsList}>
            <Pressable style={styles.settingsItem}>
              <View style={styles.settingsIconContainer}>
                <Ionicons name="restaurant" size={20} color={theme.colors.primary} />
              </View>
              <Text style={styles.settingsLabel}>Dietary Preferences</Text>
              <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
            </Pressable>

            <View style={styles.settingsDivider} />

            <Pressable style={styles.settingsItem}>
              <View style={styles.settingsIconContainer}>
                <Ionicons name="notifications" size={20} color="#3B82F6" />
              </View>
              <Text style={styles.settingsLabel}>Notifications</Text>
              <View style={styles.statusBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>On</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
            </Pressable>

            <View style={styles.settingsDivider} />

            <Pressable style={styles.settingsItem}>
              <View style={styles.settingsIconContainer}>
                <Ionicons name="people" size={20} color="#8B5CF6" />
              </View>
              <Text style={styles.settingsLabel}>Household Management</Text>
              <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
            </Pressable>

            <View style={styles.settingsDivider} />

            <Pressable style={styles.settingsItem}>
              <View style={styles.settingsIconContainer}>
                <Ionicons name="shield" size={20} color="#6B7280" />
              </View>
              <Text style={styles.settingsLabel}>Privacy & Security</Text>
              <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
            </Pressable>
          </View>
        </View>

        {/* Sign Out */}
        <View style={styles.section}>
          <Pressable style={styles.signOutButton} onPress={signOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
            <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
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
  heroHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroInfo: {
    justifyContent: 'center',
  },
  heroName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    gap: 4,
  },
  heroBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  settingsIconButton: {
    padding: 8,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: -12,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 6,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
  },
  primaryActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 24,
    gap: 12,
  },
  primaryActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  primaryActionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  section: {
    marginTop: 28,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  seeAllLink: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  navGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  navCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'flex-start',
    position: 'relative',
  },
  navIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  navLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  comingSoonBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
  },
  loadingState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyActivity: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  emptyActivityText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
  },
  emptyActivitySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  activityList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  activityIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityDetails: {
    flex: 1,
  },
  activityStore: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  activityDate: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  activityAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    marginRight: 8,
  },
  settingsList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  settingsIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
    marginRight: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16A34A',
  },
  settingsDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginLeft: 64,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    gap: 8,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.error,
  },
  bottomSpacer: {
    height: 40,
  },
});
