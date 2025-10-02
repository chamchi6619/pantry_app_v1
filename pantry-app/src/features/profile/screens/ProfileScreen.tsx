import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import LinearGradient from 'react-native-linear-gradient';
import { theme } from '../../../core/constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useHousehold } from '../../../hooks/useHousehold';
import { useMonthlySpending } from '../../../hooks/useMonthlySpending';
import { useMonthlyWaste } from '../../../hooks/useMonthlyWaste';
import { supabase } from '../../../lib/supabase';
import { MiniSparkline } from '../../../components/MiniSparkline';
import { ProgressBar } from '../../../components/ProgressBar';

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation();
  const { signOut, user } = useAuth();
  const { currentHousehold, householdMembers } = useHousehold();
  const { data: spending, loading: spendingLoading } = useMonthlySpending();
  const { data: waste, loading: wasteLoading } = useMonthlyWaste();

  const [overview, setOverview] = useState({
    itemsInStock: 0,
    shoppingListItems: 0,
    expiringSoon: 0,
  });
  const [overviewLoading, setOverviewLoading] = useState(true);

  useEffect(() => {
    const fetchOverview = async () => {
      if (!currentHousehold?.id) return;

      try {
        setOverviewLoading(true);

        const { count: stockCount } = await supabase
          .from('pantry_items')
          .select('*', { count: 'exact', head: true })
          .eq('household_id', currentHousehold.id)
          .eq('status', 'active');

        const { data: lists } = await supabase
          .from('shopping_lists')
          .select('id')
          .eq('household_id', currentHousehold.id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        let shoppingCount = 0;
        if (lists) {
          const { count: listCount } = await supabase
            .from('shopping_list_items')
            .select('*', { count: 'exact', head: true })
            .eq('list_id', lists.id)
            .eq('checked', false);
          shoppingCount = listCount || 0;
        }

        const threeDaysFromNow = new Date();
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

        const { count: expiringCount } = await supabase
          .from('pantry_items')
          .select('*', { count: 'exact', head: true })
          .eq('household_id', currentHousehold.id)
          .eq('status', 'active')
          .not('expiry_date', 'is', null)
          .lte('expiry_date', threeDaysFromNow.toISOString().split('T')[0]);

        setOverview({
          itemsInStock: stockCount || 0,
          shoppingListItems: shoppingCount,
          expiringSoon: expiringCount || 0,
        });
      } catch (error) {
        console.error('Failed to fetch overview:', error);
      } finally {
        setOverviewLoading(false);
      }
    };

    fetchOverview();
  }, [currentHousehold?.id]);

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  };

  const getFirstName = () => {
    return user?.email?.split('@')[0] || 'there';
  };

  const generateInsight = () => {
    if (!waste || !spending || !overview) {
      return "Keep up the great work tracking your pantry!";
    }

    // Waste reduction insight
    if (waste.trend_vs_last_month < -50 && waste.total_items_wasted > 0) {
      return `Amazing! You're wasting ${Math.abs(waste.trend_vs_last_month).toFixed(0)}% less food this month. Keep checking those expiry dates!`;
    }

    // Expiring soon warning
    if (overview.expiringSoon > 5) {
      return `You have ${overview.expiringSoon} items expiring soon. Check your pantry today to avoid waste!`;
    }

    // Spending savings
    if (spending.trend_pct < -10) {
      return `Great job! You're spending ${Math.abs(spending.trend_pct).toFixed(0)}% less this month.`;
    }

    // Waste warning
    if (waste.total_items_wasted > 5) {
      return `${waste.most_wasted_category || 'Some items'} are being wasted often. Try buying smaller quantities.`;
    }

    // Shopping list reminder
    if (overview.shoppingListItems > 10) {
      return `You have ${overview.shoppingListItems} items on your shopping list. Time for a grocery run!`;
    }

    // Default positive message
    return "You're doing great! Keep tracking your pantry to reduce waste.";
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Compact Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>
            Good {getTimeOfDay()}, {getFirstName()}
          </Text>
          {currentHousehold && (
            <View style={styles.householdRow}>
              <Ionicons name="home" size={14} color={theme.colors.textSecondary} />
              <Text style={styles.householdText}> {currentHousehold.name}</Text>
              <Text style={styles.memberCount}> · {householdMembers?.length || 0} members</Text>
            </View>
          )}
        </View>

        {/* Hero Card: Spending This Month */}
        {spendingLoading ? (
          <View style={styles.heroLoading}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : spending && (spending.trip_count > 0 || spending.total_cents > 0) ? (
          <LinearGradient
            colors={[theme.colors.primary, '#2A9D5F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroContent}>
              <View style={styles.heroLeft}>
                <Text style={styles.heroLabel}>This Month</Text>
                <Text style={styles.heroAmount}>{formatCurrency(spending.total_cents)}</Text>
                <View style={styles.trendRow}>
                  <Ionicons
                    name={spending.trend_pct > 0 ? 'trending-up' : 'trending-down'}
                    size={16}
                    color={spending.trend_pct > 0 ? '#FCA5A5' : '#A7F3D0'}
                  />
                  <Text style={styles.trendText}>
                    {Math.abs(spending.trend_pct).toFixed(0)}% vs last month
                  </Text>
                </View>
                <Text style={styles.heroStats}>
                  {spending.trip_count} trips · {spending.item_count} items
                </Text>
              </View>

              <View style={styles.heroRight}>
                {spending.daily_totals && spending.daily_totals.length > 0 && (
                  <MiniSparkline
                    data={spending.daily_totals}
                    width={100}
                    height={60}
                    strokeColor="rgba(255,255,255,0.7)"
                    strokeWidth={2}
                  />
                )}
              </View>
            </View>

            <Pressable
              style={styles.heroButton}
              onPress={() => navigation.navigate('PurchaseHistory')}
            >
              <Text style={styles.heroButtonText}>View Full Details</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </Pressable>
          </LinearGradient>
        ) : (
          <View style={styles.heroEmpty}>
            <Ionicons name="camera-outline" size={48} color={theme.colors.textLight} />
            <Text style={styles.heroEmptyText}>Scan your first receipt</Text>
            <Text style={styles.heroEmptySubtext}>Start tracking spending</Text>
          </View>
        )}

        {/* Quick Stats Tiles */}
        <View style={styles.statsGrid}>
          <Pressable
            style={({ pressed }) => [
              styles.statTile,
              pressed && styles.statTilePressed,
            ]}
            onPress={() => navigation.navigate('Inventory')}
          >
            <Ionicons name="cube-outline" size={28} color="#3B82F6" />
            <Text style={styles.statValue}>{overview.itemsInStock}</Text>
            <Text style={styles.statLabel}>In Stock</Text>
          </Pressable>

          <View style={styles.statDivider} />

          <Pressable
            style={({ pressed }) => [
              styles.statTile,
              pressed && styles.statTilePressed,
            ]}
            onPress={() => navigation.navigate('Shopping')}
          >
            <Ionicons name="cart-outline" size={28} color="#6B7280" />
            <Text style={styles.statValue}>{overview.shoppingListItems}</Text>
            <Text style={styles.statLabel}>To Buy</Text>
          </Pressable>

          <View style={styles.statDivider} />

          <Pressable
            style={({ pressed }) => [
              styles.statTile,
              overview.expiringSoon > 0 && styles.statTileAlert,
              pressed && styles.statTilePressed,
            ]}
            onPress={() => navigation.navigate('Inventory')}
          >
            <Ionicons
              name="alert-circle-outline"
              size={28}
              color={overview.expiringSoon > 0 ? '#EF4444' : '#6B7280'}
            />
            <Text
              style={[
                styles.statValue,
                overview.expiringSoon > 0 && styles.statValueAlert,
              ]}
            >
              {overview.expiringSoon}
            </Text>
            <Text style={styles.statLabel}>Expiring</Text>
          </Pressable>
        </View>

        {/* Insight Card */}
        <View style={styles.insightCard}>
          <View style={styles.insightHeader}>
            <Ionicons name="bulb-outline" size={20} color="#F59E0B" />
            <Text style={styles.insightTitle}>Insight</Text>
          </View>
          <Text style={styles.insightText}>{generateInsight()}</Text>
        </View>

        {/* Impact Card */}
        {!wasteLoading && waste && waste.total_items_wasted >= 0 && (
          <View style={styles.impactCard}>
            <Text style={styles.impactTitle}>This Month's Impact</Text>

            {/* Waste Reduction */}
            <View style={styles.impactSection}>
              <View style={styles.impactHeader}>
                <Text style={styles.impactLabel}>Waste Reduction</Text>
                <Text style={styles.impactValue}>
                  {waste.total_items_wasted === 0
                    ? '100%'
                    : waste.trend_vs_last_month < 0
                    ? `${Math.abs(waste.trend_vs_last_month).toFixed(0)}%`
                    : '—'}
                </Text>
              </View>
              <ProgressBar
                progress={
                  waste.total_items_wasted === 0
                    ? 1.0
                    : waste.trend_vs_last_month < 0
                    ? Math.min(Math.abs(waste.trend_vs_last_month) / 100, 1.0)
                    : 0
                }
                fillColor={theme.colors.success}
                height={8}
              />
              <Text style={styles.impactDetail}>
                {waste.total_items_wasted} item{waste.total_items_wasted !== 1 ? 's' : ''} wasted
                this month
              </Text>
            </View>

            {/* Money Saved (from spending data) */}
            {spending && spending.total_cents > 0 && (
              <View style={styles.impactSection}>
                <View style={styles.impactHeader}>
                  <Text style={styles.impactLabel}>Budget Tracking</Text>
                  <Text style={styles.impactValue}>
                    {formatCurrency(spending.total_cents)}
                  </Text>
                </View>
                <ProgressBar
                  progress={Math.min(spending.trip_count / 10, 1.0)}
                  fillColor="#3B82F6"
                  height={8}
                />
                <Text style={styles.impactDetail}>
                  {spending.trip_count} shopping trip{spending.trip_count !== 1 ? 's' : ''} tracked
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionPrimary,
              pressed && styles.actionPressed,
            ]}
            onPress={() => navigation.navigate('Scanner')}
          >
            <Ionicons name="camera" size={24} color="#fff" />
            <Text style={styles.actionText}>Scan Receipt</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionSecondary,
              pressed && styles.actionPressed,
            ]}
            onPress={() => navigation.navigate('Inventory')}
          >
            <Ionicons name="add-circle-outline" size={24} color={theme.colors.primary} />
            <Text style={styles.actionTextSecondary}>Add Item</Text>
          </Pressable>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Pressable
            style={styles.footerButton}
            onPress={() => {
              // TODO: Navigate to settings screen
            }}
          >
            <Ionicons name="settings-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.footerText}>Settings</Text>
          </Pressable>

          <View style={styles.footerDivider} />

          <Pressable style={styles.footerButton} onPress={signOut}>
            <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
            <Text style={[styles.footerText, styles.footerTextDanger]}>Sign Out</Text>
          </Pressable>
        </View>

        <View style={styles.spacer} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  greeting: {
    ...theme.typography.h2,
    color: theme.colors.text,
    fontWeight: '600',
  },
  householdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  householdText: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
  },
  memberCount: {
    ...theme.typography.bodySmall,
    color: theme.colors.textLight,
  },
  heroLoading: {
    height: 180,
    margin: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCard: {
    margin: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.xl,
    ...theme.shadows.md,
  },
  heroContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLeft: {
    flex: 1,
  },
  heroLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
    marginBottom: theme.spacing.xs,
  },
  heroAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
    marginBottom: theme.spacing.xs,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  trendText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginLeft: theme.spacing.xs,
    fontWeight: '500',
  },
  heroStats: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  heroRight: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: theme.spacing.md,
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: theme.borderRadius.md,
  },
  heroButtonText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
    marginRight: theme.spacing.xs,
  },
  heroEmpty: {
    margin: theme.spacing.md,
    padding: theme.spacing.xl * 2,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  heroEmptyText: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontWeight: '600',
    marginTop: theme.spacing.md,
  },
  heroEmptySubtext: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    ...theme.shadows.sm,
  },
  statTile: {
    flex: 1,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
  },
  statTilePressed: {
    opacity: 0.7,
    backgroundColor: theme.colors.borderLight,
  },
  statTileAlert: {
    backgroundColor: '#FEE2E2',
  },
  statDivider: {
    width: 1,
    backgroundColor: theme.colors.border,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  statValueAlert: {
    color: theme.colors.error,
  },
  statLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  insightCard: {
    margin: theme.spacing.md,
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
    backgroundColor: '#FEF3C7',
    borderRadius: theme.borderRadius.lg,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: theme.spacing.xs,
  },
  insightText: {
    fontSize: 14,
    color: '#78350F',
    lineHeight: 20,
  },
  impactCard: {
    margin: theme.spacing.md,
    marginTop: theme.spacing.lg,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    ...theme.shadows.sm,
  },
  impactTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  impactSection: {
    marginBottom: theme.spacing.lg,
  },
  impactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  impactLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  impactValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  impactDetail: {
    fontSize: 12,
    color: theme.colors.textLight,
    marginTop: theme.spacing.xs,
  },
  quickActions: {
    flexDirection: 'row',
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing.sm,
  },
  actionPrimary: {
    backgroundColor: theme.colors.primary,
    ...theme.shadows.sm,
  },
  actionSecondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
  },
  actionPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  actionTextSecondary: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  footer: {
    flexDirection: 'row',
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
  },
  footerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  footerDivider: {
    width: 1,
    backgroundColor: theme.colors.border,
  },
  footerText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  footerTextDanger: {
    color: theme.colors.error,
  },
  spacer: {
    height: theme.spacing.xl,
  },
});
