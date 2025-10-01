import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  SectionList,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../../core/constants/theme';
import { parseShoppingText, addToHistory } from '../utils/shoppingTextParser';
import { useShoppingListStore } from '../../../stores/shoppingListStore';

type FilterStatus = 'all' | 'pending' | 'done';

interface InlineItemProps {
  item: any;
  onToggle: (id: string) => void;
  onUpdate: (id: string, updates: any) => void;
  onDelete: (id: string) => void;
}

const InlineItem: React.FC<InlineItemProps> = React.memo(({ item, onToggle, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const handlePress = useCallback(() => {
    setEditText(`${item.name}${item.quantity ? ` ${item.quantity} ${item.unit || ''}` : ''}`);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [item]);

  const handleSubmit = useCallback(() => {
    if (!editText.trim()) {
      onDelete(item.id);
    } else {
      try {
        const parsed = parseShoppingText(editText);
        onUpdate(item.id, parsed);
        addToHistory(parsed.name);
      } catch (e) {
        // Fall back to simple text update
        onUpdate(item.id, { name: editText.trim() });
      }
    }
    setIsEditing(false);
  }, [editText, item.id, onUpdate, onDelete]);

  const handleBlur = useCallback(() => {
    handleSubmit();
  }, [handleSubmit]);

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
    <Pressable style={styles.itemRow} onPress={handlePress}>
      <Pressable
        style={[styles.checkbox, item.checked && styles.checkboxChecked]}
        onPress={() => onToggle(item.id)}
      >
        {item.checked && <Text style={styles.checkmark}>✓</Text>}
      </Pressable>
      <Text style={[styles.itemText, item.checked && styles.itemTextChecked]}>
        {item.name}
        {item.quantity ? (
          <Text style={styles.quantityText}>
            {' '}
            {item.quantity} {item.unit || ''}
          </Text>
        ) : null}
      </Text>
    </Pressable>
  );
});

export const InlineShoppingListScreen: React.FC = () => {
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

  // Group by category
  const sections = useMemo(() => {
    const grouped = filteredItems.reduce((acc: any, item) => {
      const category = item.category || 'Other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    }, {});

    return Object.entries(grouped).map(([title, data]) => ({
      title,
      data: data as any[],
      count: (data as any[]).length,
    }));
  }, [filteredItems]);

  // Stats
  const totalItems = items.length;
  const completedItems = items.filter(i => i.checked).length;

  const handleAddArea = useCallback(() => {
    setIsAddingNew(true);
    setTimeout(() => addInputRef.current?.focus(), 100);
  }, []);

  const handleAddSubmit = useCallback(() => {
    if (newItemText.trim()) {
      try {
        const parsed = parseShoppingText(newItemText);
        addItem({
          name: parsed.name,
          quantity: parsed.quantity,
          unit: parsed.unit,
          category: parsed.category,
          checked: false,
        });
        addToHistory(parsed.name);
        setNewItemText('');
        // Keep input focused for rapid entry
        addInputRef.current?.focus();
      } catch (e) {
        // Fall back to simple add
        addItem({
          name: newItemText.trim(),
          quantity: 1,
          unit: null,
          category: 'Other',
          checked: false,
        });
        setNewItemText('');
        addInputRef.current?.focus();
      }
    } else {
      setIsAddingNew(false);
    }
  }, [newItemText, addItem]);

  const handleAddBlur = useCallback(() => {
    if (!newItemText.trim()) {
      setIsAddingNew(false);
    } else {
      handleAddSubmit();
    }
  }, [newItemText, handleAddSubmit]);

  const handleMovePurchased = useCallback(() => {
    const checkedItems = items.filter(item => item.checked);
    if (checkedItems.length === 0) {
      Alert.alert('No items selected', 'Please check items you want to move to inventory');
      return;
    }

    Alert.alert(
      'Move to Inventory',
      `Move ${checkedItems.length} checked items to inventory?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move',
          onPress: () => {
            moveToInventory();
            Alert.alert('Success', `Moved ${checkedItems.length} items to inventory`);
          },
        },
      ]
    );
  }, [items, moveToInventory]);

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

  const renderSection = ({ section }: any) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionCount}>{section.count}</Text>
      </View>
      {section.data.map((item: any) => (
        <InlineItem
          key={item.id}
          item={item}
          onToggle={toggleItem}
          onUpdate={(id, updates) => updateItem(id, updates)}
          onDelete={deleteItem}
        />
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Shopping List</Text>
          <View style={styles.headerActions}>
            <Pressable style={styles.headerButton} onPress={handleMovePurchased}>
              <Text style={styles.headerButtonText}>📦</Text>
            </Pressable>
            <Pressable style={styles.headerButton} onPress={handleClearCompleted}>
              <Text style={styles.headerButtonText}>🗑️</Text>
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

        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {sections.map((section, index) => (
            <View key={index}>{renderSection({ section })}</View>
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
                  placeholder="Add item... (e.g., 'milk 2 gal')"
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
      </KeyboardAvoidingView>
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
  headerButton: {
    padding: theme.spacing.sm,
  },
  headerButtonText: {
    fontSize: 20,
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
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.surface,
  },
  filterTabActive: {
    backgroundColor: theme.colors.primary,
  },
  filterTabText: {
    ...theme.typography.bodyBold,
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
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
  },
  sectionTitle: {
    ...theme.typography.bodyBold,
    color: theme.colors.text,
  },
  sectionCount: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minHeight: 48,
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
  quantityText: {
    color: theme.colors.textLight,
    fontSize: 14,
  },
  inlineInput: {
    flex: 1,
    ...theme.typography.body,
    color: theme.colors.text,
    padding: 0,
    paddingVertical: 4,
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
});