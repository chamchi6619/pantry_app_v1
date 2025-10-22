import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  SectionList,
  RefreshControl,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../../core/constants/theme';
import { Button } from '../../../core/components/ui/Button';
import { Input } from '../../../core/components/ui/Input';
import { ItemEditorModal } from '../components/ItemEditorModal';
import { toTitleCase } from '../../../core/utils/textUtils';
import { useInventorySupabaseStore } from '../../../stores/inventorySupabaseStore';
import { useAuth } from '../../../contexts/AuthContext';
import { FEATURE_FLAGS } from '../../../config/featureFlags';

const { width: screenWidth } = Dimensions.get('window');

// Smart quantity display: shows whole numbers cleanly, common fractions, and rounds decimals
function formatQuantity(qty: number): string {
  // Whole numbers: no decimals
  if (qty % 1 === 0) return qty.toString();

  // Common fractions
  if (qty === 0.25) return '¼';
  if (qty === 0.5) return '½';
  if (qty === 0.75) return '¾';
  if (Math.abs(qty - Math.floor(qty) - 0.5) < 0.01) return `${Math.floor(qty)}½`;

  // Everything else: 1 decimal max
  return qty.toFixed(1);
}

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  expirationDate?: string;
  location: 'fridge' | 'freezer' | 'pantry';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface ItemRowProps {
  item: InventoryItem;
  onPress: (id: string) => void;
  onQuantityChange: (id: string, delta: number) => void;
  onDelete: (id: string) => void;
  isOpen?: boolean;
  hasAnyOpen?: boolean;
  onOpenChange?: (id: string | null, isOpen: boolean) => void;
}

