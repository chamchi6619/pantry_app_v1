/**
 * ReceiptDetailScreen - View confirmed receipt details
 *
 * Shows read-only view of a receipt that has already been processed and confirmed.
 * Displays receipt header (store, date, total) and all parsed items.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { supabase } from '../../../lib/supabase';
import { theme } from '../../../core/constants/theme';

interface ReceiptItem {
  id: string;
  raw_text: string | null;
  parsed_name: string;
  quantity: number;
  unit: string;
  price_cents: number;
  categories: string | null;
}

interface Receipt {
  id: string;
  store_name: string | null;
  receipt_date: string | null;
  total_amount_cents: number;
  subtotal_cents: number;
  tax_amount_cents: number;
  status: string;
  parse_method: string | null;
}

type RouteParams = {
  ReceiptDetail: {
    receiptId: string;
  };
};

export function ReceiptDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'ReceiptDetail'>>();
  const { receiptId } = route.params;

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReceiptDetails();
  }, [receiptId]);

  const loadReceiptDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load receipt
      const { data: receiptData, error: receiptError } = await supabase
        .from('receipts')
        .select('*')
        .eq('id', receiptId)
        .single();

      if (receiptError) throw receiptError;
      setReceipt(receiptData);

      // Load items from receipt_fix_queue (contains all parsed items)
      const { data: itemsData, error: itemsError } = await supabase
        .from('receipt_fix_queue')
        .select('id, raw_text, parsed_name, quantity, unit, price_cents, categories')
        .eq('receipt_id', receiptId)
        .order('created_at', { ascending: true });

      if (itemsError) throw itemsError;
      setItems(itemsData || []);

    } catch (err: any) {
      console.error('Failed to load receipt details:', err);
      setError(err.message || 'Failed to load receipt');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderItem = ({ item }: { item: ReceiptItem }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemMain}>
        <Text style={styles.itemName}>{item.parsed_name}</Text>
        <Text style={styles.itemPrice}>{formatPrice(item.price_cents)}</Text>
      </View>
      <View style={styles.itemDetails}>
        <Text style={styles.itemQuantity}>
          {item.quantity} {item.unit}
        </Text>
        {item.categories && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{item.categories}</Text>
          </View>
        )}
      </View>
      {item.raw_text && item.raw_text !== item.parsed_name && (
        <Text style={styles.rawText}>"{item.raw_text}"</Text>
      )}
    </View>
  );

  const renderHeader = () => {
    if (!receipt) return null;

    const itemsTotal = items.reduce((sum, item) => sum + item.price_cents, 0);

    return (
      <View style={styles.header}>
        {/* Store Info */}
        <View style={styles.storeSection}>
          <Ionicons name="storefront-outline" size={32} color={theme.colors.primary} />
          <View style={styles.storeInfo}>
            <Text style={styles.storeName}>{receipt.store_name || 'Unknown Store'}</Text>
            <Text style={styles.receiptDate}>{formatDate(receipt.receipt_date)}</Text>
          </View>
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Items ({items.length})</Text>
            <Text style={styles.totalValue}>{formatPrice(itemsTotal)}</Text>
          </View>
          {receipt.tax_amount_cents > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax</Text>
              <Text style={styles.totalValue}>{formatPrice(receipt.tax_amount_cents)}</Text>
            </View>
          )}
          <View style={[styles.totalRow, styles.grandTotalRow]}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{formatPrice(receipt.total_amount_cents)}</Text>
          </View>
        </View>

        {/* Status Badge */}
        <View style={styles.statusSection}>
          <View style={[styles.statusBadge, styles[`status_${receipt.status}`] || styles.status_completed]}>
            <Text style={styles.statusText}>
              {receipt.status === 'completed' ? 'Confirmed' : receipt.status}
            </Text>
          </View>
          {receipt.parse_method && (
            <View style={styles.methodBadge}>
              <Ionicons name="sparkles" size={12} color="#9333EA" />
              <Text style={styles.methodText}>AI Parsed</Text>
            </View>
          )}
        </View>

        {/* Items Header */}
        <Text style={styles.itemsHeader}>Items</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading receipt...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.colors.error} />
          <Text style={styles.errorTitle}>Failed to Load</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadReceiptDetails}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Navigation Header */}
      <View style={styles.navHeader}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Receipt Details</Text>
        <View style={styles.placeholder} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No items found for this receipt</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: 8,
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 32,
  },
  header: {
    padding: 16,
    backgroundColor: theme.colors.surface,
    marginBottom: 8,
  },
  storeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  storeInfo: {
    marginLeft: 12,
    flex: 1,
  },
  storeName: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
  },
  receiptDate: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  totalsSection: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  totalValue: {
    fontSize: 14,
    color: theme.colors.text,
  },
  grandTotalRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginBottom: 0,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  grandTotalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  statusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#065F46',
    textTransform: 'capitalize',
  },
  methodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  methodText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9333EA',
  },
  itemsHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  itemCard: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    borderRadius: 12,
    ...theme.shadows.sm,
  },
  itemMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
    flex: 1,
    marginRight: 12,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  itemDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  itemQuantity: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  categoryBadge: {
    backgroundColor: theme.colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 11,
    color: theme.colors.primary,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  rawText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 12,
  },
});
