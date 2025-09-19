import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../../core/constants/theme';
import { Button } from '../../../core/components/ui/Button';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useInventoryStore } from '../../../stores/inventoryStore';
import { useShoppingListStore } from '../../../stores/shoppingListStore';

interface ReceiptItem {
  id: string;
  rawText: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
  category?: string;
  confidence: number;
  needsReview: boolean;
  location?: string;
}

interface ReceiptData {
  id: string;
  storeName: string;
  date: string;
  total: number;
  currency: string;
  items: ReceiptItem[];
}

const locations = ['Fridge', 'Freezer', 'Pantry'];
const units = ['pcs', 'lb', 'oz', 'kg', 'g', 'gal', 'qt', 'L', 'ml', 'box', 'bag', 'head'];

export const ReceiptFixQueueScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { receiptData, imageUri, ocrConfidence } = (route.params as any) || {};

  const [items, setItems] = useState<ReceiptItem[]>(receiptData?.items || []);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Use stores
  const { addItem: addToInventory } = useInventoryStore();
  const { addItem: addToShoppingList } = useShoppingListStore();

  const handleEditItem = (id: string, field: keyof ReceiptItem, value: any) => {
    setItems(prev =>
      prev.map(item =>
        item.id === id
          ? { ...item, [field]: value, needsReview: false }
          : item
      )
    );
  };

  const handleDeleteItem = (id: string) => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to remove this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => setItems(prev => prev.filter(item => item.id !== id)),
        },
      ]
    );
  };

  const handleSaveToInventory = () => {
    const itemsWithLocation = items.filter(item => item.location);
    const itemsWithoutLocation = items.filter(item => !item.location);

    // Add items with location to inventory
    itemsWithLocation.forEach(item => {
      addToInventory({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category || 'Other',
        location: item.location as 'Fridge' | 'Freezer' | 'Pantry',
        notes: `From receipt: ${receiptData?.storeName || 'Unknown Store'}`,
      });
    });

    // Add items without location to shopping list
    itemsWithoutLocation.forEach(item => {
      addToShoppingList({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category || 'Other',
        notes: `From receipt: ${receiptData?.storeName || 'Unknown Store'}`,
      });
    });

    Alert.alert(
      'Success',
      `Added ${itemsWithLocation.length} items to inventory and ${itemsWithoutLocation.length} items to shopping list.`,
      [{ text: 'OK', onPress: () => navigation.navigate('Inventory' as never) }]
    );
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.8) {
      return { color: theme.colors.success, text: 'High' };
    } else if (confidence >= 0.5) {
      return { color: '#F59E0B', text: 'Medium' };
    } else {
      return { color: theme.colors.error, text: 'Low' };
    }
  };

  const sortedItems = [...items].sort((a, b) => {
    // Priority order: missing name, missing unit, missing location, confidence
    if (!a.name && b.name) return -1;
    if (a.name && !b.name) return 1;
    if (!a.unit && b.unit) return -1;
    if (a.unit && !b.unit) return 1;
    if (!a.location && b.location) return -1;
    if (a.location && !b.location) return 1;
    return a.confidence - b.confidence;
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Review Receipt</Text>
        <Pressable style={styles.closeButton} onPress={() => navigation.goBack()}>
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerIcon}>📍</Text>
        <View style={styles.bannerText}>
          <Text style={styles.bannerTitle}>Location determines destination</Text>
          <Text style={styles.bannerSubtext}>
            With location → Inventory | No location → Shopping List
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.summarySection}>
          <Text style={styles.storeName}>{receiptData?.storeName}</Text>
          <Text style={styles.itemCount}>{items.length} items detected</Text>
          {ocrConfidence && (
            <View style={styles.ocrConfidenceBadge}>
              <Text style={styles.ocrConfidenceText}>
                OCR Confidence: {Math.round(ocrConfidence * 100)}%
              </Text>
            </View>
          )}
        </View>

        {sortedItems.map((item) => (
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.rawText}>{item.rawText}</Text>
              <View style={styles.headerRight}>
                <View
                  style={[
                    styles.confidenceBadge,
                    { backgroundColor: `${getConfidenceBadge(item.confidence).color}20` },
                  ]}
                >
                  <Text
                    style={[
                      styles.confidenceText,
                      { color: getConfidenceBadge(item.confidence).color },
                    ]}
                  >
                    {getConfidenceBadge(item.confidence).text}
                  </Text>
                </View>
                <Pressable onPress={() => handleDeleteItem(item.id)}>
                  <Text style={styles.deleteIcon}>🗑️</Text>
                </Pressable>
              </View>
            </View>

            {item.needsReview && (
              <View style={styles.reviewBadge}>
                <Text style={styles.reviewText}>⚠️ Needs review</Text>
              </View>
            )}

            <View style={styles.itemFields}>
              {/* Name field */}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Name:</Text>
                {editingId === `${item.id}-name` ? (
                  <TextInput
                    style={styles.fieldInput}
                    value={item.name}
                    onChangeText={(text) => handleEditItem(item.id, 'name', text)}
                    onBlur={() => setEditingId(null)}
                    autoFocus
                  />
                ) : (
                  <Pressable
                    style={styles.fieldValue}
                    onPress={() => setEditingId(`${item.id}-name`)}
                  >
                    <Text style={styles.fieldText}>{item.name || '—'}</Text>
                  </Pressable>
                )}
              </View>

              {/* Quantity and Unit */}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Qty:</Text>
                <View style={styles.quantityRow}>
                  <Pressable
                    style={styles.quantityButton}
                    onPress={() =>
                      handleEditItem(item.id, 'quantity', Math.max(0.5, item.quantity - 0.5))
                    }
                  >
                    <Text style={styles.quantityButtonText}>−</Text>
                  </Pressable>
                  <Text style={styles.quantityValue}>{item.quantity}</Text>
                  <Pressable
                    style={styles.quantityButton}
                    onPress={() => handleEditItem(item.id, 'quantity', item.quantity + 0.5)}
                  >
                    <Text style={styles.quantityButtonText}>+</Text>
                  </Pressable>
                  <Pressable
                    style={styles.unitPicker}
                    onPress={() => {
                      const currentIndex = units.indexOf(item.unit);
                      const nextIndex = (currentIndex + 1) % units.length;
                      handleEditItem(item.id, 'unit', units[nextIndex]);
                    }}
                  >
                    <Text style={styles.unitText}>{item.unit}</Text>
                    <Text style={styles.unitArrow}>▼</Text>
                  </Pressable>
                </View>
              </View>

              {/* Category */}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Category:</Text>
                <Pressable
                  style={styles.fieldValue}
                  onPress={() => {
                    const categories = ['Produce', 'Dairy', 'Meat', 'Bakery', 'Pantry', 'Frozen', 'Beverages', 'Snacks', 'Other'];
                    const currentIndex = categories.indexOf(item.category || 'Other');
                    const nextIndex = (currentIndex + 1) % categories.length;
                    handleEditItem(item.id, 'category', categories[nextIndex]);
                  }}
                >
                  <Text style={styles.fieldText}>{item.category || 'Other'} ▼</Text>
                </Pressable>
              </View>

              {/* Price */}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Price:</Text>
                {editingId === `${item.id}-price` ? (
                  <TextInput
                    style={styles.fieldInput}
                    value={item.price.toString()}
                    onChangeText={(text) => {
                      const price = parseFloat(text) || 0;
                      handleEditItem(item.id, 'price', price);
                    }}
                    onBlur={() => setEditingId(null)}
                    keyboardType="numeric"
                    autoFocus
                  />
                ) : (
                  <Pressable
                    style={styles.fieldValue}
                    onPress={() => setEditingId(`${item.id}-price`)}
                  >
                    <Text style={styles.fieldText}>${item.price.toFixed(2)}</Text>
                  </Pressable>
                )}
              </View>

              {/* Location */}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Location:</Text>
                <View style={styles.locationButtons}>
                  {locations.map((loc) => (
                    <Pressable
                      key={loc}
                      style={[
                        styles.locationButton,
                        item.location === loc && styles.locationButtonActive,
                      ]}
                      onPress={() => handleEditItem(item.id, 'location', loc)}
                    >
                      <Text
                        style={[
                          styles.locationText,
                          item.location === loc && styles.locationTextActive,
                        ]}
                      >
                        {loc}
                      </Text>
                    </Pressable>
                  ))}
                  {item.location && (
                    <Pressable
                      style={styles.clearLocationButton}
                      onPress={() => handleEditItem(item.id, 'location', undefined)}
                    >
                      <Text style={styles.clearLocationText}>Clear</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.destinationBadge}>
              <Text style={styles.destinationText}>
                → {item.location ? 'Inventory' : 'Shopping List'}
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>To Inventory:</Text>
            <Text style={styles.summaryValue}>
              {items.filter((i) => i.location).length} items
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>To Shopping List:</Text>
            <Text style={styles.summaryValue}>
              {items.filter((i) => !i.location).length} items
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total:</Text>
            <Text style={styles.totalValue}>
              ${items.reduce((sum, item) => sum + item.price, 0).toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.actionSection}>
          <Button variant="primary" onPress={handleSaveToInventory}>
            <Text style={styles.saveButtonText}>Save Items</Text>
          </Button>
          <Button variant="secondary" onPress={() => navigation.goBack()}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Button>
        </View>
      </ScrollView>
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
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.text,
  },
  closeButton: {
    padding: theme.spacing.sm,
  },
  closeIcon: {
    fontSize: 24,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  bannerIcon: {
    fontSize: 24,
    marginRight: theme.spacing.md,
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 2,
  },
  bannerSubtext: {
    fontSize: 12,
    color: '#3B82F6',
  },
  scrollView: {
    flex: 1,
  },
  summarySection: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  storeName: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  itemCount: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  ocrConfidenceBadge: {
    marginTop: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    backgroundColor: theme.colors.primary + '20',
    borderRadius: theme.borderRadius.sm,
    alignSelf: 'flex-start',
  },
  ocrConfidenceText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  itemCard: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  rawText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  confidenceBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: '600',
  },
  deleteIcon: {
    fontSize: 20,
  },
  reviewBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.sm,
    alignSelf: 'flex-start',
  },
  reviewText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  itemFields: {
    gap: theme.spacing.sm,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  fieldLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    width: 70,
  },
  fieldValue: {
    flex: 1,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  fieldText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  fieldInput: {
    flex: 1,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: '#fff',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    fontSize: 14,
    color: theme.colors.text,
  },
  quantityRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    fontSize: 18,
    color: theme.colors.text,
  },
  quantityValue: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    minWidth: 40,
    textAlign: 'center',
  },
  unitPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  unitText: {
    fontSize: 14,
    color: theme.colors.text,
    marginRight: theme.spacing.xs,
  },
  unitArrow: {
    fontSize: 10,
    color: theme.colors.textSecondary,
  },
  locationButtons: {
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  locationButton: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  locationButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  locationText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  locationTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  clearLocationButton: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  clearLocationText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  destinationBadge: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  destinationText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  summary: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  summaryLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
  },
  totalRow: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  actionSection: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textInverse,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
});