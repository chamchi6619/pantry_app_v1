import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  SectionList,
  Alert,
  Animated,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../../core/constants/theme';
import { Button } from '../../../core/components/ui/Button';
import { ShoppingItemEditModal } from '../components/ShoppingItemEditModal';
import { toTitleCase } from '../../../core/utils/textUtils';
import { smartSyncService } from '../../../services/smartSyncService';

type FilterStatus = 'all' | 'pending' | 'done';

interface ShoppingItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string;
  category: string;
  checked: boolean;
  priority?: 'low' | 'medium' | 'high';
}

interface ShoppingItemRowProps {
  item: ShoppingItem;
  onToggle: (id: string) => void;
  onQuantityChange: (id: string, delta: number) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const ShoppingItemRow: React.FC<ShoppingItemRowProps> = React.memo(({ item, onToggle, onQuantityChange, onEdit, onDelete }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const lastOffset = useRef(0);
  const isOpen = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Very sensitive - responds to tiny movements
        return Math.abs(gestureState.dx) > 2 && Math.abs(gestureState.dy) < 15;
      },
      onPanResponderGrant: () => {
        // Stop any ongoing animations and store current value
        translateX.stopAnimation((value) => {
          lastOffset.current = value;
        });
      },
      onPanResponderMove: (_, gestureState) => {
        // Direct 1:1 movement for responsive feel
        let newX = lastOffset.current + gestureState.dx;

        // Clamp between 0 and -100 (no overscroll)
        newX = Math.min(0, Math.max(-100, newX));

        translateX.setValue(newX);
      },
      onPanResponderRelease: (_, gestureState) => {
        const velocity = gestureState.vx;
        const currentX = lastOffset.current + gestureState.dx;

        // Determine target based on velocity and position
        let shouldOpen = false;

        // Very sensitive to velocity
        if (Math.abs(velocity) > 0.3) {
          shouldOpen = velocity < 0; // Swiping left
        } else {
          // Lower threshold for opening/closing
          shouldOpen = currentX < -20;
        }

        // Animate to final position with snappy animation
        const toValue = shouldOpen ? -100 : 0;
        isOpen.current = shouldOpen;

        Animated.spring(translateX, {
          toValue,
          velocity: velocity * 0.8,
          tension: 100,  // Higher tension for snappier feel
          friction: 8,    // Lower friction for faster animation
          useNativeDriver: true,
        }).start(() => {
          // CRITICAL: Update lastOffset after animation completes
          lastOffset.current = toValue;
        });
      },
      onPanResponderTerminate: () => {
        // If gesture is interrupted, snap to final position
        const toValue = isOpen.current ? -100 : 0;
        Animated.spring(translateX, {
          toValue,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }).start(() => {
          lastOffset.current = toValue;
        });
      },
    })
  ).current;

  const handleDelete = () => {
    Alert.alert(
      'Delete Item',
      `Remove "${item.name}" from shopping list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Animated.timing(translateX, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start(() => {
              lastOffset.current = 0;
              onDelete(item.id);
            });
          },
        },
      ]
    );
  };

  const closeSwipe = () => {
    if (isOpen.current) {
      isOpen.current = false;
      Animated.spring(translateX, {
        toValue: 0,
        tension: 70,
        friction: 10,
        useNativeDriver: true,
      }).start(() => {
        // Update lastOffset after closing animation
        lastOffset.current = 0;
      });
    }
  };

  const handleToggle = () => {
    if (isOpen.current) {
      closeSwipe();
    } else {
      onToggle(item.id);
    }
  };

  const handleEdit = () => {
    if (isOpen.current) {
      closeSwipe();
    } else {
      onEdit(item.id);
    }
  };

  return (
    <View style={styles.swipeContainer}>
      <Animated.View
        style={[styles.itemRow, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Pressable
          style={[styles.checkbox, item.checked && styles.checkboxChecked]}
          onPress={handleToggle}
        >
          {item.checked && <Text style={styles.checkmark}>✓</Text>}
        </Pressable>

        <Pressable style={styles.itemInfo} onPress={handleEdit}>
          <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>
            {toTitleCase(item.name)}
          </Text>
          <Text style={styles.itemCategory}>{item.category}</Text>
        </Pressable>

        <View style={styles.itemActions}>
          <Pressable
            style={styles.quantityButton}
            onPress={() => onQuantityChange(item.id, -1)}
          >
            <Text style={styles.quantityButtonText}>−</Text>
          </Pressable>
          <Text style={styles.quantityValue}>
            {item.quantity === null ? '?' : item.quantity}
          </Text>
          <Pressable
            style={styles.quantityButton}
            onPress={() => onQuantityChange(item.id, 1)}
          >
            <Text style={styles.quantityButtonText}>+</Text>
          </Pressable>
        </View>
      </Animated.View>

      <Pressable style={styles.deleteAction} onPress={handleDelete}>
        <Text style={styles.deleteText}>Delete</Text>
      </Pressable>
    </View>
  );
});

export const ShoppingListScreen: React.FC = () => {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ShoppingItem | null>(null);
  const [hasPurchasedItems, setHasPurchasedItems] = useState(false);
  const [isCoShopping, setIsCoShopping] = useState(false);
  const [activeUsers, setActiveUsers] = useState(1);
  const [items, setItems] = useState<ShoppingItem[]>([
    {
      id: '1',
      name: 'Organic Milk',
      quantity: 1,
      unit: 'gallon',
      category: 'Dairy',
      checked: false,
    },
    {
      id: '2',
      name: 'Greek Yogurt',
      quantity: 2,
      unit: 'cups',
      category: 'Dairy',
      checked: false,
    },
    {
      id: '3',
      name: 'Cheddar Cheese',
      quantity: 1,
      unit: 'block',
      category: 'Dairy',
      checked: true,
    },
    {
      id: '4',
      name: 'Whole Wheat Bread',
      quantity: 1,
      unit: 'loaf',
      category: 'Bakery',
      checked: true,
    },
    {
      id: '5',
      name: 'Bananas',
      quantity: 6,
      unit: 'pcs',
      category: 'Produce',
      checked: false,
    },
    {
      id: '6',
      name: 'Bell Peppers',
      quantity: null,
      unit: 'pcs',
      category: 'Produce',
      checked: false,
    },
  ]);

  // Group items by category
  const getSectionData = useMemo(() => {
    let filtered = items;

    if (filter === 'pending') {
      filtered = items.filter(item => !item.checked);
    } else if (filter === 'done') {
      filtered = items.filter(item => item.checked);
    }

    // Group by category
    const grouped = filtered.reduce((acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    }, {} as Record<string, ShoppingItem[]>);

    // Convert to section list format
    const sections = Object.entries(grouped).map(([category, items]) => ({
      title: category,
      data: items,
      count: items.length,
    }));

    return sections;
  }, [items, filter]);

  const totalItems = items.length;
  const completedItems = items.filter(item => item.checked).length;

  const handleToggle = useCallback((id: string) => {
    setItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
  }, []);

  const handleQuantityChange = useCallback((id: string, delta: number) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const currentQty = item.quantity === null ? 0 : item.quantity;
        const newQty = Math.max(1, currentQty + delta);
        return { ...item, quantity: newQty };
      })
    );
  }, []);

  const handleEdit = useCallback((id: string) => {
    const item = items.find(i => i.id === id);
    if (item) {
      setEditingItem(item);
      setShowAddModal(true);
    }
  }, [items]);

  const handleDelete = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const handleAddItem = () => {
    setEditingItem(null);
    setShowAddModal(true);
  };

  const handleToggleCoShopping = async () => {
    if (!isCoShopping) {
      // Enable co-shopping
      console.log('[Shopping] Enabling co-shopping mode');
      const users = await smartSyncService.enableCoShopping();
      if (users) {
        setActiveUsers(users);
        setIsCoShopping(true);
        console.log(`[Shopping] Co-shopping enabled - ${users} users active`);
      }
    } else {
      // Disable co-shopping
      console.log('[Shopping] Disabling co-shopping mode');
      await smartSyncService.disableCoShopping();
      setActiveUsers(1);
      setIsCoShopping(false);
    }
  };

  const handleSaveItem = useCallback((itemData: any) => {
    if (editingItem) {
      setItems(prev =>
        prev.map(item =>
          item.id === editingItem.id ? { ...item, ...itemData } : item
        )
      );
    } else {
      const newItem: ShoppingItem = {
        ...itemData,
        id: Date.now().toString(),
        checked: false,
        quantity: itemData.quantity || null,
      };
      setItems(prev => [...prev, newItem]);
    }
    setShowAddModal(false);
    setEditingItem(null);
  }, [editingItem]);

  const handleMovePurchased = useCallback(() => {
    const checkedItems = items.filter(item => item.checked);
    if (checkedItems.length === 0) {
      Alert.alert('No items selected', 'Please check items you want to move to inventory');
      return;
    }

    Alert.alert(
      'Move Purchased to Inventory',
      `Move ${checkedItems.length} checked items to inventory? Unchecked items will remain in the list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move',
          onPress: () => {
            setItems(prev => prev.filter(item => !item.checked));
            setHasPurchasedItems(true);
            Alert.alert('Success', `Moved ${checkedItems.length} items to inventory`);
          },
        },
      ]
    );
  }, [items]);

  const handleClearAll = useCallback(() => {
    if (items.length === 0) {
      Alert.alert('List is empty', 'There are no items to clear');
      return;
    }

    const message = hasPurchasedItems
      ? 'Are you sure you want to clear all items from the shopping list?'
      : 'You haven\'t moved purchased items to inventory yet. Are you sure you want to clear all items?';

    Alert.alert(
      'Clear Shopping List',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            setItems([]);
            setHasPurchasedItems(false);
          },
        },
      ]
    );
  }, [items, hasPurchasedItems]);

  const renderSectionHeader = ({ section }: any) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <Text style={styles.sectionCount}>{section.count} items</Text>
    </View>
  );

  const renderItem = ({ item }: { item: ShoppingItem }) => (
    <ShoppingItemRow
      item={item}
      onToggle={handleToggle}
      onQuantityChange={handleQuantityChange}
      onEdit={handleEdit}
      onDelete={handleDelete}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Shopping List</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={[styles.coShoppingButton, isCoShopping && styles.coShoppingButtonActive]}
            onPress={handleToggleCoShopping}
          >
            <Text style={[styles.coShoppingButtonText, isCoShopping && styles.coShoppingButtonTextActive]}>
              {isCoShopping ? `👥 ${activeUsers}` : '👤'}
            </Text>
          </Pressable>
          <Pressable style={styles.headerButton} onPress={handleClearAll}>
            <Text style={styles.headerButtonText}>Clear</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          {totalItems} items • {completedItems} completed
        </Text>
      </View>

      <View style={styles.filterTabs}>
        <Pressable
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
            All
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filterTab, filter === 'pending' && styles.filterTabActive]}
          onPress={() => setFilter('pending')}
        >
          <Text style={[styles.filterTabText, filter === 'pending' && styles.filterTabTextActive]}>
            Pending
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filterTab, filter === 'done' && styles.filterTabActive]}
          onPress={() => setFilter('done')}
        >
          <Text style={[styles.filterTabText, filter === 'done' && styles.filterTabTextActive]}>
            Done
          </Text>
        </Pressable>
      </View>

      <View style={styles.addItemBar}>
        <Pressable style={styles.addItemButton} onPress={handleAddItem}>
          <Text style={styles.addItemIcon}>+</Text>
          <Text style={styles.addItemText}>Add Item</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        <SectionList
          sections={getSectionData}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={item => item.id}
          contentContainerStyle={[
            styles.listContent,
            completedItems > 0 && styles.listContentWithBottom
          ]}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🛒</Text>
              <Text style={styles.emptyText}>Your shopping list is empty</Text>
              <Text style={styles.emptySubtext}>Add items to get started</Text>
            </View>
          }
        />
      </View>

      {completedItems > 0 && (
        <View style={styles.bottomActions}>
          <Button
            variant="primary"
            onPress={handleMovePurchased}
            style={styles.moveButton}
          >
            <Text style={styles.moveButtonText}>Move Purchased to Inventory</Text>
          </Button>
        </View>
      )}

    </SafeAreaView>
    {showAddModal && (
      <ShoppingItemEditModal
        visible={showAddModal}
        item={editingItem}
        onSave={handleSaveItem}
        onClose={() => {
          setShowAddModal(false);
          setEditingItem(null);
        }}
      />
    )}
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  coShoppingButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  coShoppingButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  coShoppingButtonText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  coShoppingButtonTextActive: {
    color: '#fff',
  },
  headerButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  headerButtonText: {
    fontSize: 14,
    color: theme.colors.error,
    fontWeight: '600',
  },
  statsBar: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  statsText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  filterTab: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface,
  },
  filterTabActive: {
    backgroundColor: theme.colors.text,
  },
  filterTabText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  filterTabTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  addItemBar: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  addItemIcon: {
    fontSize: 20,
    color: theme.colors.textSecondary,
    marginRight: theme.spacing.xs,
  },
  addItemText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  sectionTitle: {
    ...theme.typography.h3,
    color: theme.colors.text,
  },
  sectionCount: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.xl,
  },
  listContentWithBottom: {
    paddingBottom: 80,
  },
  swipeContainer: {
    position: 'relative',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    width: '100%',
    zIndex: 1,
  },
  deleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 100,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  deleteText: {
    color: '#fff',
    fontWeight: '600',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.success,
    borderColor: theme.colors.success,
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  itemInfo: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  itemName: {
    ...theme.typography.body,
    color: theme.colors.text,
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
    color: theme.colors.textLight,
  },
  itemCategory: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexShrink: 0, // Prevent quantity controls from shrinking
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    fontSize: 18,
    color: theme.colors.text,
  },
  quantityValue: {
    minWidth: 30,
    textAlign: 'center',
    ...theme.typography.body,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl * 2,
    paddingTop: theme.spacing.xl * 3,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  emptyText: {
    ...theme.typography.h3,
    color: theme.colors.textLight,
    marginBottom: theme.spacing.xs,
  },
  emptySubtext: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  bottomActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  moveButton: {
    backgroundColor: theme.colors.primary,
  },
  moveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});