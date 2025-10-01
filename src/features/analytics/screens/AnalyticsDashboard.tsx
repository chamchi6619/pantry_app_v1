import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHousehold } from '../../../hooks/useHousehold';
import { supabase } from '../../../lib/supabase';

const { width: screenWidth } = Dimensions.get('window');

interface SpendingData {
  day: string;
  amount: number;
}

interface CategorySpending {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

interface StoreComparison {
  store_name: string;
  avg_price: number;
  item_count: number;
}

interface TrendingItem {
  item_name: string;
  purchase_count: number;
  avg_price: number;
  last_purchased: string;
}

export function AnalyticsDashboard() {
  const { currentHousehold } = useHousehold();

  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('week');

  const [stats, setStats] = useState({
    totalSpent: 0,
    avgWeekly: 0,
    itemCount: 0,
    receiptCount: 0,
  });

  const [spendingData, setSpendingData] = useState<SpendingData[]>([]);
  const [categorySpending, setCategorySpending] = useState<CategorySpending[]>([]);
  const [storeComparison, setStoreComparison] = useState<StoreComparison[]>([]);
  const [trendingItems, setTrendingItems] = useState<TrendingItem[]>([]);
  const [savingsOpportunities, setSavingsOpportunities] = useState<any[]>([]);

  useEffect(() => {
    if (currentHousehold?.id) {
      loadAnalytics();
    }
  }, [currentHousehold?.id, selectedPeriod]);

  const loadAnalytics = async () => {
    if (!currentHousehold?.id) return;

    try {
      setLoading(true);

      // Load spending over time
      const dateFilter = getDateFilter(selectedPeriod);

      const { data: purchases } = await supabase
        .from('purchase_history')
        .select('purchase_date, total_price_cents, category, store_name')
        .eq('household_id', currentHousehold.id)
        .gte('purchase_date', dateFilter)
        .order('purchase_date', { ascending: true });

      if (purchases) {
        // Calculate daily spending
        const dailySpending = purchases.reduce((acc: any, item) => {
          const date = new Date(item.purchase_date).toLocaleDateString();
          acc[date] = (acc[date] || 0) + (item.total_price_cents || 0);
          return acc;
        }, {});

        const spendingArray = Object.entries(dailySpending).map(([day, amount]) => ({
          day,
          amount: amount as number / 100,
        }));
        setSpendingData(spendingArray.slice(-7)); // Last 7 days for chart

        // Calculate category breakdown
        const categoryTotals = purchases.reduce((acc: any, item) => {
          const cat = item.category || 'Other';
          acc[cat] = (acc[cat] || 0) + (item.total_price_cents || 0);
          return acc;
        }, {});

        const totalCategorySpend = Object.values(categoryTotals).reduce((a: any, b: any) => a + b, 0) as number;
        const categories = Object.entries(categoryTotals)
          .map(([category, amount]) => ({
            category,
            amount: amount as number / 100,
            percentage: ((amount as number) / totalCategorySpend) * 100,
            color: getCategoryColor(category),
          }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5);

        setCategorySpending(categories);

        // Calculate store comparison
        const storeData = purchases.reduce((acc: any, item) => {
          const store = item.store_name || 'Unknown';
          if (!acc[store]) {
            acc[store] = { total: 0, count: 0 };
          }
          acc[store].total += item.total_price_cents || 0;
          acc[store].count += 1;
          return acc;
        }, {});

        const stores = Object.entries(storeData)
          .map(([store_name, data]: [string, any]) => ({
            store_name,
            avg_price: data.total / data.count / 100,
            item_count: data.count,
          }))
          .sort((a, b) => b.item_count - a.item_count)
          .slice(0, 5);

        setStoreComparison(stores);

        // Calculate overall stats
        const total = purchases.reduce((sum, item) => sum + (item.total_price_cents || 0), 0);
        const weeks = Math.ceil((new Date().getTime() - new Date(dateFilter).getTime()) / (7 * 24 * 60 * 60 * 1000));

        setStats({
          totalSpent: total / 100,
          avgWeekly: total / weeks / 100,
          itemCount: purchases.length,
          receiptCount: new Set(purchases.map(p => p.purchase_date)).size,
        });
      }

      // Load trending items
      const { data: trends } = await supabase
        .from('purchase_history')
        .select('product_name, total_price_cents, purchase_date')
        .eq('household_id', currentHousehold.id)
        .gte('purchase_date', dateFilter);

      if (trends) {
        const itemCounts = trends.reduce((acc: any, item) => {
          const name = item.product_name;
          if (!acc[name]) {
            acc[name] = {
              count: 0,
              totalPrice: 0,
              lastDate: item.purchase_date,
            };
          }
          acc[name].count += 1;
          acc[name].totalPrice += item.total_price_cents || 0;
          if (new Date(item.purchase_date) > new Date(acc[name].lastDate)) {
            acc[name].lastDate = item.purchase_date;
          }
          return acc;
        }, {});

        const trending = Object.entries(itemCounts)
          .map(([item_name, data]: [string, any]) => ({
            item_name,
            purchase_count: data.count,
            avg_price: data.totalPrice / data.count / 100,
            last_purchased: data.lastDate,
          }))
          .sort((a, b) => b.purchase_count - a.purchase_count)
          .slice(0, 10);

        setTrendingItems(trending);
      }

      // Find savings opportunities
      findSavingsOpportunities();

    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDateFilter = (period: string) => {
    const date = new Date();
    switch (period) {
      case 'week':
        date.setDate(date.getDate() - 7);
        break;
      case 'month':
        date.setMonth(date.getMonth() - 1);
        break;
      case 'year':
        date.setFullYear(date.getFullYear() - 1);
        break;
    }
    return date.toISOString();
  };

  const getCategoryColor = (category: string) => {
    const colors: any = {
      'Produce': '#10B981',
      'Dairy': '#3B82F6',
      'Meat': '#EF4444',
      'Bakery': '#F59E0B',
      'Beverages': '#8B5CF6',
      'Snacks': '#EC4899',
      'Frozen': '#06B6D4',
      'Other': '#6B7280',
    };
    return colors[category] || '#6B7280';
  };

  const findSavingsOpportunities = () => {
    const opportunities = [];

    // Example savings opportunities (would be calculated from real data)
    if (storeComparison.length > 1) {
      const cheapest = storeComparison.reduce((min, store) =>
        store.avg_price < min.avg_price ? store : min
      );
      const mostExpensive = storeComparison.reduce((max, store) =>
        store.avg_price > max.avg_price ? store : max
      );

      if (cheapest.store_name !== mostExpensive.store_name) {
        opportunities.push({
          type: 'store',
          title: 'Shop at ' + cheapest.store_name,
          description: `Save ~$${((mostExpensive.avg_price - cheapest.avg_price) * 10).toFixed(2)} per trip`,
          icon: 'storefront',
          color: '#10B981',
        });
      }
    }

    // Add more opportunity types here
    setSavingsOpportunities(opportunities);
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const renderSpendingChart = () => {
    if (spendingData.length === 0) return null;

    const maxAmount = Math.max(...spendingData.map(d => d.amount));

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.sectionTitle}>Daily Spending</Text>
        <View style={styles.chart}>
          {spendingData.map((data, index) => (
            <View key={index} style={styles.chartBar}>
              <View
                style={[
                  styles.bar,
                  {
                    height: (data.amount / maxAmount) * 100,
                    backgroundColor: '#3B82F6',
                  },
                ]}
              />
              <Text style={styles.chartLabel}>
                {new Date(data.day).getDate()}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderCategoryBreakdown = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Spending by Category</Text>
      {categorySpending.map((cat, index) => (
        <View key={index} style={styles.categoryRow}>
          <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
          <Text style={styles.categoryName}>{cat.category}</Text>
          <Text style={styles.categoryAmount}>{formatCurrency(cat.amount)}</Text>
          <Text style={styles.categoryPercentage}>{cat.percentage.toFixed(0)}%</Text>
        </View>
      ))}
    </View>
  );

  const renderTrendingItems = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Frequently Purchased</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {trendingItems.slice(0, 5).map((item, index) => (
          <View key={index} style={styles.trendingCard}>
            <Text style={styles.trendingName} numberOfLines={2}>
              {item.item_name}
            </Text>
            <Text style={styles.trendingCount}>{item.purchase_count}x</Text>
            <Text style={styles.trendingPrice}>{formatCurrency(item.avg_price)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header Stats */}
        <View style={styles.header}>
          <Text style={styles.title}>Analytics</Text>

          <View style={styles.periodSelector}>
            {['week', 'month', 'year'].map((period) => (
              <TouchableOpacity
                key={period}
                style={[
                  styles.periodButton,
                  selectedPeriod === period && styles.activePeriod,
                ]}
                onPress={() => setSelectedPeriod(period as any)}
              >
                <Text
                  style={[
                    styles.periodText,
                    selectedPeriod === period && styles.activePeriodText,
                  ]}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons name="wallet-outline" size={24} color="#3B82F6" />
              <Text style={styles.statValue}>{formatCurrency(stats.totalSpent)}</Text>
              <Text style={styles.statLabel}>Total Spent</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="trending-up-outline" size={24} color="#10B981" />
              <Text style={styles.statValue}>{formatCurrency(stats.avgWeekly)}</Text>
              <Text style={styles.statLabel}>Weekly Avg</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="cart-outline" size={24} color="#F59E0B" />
              <Text style={styles.statValue}>{stats.itemCount}</Text>
              <Text style={styles.statLabel}>Items</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="receipt-outline" size={24} color="#8B5CF6" />
              <Text style={styles.statValue}>{stats.receiptCount}</Text>
              <Text style={styles.statLabel}>Receipts</Text>
            </View>
          </View>
        </View>

        {/* Charts */}
        {renderSpendingChart()}
        {renderCategoryBreakdown()}
        {renderTrendingItems()}

        {/* Savings Opportunities */}
        {savingsOpportunities.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Savings Opportunities</Text>
            {savingsOpportunities.map((opp, index) => (
              <TouchableOpacity key={index} style={styles.opportunityCard}>
                <View style={[styles.opportunityIcon, { backgroundColor: opp.color + '20' }]}>
                  <Ionicons name={opp.icon} size={24} color={opp.color} />
                </View>
                <View style={styles.opportunityContent}>
                  <Text style={styles.opportunityTitle}>{opp.title}</Text>
                  <Text style={styles.opportunityDesc}>{opp.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 4,
    marginBottom: 20,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  activePeriod: {
    backgroundColor: '#fff',
  },
  periodText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  activePeriodText: {
    color: '#3B82F6',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  statCard: {
    width: '50%',
    padding: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 12,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  chartContainer: {
    backgroundColor: '#fff',
    marginTop: 12,
    padding: 20,
  },
  chart: {
    flexDirection: 'row',
    height: 120,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  chartBar: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  bar: {
    width: '80%',
    borderRadius: 4,
    marginBottom: 4,
  },
  chartLabel: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  categoryName: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginRight: 12,
  },
  categoryPercentage: {
    fontSize: 12,
    color: '#6B7280',
    width: 40,
    textAlign: 'right',
  },
  trendingCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    width: 120,
  },
  trendingName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 8,
  },
  trendingCount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3B82F6',
  },
  trendingPrice: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  opportunityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  opportunityIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  opportunityContent: {
    flex: 1,
  },
  opportunityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  opportunityDesc: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
});