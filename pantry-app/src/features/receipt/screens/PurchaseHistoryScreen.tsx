import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useHousehold } from '../../../hooks/useHousehold';
import { supabase } from '../../../lib/supabase';
import { theme } from '../../../core/constants/theme';

interface PurchaseItem {
  id: string;
  product_name: string;
  brand?: string;
  store_name?: string;
  purchase_date: string;
  quantity: number;
  unit?: string;
  total_price_cents: number;
  category?: string;
  was_on_sale?: boolean;
}

interface ReceiptSummary {
  id: string;
  store_name: string;
  receipt_date: string;
  total_amount_cents: number;
  item_count: number;
  status: string;
}

export function PurchaseHistoryScreen() {
  const navigation = useNavigation();
  const { currentHousehold } = useHousehold();

  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<'items' | 'receipts'>('items');
  const [stats, setStats] = useState({
    totalSpent: 0,
    totalItems: 0,
    totalReceipts: 0,
    avgItemPrice: 0,
  });

  useEffect(() => {
    if (currentHousehold?.id) {
      loadPurchaseHistory();
    }
  }, [currentHousehold?.id, selectedTab]);

  const loadPurchaseHistory = async () => {
    if (!currentHousehold?.id) return;

    try {
      setLoading(true);

      if (selectedTab === 'items') {
        // Load purchase items
        const { data: items, error } = await supabase
          .from('purchase_history')
          .select('*')
          .eq('household_id', currentHousehold.id)
          .order('purchase_date', { ascending: false })
          .limit(100);

        if (error) throw error;

        setPurchases(items || []);

        // Calculate stats
        if (items && items.length > 0) {
          const total = items.reduce((sum, item) => sum + (item.total_price_cents || 0), 0);
          setStats({
            totalSpent: total,
            totalItems: items.length,
            totalReceipts: new Set(items.map(i => i.receipt_id)).size,
            avgItemPrice: Math.round(total / items.length),
          });
        }
      } else {
        // Load receipts
        const { data: receiptData, error } = await supabase
          .from('receipts')
          .select(`
            id,
            store_name,
            receipt_date,
            total_amount_cents,
            status,
            receipt_items(count)
          `)
          .eq('household_id', currentHousehold.id)
          .order('receipt_date', { ascending: false })
          .limit(50);

        if (error) throw error;

        const formattedReceipts = receiptData?.map(r => ({
          id: r.id,
          store_name: r.store_name,
          receipt_date: r.receipt_date,
          total_amount_cents: r.total_amount_cents,
          item_count: r.receipt_items?.[0]?.count || 0,
          status: r.status,
        })) || [];

        setReceipts(formattedReceipts);
      }
    } catch (error) {
      console.error('Failed to load purchase history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadPurchaseHistory();
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const filteredPurchases = purchases.filter(item =>
    item.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.store_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredReceipts = receipts.filter(receipt =>
    receipt.store_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderPurchaseItem = ({ item }: { item: PurchaseItem }) => (
    <TouchableOpacity style={styles.purchaseCard}>
      <View style={styles.purchaseHeader}>
        <View style={styles.purchaseInfo}>
          <Text style={styles.productName}>{item.product_name}</Text>
          {item.brand && <Text style={styles.brand}>{item.brand}</Text>}
          <View style={styles.purchaseMeta}>
            <Text style={styles.storeName}>{item.store_name || 'Unknown Store'}</Text>
            <Text style={styles.separator}>•</Text>
            <Text style={styles.purchaseDate}>{formatDate(item.purchase_date)}</Text>
          </View>
        </View>
        <View style={styles.priceContainer}>
          <Text style={styles.price}>{formatPrice(item.total_price_cents)}</Text>
          {item.was_on_sale && (
            <View style={styles.saleBadge}>
              <Text style={styles.saleText}>SALE</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.purchaseDetails}>
        <Text style={styles.quantity}>
          {item.quantity} {item.unit || 'item'}
          {item.quantity > 1 ? 's' : ''}
        </Text>
        {item.category && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderReceiptItem = ({ item }: { item: ReceiptSummary }) => (
    <TouchableOpacity
      style={styles.receiptCard}
      onPress={() => navigation.navigate('ReceiptDetail', { receiptId: item.id })}
    >
      <View style={styles.receiptHeader}>
        <Ionicons name="receipt-outline" size={24} color="#6B7280" />
        <View style={styles.receiptInfo}>
          <Text style={styles.storeName}>{item.store_name}</Text>
          <Text style={styles.receiptDate}>{formatDate(item.receipt_date)}</Text>
        </View>
        <View style={styles.receiptStats}>
          <Text style={styles.receiptTotal}>{formatPrice(item.total_amount_cents)}</Text>
          <Text style={styles.itemCount}>{item.item_count} items</Text>
        </View>
      </View>
      <View style={[styles.statusBadge, styles[`status_${item.status}`]]}>
        <Text style={styles.statusText}>{item.status}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatPrice(stats.totalSpent)}</Text>
          <Text style={styles.statLabel}>Total Spent</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalItems}</Text>
          <Text style={styles.statLabel}>Items</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatPrice(stats.avgItemPrice)}</Text>
          <Text style={styles.statLabel}>Avg Price</Text>
        </View>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'items' && styles.activeTab]}
          onPress={() => setSelectedTab('items')}
        >
          <Text style={[styles.tabText, selectedTab === 'items' && styles.activeTabText]}>
            Items
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'receipts' && styles.activeTab]}
          onPress={() => setSelectedTab('receipts')}
        >
          <Text style={[styles.tabText, selectedTab === 'receipts' && styles.activeTabText]}>
            Receipts
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder={`Search ${selectedTab}...`}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#9CA3AF"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#6B7280" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading purchase history...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const data = selectedTab === 'items' ? filteredPurchases : filteredReceipts;
  const renderItem = selectedTab === 'items' ? renderPurchaseItem : renderReceiptItem;

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cart-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No Purchase History</Text>
            <Text style={styles.emptyText}>
              {selectedTab === 'items'
                ? 'Purchase items will appear here after processing receipts'
                : 'Processed receipts will appear here'}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={data.length === 0 ? styles.emptyList : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
  },
  header: {
    backgroundColor: theme.colors.surface,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    ...theme.typography.h3,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  statLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    ...theme.typography.bodySmall,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  activeTabText: {
    color: theme.colors.primary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.borderLight,
    borderRadius: theme.borderRadius.md,
  },
  searchInput: {
    flex: 1,
    marginLeft: theme.spacing.sm,
    ...theme.typography.bodySmall,
    color: theme.colors.text,
  },
  purchaseCard: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  purchaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  purchaseInfo: {
    flex: 1,
  },
  productName: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
  },
  brand: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  purchaseMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  storeName: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  separator: {
    marginHorizontal: theme.spacing.xs + 2,
    color: theme.colors.border,
  },
  purchaseDate: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  price: {
    ...theme.typography.h3,
    fontWeight: '700',
    color: theme.colors.text,
  },
  saleBadge: {
    backgroundColor: theme.colors.error + '20',
    borderRadius: theme.borderRadius.xs,
    paddingHorizontal: theme.spacing.xs + 2,
    paddingVertical: 2,
    marginTop: theme.spacing.xs,
  },
  saleText: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.error,
  },
  purchaseDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm + 4,
  },
  quantity: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
  },
  categoryBadge: {
    backgroundColor: theme.colors.primary + '15',
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: theme.spacing.xs,
    marginLeft: theme.spacing.sm,
  },
  categoryText: {
    ...theme.typography.caption,
    color: theme.colors.primary,
  },
  receiptCard: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptInfo: {
    flex: 1,
    marginLeft: theme.spacing.sm + 4,
  },
  receiptDate: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  receiptStats: {
    alignItems: 'flex-end',
  },
  receiptTotal: {
    ...theme.typography.h3,
    fontWeight: '700',
    color: theme.colors.text,
  },
  itemCount: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    marginTop: theme.spacing.sm,
  },
  status_completed: {
    backgroundColor: theme.colors.success + '30',
  },
  status_pending: {
    backgroundColor: '#FEF3C7',
  },
  status_failed: {
    backgroundColor: theme.colors.error + '20',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xl * 2,
  },
  emptyTitle: {
    ...theme.typography.h3,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
  emptyText: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  emptyList: {
    flexGrow: 1,
  },
});