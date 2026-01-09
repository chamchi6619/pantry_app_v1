import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReceiptItem } from '../../../services/receiptService';

interface FixQueueItemProps {
  item: ReceiptItem;
  onUpdate: (field: keyof ReceiptItem, value: any) => void;
  onDelete: () => void;
}

export function FixQueueItem({
  item,
  onUpdate,
  onDelete,
}: FixQueueItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Available categories - same as inventory
  const availableCategories = ['Beverages', 'Dairy', 'Essential', 'Frozen', 'Fruits', 'Grains', 'Proteins', 'Snacks', 'Vegetables'].sort();

  const confidenceColor =
    item.confidence >= 0.8 ? '#10B981' :
    item.confidence >= 0.6 ? '#F59E0B' :
    '#EF4444';

  const handleQuantityChange = (delta: number) => {
    // Smart increment based on unit type
    const weightUnits = ['lb', 'oz', 'kg', 'g'];
    const isWeightUnit = weightUnits.includes(item.unit.toLowerCase());

    // For weight items: increment by 0.1 (delta is ±0.25, so scale to ±0.1)
    // For count items: keep increment at 0.25 (quarters)
    const actualDelta = isWeightUnit ? (delta / 0.25) * 0.1 : delta;
    const minimum = isWeightUnit ? 0.1 : 0.25;

    let newQty = Math.max(minimum, (item.quantity || 1) + actualDelta);

    // Round to 2 decimal places to avoid floating point issues
    newQty = Math.round(newQty * 100) / 100;
    onUpdate('quantity', newQty);
  };

  // Smart quantity display
  const formatQuantity = (qty: number): string => {
    // Whole numbers: no decimals
    if (qty % 1 === 0) return qty.toString();
    // Common fractions
    if (qty === 0.25) return '¼';
    if (qty === 0.5) return '½';
    if (qty === 0.75) return '¾';
    if (Math.abs(qty - Math.floor(qty) - 0.5) < 0.01) return `${Math.floor(qty)}½`;
    // Everything else: max 2 decimals
    return qty.toFixed(qty % 0.1 === 0 ? 1 : 2);
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
                style={[styles.nameContainer, { marginTop: 2 }]}
              >
                <Text style={styles.itemName}>{item.parsed_name}</Text>
                <Ionicons name="pencil" size={14} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.detailsRow, { marginTop: 10 }]}>
            <View style={styles.quantityContainer}>
              <TouchableOpacity
                style={styles.qtyButton}
                onPress={() => handleQuantityChange(-0.25)}
              >
                <Ionicons name="remove" size={16} color="#6B7280" />
              </TouchableOpacity>
              <Text style={styles.quantity}>
                {formatQuantity(item.quantity)} {item.unit}
              </Text>
              <TouchableOpacity
                style={styles.qtyButton}
                onPress={() => handleQuantityChange(0.25)}
              >
                <Ionicons name="add" size={16} color="#6B7280" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <Text style={[styles.price, { marginRight: 16 }]}>
          {formatPrice(item.price_cents)}
        </Text>

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
            <Pressable
              style={styles.categorySelector}
              onPress={() => setShowCategoryPicker(true)}
            >
              <Text style={[styles.categoryText, !item.categories && styles.categoryPlaceholder]}>
                {item.categories || 'Select category'}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#6B7280" />
            </Pressable>
          </View>

          {/* Category Picker Modal */}
          {showCategoryPicker && (
            <Modal
              visible={showCategoryPicker}
              transparent={true}
              animationType="fade"
              onRequestClose={() => setShowCategoryPicker(false)}
            >
              <Pressable style={styles.modalOverlay} onPress={() => setShowCategoryPicker(false)}>
                <View style={styles.dropdownModal}>
                  <ScrollView style={styles.dropdownScroll} showsVerticalScrollIndicator={true}>
                    {availableCategories.map((cat) => (
                      <Pressable
                        key={cat}
                        style={styles.dropdownOption}
                        onPress={() => {
                          onUpdate('categories', cat);
                          setShowCategoryPicker(false);
                        }}
                      >
                        <Text style={[styles.dropdownOptionText, item.categories === cat && styles.selectedOption]}>
                          {cat}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </Pressable>
            </Modal>
          )}

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

          <View style={styles.locationRow}>
            <Text style={styles.label}>Location:</Text>
            <View style={styles.locationButtons}>
              {[
                { key: 'fridge', icon: 'snow', label: 'Fridge' },
                { key: 'freezer', icon: 'ice-cream', label: 'Freezer' },
                { key: 'pantry', icon: 'home', label: 'Pantry' },
              ].map((loc) => (
                <TouchableOpacity
                  key={loc.key}
                  style={[
                    styles.locationButton,
                    item.selectedLocation === loc.key && styles.locationButtonActive,
                  ]}
                  onPress={() => onUpdate('selectedLocation', loc.key)}
                >
                  <Ionicons
                    name={loc.icon as any}
                    size={14}
                    color={item.selectedLocation === loc.key ? '#fff' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.locationButtonText,
                      item.selectedLocation === loc.key && styles.locationButtonTextActive,
                    ]}
                  >
                    {loc.label}
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
              <Text style={styles.deleteButtonText}>Delete Item</Text>
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
    marginTop: 8,
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
    paddingTop: 12,
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
  categorySelector: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  categoryText: {
    fontSize: 14,
    color: '#111827',
  },
  categoryPlaceholder: {
    color: '#9CA3AF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '80%',
    maxHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  dropdownScroll: {
    maxHeight: 300,
  },
  dropdownOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownOptionText: {
    fontSize: 16,
    color: '#111827',
  },
  selectedOption: {
    color: '#3B82F6',
    fontWeight: '600',
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
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationButtons: {
    flexDirection: 'row',
    flex: 1,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
  },
  locationButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  locationButtonText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
  },
  locationButtonTextActive: {
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
});