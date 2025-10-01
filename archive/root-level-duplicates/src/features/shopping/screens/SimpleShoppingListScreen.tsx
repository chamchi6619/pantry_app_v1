import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../../core/constants/theme';
import { useShoppingListSupabaseStore } from '../../../stores/shoppingListSupabaseStore';
import { useAuth } from '../../../contexts/AuthContext';
import { FEATURE_FLAGS } from '../../../config/featureFlags';
import { LocationSelectorModal, LocationAssignments } from '../components/LocationSelectorModal';

type FilterStatus = 'all' | 'pending' | 'done';

interface InlineItemProps {
  item: any;
  onToggle: (id: string) => void;
  onUpdate: (id: string, updates: any) => void;
  onDelete: (id: string) => void;
  onQuantityChange: (id: string, delta: number) => void;
  isOpen: boolean;
  hasAnyOpen: boolean;
  onOpenChange: (id: string | null, isOpen: boolean) => void;
  isEditing: boolean;
  onEditingChange: (id: string | null) => void;
  isAddingNew: boolean;
}

const InlineItem: React.FC<InlineItemProps> = React.memo(({
  item,
  onToggle,
  onUpdate,
  onDelete,
  onQuantityChange,
  isOpen,
  hasAnyOpen,
  onOpenChange,
  isEditing,
  onEditingChange,
  isAddingNew
}) => {
  const [editText, setEditText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const translateX = useRef(new Animated.Value(0)).current;
  const lastOffset = useRef(0);
  const lastEditSubmitRef = useRef({ text: '', time: 0 });

  // Format quantity with unit for display
  const formatQuantityWithUnit = useCallback((item: ShoppingListItem) => {
    const qty = item.quantity || 1;
    const unit = item.unit || 'item';

    // Only show unit if it's meaningful (not "item" or "piece")
    if (unit === 'item' || unit === 'piece') {
      return qty.toString();
    }

    // Format with unit
    return `${qty}${unit}`;
  }, []);

  // Sync open state with parent
  React.useEffect(() => {
    if (!isOpen && lastOffset.current !== 0) {
      Animated.spring(translateX, {
        toValue: 0,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }).start(() => {
        lastOffset.current = 0;
      });
    }
  }, [isOpen, translateX]);

  // Sync editing state with parent
  React.useEffect(() => {
    if (isEditing) {
      setEditText(item.name);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isEditing, item.name]);

  // Clean up animations on unmount
  React.useEffect(() => {
    return () => {
      translateX.stopAnimation();
    };
  }, [translateX]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Don't allow swipe if currently editing this item
        if (isEditing) {
          return false;
        }
        // More forgiving: prioritize horizontal movement
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const hasMovedEnough = Math.abs(gestureState.dx) > 5;
        return isHorizontal && hasMovedEnough;
      },
      onPanResponderGrant: () => {
        // Close any other open items when starting a new swipe
        if (!isOpen) {
          onOpenChange(item.id, false); // This will close other items
        }
        translateX.stopAnimation((value) => {
          lastOffset.current = value;
        });
      },
      onPanResponderMove: (_, gestureState) => {
        let newX = lastOffset.current + gestureState.dx;
        newX = Math.min(0, Math.max(-80, newX)); // Limit swipe distance
        translateX.setValue(newX);
      },
      onPanResponderRelease: (_, gestureState) => {
        const velocity = gestureState.vx;
        const currentX = lastOffset.current + gestureState.dx;
        let shouldOpen = false;

        // More lenient thresholds
        if (Math.abs(velocity) > 0.2) {
          shouldOpen = velocity < 0; // Swiping left
        } else {
          shouldOpen = currentX < -30; // Lower threshold for opening
        }

        const toValue = shouldOpen ? -80 : 0;
        onOpenChange(item.id, shouldOpen);

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
        // Handle when gesture is interrupted (e.g., by scroll or another touch)
        const toValue = isOpen ? -80 : 0;
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
    })
  ).current;

  const handlePress = useCallback(() => {
    // If currently adding, don't do anything (add mode should be exited first)
    if (isAddingNew) {
      return;
    }

    // If this item is open, close it
    if (isOpen) {
      onOpenChange(item.id, false);
      return;
    }

    // If another item was open, just close it
    if (hasAnyOpen) {
      onOpenChange(null, false);
      return;
    }

    // Always toggle checkbox - this is the primary action while shopping
    onToggle(item.id);
  }, [item.id, isOpen, hasAnyOpen, isAddingNew, onOpenChange, onToggle]);

  const handleLongPress = useCallback(() => {
    // Don't edit if swipe is open or adding new item
    if (isOpen || hasAnyOpen || isAddingNew) {
      return;
    }

    // Enter edit mode
    onEditingChange(item.id);
  }, [item.id, isOpen, hasAnyOpen, isAddingNew, onEditingChange]);

  const handleSubmit = useCallback(() => {
    const trimmedText = editText.trim();
    const now = Date.now();

    // Guard against duplicate submission within 300ms
    if (trimmedText === lastEditSubmitRef.current.text &&
        now - lastEditSubmitRef.current.time < 300) {
      setEditText('');  // Clear input but don't update duplicate
      onEditingChange(null);
      return;
    }

    lastEditSubmitRef.current = { text: trimmedText, time: now };

    if (!trimmedText) {
      onDelete(item.id);
    } else if (trimmedText !== item.name) {
      onUpdate(item.id, { name: trimmedText });
    }
    onEditingChange(null);
  }, [editText, item.id, item.name, onUpdate, onDelete, onEditingChange]);

  const handleBlur = useCallback(() => {
    // Save on blur - same as submit
    const trimmedText = editText.trim();
    if (!trimmedText) {
      // If empty, just cancel edit without deleting
      onEditingChange(null);
    } else if (trimmedText !== item.name) {
      // Save the changes
      onUpdate(item.id, { name: trimmedText });
    }
    onEditingChange(null);
  }, [editText, item.id, item.name, onUpdate, onEditingChange]);

  const handleDelete = () => {
    // Animate out then delete
    Animated.timing(translateX, {
      toValue: -400,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onDelete(item.id);
    });
  };

  if (isEditing) {
    return (
      <View style={styles.swipeContainer}>
        <View style={styles.itemContainer}>
          <View style={styles.itemRow}>
            <View style={{ width: 40, flexShrink: 0 }}>
              <View style={[styles.checkbox, { marginRight: 0 }]} />
            </View>
            <View style={{ flex: 1, justifyContent: 'center', height: 24 }}>
              <TextInput
                ref={inputRef}
                style={styles.inlineInput}
                value={editText}
                onChangeText={setEditText}
                onSubmitEditing={handleSubmit}
                onBlur={handleBlur}
                autoCapitalize="none"
                returnKeyType="done"
                multiline={false}
                numberOfLines={1}
              />
            </View>
          </View>
          {/* Keep quantity controls visible during edit */}
          <View style={styles.quantityControls}>
            <Pressable
              style={styles.quantityButton}
              onPress={() => onQuantityChange(item.id, -1)}
            >
              <Text style={styles.quantityButtonText}>−</Text>
            </Pressable>
            <Text style={styles.quantityText}>{formatQuantityWithUnit(item)}</Text>
            <Pressable
              style={styles.quantityButton}
              onPress={() => onQuantityChange(item.id, 1)}
            >
              <Text style={styles.quantityButtonText}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.swipeContainer}>
      <Animated.View
        style={[
          styles.itemContainer,
          { transform: [{ translateX }] }
        ]}
        {...panResponder.panHandlers}
      >
        <Pressable
          style={({ pressed }) => [
            styles.itemRow,
            pressed && styles.itemRowPressed
          ]}
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={500}
          android_ripple={{ color: theme.colors.primary + '10' }}
        >
          <View
            style={[styles.checkbox, item.checked && styles.checkboxChecked]}
          >
            {item.checked && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text
            style={[styles.itemText, item.checked && styles.itemTextChecked]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.name}
          </Text>
        </Pressable>

        {/* Quantity controls on the right */}
        <View style={styles.quantityControls}>
          <Pressable
            style={styles.quantityButton}
            onPress={() => onQuantityChange(item.id, -1)}
          >
            <Text style={styles.quantityButtonText}>−</Text>
          </Pressable>
          <Text style={styles.quantityText}>{item.quantity || 1}</Text>
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

export const SimpleShoppingListScreen: React.FC = () => {
  const { householdId } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);

  // Use Supabase store
  const items = useShoppingListSupabaseStore((state) => state.items);
  const addItem = useShoppingListSupabaseStore((state) => state.addItem);
  const updateItem = useShoppingListSupabaseStore((state) => state.updateItem);
  const deleteItem = useShoppingListSupabaseStore((state) => state.deleteItem);
  const toggleItem = useShoppingListSupabaseStore((state) => state.toggleItem);
  const clearCompleted = useShoppingListSupabaseStore((state) => state.clearCompleted);
  const moveToInventory = useShoppingListSupabaseStore((state) => state.moveToInventory);
  const initialize = useShoppingListSupabaseStore((state) => state.initialize);
  const loadFromSupabase = useShoppingListSupabaseStore((state) => state.loadFromSupabase);
  const isSyncing = useShoppingListSupabaseStore((state) => state.isSyncing);
  const syncError = useShoppingListSupabaseStore((state) => state.syncError);

  // Initialize store with household ID
  React.useEffect(() => {
    const initializeShoppingList = async () => {
      if (householdId) {
        await initialize(householdId);
      }
      setIsInitialized(true);
    };

    initializeShoppingList();
  }, [householdId, initialize]);

  const [filter, setFilter] = useState<FilterStatus>('all');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const addInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const lastSubmitRef = useRef({ text: '', time: 0 });
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);

  // Filter items
  const filteredItems = useMemo(() => {
    switch (filter) {
      case 'pending':
        return items.filter(item => !item.checked);
      case 'done':
        return items.filter(item => item.checked);
      default:
        return items;
    }
  }, [items, filter]);

  // Stats
  const totalItems = items.length;
  const completedItems = items.filter(i => i.checked).length;

  const handleAddArea = useCallback(() => {
    // If any swipe is open, close it first
    if (openItemId) {
      setOpenItemId(null);
      return;
    }
    // If any item is being edited, exit edit mode first
    if (editingItemId) {
      setEditingItemId(null);
      return;
    }
    setIsAddingNew(true);
    // Scroll to bottom when opening add area
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
      addInputRef.current?.focus();
    }, 100);
  }, [editingItemId, openItemId]);

  const handleAddSubmit = useCallback(async () => {
    const trimmedText = newItemText.trim();

    if (trimmedText) {
      const now = Date.now();

      // Guard against duplicate submission within 300ms
      if (trimmedText === lastSubmitRef.current.text &&
          now - lastSubmitRef.current.time < 300) {
        setNewItemText('');  // Clear input but don't add duplicate
        return;
      }

      lastSubmitRef.current = { text: trimmedText, time: now };

      await addItem({
        name: trimmedText,
        quantity: 1,
        unit: 'pieces',
        category: 'Other',
      });
      setNewItemText('');
      // Keep add mode active and input focused for continuous entry
      setIsAddingNew(true);
      // Scroll to bottom to keep input visible after adding item
      // Use longer delay to ensure item is rendered first
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
        addInputRef.current?.focus();
      }, 100);
    } else {
      setIsAddingNew(false);
      // Clear any open states when done adding
      setOpenItemId(null);
      setEditingItemId(null);
    }
  }, [newItemText, addItem]);

  const handleAddBlur = useCallback(() => {
    if (!newItemText.trim()) {
      setIsAddingNew(false);
      setOpenItemId(null);
      setEditingItemId(null);
    }
    // Don't submit on blur - let onSubmitEditing handle it
  }, [newItemText]);

  const handleQuantityChange = useCallback((id: string, delta: number) => {
    const item = items.find(i => i.id === id);
    if (item) {
      const newQuantity = Math.max(1, (item.quantity || 1) + delta);
      updateItem(id, { quantity: newQuantity });
    }
  }, [items, updateItem]);

  const handleOpenChange = useCallback((id: string | null, isOpen: boolean) => {
    if (id === null) {
      // Close all items
      setOpenItemId(null);
    } else {
      setOpenItemId(isOpen ? id : null);
    }
  }, []);

  const handleClearAll = useCallback(() => {
    if (items.length === 0) return;

    Alert.alert(
      'Clear Shopping List',
      'Remove all items from the shopping list?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            // Clear all items
            items.forEach(item => deleteItem(item.id));
          }
        }
      ]
    );
  }, [items, deleteItem]);

  const handleMovePurchased = useCallback(() => {
    const checkedItems = items.filter(item => item.checked);
    if (checkedItems.length === 0) {
      Alert.alert('No items selected', 'Please check items you want to move to inventory');
      return;
    }

    setShowLocationModal(true);
  }, [items]);

  const handleLocationConfirm = useCallback(async (assignments: LocationAssignments) => {
    const movedCount = await moveToInventory(assignments);
    setShowLocationModal(false);
    if (movedCount) {
      Alert.alert('Success', `Moved ${movedCount} items to inventory`);
    }
  }, [moveToInventory]);

  const handleLocationCancel = useCallback(() => {
    setShowLocationModal(false);
  }, []);

  const handleClearCompleted = useCallback(() => {
    const completed = items.filter(i => i.checked);
    if (completed.length === 0) {
      Alert.alert('No completed items', 'There are no completed items to clear');
      return;
    }

    Alert.alert(
      'Clear Completed',
      `Remove ${completed.length} completed items?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: clearCompleted,
        },
      ]
    );
  }, [items, clearCompleted]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>Shopping List</Text>
            {FEATURE_FLAGS.SHOW_SYNC_STATUS && isSyncing && (
              <Text style={styles.syncStatus}>🔄 Syncing...</Text>
            )}
            {FEATURE_FLAGS.SHOW_SYNC_STATUS && syncError && (
              <Text style={styles.syncError}>⚠️ Sync error</Text>
            )}
          </View>
          <View style={styles.headerActions}>
            {completedItems > 0 && (
              <Pressable style={styles.moveButton} onPress={handleMovePurchased}>
                <Text style={styles.moveButtonText}>Move {completedItems} to Inventory</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.statsBar}>
          <Text style={styles.statsText}>
            {totalItems} items • {completedItems} completed
          </Text>
        </View>

        <View style={styles.filterTabs}>
          <View style={styles.filterTabsLeft}>
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
                To Buy
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
          {items.length > 0 && (
            <Pressable
              style={[styles.filterTab, styles.clearAllTab]}
              onPress={handleClearAll}
            >
              <Text style={[styles.filterTabText, styles.clearAllText]}>
                Clear
              </Text>
            </Pressable>
          )}
        </View>

        <Pressable
          style={styles.flex}
          onPress={() => {
            // If adding new item, submit or cancel it first
            if (isAddingNew) {
              if (newItemText.trim()) {
                handleAddSubmit();
              } else {
                setIsAddingNew(false);
                setOpenItemId(null);
                setEditingItemId(null);
              }
              return;
            }
            // If editing, submit the edit
            if (editingItemId) {
              setEditingItemId(null);
              return;
            }
            // Close any open swipes
            if (openItemId) {
              setOpenItemId(null);
            }
          }}
        >
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
          {filteredItems.map((item) => (
            <InlineItem
              key={item.id}
              item={item}
              onToggle={toggleItem}
              onUpdate={(id, updates) => updateItem(id, updates)}
              onDelete={deleteItem}
              onQuantityChange={handleQuantityChange}
              isOpen={openItemId === item.id}
              hasAnyOpen={openItemId !== null}
              onOpenChange={handleOpenChange}
              isEditing={editingItemId === item.id}
              onEditingChange={setEditingItemId}
              isAddingNew={isAddingNew}
            />
          ))}

          {/* Tap-to-add area */}
          <Pressable style={[styles.addArea, isAddingNew && { paddingTop: 0 }]} onPress={handleAddArea}>
            {isAddingNew ? (
              <View style={styles.itemRow}>
                <View style={{ width: 40, flexShrink: 0 }}>
                  <View style={[styles.checkbox, { marginRight: 0 }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextInput
                    ref={addInputRef}
                    style={styles.inlineInput}
                    value={newItemText}
                    onChangeText={setNewItemText}
                    onSubmitEditing={handleAddSubmit}
                    onBlur={handleAddBlur}
                    placeholder="Add item..."
                    placeholderTextColor={theme.colors.textLight}
                    autoCapitalize="none"
                    returnKeyType="done"
                    blurOnSubmit={false}
                  />
                </View>
              </View>
            ) : (
              <Text style={styles.addPrompt}>Tap to add item...</Text>
            )}
          </Pressable>
          </ScrollView>
        </Pressable>
      </KeyboardAvoidingView>

      {/* Floating Action Button */}
      {!isAddingNew && (
        <Pressable
          style={styles.fab}
          onPress={handleAddArea}
        >
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      )}

      <LocationSelectorModal
        visible={showLocationModal}
        items={items.filter(item => item.checked)}
        onConfirm={handleLocationConfirm}
        onCancel={handleLocationCancel}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  moveButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
  },
  moveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  statsBar: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  statsText: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterTabsLeft: {
    flexDirection: 'row',
    flex: 1,
    gap: theme.spacing.xs,
  },
  filterTab: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface,
  },
  filterTabActive: {
    backgroundColor: theme.colors.primary,
  },
  clearAllTab: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  filterTabText: {
    ...theme.typography.button,
    fontSize: 14,
    color: theme.colors.textLight,
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  clearAllText: {
    color: theme.colors.error,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 200, // Increased padding to ensure input is visible above keyboard
  },
  swipeContainer: {
    position: 'relative',
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: theme.spacing.md,
    backgroundColor: theme.colors.background,
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
    zIndex: -1,
  },
  deleteText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    minHeight: 52,
    flex: 1,
  },
  itemRowPressed: {
    backgroundColor: theme.colors.surface,
    opacity: 0.9,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border,
    marginRight: theme.spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0, // Prevent checkbox from shrinking
  },
  checkboxChecked: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  itemText: {
    ...theme.typography.body,
    color: theme.colors.text,
    flex: 1,
    textAlignVertical: 'center',
    includeFontPadding: false,
    marginRight: theme.spacing.sm, // Add space before quantity controls
  },
  itemTextChecked: {
    textDecorationLine: 'line-through',
    color: theme.colors.textLight,
  },
  inlineInput: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.body.fontWeight,
    color: theme.colors.text,
    padding: 0,
    margin: 0,
    height: '100%',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  quantityButton: {
    padding: theme.spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    fontSize: 20,
    color: theme.colors.text,
    fontWeight: 'bold',
  },
  quantityText: {
    ...theme.typography.body,
    color: theme.colors.text,
    minWidth: 24,
    textAlign: 'center',
  },
  addArea: {
    minHeight: 56, // Match item row height
    paddingTop: theme.spacing.sm,
  },
  addPrompt: {
    paddingHorizontal: theme.spacing.md + 24 + theme.spacing.md,
    ...theme.typography.body,
    color: theme.colors.textLight,
    fontStyle: 'italic',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '300',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  syncStatus: {
    fontSize: 12,
    color: theme.colors.primary,
  },
  syncError: {
    fontSize: 12,
    color: theme.colors.error,
  },
});