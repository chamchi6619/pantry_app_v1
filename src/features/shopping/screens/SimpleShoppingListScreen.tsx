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
import { useShoppingListStore } from '../../../stores/shoppingListStore';
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

    // If another item was open, just close it (don't edit)
    if (hasAnyOpen) {
      onOpenChange(null, false);
      return;
    }

    // If item is checked, uncheck it instead of editing
    if (item.checked) {
      onToggle(item.id);
      return;
    }

    // Item is unchecked and no swipes open, go into edit mode
    onEditingChange(item.id);
  }, [item.id, item.checked, isOpen, hasAnyOpen, isAddingNew, onOpenChange, onToggle, onEditingChange]);

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
    // Don't submit on blur - let onSubmitEditing handle it
    // This prevents double-submission with Chinese IME
    if (!editText.trim()) {
      onEditingChange(null);
    }
  }, [editText, onEditingChange]);

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
      <View style={styles.itemRow}>
        <View style={styles.checkbox} />
        <TextInput
          ref={inputRef}
          style={styles.inlineInput}
          value={editText}
          onChangeText={setEditText}
          onSubmitEditing={handleSubmit}
          onBlur={handleBlur}
          autoCapitalize="none"
          returnKeyType="done"
        />
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
        <Pressable style={styles.itemRow} onPress={handlePress}>
          <Pressable
            style={[styles.checkbox, item.checked && styles.checkboxChecked]}
            onPress={() => onToggle(item.id)}
          >
            {item.checked && <Text style={styles.checkmark}>✓</Text>}
          </Pressable>
          <Text style={[styles.itemText, item.checked && styles.itemTextChecked]}>
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
  const items = useShoppingListStore((state) => state.items);
  const addItem = useShoppingListStore((state) => state.addItem);
  const updateItem = useShoppingListStore((state) => state.updateItem);
  const deleteItem = useShoppingListStore((state) => state.deleteItem);
  const toggleItem = useShoppingListStore((state) => state.toggleItem);
  const clearCompleted = useShoppingListStore((state) => state.clearCompleted);
  const moveToInventory = useShoppingListStore((state) => state.moveToInventory);

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

  const handleAddSubmit = useCallback(() => {
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

      addItem({
        name: trimmedText,
        quantity: 1,
        unit: 'pieces',
        category: 'Other',
        checked: false,
      });
      setNewItemText('');
      // Keep input focused for rapid entry
      addInputRef.current?.focus();
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

  const handleMovePurchased = useCallback(() => {
    const checkedItems = items.filter(item => item.checked);
    if (checkedItems.length === 0) {
      Alert.alert('No items selected', 'Please check items you want to move to inventory');
      return;
    }

    setShowLocationModal(true);
  }, [items]);

  const handleLocationConfirm = useCallback((assignments: LocationAssignments) => {
    const movedCount = moveToInventory(assignments);
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
          <Text style={styles.title}>Shopping List</Text>
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
          <Pressable style={styles.addArea} onPress={handleAddArea}>
            {isAddingNew ? (
              <View style={styles.itemRow}>
                <View style={styles.checkbox} />
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
                  returnKeyType="next"
                />
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
  filterTabText: {
    ...theme.typography.button,
    fontSize: 14,
    color: theme.colors.textLight,
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
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
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border,
    marginRight: theme.spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  itemTextChecked: {
    textDecorationLine: 'line-through',
    color: theme.colors.textLight,
  },
  inlineInput: {
    flex: 1,
    ...theme.typography.body,
    color: theme.colors.text,
    padding: 0,
    paddingVertical: 4,
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
    minHeight: 80,
    paddingTop: theme.spacing.md,
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
});