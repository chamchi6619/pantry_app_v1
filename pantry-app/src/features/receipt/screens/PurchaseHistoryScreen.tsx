import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useHousehold } from '../../../hooks/useHousehold';
import { supabase } from '../../../lib/supabase';
import { theme } from '../../../core/constants/theme';

// Helper functions for month navigation
const getMonthStart = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

const getMonthEnd = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
};

const getPreviousMonth = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
};

const getNextMonth = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
};

const formatMonthYear = (date: Date): string => {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const isSameMonth = (date1: Date, date2: Date): boolean => {
  return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth();
};

const isDateInMonth = (dateString: string, monthStart: Date): boolean => {
  const date = new Date(dateString);
  const monthEnd = getMonthEnd(monthStart);
  return date >= monthStart && date <= monthEnd;
};

const isDateInYear = (dateString: string, year: number): boolean => {
  const date = new Date(dateString);
  return date.getFullYear() === year;
};

const isFutureMonth = (year: number, month: number): boolean => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  return year > currentYear || (year === currentYear && month > currentMonth);
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface ReceiptWithItems {
  id: string;
  store_name: string;
  receipt_date: string;
  total_amount_cents: number;
  item_count: number;
  status: string;
  item_names: string[]; // For search functionality
}

export function PurchaseHistoryScreen() {
  const navigation = useNavigation();
  const { currentHousehold } = useHousehold();

  const [receipts, setReceipts] = useState<ReceiptWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<Date>(getMonthStart(new Date()));
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  // Check if we can navigate to next month (can't go beyond current month)
  const canGoNext = !isSameMonth(selectedMonth, new Date());

  // Filter receipts by selected month
  const monthFilteredReceipts = useMemo(() => {
    return receipts.filter(receipt => isDateInMonth(receipt.receipt_date, selectedMonth));
  }, [receipts, selectedMonth]);

  // Calculate stats based on filtered receipts
  const stats = useMemo(() => {
    if (monthFilteredReceipts.length === 0) {
      return { totalSpent: 0, totalItems: 0, totalTrips: 0, avgPerTrip: 0 };
    }
    const totalSpent = monthFilteredReceipts.reduce(
      (sum, receipt) => sum + (receipt.total_amount_cents || 0),
      0
    );
    const totalItems = monthFilteredReceipts.reduce(
      (sum, receipt) => sum + (receipt.item_count || 0),
      0
    );
    return {
      totalSpent,
      totalItems,
      totalTrips: monthFilteredReceipts.length,
      avgPerTrip: Math.round(totalSpent / monthFilteredReceipts.length),
    };
  }, [monthFilteredReceipts]);

  // Calculate monthly totals for calendar year grid
  const yearlyTotals = useMemo(() => {
    const totals: { [month: number]: number } = {};
    for (let i = 0; i < 12; i++) {
      totals[i] = 0;
    }
    receipts.forEach(receipt => {
      if (isDateInYear(receipt.receipt_date, calendarYear)) {
        const month = new Date(receipt.receipt_date).getMonth();
        totals[month] += receipt.total_amount_cents || 0;
      }
    });
    return totals;
  }, [receipts, calendarYear]);

  const handleCalendarMonthSelect = (month: number) => {
    if (!isFutureMonth(calendarYear, month)) {
      setSelectedMonth(new Date(calendarYear, month, 1));
      setShowCalendar(false);
    }
  };

  const handlePreviousYear = () => {
    setCalendarYear(calendarYear - 1);
  };

  const handleNextYear = () => {
    if (calendarYear < new Date().getFullYear()) {
      setCalendarYear(calendarYear + 1);
    }
  };

  const handlePreviousMonth = () => {
    setSelectedMonth(getPreviousMonth(selectedMonth));
  };

  const handleNextMonth = () => {
    if (canGoNext) {
      setSelectedMonth(getNextMonth(selectedMonth));
    }
  };

  useEffect(() => {
    if (currentHousehold?.id) {
      loadReceipts();
    }
  }, [currentHousehold?.id]);

  const loadReceipts = async () => {
    if (!currentHousehold?.id) return;

    try {
      setLoading(true);

      // Load receipts with their item names for search (last 6 months)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const { data: receiptData, error } = await supabase
        .from('receipts')
        .select(`
          id,
          store_name,
          receipt_date,
          total_amount_cents,
          status,
          receipt_fix_queue(parsed_name)
        `)
        .eq('household_id', currentHousehold.id)
        .gte('receipt_date', sixMonthsAgo.toISOString())
        .order('receipt_date', { ascending: false });

      if (error) throw error;

      const formattedReceipts: ReceiptWithItems[] = (receiptData || []).map(r => ({
        id: r.id,
        store_name: r.store_name || 'Unknown Store',
        receipt_date: r.receipt_date,
        total_amount_cents: r.total_amount_cents || 0,
        item_count: r.receipt_fix_queue?.length || 0,
        status: r.status,
        item_names: (r.receipt_fix_queue || []).map((item: any) => item.parsed_name?.toLowerCase() || ''),
      }));

      setReceipts(formattedReceipts);
    } catch (error) {
      console.error('Failed to load receipts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadReceipts();
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

  // Search by store name OR item names within receipts
  const filteredReceipts = useMemo(() => {
    if (!searchQuery) return monthFilteredReceipts;

    const query = searchQuery.toLowerCase();
    return monthFilteredReceipts.filter(receipt =>
      receipt.store_name.toLowerCase().includes(query) ||
      receipt.item_names.some(itemName => itemName.includes(query))
    );
  }, [monthFilteredReceipts, searchQuery]);

  const renderReceiptItem = ({ item }: { item: ReceiptWithItems }) => (
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
      {item.status !== 'completed' && (
        <View style={[styles.statusBadge, styles[`status_${item.status}`] || styles.status_pending]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      {/* Month Selector */}
      <View style={styles.monthSelector}>
        <TouchableOpacity
          style={styles.monthArrow}
          onPress={handlePreviousMonth}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.monthDisplay}
          onPress={() => {
            setCalendarYear(selectedMonth.getFullYear());
            setShowCalendar(true);
          }}
          activeOpacity={0.7}
        >
          <View style={styles.monthTextRow}>
            <Text style={styles.monthText}>{formatMonthYear(selectedMonth)}</Text>
            <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} style={styles.calendarIcon} />
          </View>
          <Text style={styles.monthTotal}>{formatPrice(stats.totalSpent)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.monthArrow, !canGoNext && styles.monthArrowDisabled]}
          onPress={handleNextMonth}
          disabled={!canGoNext}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name="chevron-forward"
            size={24}
            color={canGoNext ? theme.colors.primary : theme.colors.border}
          />
        </TouchableOpacity>
      </View>

      {/* Stats Row */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalItems}</Text>
          <Text style={styles.statLabel}>Items</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalTrips}</Text>
          <Text style={styles.statLabel}>Trips</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatPrice(stats.avgPerTrip)}</Text>
          <Text style={styles.statLabel}>Avg/Trip</Text>
        </View>
      </View>

      {/* Search - searches both store names and items */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search stores or items..."
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
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading receipts...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderCalendarModal = () => (
    <Modal
      visible={showCalendar}
      transparent
      animationType="fade"
      onRequestClose={() => setShowCalendar(false)}
    >
      <Pressable style={styles.modalOverlay} onPress={() => setShowCalendar(false)}>
        <Pressable style={styles.calendarContainer} onPress={(e) => e.stopPropagation()}>
          {/* Year Header */}
          <View style={styles.yearHeader}>
            <TouchableOpacity
              style={styles.yearArrow}
              onPress={handlePreviousYear}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
            <Text style={styles.yearText}>{calendarYear}</Text>
            <TouchableOpacity
              style={[styles.yearArrow, calendarYear >= new Date().getFullYear() && styles.yearArrowDisabled]}
              onPress={handleNextYear}
              disabled={calendarYear >= new Date().getFullYear()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name="chevron-forward"
                size={24}
                color={calendarYear >= new Date().getFullYear() ? theme.colors.border : theme.colors.primary}
              />
            </TouchableOpacity>
          </View>

          {/* Month Grid */}
          <View style={styles.monthGrid}>
            {[0, 1, 2, 3].map((row) => (
              <View key={row} style={styles.monthRow}>
                {[0, 1, 2].map((col) => {
                  const month = row * 3 + col;
                  const isFuture = isFutureMonth(calendarYear, month);
                  const isSelected = selectedMonth.getFullYear() === calendarYear && selectedMonth.getMonth() === month;
                  const total = yearlyTotals[month];

                  return (
                    <TouchableOpacity
                      key={month}
                      style={[
                        styles.monthCell,
                        isSelected && styles.monthCellSelected,
                        isFuture && styles.monthCellDisabled,
                      ]}
                      onPress={() => handleCalendarMonthSelect(month)}
                      disabled={isFuture}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.monthCellName,
                        isSelected && styles.monthCellNameSelected,
                        isFuture && styles.monthCellNameDisabled,
                      ]}>
                        {MONTH_NAMES[month]}
                      </Text>
                      <Text style={[
                        styles.monthCellTotal,
                        isSelected && styles.monthCellTotalSelected,
                        isFuture && styles.monthCellTotalDisabled,
                        total === 0 && !isFuture && styles.monthCellTotalZero,
                      ]}>
                        {isFuture ? '—' : `$${(total / 100).toFixed(0)}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Close Button */}
          <TouchableOpacity style={styles.closeButton} onPress={() => setShowCalendar(false)}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {renderCalendarModal()}
      <FlatList
        data={filteredReceipts}
        keyExtractor={(item) => item.id}
        renderItem={renderReceiptItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>
              {searchQuery ? 'No Results' : 'No Receipts'}
            </Text>
            <Text style={styles.emptyText}>
              {searchQuery
                ? `No receipts found matching "${searchQuery}"`
                : 'Scanned receipts will appear here'}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={filteredReceipts.length === 0 ? styles.emptyList : undefined}
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
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  header: {
    backgroundColor: theme.colors.surface,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  monthArrow: {
    padding: theme.spacing.sm,
  },
  monthArrowDisabled: {
    opacity: 0.3,
  },
  monthDisplay: {
    alignItems: 'center',
    flex: 1,
  },
  monthTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  calendarIcon: {
    marginLeft: 6,
  },
  monthText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  monthTotal: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.primary,
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.borderLight || '#F3F4F6',
    borderRadius: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: theme.spacing.sm,
    fontSize: 14,
    color: theme.colors.text,
  },
  receiptCard: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.sm,
    borderRadius: 12,
    padding: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptInfo: {
    flex: 1,
    marginLeft: 12,
  },
  storeName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  receiptDate: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  receiptStats: {
    alignItems: 'flex-end',
  },
  receiptTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  itemCount: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: theme.spacing.sm,
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
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  emptyList: {
    flexGrow: 1,
  },
  // Calendar Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: theme.spacing.lg,
    marginHorizontal: theme.spacing.lg,
    width: '90%',
    maxWidth: 360,
  },
  yearHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  yearArrow: {
    padding: theme.spacing.sm,
  },
  yearArrowDisabled: {
    opacity: 0.3,
  },
  yearText: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
  },
  monthGrid: {
    marginBottom: theme.spacing.md,
  },
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  monthCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    marginHorizontal: 4,
    borderRadius: 12,
    backgroundColor: theme.colors.background,
  },
  monthCellSelected: {
    backgroundColor: theme.colors.primary,
  },
  monthCellDisabled: {
    backgroundColor: theme.colors.border + '40',
  },
  monthCellName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  monthCellNameSelected: {
    color: '#fff',
  },
  monthCellNameDisabled: {
    color: theme.colors.textSecondary,
  },
  monthCellTotal: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  monthCellTotalSelected: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  monthCellTotalDisabled: {
    color: theme.colors.border,
  },
  monthCellTotalZero: {
    color: theme.colors.border,
  },
  closeButton: {
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.primary,
  },
});
