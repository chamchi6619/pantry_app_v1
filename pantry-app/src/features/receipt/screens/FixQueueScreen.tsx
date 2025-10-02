import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { FixQueueItem } from '../components/FixQueueItem';
import { receiptService, ReceiptItem } from '../../../services/receiptService';
import { useAuth } from '../../../hooks/useAuth';
import { useHousehold } from '../../../hooks/useHousehold';
import { useInventorySupabaseStore } from '../../../stores/inventorySupabaseStore';
import { useReceiptStore } from '../../../stores/receiptStore';

// Smart location defaults based on category
function getSmartLocation(category?: string): 'fridge' | 'freezer' | 'pantry' {
  if (!category) return 'pantry';

  const cat = category.toLowerCase();

  // Fridge items
  if (cat.includes('dairy') || cat.includes('milk') || cat.includes('cheese') ||
      cat.includes('yogurt') || cat.includes('butter') || cat.includes('eggs') ||
      cat.includes('deli') || cat.includes('meat') || cat.includes('seafood') ||
      cat.includes('produce')) {
    return 'fridge';
  }

  // Freezer items
  if (cat.includes('frozen') || cat.includes('ice cream')) {
    return 'freezer';
  }

  // Everything else goes to pantry
  return 'pantry';
}

export function FixQueueScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const { currentHousehold } = useHousehold();
  const inventoryStore = useInventorySupabaseStore();
  const addReceiptToHistory = useReceiptStore((state) => state.addReceipt);

  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [editedItems, setEditedItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);
  const [addToInventory, setAddToInventory] = useState(true); // Default to adding to inventory
  const [defaultLocation, setDefaultLocation] = useState<'fridge' | 'freezer' | 'pantry'>('pantry'); // Default location for items

  useEffect(() => {
    loadFixQueueItems();
  }, []);

  const loadFixQueueItems = async () => {
    try {
      setLoading(true);

      // If items were passed from scanner, use those
      if (route.params?.items) {
        const passedItems = route.params.items as ReceiptItem[];
        const receipt = route.params.receipt;

        console.log(`📋 Loading ${passedItems.length} items (${receipt?.parse_method})`);

        // Initialize each item with smart default location
        const itemsWithLocation = passedItems.map(item => ({
          ...item,
          selectedLocation: item.selectedLocation || getSmartLocation(item.categories)
        }));

        setItems(itemsWithLocation);
        setEditedItems([...itemsWithLocation]);
        setReceipt(receipt);
      } else {
        // Otherwise load from database
        if (!currentHousehold?.id) return;

        const queueItems = await receiptService.getFixQueueItems(currentHousehold.id);

        // Initialize each item with smart default location
        const itemsWithLocation = queueItems.map(item => ({
          ...item,
          selectedLocation: item.selectedLocation || getSmartLocation(item.categories)
        }));

        setItems(itemsWithLocation);
        setEditedItems([...itemsWithLocation]);
      }
    } catch (error) {
      console.error('Failed to load fix queue:', error);
      Alert.alert('Error', 'Failed to load items for review');
    } finally {
      setLoading(false);
    }
  };

  const handleItemUpdate = (index: number, field: keyof ReceiptItem, value: any) => {
    const updated = [...editedItems];
    updated[index] = { ...updated[index], [field]: value };
    setEditedItems(updated);
  };

  const handleItemDelete = (index: number) => {
    const updated = editedItems.filter((_, i) => i !== index);
    setEditedItems(updated);
  };

  const handleConfirmAll = async () => {
    if (editedItems.length === 0) {
      Alert.alert('No Items', 'No items to save');
      return;
    }

    try {
      setSaving(true);

      if (!currentHousehold?.id) {
        Alert.alert('Error', 'No household selected');
        return;
      }

      // Save corrections and move to purchase history
      await receiptService.confirmFixQueueItems(editedItems, currentHousehold.id);

      // Add receipt to history (for profile screen)
      if (receipt) {
        addReceiptToHistory({
          date: receipt.receipt_date,
          storeName: receipt.store_name,
          totalAmount: (receipt.total_amount_cents || receipt.subtotal_cents) / 100,
          items: editedItems.map(item => ({
            name: item.parsed_name,
            quantity: item.quantity,
            unit: item.unit,
            price: item.price_cents / 100,
          })),
        });
      }

      // Add to inventory if enabled
      let addedToInventory = 0;
      if (addToInventory) {
        // Initialize inventory store if needed
        if (!inventoryStore.householdId) {
          await inventoryStore.initialize(currentHousehold.id);
        }

        // Add high confidence items to inventory with their individual locations
        for (const item of editedItems) {
          if (item.confidence >= 0.8) {
            try {
              await inventoryStore.addItem({
                name: item.parsed_name,
                quantity: item.quantity,
                unit: item.unit,
                category: item.categories || 'Other',
                location: item.selectedLocation || getSmartLocation(item.categories),
                notes: `Added from receipt on ${new Date().toLocaleDateString()}`,
              });
              addedToInventory++;
            } catch (err) {
              console.error('Failed to add item to inventory:', err);
            }
          }
        }
      }

      // Calculate stats for success message
      const totalItems = editedItems.length;
      const totalSpent = editedItems.reduce((sum, item) => sum + (item.price_cents * (item.quantity || 1)), 0);

      const message = addedToInventory > 0
        ? `${totalItems} items saved to purchase history.\n${addedToInventory} items added to inventory.\nTotal: $${(totalSpent / 100).toFixed(2)}`
        : `${totalItems} items saved to purchase history.\nTotal: $${(totalSpent / 100).toFixed(2)}`;

      // Clear params first
      navigation.setParams({ items: undefined, receipt: undefined });

      Alert.alert(
        'Success!',
        message,
        [
          {
            text: addedToInventory > 0 ? 'View Inventory' : 'View History',
            onPress: () => {
              // Go to Scanner first to reset the stack, then to Inventory
              navigation.navigate('Scanner');
              setTimeout(() => {
                navigation.navigate('Inventory');
              }, 100);
            },
          },
          {
            text: 'Scan Another',
            onPress: () => {
              navigation.navigate('Scanner');
            },
          },
        ]
      );
    } catch (error) {
      console.error('Failed to save items:', error);
      Alert.alert('Error', 'Failed to save items. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleExit = () => {
    Alert.alert(
      'Exit Review',
      'What would you like to do with these items?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Keep in Queue',
          onPress: () => {
            // Items stay in fix queue for later
            navigation.setParams({ items: undefined, receipt: undefined });
            navigation.navigate('Scanner');
          },
        },
        {
          text: 'Discard All',
          style: 'destructive',
          onPress: () => {
            // Clear everything and go to scanner
            navigation.setParams({ items: undefined, receipt: undefined });
            navigation.navigate('Scanner');
          },
        },
      ]
    );
  };

  const renderHeader = () => {
    // FIX: price_cents is already the total price paid for the item, don't multiply by quantity
    const totalAmount = editedItems.reduce((sum, item) => sum + item.price_cents, 0);

    return (
      <View style={styles.header}>
        {receipt && (
          <View style={styles.receiptInfo}>
            <Text style={styles.storeName}>{receipt.store_name}</Text>
            <Text style={styles.receiptDate}>
              {new Date(receipt.receipt_date).toLocaleDateString()}
            </Text>
            <Text style={styles.receiptTotal}>
              Total: ${(totalAmount / 100).toFixed(2)}
            </Text>
            <Text style={styles.itemCount}>
              {editedItems.length} items
            </Text>
            {receipt.parse_method === 'gemini' && (
              <View style={styles.aiUsedBadge}>
                <Ionicons name="sparkles" size={14} color="#9333EA" />
                <Text style={styles.aiUsedText}>AI Parsed</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.instructions}>
          <Ionicons name="information-circle" size={20} color="#3B82F6" />
          <Text style={styles.instructionText}>
            Review and edit items below. Each item can be assigned to a storage location.
          </Text>
        </View>
      </View>
    );
  };

  const renderFooter = () => null; // Remove footer from FlatList

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading items...</Text>
      </View>
    );
  }

  if (editedItems.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Ionicons name="checkmark-circle" size={64} color="#10B981" />
          <Text style={styles.emptyTitle}>All Caught Up!</Text>
          <Text style={styles.emptyText}>
            No items need review right now.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with close button */}
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Review Items</Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleExit}
        >
          <Ionicons name="close" size={28} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <View style={styles.contentContainer}>
        <FlatList
          data={editedItems}
          keyExtractor={(item, index) => item.id || `item-${index}`}
          ListHeaderComponent={renderHeader}
          renderItem={({ item, index }) => (
            <FixQueueItem
              item={item}
              onUpdate={(field, value) => handleItemUpdate(index, field, value)}
              onDelete={() => handleItemDelete(index)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={true}
          bounces={true}
        />

        {/* Fixed footer at bottom */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, styles.exitButton]}
            onPress={handleExit}
          >
            <Ionicons name="arrow-back" size={20} color="#6B7280" />
            <Text style={styles.exitButtonText}>Exit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.confirmButton, saving && styles.buttonDisabled]}
            onPress={handleConfirmAll}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.confirmButtonText}>Confirm All</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 8,
  },
  contentContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  header: {
    padding: 16,
  },
  receiptInfo: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  storeName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  receiptDate: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  receiptTotal: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 12,
  },
  itemCount: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  aiUsedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  aiUsedText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#9333EA',
    fontWeight: '500',
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  instructionText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#1E40AF',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginVertical: 12,
  },
  inventoryToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  inventoryToggleActive: {
    backgroundColor: '#D1FAE5',
  },
  inventoryToggleText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  inventoryToggleTextActive: {
    color: '#10B981',
  },
  locationSelector: {
    marginVertical: 12,
  },
  locationLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  locationButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    gap: 6,
  },
  locationButtonActive: {
    backgroundColor: '#3B82F6',
  },
  locationButtonText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  locationButtonTextActive: {
    color: '#fff',
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingBottom: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitButton: {
    backgroundColor: '#F3F4F6',
    marginRight: 8,
    flexDirection: 'row',
    gap: 6,
  },
  exitButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
  },
  confirmButton: {
    backgroundColor: '#10B981',
    marginLeft: 8,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});