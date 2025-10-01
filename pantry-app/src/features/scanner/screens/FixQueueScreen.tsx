import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Pressable,
  Switch,
} from 'react-native';
import { theme } from '../../../core/constants/theme';
import { Button } from '../../../core/components/ui/Button';

interface FixQueueItem {
  id: string;
  rawText: string;
  itemName: string;
  quantity: string;
  unit: string;
  price: string;
  categories: string[];
  attributes: string[];
}

const FixQueueCard: React.FC<{
  item: FixQueueItem;
  onUpdate: (id: string, field: string, value: any) => void;
  onSkip: (id: string) => void;
}> = ({ item, onUpdate, onSkip }) => {
  const [applyToSimilar, setApplyToSimilar] = useState(false);

  const handleCategoryToggle = (category: string) => {
    const newCategories = item.categories.includes(category)
      ? item.categories.filter(c => c !== category)
      : [...item.categories, category];
    onUpdate(item.id, 'categories', newCategories);
  };

  const handleAttributeToggle = (attribute: string) => {
    const newAttributes = item.attributes.includes(attribute)
      ? item.attributes.filter(a => a !== attribute)
      : [...item.attributes, attribute];
    onUpdate(item.id, 'attributes', newAttributes);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.rawText}>{item.rawText}</Text>

      {/* Item Name */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Item Name</Text>
        <TextInput
          style={styles.input}
          value={item.itemName}
          onChangeText={(text) => onUpdate(item.id, 'itemName', text)}
        />
      </View>

      {/* Quantity, Unit, Price */}
      <View style={styles.row}>
        <View style={[styles.field, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>Quantity</Text>
          <TextInput
            style={styles.input}
            value={item.quantity}
            onChangeText={(text) => onUpdate(item.id, 'quantity', text)}
            keyboardType="numeric"
          />
        </View>
        <View style={[styles.field, { flex: 1.5, marginHorizontal: theme.spacing.sm }]}>
          <Text style={styles.fieldLabel}>Unit</Text>
          <Pressable style={styles.selector}>
            <Text style={styles.selectorText}>{item.unit}</Text>
            <Text style={styles.chevron}>⌄</Text>
          </Pressable>
        </View>
        <View style={[styles.field, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>Price</Text>
          <TextInput
            style={styles.input}
            value={item.price}
            onChangeText={(text) => onUpdate(item.id, 'price', text)}
            keyboardType="numeric"
            placeholder="$0.00"
          />
        </View>
      </View>

      {/* Categories */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Categories</Text>
        <View style={styles.chips}>
          {['Dairy', 'Beverages', 'Perishable'].map((cat) => (
            <Pressable
              key={cat}
              style={[
                styles.chip,
                item.categories.includes(cat) && styles.chipActive,
              ]}
              onPress={() => handleCategoryToggle(cat)}
            >
              <Text
                style={[
                  styles.chipText,
                  item.categories.includes(cat) && styles.chipTextActive,
                ]}
              >
                {cat}
              </Text>
            </Pressable>
          ))}
          <Pressable style={styles.addChip}>
            <Text style={styles.addChipText}>+ Add</Text>
          </Pressable>
        </View>
      </View>

      {/* Attributes */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Attributes</Text>
        <View style={styles.chips}>
          {['1 gallon', '$4.99', 'Organic', 'Refrigerated'].map((attr) => (
            <Pressable
              key={attr}
              style={[
                styles.chip,
                item.attributes.includes(attr) && styles.chipActive,
              ]}
              onPress={() => handleAttributeToggle(attr)}
            >
              <Text
                style={[
                  styles.chipText,
                  item.attributes.includes(attr) && styles.chipTextActive,
                ]}
              >
                {attr}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable style={styles.skipButton} onPress={() => onSkip(item.id)}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
        <View style={styles.applySwitch}>
          <Switch
            value={applyToSimilar}
            onValueChange={setApplyToSimilar}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
          />
          <Text style={styles.applyText}>Apply to similar</Text>
        </View>
      </View>
    </View>
  );
};

export const FixQueueScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const [items, setItems] = useState<FixQueueItem[]>([
    {
      id: '1',
      rawText: 'org mlk 1gal $4.99',
      itemName: 'Organic Milk',
      quantity: '1',
      unit: 'lb',
      price: '$4.99',
      categories: ['Dairy'],
      attributes: ['1 gallon', '$4.99', 'Organic'],
    },
    {
      id: '2',
      rawText: 'brd wht whl 1lf $3.49',
      itemName: 'Whole Wheat Bread',
      quantity: '1',
      unit: 'lb',
      price: '$4.99',
      categories: [],
      attributes: [],
    },
  ]);

  const handleUpdate = (id: string, field: string, value: any) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const handleSkip = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleSkipAll = () => {
    // Skip all items
    setItems([]);
  };

  const handleProcessQueue = () => {
    // Process all items
    console.log('Processing queue:', items);
    if (navigation) {
      navigation.navigate('Inventory');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Fix Queue</Text>
        <Text style={styles.itemCount}>{items.length} items</Text>
      </View>

      <Text style={styles.subtitle}>Review and fix items that need attention</Text>

      {/* Queue Items */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {items.map((item) => (
          <FixQueueCard
            key={item.id}
            item={item}
            onUpdate={handleUpdate}
            onSkip={handleSkip}
          />
        ))}
      </ScrollView>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <Button variant="outline" onPress={handleSkipAll} style={styles.skipAllButton}>
          Skip All
        </Button>
        <Button variant="primary" onPress={handleProcessQueue} style={styles.processButton}>
          Process Queue
        </Button>
      </View>
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
    paddingTop: theme.spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
  },
  itemCount: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  rawText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
  },
  field: {
    marginBottom: theme.spacing.md,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  row: {
    flexDirection: 'row',
  },
  selector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.background,
  },
  selectorText: {
    fontSize: 16,
    color: theme.colors.text,
  },
  chevron: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  chip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipText: {
    fontSize: 13,
    color: theme.colors.text,
  },
  chipTextActive: {
    color: theme.colors.textInverse,
  },
  addChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  addChipText: {
    fontSize: 13,
    color: theme.colors.primary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  skipButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  skipText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  applySwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  applyText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  bottomActions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  skipAllButton: {
    flex: 1,
  },
  processButton: {
    flex: 2,
  },
});