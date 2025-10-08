import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../core/constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useHousehold } from '../../../hooks/useHousehold';
import { supabase } from '../../../lib/supabase';

interface RecentReceipt {
  id: string;
  store_name: string;
  receipt_date: string;
  total_amount_cents: number;
  item_count: number;
}

export const ProfileScreenV1: React.FC = () => {
  const navigation = useNavigation();
  const { signOut, user } = useAuth();
  const { currentHousehold, householdMembers } = useHousehold();

  const [recentReceipts, setRecentReceipts] = useState<RecentReceipt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecentReceipts = async () => {
      if (!currentHousehold?.id) return;

      try {
        setLoading(true);

        // Get recent receipts with item counts
        const { data: receipts, error } = await supabase
          .from('receipts')
          .select('id, store_name, receipt_date, total_amount_cents')
          .eq('household_id', currentHousehold.id)
          .order('receipt_date', { ascending: false })
          .limit(5);

        if (error) throw error;

        // Get item counts for each receipt
        const receiptsWithCounts = await Promise.all(
          (receipts || []).map(async (receipt) => {
            const { count } = await supabase
              .from('receipt_items')
              .select('*', { count: 'exact', head: true })
              .eq('receipt_id', receipt.id);

            return {
              ...receipt,
              item_count: count || 0,
            };
          })
        );

        setRecentReceipts(receiptsWithCounts);
      } catch (error) {
        console.error('Failed to fetch recent receipts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentReceipts();
  }, [currentHousehold?.id]);

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const getUserInitials = () => {
    const email = user?.email || '';
    const name = email.split('@')[0];
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Personal Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getUserInitials()}</Text>
            </View>
            <Pressable style={styles.editAvatarButton}>
              <Ionicons name="camera" size={16} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.email?.split('@')[0] || 'User'}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            {currentHousehold && (
              <View style={styles.householdBadge}>
                <Ionicons name="home" size={14} color={theme.colors.primary} />
                <Text style={styles.householdName}>{currentHousehold.name}</Text>
                <Text style={styles.memberCount}>· {householdMembers?.length || 0} members</Text>
              </View>
            )}
          </View>

          <Pressable
            style={styles.editButton}
            onPress={() => {
              // TODO: Navigate to edit profile
            }}
          >
            <Ionicons name="create-outline" size={20} color={theme.colors.primary} />
          </Pressable>
        </View>

        {/* My Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Preferences</Text>

          <Pressable style={styles.preferenceCard}>
            <View style={styles.preferenceIcon}>
              <Ionicons name="restaurant-outline" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.preferenceContent}>
              <Text style={styles.preferenceTitle}>Dietary Preferences</Text>
              <Text style={styles.preferenceSubtitle}>Not set · Tap to add allergies, diet type</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>

          <Pressable style={styles.preferenceCard}>
            <View style={styles.preferenceIcon}>
              <Ionicons name="storefront-outline" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.preferenceContent}>
              <Text style={styles.preferenceTitle}>Favorite Stores</Text>
              <Text style={styles.preferenceSubtitle}>Manage your preferred grocery stores</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>

          <Pressable style={styles.preferenceCard}>
            <View style={styles.preferenceIcon}>
              <Ionicons name="notifications-outline" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.preferenceContent}>
              <Text style={styles.preferenceTitle}>Notifications</Text>
              <Text style={styles.preferenceSubtitle}>Expiry alerts, shopping reminders</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>
        </View>

        {/* My Purchase History */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Purchases</Text>
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
              <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyStateText}>No purchases yet</Text>
              <Text style={styles.emptyStateSubtext}>Scan your first receipt to get started</Text>
            </View>
          ) : (
            <View style={styles.receiptList}>
              {recentReceipts.map((receipt) => (
                <Pressable
                  key={receipt.id}
                  style={styles.receiptCard}
                  onPress={() => navigation.navigate('PurchaseHistory')}
                >
                  <View style={styles.receiptIcon}>
                    <Ionicons name="receipt" size={20} color={theme.colors.primary} />
                  </View>
                  <View style={styles.receiptContent}>
                    <Text style={styles.receiptStore}>{receipt.store_name}</Text>
                    <Text style={styles.receiptDate}>
                      {formatDate(receipt.receipt_date)} · {receipt.item_count} items
                    </Text>
                  </View>
                  <Text style={styles.receiptAmount}>{formatCurrency(receipt.total_amount_cents)}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* My Recipes (Coming Soon) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Recipes</Text>

          <View style={styles.comingSoonCard}>
            <Ionicons name="book-outline" size={32} color="#D1D5DB" />
            <Text style={styles.comingSoonText}>Coming Soon</Text>
            <Text style={styles.comingSoonSubtext}>
              Save and organize your favorite recipes
            </Text>
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>

          <Pressable style={styles.settingRow}>
            <Ionicons name="people-outline" size={22} color="#6B7280" />
            <Text style={styles.settingText}>Household Management</Text>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>

          <Pressable style={styles.settingRow}>
            <Ionicons name="shield-outline" size={22} color="#6B7280" />
            <Text style={styles.settingText}>Privacy & Data</Text>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>

          <Pressable style={styles.settingRow}>
            <Ionicons name="help-circle-outline" size={22} color="#6B7280" />
            <Text style={styles.settingText}>Help & Support</Text>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>

          <Pressable style={styles.settingRow}>
            <Ionicons name="information-circle-outline" size={22} color="#6B7280" />
            <Text style={styles.settingText}>About</Text>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>
        </View>

        {/* Sign Out */}
        <View style={styles.section}>
          <Pressable style={styles.signOutButton} onPress={signOut}>
            <Ionicons name="log-out-outline" size={22} color={theme.colors.error} />
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
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 6,
  },
  householdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  householdName: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.primary,
    marginLeft: 4,
  },
  memberCount: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
  },
  editButton: {
    padding: 8,
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
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  viewAllLink: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.primary,
  },
  preferenceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  preferenceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  preferenceContent: {
    flex: 1,
  },
  preferenceTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  preferenceSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  receiptList: {
    gap: 8,
  },
  receiptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  receiptIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  receiptContent: {
    flex: 1,
  },
  receiptStore: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  receiptDate: {
    fontSize: 13,
    color: '#6B7280',
  },
  receiptAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  comingSoonCard: {
    backgroundColor: '#FFFFFF',
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#F3F4F6',
    borderStyle: 'dashed',
  },
  comingSoonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#9CA3AF',
    marginTop: 12,
  },
  comingSoonSubtext: {
    fontSize: 14,
    color: '#D1D5DB',
    marginTop: 4,
    textAlign: 'center',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 10,
    marginBottom: 8,
  },
  settingText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    color: '#374151',
    marginLeft: 12,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.error,
    marginLeft: 8,
  },
  bottomSpacer: {
    height: 40,
  },
});
