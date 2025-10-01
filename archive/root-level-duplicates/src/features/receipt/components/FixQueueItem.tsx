import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReceiptItem } from '../../../services/receiptService';

interface FixQueueItemProps {
  item: ReceiptItem;
  onUpdate: (field: keyof ReceiptItem, value: any) => void;
  onDelete: () => void;
  onAddToInventory: () => void;
}

export function FixQueueItem({
  item,
  onUpdate,
  onDelete,
  onAddToInventory,
}: FixQueueItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const confidenceColor =
    item.confidence >= 0.8 ? '#10B981' :
    item.confidence >= 0.6 ? '#F59E0B' :
    '#EF4444';

  const handleQuantityChange = (delta: number) => {
    const newQty = Math.max(0.25, (item.quantity || 1) + delta);
    onUpdate('quantity', newQty);
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <View style={styles.mainInfo}>
          <View style={styles.titleRow}>
            {isEditing ? (
              <TextInput
                style={styles.nameInput}
                value={item.parsed_name}
                onChangeText={(text) => onUpdate('parsed_name', text)}
                onBlur={() => setIsEditing(false)}
                autoFocus
              />
            ) : (
              <TouchableOpacity
                onPress={() => setIsEditing(true)}
                style={styles.nameContainer}
              >
                <Text style={styles.itemName}>{item.parsed_name}</Text>
                <Ionicons name="pencil" size={14} color="#6B7280" />
              </TouchableOpacity>
            )}
            <View style={[styles.confidenceBadge, { backgroundColor: confidenceColor + '20' }]}>
              <Text style={[styles.confidenceText, { color: confidenceColor }]}>
                {Math.round(item.confidence * 100)}%
              </Text>
            </View>
          </View>

          <View style={styles.detailsRow}>
            <View style={styles.quantityContainer}>
              <TouchableOpacity
                style={styles.qtyButton}
                onPress={() => handleQuantityChange(-0.25)}
              >
                <Ionicons name="remove" size={16} color="#6B7280" />
              </TouchableOpacity>
              <Text style={styles.quantity}>
                {item.quantity} {item.unit}
              </Text>
              <TouchableOpacity
                style={styles.qtyButton}
                onPress={() => handleQuantityChange(0.25)}
              >
                <Ionicons name="add" size={16} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.price}>
              {formatPrice(item.price_cents)}
            </Text>
          </View>

          <Text style={styles.rawText}>OCR: {item.raw_text}</Text>
        </View>

        <Ionicons
          name={isExpanded ? "chevron-up" : "chevron-down"}
          size={20}
          color="#6B7280"
        />
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.expandedContent}>
          <View style={styles.categoryRow}>
            <Text style={styles.label}>Category:</Text>
            <TextInput
              style={styles.categoryInput}
              value={item.categories || ''}
              onChangeText={(text) => onUpdate('categories', text)}
              placeholder="e.g., dairy, produce"
            />
          </View>

          <View style={styles.unitRow}>
            <Text style={styles.label}>Unit:</Text>
            <View style={styles.unitButtons}>
              {['piece', 'lb', 'oz', 'pack', 'bunch'].map((unit) => (
                <TouchableOpacity
                  key={unit}
                  style={[
                    styles.unitButton,
                    item.unit === unit && styles.unitButtonActive,
                  ]}
                  onPress={() => onUpdate('unit', unit)}
                >
                  <Text
                    style={[
                      styles.unitButtonText,
                      item.unit === unit && styles.unitButtonTextActive,
                    ]}
                  >
                    {unit}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.label}>Price:</Text>
            <TextInput
              style={styles.priceInput}
              value={formatPrice(item.price_cents)}
              onChangeText={(text) => {
                const cents = Math.round(parseFloat(text.replace('$', '')) * 100);
                if (!isNaN(cents)) {
                  onUpdate('price_cents', cents);
                }
              }}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => {
                Alert.alert(
                  'Delete Item',
                  'Remove this item from the receipt?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', onPress: onDelete, style: 'destructive' },
                  ]
                );
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.inventoryButton]}
              onPress={onAddToInventory}
            >
              <Ionicons name="home-outline" size={20} color="#10B981" />
              <Text style={styles.inventoryButtonText}>Add to Inventory</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mainInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginRight: 8,
  },
  nameInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#3B82F6',
    flex: 1,
    paddingVertical: 2,
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: '600',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  qtyButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantity: {
    marginHorizontal: 12,
    fontSize: 14,
    color: '#374151',
    minWidth: 60,
    textAlign: 'center',
  },
  price: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  rawText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
    fontStyle: 'italic',
  },
  expandedContent: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: '#6B7280',
    width: 80,
  },
  categoryInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  unitButtons: {
    flexDirection: 'row',
    flex: 1,
  },
  unitButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
  },
  unitButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  unitButtonText: {
    fontSize: 12,
    color: '#6B7280',
  },
  unitButtonTextActive: {
    color: '#fff',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  priceInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
  },
  deleteButtonText: {
    color: '#EF4444',
    marginLeft: 4,
    fontSize: 14,
    fontWeight: '500',
  },
  inventoryButton: {
    backgroundColor: '#D1FAE5',
  },
  inventoryButtonText: {
    color: '#10B981',
    marginLeft: 4,
    fontSize: 14,
    fontWeight: '500',
  },
});