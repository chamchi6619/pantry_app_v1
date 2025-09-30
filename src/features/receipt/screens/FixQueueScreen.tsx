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

export function FixQueueScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const { currentHousehold } = useHousehold();
  const inventoryStore = useInventorySupabaseStore();

  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [editedItems, setEditedItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);
  const [addToInventory, setAddToInventory] = useState(true); // Default to adding to inventory

  useEffect(() => {
    loadFixQueueItems();
  }, []);

  const loadFixQueueItems = async () => {
    try {
      setLoading(true);

      console.log('=== FIX QUEUE LOADING ===');
      console.log('Route params exist?', !!route.params);
      console.log('Route params:', JSON.stringify(route.params, null, 2));
      console.log('Items received:', route.params?.items);
      console.log('Items type:', typeof route.params?.items);
      console.log('Items is array?', Array.isArray(route.params?.items));
      console.log('Receipt received:', route.params?.receipt);

      // If items were passed from scanner, use those
      if (route.params?.items) {
        const passedItems = route.params.items as ReceiptItem[];
        console.log('✅ Using passed items:');
        console.log('  - Count:', passedItems.length);
        console.log('  - First item:', passedItems[0]);
        console.log('  - Details:', JSON.stringify(passedItems, null, 2));

        // Check if it used Gemini
        const receipt = route.params.receipt;
        if (receipt?.parse_method === 'gemini') {
          console.log('🤖 USED GEMINI AI for parsing');
        } else if (receipt?.parse_method === 'heuristics') {
          console.log('📝 Used heuristics only (no AI)');
        } else {
          console.log('⚠️ Parse method not specified:', receipt?.parse_method);
        }

        setItems(passedItems);
        setEditedItems([...passedItems]);
        setReceipt(receipt);
      } else {
        // Otherwise load from database
        if (!currentHousehold?.id) return;

        const queueItems = await receiptService.getFixQueueItems(currentHousehold.id);
        setItems(queueItems);
        setEditedItems([...queueItems]);
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

  const handleAddToInventory = (index: number) => {
    const item = editedItems[index];
    navigation.navigate('AddItem', {
      fromReceipt: true,
      defaultValues: {
        name: item.parsed_name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.categories,
      }
    });
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

      // Add to inventory if enabled
      let addedToInventory = 0;
      if (addToInventory) {
        // Initialize inventory store if needed
        if (!inventoryStore.householdId) {
          await inventoryStore.initialize(currentHousehold.id);
        }

        // Add high confidence items to inventory
        for (const item of editedItems) {
          if (item.confidence >= 0.8) {
            try {
              await inventoryStore.addItem({
                name: item.parsed_name,
                quantity: item.quantity,
                unit: item.unit,
                category: item.categories || 'Other',
                location: 'pantry', // Default location
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

      Alert.alert(
        'Success!',
        message,
        [
          {
            text: addedToInventory > 0 ? 'View Inventory' : 'View History',
            onPress: () => navigation.navigate('Inventory'),
          },
          {
            text: 'Done',
            onPress: () => navigation.navigate('Inventory'), // Go to Inventory tab
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

  const handleSkipAll = () => {
    Alert.alert(
      'Skip Review',
      'Items will remain in the fix queue for later review. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          onPress: () => navigation.navigate('Inventory'), // Go to Inventory tab
        },
      ]
    );
  };

  const renderHeader = () => {
    const highConfidenceCount = editedItems.filter(item => item.confidence >= 0.8).length;
    const lowConfidenceCount = editedItems.filter(item => item.confidence < 0.8).length;

    return (
      <View style={styles.header}>
        {receipt && (
          <View style={styles.receiptInfo}>
            <Text style={styles.storeName}>{receipt.store_name}</Text>
            <Text style={styles.receiptDate}>
              {new Date(receipt.receipt_date).toLocaleDateString()}
            </Text>
            <Text style={styles.receiptTotal}>
              Total: ${((receipt.total_amount_cents || 0) / 100).toFixed(2)}
            </Text>
            {receipt.parse_method === 'gemini' && (
              <View style={styles.aiUsedBadge}>
                <Ionicons name="sparkles" size={14} color="#9333EA" />
                <Text style={styles.aiUsedText}>AI Enhanced</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {editedItems.length} items • $
            {(editedItems.reduce((sum, item) => sum + (item.price_cents * (item.quantity || 1)), 0) / 100).toFixed(2)}
          </Text>
          {highConfidenceCount > 0 && (
            <Text style={styles.confidenceText}>
              ✅ {highConfidenceCount} high confidence
              {lowConfidenceCount > 0 && ` • ⚠️ ${lowConfidenceCount} need review`}
            </Text>
          )}
        </View>

        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.inventoryToggle, addToInventory && styles.inventoryToggleActive]}
            onPress={() => setAddToInventory(!addToInventory)}
          >
            <Ionicons
              name={addToInventory ? "checkbox" : "square-outline"}
              size={20}
              color={addToInventory ? "#10B981" : "#6B7280"}
            />
            <Text style={[
              styles.inventoryToggleText,
              addToInventory && styles.inventoryToggleTextActive
            ]}>
              Add to Inventory
            </Text>
          </TouchableOpacity>

          {highConfidenceCount === editedItems.length && (
            <View style={styles.autoAcceptBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.autoAcceptText}>All items high confidence!</Text>
            </View>
          )}
        </View>

        <View style={styles.instructions}>
          <Ionicons name="information-circle" size={20} color="#3B82F6" />
          <Text style={styles.instructionText}>
            Review items below. High confidence items are pre-approved.
          </Text>
        </View>
      </View>
    );
  };

  const renderFooter = () => null; // Remove footer from FlatList

  if (loading) {
    console.log('=== FIX QUEUE LOADING STATE ===');
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading items...</Text>
      </View>
    );
  }

  console.log('=== FIX QUEUE RENDER CHECK ===');
  console.log('editedItems length:', editedItems.length);
  console.log('editedItems:', JSON.stringify(editedItems, null, 2));
  console.log('Total amount:', (editedItems.reduce((sum, item) => sum + (item.price_cents * (item.quantity || 1)), 0) / 100).toFixed(2));

  if (editedItems.length === 0) {
    console.log('=== SHOWING EMPTY STATE ===');
    console.log('Items array:', items);
    console.log('Edited items array:', editedItems);
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
              onAddToInventory={() => handleAddToInventory(index)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={true}
          bounces={true}
        />

        {/* Fixed footer at bottom */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, styles.skipButton]}
            onPress={handleSkipAll}
          >
            <Text style={styles.skipButtonText}>Skip for Now</Text>
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
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginTop: 8,
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
  summary: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  summaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  confidenceText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
    paddingHorizontal: 16,
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
  autoAcceptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  autoAcceptText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
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
  skipButton: {
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  skipButtonText: {
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