const ItemRow: React.FC<ItemRowProps> = React.memo(({
  item,
  onPress,
  onQuantityChange,
  onDelete,
  isOpen: isOpenProp = false,
  hasAnyOpen = false,
  onOpenChange
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const lastOffset = useRef(0);
  const isOpen = useRef(isOpenProp);

  // Sync open state with parent
  React.useEffect(() => {
    if (!isOpenProp && lastOffset.current !== 0) {
      Animated.spring(translateX, {
        toValue: 0,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }).start(() => {
        lastOffset.current = 0;
        isOpen.current = false;
      });
    }
  }, [isOpenProp, translateX]);

  // Lazy initialize PanResponder to improve performance
  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // More forgiving: prioritize horizontal movement
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const hasMovedEnough = Math.abs(gestureState.dx) > 5;
        return isHorizontal && hasMovedEnough;
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

        // Clamp between 0 and -80 (no overscroll)
        newX = Math.min(0, Math.max(-80, newX));

        translateX.setValue(newX);
      },
      onPanResponderRelease: (_, gestureState) => {
        const velocity = gestureState.vx;
        const currentX = lastOffset.current + gestureState.dx;

        // Determine target based on velocity and position
        let shouldOpen = false;

        // More lenient thresholds
        if (Math.abs(velocity) > 0.2) {
          shouldOpen = velocity < 0; // Swiping left
        } else {
          shouldOpen = currentX < -30; // Lower threshold for opening
        }

        const toValue = shouldOpen ? -80 : 0;
        isOpen.current = shouldOpen;
        onOpenChange?.(item.id, shouldOpen); // Notify parent about swipe state

        Animated.spring(translateX, {
          toValue,
          velocity: velocity * 0.5,
          tension: 70, // Softer spring
          friction: 10, // More damping
          useNativeDriver: true,
        }).start(() => {
          lastOffset.current = toValue;
        });
      },
      onPanResponderTerminate: () => {
        // If gesture is interrupted, snap to final position
        const toValue = isOpen.current ? -80 : 0;
        Animated.spring(translateX, {
          toValue,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }).start(() => {
          lastOffset.current = toValue;
        });
      },
      onShouldBlockNativeResponder: () => true,
      onPanResponderTerminationRequest: () => false, // Don't let scroll view steal the gesture
    }),
    []
  );

  const handleDelete = () => {
    Alert.alert(
      'Delete Item',
      `Remove "${item.name}" from inventory?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Delete immediately for better UX
            onDelete(item.id);
            // Then animate out
            Animated.timing(translateX, {
              toValue: -screenWidth,
              duration: 200,
              useNativeDriver: true,
            }).start();
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

  const handleItemPress = () => {
    // If any item is open, close it first
    if (hasAnyOpen) {
      onOpenChange?.(null, false);
      return;
    }
    // Only open editor if no swipes are open
    if (!isOpen.current) {
      onPress(item.id);
    }
  };
  const getItemIcon = () => {
    // Check if emoji is stored in notes field
    if (item.notes && item.notes.startsWith('Icon: ')) {
      return item.notes.substring(6);
    }
    const categoryIcons: Record<string, string> = {
      'Proteins': '🥩',
      'Vegetables': '🥬',
      'Dairy': '🥛',
      'Bakery': '🍞',
      'Grains': '🍚',
      'Fruits': '🍎',
      'Snacks': '🍿',
      'Beverages': '🥤',
      'Condiments': '🧂',
      'Frozen': '🧊',
    };
    return categoryIcons[item.category] || '🍽️';
  };

  const getDaysLeft = () => {
    if (!item.expirationDate) return null;

    // Parse YYYY-MM-DD format properly to avoid timezone issues
    const [year, month, day] = item.expirationDate.split('-').map(Number);
    if (!year || !month || !day) return null;

    // Create dates at noon to avoid timezone boundary issues
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    const expiry = new Date(year, month - 1, day, 12, 0, 0, 0);
    const days = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const daysLeft = getDaysLeft();
  const isExpiringSoon = daysLeft !== null && daysLeft <= 3;

  return (
    <View style={styles.swipeContainer}>
      <Animated.View
        style={[styles.itemRow, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Pressable onPress={handleItemPress} style={styles.itemContent}>
          <View style={styles.itemLeft}>
        <Text style={styles.itemIcon}>{getItemIcon()}</Text>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{toTitleCase(item.name)}</Text>
          <View style={styles.itemMeta}>
            <Text style={styles.locationText}>{item.location}</Text>
            {item.expirationDate ? (
              <Text style={[styles.expiryText, isExpiringSoon && styles.expiryTextUrgent]}>
                {isExpiringSoon && '🔥 '}{daysLeft <= 0 ? 'Expired' : `${daysLeft} days left`}
              </Text>
            ) : (
              <Text style={styles.expiryUnknown}>Expiry Unknown</Text>
            )}
          </View>
        </View>
      </View>
      <View style={styles.itemActions}>
        <Pressable
          style={styles.quantityButton}
          onPress={() => onQuantityChange(item.id, -1)}
        >
          <Text style={styles.quantityButtonText}>−</Text>
        </Pressable>
        <View style={styles.quantityDisplay}>
          <Text style={styles.quantityValue}>{formatQuantity(item.quantity)}</Text>
          <Text style={styles.quantityUnit}>{item.unit}</Text>
        </View>
        <Pressable
          style={styles.quantityButton}
          onPress={() => onQuantityChange(item.id, 1)}
        >
          <Text style={styles.quantityButtonText}>+</Text>
        </Pressable>
      </View>
        </Pressable>
      </Animated.View>
      <Pressable style={styles.deleteAction} onPress={handleDelete}>
        <Text style={styles.deleteText}>Delete</Text>
      </Pressable>
    </View>
  );
});

export const InventoryScreen: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const { householdId } = useAuth();

  // Use Supabase store
  const items = useInventorySupabaseStore((state) => state.items) as InventoryItem[];
  const updateItem = useInventorySupabaseStore((state) => state.updateItem);
  const deleteItem = useInventorySupabaseStore((state) => state.deleteItem);
  const addItem = useInventorySupabaseStore((state) => state.addItem);
  const initialize = useInventorySupabaseStore((state) => state.initialize);
  const loadFromSupabase = useInventorySupabaseStore((state) => state.loadFromSupabase);

  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Initialize store with household ID
  React.useEffect(() => {
    const initializeInventory = async () => {
      if (householdId) {
        await initialize(householdId);
      }
      setIsLoading(false);
    };

    initializeInventory();
  }, [householdId, initialize]);

  // Remove the hardcoded items that were here
  const oldItems = [
  ];

  // Group items by location for section list with sorting
  const getSectionData = useMemo(() => {
    let filtered = items.filter(item =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Apply category filter if any selected
    if (selectedCategories.size > 0) {
      filtered = filtered.filter(item => selectedCategories.has(item.category));
    }

    // Group by location (convert to title case for display)
    const grouped = filtered.reduce((acc, item) => {
      const locationKey = item.location.charAt(0).toUpperCase() + item.location.slice(1);
      if (!acc[locationKey]) {
        acc[locationKey] = [];
      }
      acc[locationKey].push(item);
      return acc;
    }, {} as Record<string, InventoryItem[]>);

    // Always include all three sections in the correct order
    const locationOrder = ['Fridge', 'Freezer', 'Pantry'];
    const sections = locationOrder
      .map(location => ({
        title: location,
        icon: location === 'Fridge' ? '❄️' : location === 'Freezer' ? '🧊' : '🗄️',
        data: collapsedSections.has(location) ? [] : (grouped[location] || []),
        actualCount: grouped[location]?.length || 0,
        isCollapsed: collapsedSections.has(location),
      }));

    return sections;
  }, [items, searchQuery, selectedCategories, collapsedSections]);

  // Get category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach(item => {
      counts[item.category] = (counts[item.category] || 0) + 1;
    });
    return counts;
  }, [items]);

  // Get all unique categories for pills
  const topCategories = useMemo(() => {
    // Get all unique categories (sorted alphabetically)
    const allCategories = [...new Set(items.map(item => item.category))]
      .filter(cat => cat)
      .sort((a, b) => a.localeCompare(b));

    return allCategories.map(category => {
      const icons: Record<string, string> = {
        'Fruits': '🍓',
        'Vegetables': '🥬',
        'Proteins': '🍗',
        'Dairy': '🥛',
        'Frozen': '🧊',
        'Grains': '🌾',
        'Snacks': '🍿',
        'Beverages': '🥤',
        'Essential': '⭐',
        'Other': '🍽️',
      };
      const colors: Record<string, string> = {
        'Fruits': '#FFE5E5',
        'Vegetables': '#E5FFE5',
        'Proteins': '#FFE5F0',
        'Dairy': '#E5F5FF',
        'Frozen': '#E5F0FF',
        'Grains': '#FFF5E5',
        'Snacks': '#FFE5F5',
        'Beverages': '#E5FFFF',
        'Essential': '#FFFFE5',
        'Other': '#F0F0F0',
      };
      return {
        name: category,
        count: categoryCounts[category] || 0,
        icon: icons[category] || '🍽️',
        color: colors[category] || '#F0F0F0',
      };
    }).sort((a, b) => b.count - a.count);
  }, [items, categoryCounts]);

  const handleAddItem = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const handleEditItem = (itemId: string) => {
    // Don't edit if any swipe is open
    if (openItemId) {
      setOpenItemId(null);
      return;
    }
    const item = items.find(i => i.id === itemId);
    if (item) {
      // Extract emoji from notes if stored there
      let itemWithEmoji = { ...item };
      if (item.notes && item.notes.startsWith('Icon: ')) {
        itemWithEmoji.emoji = item.notes.substring(6);
      }
      setEditingItem(itemWithEmoji);
      setShowModal(true);
    }
  };

  const handleOpenChange = useCallback((id: string | null, isOpen: boolean) => {
    if (id === null) {
      // Close all items
      setOpenItemId(null);
    } else {
      setOpenItemId(isOpen ? id : null);
    }
  }, []);

  const handleQuantityChange = (itemId: string, delta: number) => {
    const item = items.find(i => i.id === itemId);
    if (item) {
      let newQuantity = item.quantity + delta;

      // Round to 1 decimal place to avoid floating point weirdness
      newQuantity = Math.round(newQuantity * 10) / 10;

      if (newQuantity <= 0) {
        Alert.alert(
          'Remove Item?',
          `"${item.name}" quantity will be 0. Remove from inventory?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: () => deleteItem(itemId)
            }
          ]
        );
      } else {
        updateItem(itemId, { quantity: newQuantity });
      }
    }
  };

  const handleDeleteItem = (itemId: string) => {
    // Direct delete - confirmation is handled in ItemRow swipe action
    deleteItem(itemId);
  };


  const handleSaveItem = (itemData: any) => {
    console.log('Received item data:', itemData);
    // Map modal data structure to inventory item structure
    const mappedData = {
      name: toTitleCase(itemData.name),
      quantity: isNaN(itemData.quantity) || itemData.quantity === null ? 0 : itemData.quantity,
      unit: itemData.unit,
      // Ensure location is lowercase for store
      location: itemData.location.toLowerCase() as 'fridge' | 'freezer' | 'pantry',
      // Use expirationDate directly from modal as YYYY-MM-DD string
      expirationDate: itemData.expirationDate && itemData.expirationDate !== ''
        ? itemData.expirationDate
        : undefined,
      // Take first category from categories array
      category: itemData.categories && itemData.categories.length > 0 ? itemData.categories[0] : 'Other',
      // Store emoji in notes field for persistence
      notes: itemData.emoji ? `Icon: ${itemData.emoji}` : (editingItem?.notes || undefined),
    };

    console.log('Mapped data with expirationDate:', mappedData.expirationDate);

    if (editingItem) {
      updateItem(editingItem.id, mappedData);
    } else {
      addItem(mappedData);
    }
    setShowModal(false);
    setEditingItem(null);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    // Reload from Supabase if sync is enabled
    if (FEATURE_FLAGS.SYNC_INVENTORY) {
      await loadFromSupabase();
    }

    setRefreshing(false);
  }, [loadFromSupabase]);

  const toggleSection = (sectionTitle: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionTitle)) {
        newSet.delete(sectionTitle);
      } else {
        newSet.add(sectionTitle);
      }
      return newSet;
    });
  };

  const renderSectionHeader = ({ section }: any) => (
    <Pressable
      style={styles.sectionHeader}
      onPress={() => toggleSection(section.title)}
    >
      <Text style={styles.chevron}>
        {section.isCollapsed ? '►' : '▼'}
      </Text>
      <Text style={styles.sectionIcon}>{section.icon}</Text>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <Text style={styles.sectionCount}>{section.actualCount} items</Text>
    </Pressable>
  );

  const renderItem = ({ item }: { item: InventoryItem }) => (
    <ItemRow
      item={item}
      onPress={handleEditItem}
      onQuantityChange={handleQuantityChange}
      onDelete={handleDeleteItem}
      isOpen={openItemId === item.id}
      hasAnyOpen={openItemId !== null}
      onOpenChange={handleOpenChange}
    />
  );

  // Show loading indicator for initial mount
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading inventory...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        <Pressable style={styles.addItemButton} onPress={handleAddItem}>
          <Text style={styles.addItemText}>Add Item</Text>
          <View style={[styles.addButton, { marginLeft: 3 }]}>
            <Text style={styles.addIcon}>+</Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.searchContainer}>
        <Input
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name..."
          containerStyle={styles.searchInput}
          leftIcon={<Text>🔍</Text>}
        />
      </View>

      <View style={styles.categoryPillsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryPills}
          contentContainerStyle={styles.categoryPillsContent}
        >
        <Pressable
          onPress={() => setSelectedCategories(new Set())}
          style={[
            styles.categoryPill,
            {
              backgroundColor: selectedCategories.size === 0 ? '#E5FFE5' : '#F0F0F0',
              borderColor: selectedCategories.size === 0 ? theme.colors.primary : '#E5E7EB',
            }
          ]}
        >
          <Text style={[styles.categoryPillIcon, selectedCategories.size === 0 && { color: '#000' }]}>●</Text>
          <Text style={[styles.categoryPillText, selectedCategories.size === 0 && { color: '#000', fontWeight: '600' }]}>All</Text>
          <Text style={[styles.categoryPillCount, selectedCategories.size === 0 && { color: '#000' }]}>{items.length}</Text>
        </Pressable>
        {topCategories.map(cat => {
          const isSelected = selectedCategories.has(cat.name);
          return (
            <Pressable
              key={cat.name}
              onPress={() => {
                const newSelected = new Set(selectedCategories);
                if (isSelected) {
                  newSelected.delete(cat.name);
                } else {
                  newSelected.add(cat.name);
                }
                setSelectedCategories(newSelected);
              }}
              style={[
                styles.categoryPill,
                {
                  backgroundColor: isSelected ? cat.color : '#F0F0F0',
                  borderColor: isSelected ? theme.colors.primary : '#E5E7EB',
                }
              ]}
            >
              <Text style={[styles.categoryPillIcon, isSelected && { color: '#000' }]}>{cat.icon}</Text>
              <Text style={[styles.categoryPillText, isSelected && { color: '#000', fontWeight: '600' }]}>{cat.name}</Text>
              <Text style={[styles.categoryPillCount, isSelected && { color: '#000' }]}>{cat.count}</Text>
            </Pressable>
          );
        })}
        </ScrollView>
      </View>

      <SectionList
        sections={getSectionData}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={item => item.id}
        extraData={items.length} // Force re-render when items change
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyText}>No items found</Text>
          </View>
        }
      />

      {showModal && (
        <ItemEditorModal
          visible={showModal}
          item={editingItem}
          onSave={handleSaveItem}
          onDelete={editingItem ? () => {
            handleDeleteItem(editingItem.id);
            setShowModal(false);
            setEditingItem(null);
          } : undefined}
          onClose={() => {
            setShowModal(false);
            setEditingItem(null);
          }}
        />
      )}
    </SafeAreaView>
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
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  addItemText: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 32,  // Match button height for better alignment
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 20,  // Ensure proper centering
  },
  searchContainer: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: 0,  // No gap - pills container handles spacing
  },
  searchInput: {
    backgroundColor: theme.colors.surface,
  },
  sortButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 90,
  },
  sortButtonActive: {
    backgroundColor: '#E5F5FF',
    borderColor: theme.colors.primary,
  },
  sortText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  sortTextActive: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  categoryPillsContainer: {
    height: 56,  // Fixed container height
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    overflow: 'hidden',  // Prevent content overflow
  },
  categoryPills: {
    flex: 1,  // Take full height of container
  },
  categoryPillsContent: {
    paddingHorizontal: 16,
    paddingTop: 6,  // Reduced from 10 to bring closer to search
    paddingBottom: 10,
    gap: 8,
    alignItems: 'center',  // Center pills vertically
    flexDirection: 'row',  // Ensure horizontal layout
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1.5,  // Consistent border
    minHeight: 36,  // Minimum height instead of fixed
    justifyContent: 'center',
  },
  categoryPillIcon: {
    fontSize: 16,
    lineHeight: 18,
  },
  categoryPillText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    lineHeight: 18,
  },
  categoryPillCount: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    lineHeight: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderTopWidth: 3,  // Bolder divider
    borderTopColor: theme.colors.border,
    marginTop: 0,  // Remove margin to eliminate gap
  },
  chevron: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginRight: theme.spacing.xs,
    width: 16,
  },
  sectionIcon: {
    fontSize: 20,
    marginRight: theme.spacing.sm,
  },
  sectionTitle: {
    ...theme.typography.h3,
    color: theme.colors.primary,
    flex: 1,
  },
  sectionCount: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
  },
  listContent: {
    paddingBottom: theme.spacing.xl,
  },
  swipeContainer: {
    position: 'relative',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  itemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  deleteText: {
    color: '#fff',
    fontWeight: '600',
  },
  itemRow: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    width: '100%',
    zIndex: 1,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemIcon: {
    fontSize: 24,
    marginRight: theme.spacing.sm,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontWeight: '500',
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: theme.spacing.xs,
  },
  locationText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  expiryText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  expiryUnknown: {
    fontSize: 12,
    color: '#9CA3AF',  // Lighter gray color for unknown expiry
    fontStyle: 'italic',
  },
  expiryTextUrgent: {
    color: theme.colors.error,
    fontWeight: '600',
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
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
  quantityDisplay: {
    alignItems: 'center',
    minWidth: 40,
  },
  quantityValue: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontWeight: '600',
  },
  quantityUnit: {
    fontSize: 10,
    color: theme.colors.textLight,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl * 2,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textLight,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...theme.typography.body,
    color: theme.colors.textLight,
  },
});