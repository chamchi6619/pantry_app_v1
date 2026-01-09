import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Switch,
  Linking,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../core/constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useMonthlySpending } from '../../../hooks/useMonthlySpending';
import { useUserPreferences } from '../../../hooks/useUserPreferences';
import { supabase } from '../../../lib/supabase';

interface RecentReceipt {
  id: string;
  store_name: string;
  receipt_date: string;
  total_amount_cents: number;
}

const MEASUREMENT_SYSTEMS = [
  { label: 'Imperial (lb, oz, cups)', value: 'imperial' },
  { label: 'Metric (kg, g, ml)', value: 'metric' },
];

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation();
  const { signOut, user, householdId } = useAuth();
  const { data: spending } = useMonthlySpending();
  const { preferences, profile, loading: prefsLoading, updatePreferences, updateProfile } = useUserPreferences();

  const [recentReceipts, setRecentReceipts] = useState<RecentReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalSpent, setTotalSpent] = useState(0);

  useEffect(() => {
    if (householdId) {
      fetchData();
    }
  }, [householdId]);

  const fetchData = async () => {
    if (!householdId) return;

    try {
      setLoading(true);

      const { data: receipts, error } = await supabase
        .from('receipts')
        .select('id, store_name, receipt_date, total_amount_cents')
        .eq('household_id', householdId)
        .order('receipt_date', { ascending: false })
        .limit(5);

      if (error) throw error;
      setRecentReceipts(receipts || []);

      const { data: allReceipts } = await supabase
        .from('receipts')
        .select('total_amount_cents')
        .eq('household_id', householdId);

      const total = (allReceipts || []).reduce(
        (sum, r) => sum + (r.total_amount_cents || 0),
        0
      );
      setTotalSpent(total);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      Alert.alert(
        'Failed to Load Data',
        'Could not load your purchase history. Please check your connection and try again.',
        [
          { text: 'OK' },
          { text: 'Retry', onPress: fetchData }
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

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
    if (profile?.display_name) {
      const names = profile.display_name.split(' ');
      if (names.length >= 2) {
        return `${names[0][0]}${names[1][0]}`.toUpperCase();
      }
      return profile.display_name.substring(0, 2).toUpperCase();
    }
    const email = user?.email || '';
    const name = email.split('@')[0];
    return name.substring(0, 2).toUpperCase();
  };

  const getUserDisplayName = () => {
    return profile?.display_name || user?.email?.split('@')[0] || 'User';
  };

  const handlePreferenceChange = async (key: string, value: any) => {
    try {
      await updatePreferences({ [key]: value });
    } catch (error) {
      Alert.alert('Error', 'Failed to update preference');
    }
  };

  const showPicker = (title: string, options: Array<{ label: string; value: string }>, currentValue: string, onSelect: (value: string) => void) => {
    Alert.alert(
      title,
      undefined,
      [
        ...options.map(option => ({
          text: option.label,
          onPress: () => onSelect(option.value),
          style: option.value === currentValue ? 'default' : 'cancel',
        })),
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account?',
      'This will permanently delete all your data including:\n\n• Pantry inventory\n• Shopping lists\n• Recipes and meal plans\n• Purchase history\n• All personal information\n\nThis action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: confirmDeleteAccount,
        },
      ]
    );
  };

  const confirmDeleteAccount = async () => {
    try {
      setLoading(true);

      // Call Edge Function to delete all user data
      const { data, error } = await supabase.functions.invoke('delete-user-account', {
        body: { user_id: user?.id, household_id: householdId }
      });

      if (error) throw error;

      // Sign out and clear local data
      Alert.alert(
        'Account Deleted',
        'Your account and all data have been permanently deleted.',
        [{ text: 'OK', onPress: signOut }]
      );
    } catch (error) {
      console.error('Failed to delete account:', error);
      Alert.alert(
        'Error',
        'Failed to delete account. Please try again or contact support.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  if (prefsLoading || loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getUserInitials()}</Text>
            </View>
            <View>
              <Text style={styles.headerName}>{getUserDisplayName()}</Text>
              <Text style={styles.headerEmail}>{user?.email}</Text>
            </View>
          </View>
        </View>

        {/* Stats */}
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

        {/* Recent Purchases */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Purchases</Text>
            {recentReceipts.length > 0 && (
              <Pressable onPress={() => navigation.navigate('PurchaseHistory')}>
                <Ionicons name="arrow-forward" size={20} color={theme.colors.primary} />
              </Pressable>
            )}
          </View>

          {recentReceipts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyStateTitle}>No purchases yet</Text>
              <Text style={styles.emptyStateText}>
                Scan receipts to track your spending
              </Text>
              <Pressable
                style={styles.emptyStateButton}
                onPress={() => navigation.navigate('Receipt')}
              >
                <Text style={styles.emptyStateButtonText}>Scan Receipt</Text>
                <Ionicons name="camera" size={16} color={theme.colors.primary} />
              </Pressable>
            </View>
          ) : (
            recentReceipts.slice(0, 3).map((receipt) => (
              <Pressable
                key={receipt.id}
                style={styles.purchaseItem}
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
            ))
          )}
        </View>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>

          <Pressable
            style={styles.prefItem}
            onPress={() =>
              showPicker(
                'Measurement System',
                MEASUREMENT_SYSTEMS,
                preferences?.measurement_system || 'imperial',
                (value) => handlePreferenceChange('measurement_system', value)
              )
            }
          >
            <View style={styles.prefLeft}>
              <Ionicons name="resize" size={20} color="#6B7280" />
              <Text style={styles.prefText}>Measurement System</Text>
            </View>
            <View style={styles.prefRight}>
              <Text style={styles.prefValue}>
                {MEASUREMENT_SYSTEMS.find(m => m.value === preferences?.measurement_system)?.label || 'Imperial (lb, oz, cups)'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
            </View>
          </Pressable>

          <View style={styles.prefItem}>
            <View style={styles.prefLeft}>
              <Ionicons name="notifications" size={20} color="#6B7280" />
              <Text style={styles.prefText}>Notifications</Text>
            </View>
            <Switch
              value={preferences?.enable_notifications ?? true}
              onValueChange={(value) => handlePreferenceChange('enable_notifications', value)}
              trackColor={{ false: '#D1D5DB', true: theme.colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Legal & Compliance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>

          <Pressable
            style={styles.accountItem}
            onPress={() => navigation.navigate('PrivacyPolicy' as never)}
          >
            <Ionicons name="document-text-outline" size={20} color="#6B7280" />
            <Text style={styles.accountText}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>

          <Pressable
            style={styles.accountItem}
            onPress={() => navigation.navigate('TermsOfService' as never)}
          >
            <Ionicons name="document-text-outline" size={20} color="#6B7280" />
            <Text style={styles.accountText}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          <Pressable
            style={styles.accountItem}
            onPress={() => Linking.openURL('mailto:support@pantryapp.com?subject=Support Request')}
          >
            <Ionicons name="help-circle-outline" size={20} color="#6B7280" />
            <Text style={styles.accountText}>Help & Support</Text>
            <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
          </Pressable>

          <Pressable
            style={[styles.accountItem, styles.dangerItem]}
            onPress={handleDeleteAccount}
          >
            <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
            <Text style={[styles.accountText, styles.dangerText]}>Delete My Account</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  headerEmail: {
    fontSize: 14,
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
  purchaseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  emptyStateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
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
  prefRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  prefValue: {
    fontSize: 14,
    color: '#9CA3AF',
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
  dangerItem: {
    borderBottomColor: '#FEE2E2',
  },
  dangerText: {
    color: theme.colors.error,
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 40,
  },
});
