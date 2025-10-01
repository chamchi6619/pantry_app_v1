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
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#3B82F6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#3B82F6',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#111827',
  },
  purchaseCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  purchaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  purchaseInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  brand: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  purchaseMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  storeName: {
    fontSize: 12,
    color: '#6B7280',
  },
  separator: {
    marginHorizontal: 6,
    color: '#D1D5DB',
  },
  purchaseDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  saleBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  saleText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#EF4444',
  },
  purchaseDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  quantity: {
    fontSize: 14,
    color: '#6B7280',
  },
  categoryBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 8,
  },
  categoryText: {
    fontSize: 12,
    color: '#3B82F6',
  },
  receiptCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptInfo: {
    flex: 1,
    marginLeft: 12,
  },
  receiptDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  receiptStats: {
    alignItems: 'flex-end',
  },
  receiptTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  itemCount: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
  },
  status_completed: {
    backgroundColor: '#D1FAE5',
  },
  status_pending: {
    backgroundColor: '#FEF3C7',
  },
  status_failed: {
    backgroundColor: '#FEE2E2',
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
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  emptyList: {
    flexGrow: 1,
  },
});