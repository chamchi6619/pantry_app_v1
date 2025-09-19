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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../../core/constants/theme';
import { Button } from '../../../core/components/ui/Button';
import { Input } from '../../../core/components/ui/Input';
import { ItemEditorModal } from '../components/ItemEditorModal';
import { toTitleCase } from '../../../core/utils/textUtils';

type LocationTab = 'all' | 'Fridge' | 'Freezer' | 'Pantry';

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  expiresAt?: string;
  location: 'Fridge' | 'Freezer' | 'Pantry';
  emoji?: string;
}

interface ItemRowProps {
  item: InventoryItem;
  onPress: (id: string) => void;
  onQuantityChange: (id: string, delta: number) => void;
  onDelete: (id: string) => void;
}

const ItemRow: React.FC<ItemRowProps> = React.memo(({ item, onPress, onQuantityChange, onDelete }) => {
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
      `Remove "${item.name}" from inventory?`,
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

  const handleItemPress = () => {
    if (isOpen.current) {
      closeSwipe();
    } else {
      onPress(item.id);
    }
  };
  const getItemIcon = () => {
    if (item.emoji) {
      return item.emoji;
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
    if (!item.expiresAt) return null;
    const today = new Date();
    const expiry = new Date(item.expiresAt);
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
            {item.expiresAt ? (
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
          <Text style={styles.quantityValue}>{item.quantity}</Text>
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
  const [activeTab, setActiveTab] = useState<LocationTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<InventoryItem[]>([
    {
      id: '1',
      name: 'Ground Beef',
      quantity: 1.2,
      unit: 'lb',
      category: 'Proteins',
      expiresAt: '2024-12-26',
      location: 'Fridge',
      emoji: '🥩',
    },
    {
      id: '2',
      name: 'Bok Choy',
      quantity: 1,
      unit: 'bunch',
      category: 'Vegetables',
      expiresAt: '2024-12-30',
      location: 'Fridge',
      emoji: '🥬',
    },
    {
      id: '3',
      name: 'Eggs',
      quantity: 8,
      unit: 'pieces',
      category: 'Dairy',
      expiresAt: '2025-01-08',
      location: 'Fridge',
      emoji: '🥚',
    },
    {
      id: '4',
      name: 'Soy Milk',
      quantity: 32,
      unit: 'fl oz',
      category: 'Dairy',
      expiresAt: '2025-01-02',
      location: 'Fridge',
      emoji: '🥛',
    },
    {
      id: '5',
      name: 'Frozen Berries',
      quantity: 2,
      unit: 'bags',
      category: 'Fruits',
      location: 'Freezer',
      emoji: '🫐',
    },
    {
      id: '6',
      name: 'Ice Cream',
      quantity: 1,
      unit: 'pint',
      category: 'Frozen',
      location: 'Freezer',
      emoji: '🍦',
    },
  ]);

  // Group items by location for section list with sorting
  const getSectionData = useMemo(() => {
    let filtered = items.filter(item =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (activeTab !== 'all') {
      filtered = filtered.filter(item => item.location.toLowerCase() === activeTab.toLowerCase());
    }

    // Apply category filter if any selected
    if (selectedCategories.size > 0) {
      filtered = filtered.filter(item => selectedCategories.has(item.category));
    }


    // Group by location
    const grouped = filtered.reduce((acc, item) => {
      const locationKey = item.location;
      if (!acc[locationKey]) {
        acc[locationKey] = [];
      }
      acc[locationKey].push(item);
      return acc;
    }, {} as Record<string, InventoryItem[]>);

    // Always include all three sections in the correct order
    const locationOrder = ['Fridge', 'Freezer', 'Pantry'];
    const sections = locationOrder
      .filter(location => activeTab === 'all' || location.toLowerCase() === activeTab)
      .map(location => ({
        title: location,
        icon: location === 'Fridge' ? '❄️' : location === 'Freezer' ? '🧊' : '🗄️',
        data: grouped[location] || [],
        count: grouped[location]?.length || 0,
      }))
      .filter(section => section.data.length > 0); // Only show sections with items

    return sections;
  }, [items, searchQuery, activeTab, selectedCategories]);

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
    const item = items.find(i => i.id === itemId);
    if (item) {
      setEditingItem(item);
      setShowModal(true);
    }
  };

  const handleQuantityChange = (itemId: string, delta: number) => {
    setItems(prev =>
      prev.map(item =>
        item.id === itemId
          ? { ...item, quantity: Math.max(0, item.quantity + delta) }
          : item
      )
    );
  };

  const handleDeleteItem = (itemId: string) => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => setItems(prev => prev.filter(item => item.id !== itemId))
        },
      ]
    );
  };

  const handleSaveItem = (itemData: any) => {
    // Map modal data structure to inventory item structure
    const mappedData = {
      name: toTitleCase(itemData.name),
      quantity: isNaN(itemData.quantity) || itemData.quantity === null ? 0 : itemData.quantity,
      unit: itemData.unit,
      // Ensure location is properly capitalized
      location: itemData.location.charAt(0).toUpperCase() + itemData.location.slice(1) as 'Fridge' | 'Freezer' | 'Pantry',
      // Map expiryDate to expiresAt
      expiresAt: itemData.expiryDate || undefined,
      // Take first category from categories array
      category: itemData.categories && itemData.categories.length > 0 ? itemData.categories[0] : 'Other',
      // Pass through emoji
      emoji: itemData.emoji,
    };

    if (editingItem) {
      setItems(prev =>
        prev.map(item =>
          item.id === editingItem.id ? { ...item, ...mappedData } : item
        )
      );
    } else {
      const newItem: InventoryItem = {
        ...mappedData,
        id: Date.now().toString(),
      };
      setItems(prev => [...prev, newItem]);
    }
    setShowModal(false);
    setEditingItem(null);
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const renderSectionHeader = ({ section }: any) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionIcon}>{section.icon}</Text>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <Text style={styles.sectionCount}>{section.count} items</Text>
    </View>
  );

  const renderItem = ({ item }: { item: InventoryItem }) => (
    <ItemRow
      item={item}
      onPress={handleEditItem}
      onQuantityChange={handleQuantityChange}
      onDelete={handleDeleteItem}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        <Pressable style={styles.addItemButton} onPress={handleAddItem}>
          <Text style={styles.addItemText}>Add Item</Text>
          <View style={[styles.addButton, { marginLeft: 3 }]}>
            <Text style={styles.addIcon}>+</Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.tabContainer}>
        {(['All', 'Fridge', 'Freezer', 'Pantry'] as const).map((tab) => (
          <Pressable
            key={tab}
            style={[
              styles.tab,
              activeTab === tab.toLowerCase() && styles.tabActive,
            ]}
            onPress={() => {
              setActiveTab(tab.toLowerCase() as LocationTab);
              // Maintain category filters when switching tabs
            }}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.toLowerCase() && styles.tabTextActive,
              ]}
            >
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.searchContainer}>
        <Input
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name..."
          style={styles.searchInput}
          leftIcon={<Text>🔍</Text>}
        />
      </View>

      {activeTab === 'all' && (
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
              { backgroundColor: selectedCategories.size === 0 ? '#E5FFE5' : '#F0F0F0' }
            ]}
          >
            <Text style={styles.categoryPillIcon}>●</Text>
            <Text style={styles.categoryPillText}>All</Text>
            <Text style={styles.categoryPillCount}>{items.length}</Text>
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
                    borderWidth: isSelected ? 2 : 0,
                    borderColor: isSelected ? theme.colors.primary : 'transparent'
                  }
                ]}
              >
                <Text style={styles.categoryPillIcon}>{cat.icon}</Text>
                <Text style={styles.categoryPillText}>{cat.name}</Text>
                <Text style={styles.categoryPillCount}>{cat.count}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <SectionList
        sections={getSectionData}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={item => item.id}
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
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    marginHorizontal: 2,
  },
  tabActive: {
    backgroundColor: theme.colors.primary,
  },
  tabText: {
    ...theme.typography.body,
    color: theme.colors.textLight,
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  searchContainer: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
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
  categoryPills: {
    maxHeight: 50,
    marginBottom: theme.spacing.sm,
  },
  categoryPillsContent: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 2,  // Very slim - only 2px top and bottom
    borderRadius: theme.borderRadius.full,
    gap: theme.spacing.xs,
  },
  categoryPillIcon: {
    fontSize: 16,
  },
  categoryPillText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  categoryPillCount: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderTopWidth: 3,  // Bolder divider
    borderTopColor: theme.colors.border,
    marginTop: theme.spacing.sm,
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
});