import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  SafeAreaView,
  ScrollView,
  Pressable,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
// Conditionally import date picker for native platforms only
let DateTimePickerModal: any = null;
let DateTimePicker: any = null;
if (Platform.OS !== 'web') {
  DateTimePickerModal = require('react-native-modal-datetime-picker').default;
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}
import { theme } from '../../../core/constants/theme';
import { Button } from '../../../core/components/ui/Button';
import { Input } from '../../../core/components/ui/Input';
import { getAllFoodEmojis, getFoodEmojisByCategory, defaultFoodEmoji } from '../../../core/constants/foodEmojis';

interface ItemEditorModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (item: any) => void;
  onDelete?: () => void;
  item?: any;
}

export const ItemEditorModal: React.FC<ItemEditorModalProps> = ({
  visible,
  onClose,
  onSave,
  onDelete,
  item,
}) => {
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('pieces');
  const [location, setLocation] = useState('fridge');
  const [expiryDate, setExpiryDate] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showCustomCategoryInput, setShowCustomCategoryInput] = useState(false);
  const [customCategoryText, setCustomCategoryText] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEmoji, setSelectedEmoji] = useState(defaultFoodEmoji);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  useEffect(() => {
    if (item) {
      setItemName(item.name || '');
      // Handle quantity properly to avoid NaN
      const qty = item.quantity;
      setQuantity(qty === null || qty === undefined || qty === 0 ? '' : qty.toString());
      setUnit(item.unit || 'pieces');
      setLocation(item.location?.toLowerCase() || 'fridge');
      // Map expirationDate to expiryDate for the modal
      const dateStr = item.expirationDate || item.expiresAt || item.expiryDate || '';
      setExpiryDate(dateStr);
      if (dateStr) {
        setSelectedDate(new Date(dateStr));
      }
      // Map single category to categories array
      setCategories(item.category ? [item.category] : (item.categories || []));
      // Set emoji from item or use default
      setSelectedEmoji(item.emoji || defaultFoodEmoji);
    } else {
      // Reset for new item
      setItemName('');
      setQuantity('');
      setUnit('pieces');
      setLocation('fridge');
      setExpiryDate('');
      setSelectedDate(null);
      setCategories([]);
      setSelectedEmoji(defaultFoodEmoji);
    }
  }, [item]);

  const units = ['serving', 'servings', 'half gallon', 'gallon', 'liter', 'ml', 'oz', 'fl oz', 'lb', 'kg', 'g', 'piece', 'pieces', 'bunch', 'pack'];
  const availableCategories = ['Beverages', 'Dairy', 'Essential', 'Frozen', 'Fruits', 'Grains', 'Proteins', 'Snacks', 'Vegetables'].sort();
  const popularCategories = ['Proteins', 'Vegetables', 'Fruits', 'Grains', 'Snacks'];

  const handleSave = () => {
    // Parse quantity, defaulting to null if empty
    const parsedQuantity = quantity === '' ? null : parseFloat(quantity);
    const updatedItem = {
      name: itemName,
      quantity: isNaN(parsedQuantity) ? null : parsedQuantity,
      unit,
      location,
      expirationDate: expiryDate && expiryDate !== '' ? expiryDate : undefined, // Keep as YYYY-MM-DD string
      categories,
      emoji: selectedEmoji,
    };
    console.log('Saving item with expiration date:', expiryDate);
    onSave(updatedItem);
    onClose();
  };

  const toggleCategory = (category: string) => {
    if (categories.includes(category)) {
      setCategories(categories.filter(c => c !== category));
    } else {
      setCategories([...categories, category]);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerButton}>
            <Text style={styles.closeButton}>✕</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{item ? 'Edit Item' : 'Add Item'}</Text>
          <Pressable onPress={handleSave} style={styles.headerButton}>
            <Text style={styles.saveButton}>Save</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Emoji Section */}
          <View style={styles.emojiSection}>
            <Text style={styles.label}>Item Icon</Text>
            <Pressable
              style={styles.emojiSelector}
              onPress={() => setShowEmojiPicker(true)}
            >
              <Text style={styles.selectedEmoji}>{selectedEmoji}</Text>
              <Text style={styles.changeEmojiText}>Tap to change</Text>
            </Pressable>
          </View>

          {/* Emoji Picker Modal */}
          {showEmojiPicker && (
            <Modal
              visible={showEmojiPicker}
              transparent={true}
              animationType="fade"
              onRequestClose={() => setShowEmojiPicker(false)}
            >
              <Pressable style={styles.modalOverlay} onPress={() => setShowEmojiPicker(false)}>
                <View style={styles.emojiPickerModal}>
                  <Text style={styles.emojiPickerTitle}>Choose an Icon</Text>
                  <ScrollView style={styles.emojiGrid} showsVerticalScrollIndicator={true}>
                    <View style={styles.emojiGridContent}>
                      {(categories.length > 0 ? getFoodEmojisByCategory(categories[0]) : getAllFoodEmojis()).map((emoji, index) => (
                        <Pressable
                          key={index}
                          style={[styles.emojiOption, selectedEmoji === emoji && styles.emojiOptionSelected]}
                          onPress={() => {
                            setSelectedEmoji(emoji);
                            setShowEmojiPicker(false);
                          }}
                        >
                          <Text style={styles.emojiOptionText}>{emoji}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </Pressable>
            </Modal>
          )}

          {/* Item Name */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Item Name</Text>
            <TextInput
              style={styles.input}
              value={itemName}
              onChangeText={setItemName}
              placeholder="Enter item name"
            />
          </View>

          {/* Quantity and Unit */}
          <View style={styles.row}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.label}>Quantity</Text>
              <TextInput
                style={styles.input}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                placeholder="?"
              />
            </View>
            <View style={[styles.formGroup, { flex: 2, marginLeft: theme.spacing.md }]}>
              <Text style={styles.label}>Unit</Text>
              <Pressable
                style={styles.unitSelector}
                onPress={() => setShowUnitPicker(!showUnitPicker)}
              >
                <Text style={styles.unitText}>{unit}</Text>
                <Text style={styles.chevron}>⌄</Text>
              </Pressable>
            </View>
          </View>

          {/* Quantity Presets */}
          <View style={styles.presetContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
              {[
                { label: '½', value: '0.5', unit: null },
                { label: '1', value: '1', unit: null },
                { label: '1½', value: '1.5', unit: null },
                { label: '2', value: '2', unit: null },
                { label: '1 lb', value: '1', unit: 'lb' },
                { label: '500g', value: '500', unit: 'g' },
                { label: '1 dozen', value: '12', unit: 'pieces' },
                { label: '6 pack', value: '6', unit: 'pack' },
              ].map((preset) => (
                <Pressable
                  key={preset.label}
                  style={styles.presetButton}
                  onPress={() => {
                    setQuantity(preset.value);
                    if (preset.unit) setUnit(preset.unit);
                  }}
                >
                  <Text style={styles.presetText}>{preset.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Unit Picker Modal */}
          {showUnitPicker && (
            <Modal
              visible={showUnitPicker}
              transparent={true}
              animationType="fade"
              onRequestClose={() => setShowUnitPicker(false)}
            >
              <Pressable style={styles.modalOverlay} onPress={() => setShowUnitPicker(false)}>
                <View style={styles.dropdownModal}>
                  <ScrollView style={styles.dropdownScroll} showsVerticalScrollIndicator={true}>
                    {units.map((u) => (
                      <Pressable
                        key={u}
                        style={styles.dropdownOption}
                        onPress={() => {
                          setUnit(u);
                          setShowUnitPicker(false);
                        }}
                      >
                        <Text style={[styles.dropdownOptionText, u === unit && styles.selectedOption]}>
                          {u}
                        </Text>
                      </Pressable>
                    ))}
                    <Pressable
                      style={styles.dropdownOption}
                      onPress={() => {
                        setUnit('custom');
                        setShowUnitPicker(false);
                      }}
                    >
                      <Text style={styles.customOption}>+ Custom unit</Text>
                    </Pressable>
                  </ScrollView>
                </View>
              </Pressable>
            </Modal>
          )}

          {/* Location */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Location</Text>
            <View style={styles.locationButtons}>
              <Pressable
                style={[styles.locationButton, location === 'fridge' && styles.fridgeActive]}
                onPress={() => setLocation('fridge')}
              >
                <Text style={styles.locationIcon}>❄️</Text>
                <Text style={[styles.locationText, location === 'fridge' && styles.locationTextActive]}>
                  Fridge
                </Text>
              </Pressable>
              <Pressable
                style={[styles.locationButton, location === 'freezer' && styles.freezerActive]}
                onPress={() => setLocation('freezer')}
              >
                <Text style={styles.locationIcon}>🧊</Text>
                <Text style={[styles.locationText, location === 'freezer' && styles.locationTextActive]}>
                  Freezer
                </Text>
              </Pressable>
              <Pressable
                style={[styles.locationButton, location === 'pantry' && styles.pantryActive]}
                onPress={() => setLocation('pantry')}
              >
                <Text style={styles.locationIcon}>🏺</Text>
                <Text style={[styles.locationText, location === 'pantry' && styles.locationTextActive]}>
                  Pantry
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Expiry Date */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Expiry Date</Text>
            <Pressable
              style={styles.dateInput}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={[styles.dateText, !expiryDate && styles.datePlaceholder]}>
                {expiryDate ? (() => {
                  // Parse YYYY-MM-DD format safely
                  const [year, month, day] = expiryDate.split('-');
                  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).toLocaleDateString();
                })() : 'Select date'}
              </Text>
              <Text style={styles.calendarIcon}>📅</Text>
            </Pressable>
          </View>

          {/* Date Picker Modal - iOS */}
          {showDatePicker && Platform.OS === 'ios' && DateTimePicker && (
            <Modal
              visible={showDatePicker}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowDatePicker(false)}
            >
              <Pressable style={styles.dateModalBackdrop} onPress={() => setShowDatePicker(false)}>
                <View style={styles.dateModalContainer}>
                  <View style={styles.dateModalHeader}>
                    <View style={styles.dateModalPill} />
                    <Text style={styles.dateModalTitle}>Select Expiry Date</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <DateTimePicker
                      value={selectedDate || new Date()}
                      mode="date"
                      display="spinner"
                      onChange={(event: any, date?: Date) => {
                        if (date) {
                          setSelectedDate(date);
                          // Format date properly to avoid timezone issues
                          const year = date.getFullYear();
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const day = String(date.getDate()).padStart(2, '0');
                          const localDateStr = `${year}-${month}-${day}`;
                          setExpiryDate(localDateStr);
                        }
                      }}
                      style={{ height: 180, width: '100%' }}
                      textColor={theme.colors.text}
                      themeVariant="light"
                    />
                  </View>
                  <View style={styles.dateModalButtons}>
                    <TouchableOpacity
                      style={styles.dateModalCancel}
                      onPress={() => setShowDatePicker(false)}
                    >
                      <Text style={styles.dateModalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.dateModalConfirm}
                      onPress={() => setShowDatePicker(false)}
                    >
                      <Text style={styles.dateModalConfirmText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Pressable>
            </Modal>
          )}

          {/* Date Picker Modal - Android */}
          {showDatePicker && Platform.OS === 'android' && DateTimePicker && (
            <DateTimePicker
              value={selectedDate || new Date()}
              mode="date"
              display="default"
              onChange={(event: any, date?: Date) => {
                setShowDatePicker(false);
                if (date) {
                  setSelectedDate(date);
                  // Format date properly to avoid timezone issues
                  const year = date.getFullYear();
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  const localDateStr = `${year}-${month}-${day}`;
                  setExpiryDate(localDateStr);
                }
              }}
            />
          )}

          {/* Date Picker Modal - Web */}
          {showDatePicker && Platform.OS === 'web' && (
            <Modal
              visible={showDatePicker}
              transparent={true}
              animationType="fade"
              onRequestClose={() => setShowDatePicker(false)}
            >
              <Pressable style={styles.modalOverlay} onPress={() => setShowDatePicker(false)}>
                <Pressable style={styles.webDatePickerModal} onPress={(e) => e.stopPropagation()}>
                  <Text style={styles.webDatePickerTitle}>Select Expiry Date</Text>
                  <TextInput
                    style={styles.webDateInput}
                    value={expiryDate}
                    onChangeText={(text) => {
                      setExpiryDate(text);
                      // Try to parse the date if it's in a valid format
                      const date = new Date(text);
                      if (!isNaN(date.getTime())) {
                        setSelectedDate(date);
                      }
                    }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                  <View style={styles.webDatePickerButtons}>
                    <Pressable
                      style={[styles.webDatePickerButton, styles.webDatePickerCancel]}
                      onPress={() => setShowDatePicker(false)}
                    >
                      <Text style={styles.webDatePickerCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.webDatePickerButton, styles.webDatePickerConfirm]}
                      onPress={() => {
                        setShowDatePicker(false);
                      }}
                    >
                      <Text style={styles.webDatePickerConfirmText}>Done</Text>
                    </Pressable>
                  </View>
                </Pressable>
              </Pressable>
            </Modal>
          )}

          {/* Categories */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.selectedCategories}>
              {categories.map((cat) => (
                <Pressable
                  key={cat}
                  style={styles.categoryChip}
                  onPress={() => toggleCategory(cat)}
                >
                  <Text style={styles.categoryChipText}>{cat}</Text>
                  <Text style={styles.removeCategory}>✕</Text>
                </Pressable>
              ))}
              <Pressable
                style={styles.addCategoryButton}
                onPress={() => setShowCategoryPicker(!showCategoryPicker)}
              >
                <Text style={styles.addCategoryText}>+ Add Category</Text>
              </Pressable>
            </View>

            <Text style={styles.popularLabel}>Popular: {popularCategories.join(', ')}</Text>

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
                      {availableCategories.filter(cat => !categories.includes(cat)).map((cat) => (
                        <Pressable
                          key={cat}
                          style={styles.dropdownOption}
                          onPress={() => {
                            toggleCategory(cat);
                            setShowCategoryPicker(false);
                          }}
                        >
                          <Text style={styles.dropdownOptionText}>{cat}</Text>
                        </Pressable>
                      ))}
                      <Pressable
                        style={styles.dropdownOption}
                        onPress={() => {
                          setShowCategoryPicker(false);
                          setShowCustomCategoryInput(true);
                        }}
                      >
                        <Text style={styles.customOption}>+ Add Custom Category</Text>
                      </Pressable>
                    </ScrollView>
                  </View>
                </Pressable>
              </Modal>
            )}

            {/* Custom Category Input Modal */}
            {showCustomCategoryInput && (
              <Modal
                visible={showCustomCategoryInput}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowCustomCategoryInput(false)}
              >
                <Pressable style={styles.modalOverlay} onPress={() => setShowCustomCategoryInput(false)}>
                  <View style={styles.customCategoryModal}>
                    <Text style={styles.customCategoryTitle}>Add Custom Category</Text>
                    <TextInput
                      style={styles.customCategoryInput}
                      value={customCategoryText}
                      onChangeText={setCustomCategoryText}
                      placeholder="Enter category name"
                      autoFocus={true}
                    />
                    <View style={styles.customCategoryButtons}>
                      <Pressable
                        style={styles.customCategoryCancel}
                        onPress={() => {
                          setShowCustomCategoryInput(false);
                          setCustomCategoryText('');
                        }}
                      >
                        <Text style={styles.customCategoryCancelText}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={styles.customCategoryAdd}
                        onPress={() => {
                          if (customCategoryText.trim()) {
                            toggleCategory(customCategoryText.trim());
                            setShowCustomCategoryInput(false);
                            setCustomCategoryText('');
                          }
                        }}
                      >
                        <Text style={styles.customCategoryAddText}>Add</Text>
                      </Pressable>
                    </View>
                  </View>
                </Pressable>
              </Modal>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            {onDelete && (
              <Pressable style={styles.deleteButton} onPress={onDelete}>
                <Text style={styles.deleteIcon}>✕</Text>
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            )}

            <Button
              variant="primary"
              onPress={handleSave}
              style={styles.saveChangesButton}
            >
              ✓ Save Changes
            </Button>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
  headerButton: {
    padding: theme.spacing.sm,
  },
  closeButton: {
    fontSize: 24,
    color: theme.colors.text,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  saveButton: {
    fontSize: 16,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  emojiSection: {
    marginBottom: theme.spacing.xl,
  },
  emojiSelector: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selectedEmoji: {
    fontSize: 64,
    marginBottom: theme.spacing.sm,
  },
  changeEmojiText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  emojiPickerModal: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    width: '90%',
    maxHeight: '70%',
    padding: theme.spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  emojiPickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  emojiGrid: {
    maxHeight: 300,
  },
  emojiGridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  emojiOption: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 5,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
  },
  emojiOptionSelected: {
    backgroundColor: theme.colors.primary,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  emojiOptionText: {
    fontSize: 24,
  },
  formGroup: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  row: {
    flexDirection: 'row',
  },
  unitSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  unitText: {
    fontSize: 16,
    color: theme.colors.text,
  },
  chevron: {
    fontSize: 20,
    color: theme.colors.textSecondary,
  },
  presetContainer: {
    marginTop: -theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  presetScroll: {
    paddingVertical: theme.spacing.xs,
  },
  presetButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.full,
    marginRight: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  presetText: {
    fontSize: 14,
    color: theme.colors.text,
  },
  unitPicker: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    maxHeight: 200,
  },
  unitOption: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  unitOptionText: {
    fontSize: 16,
    color: theme.colors.text,
  },
  selectedUnit: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  locationButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  locationButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  fridgeActive: {
    backgroundColor: '#E3F2FD',
    borderColor: theme.colors.fridge,
  },
  freezerActive: {
    backgroundColor: '#E0F7FA',
    borderColor: theme.colors.freezer,
  },
  pantryActive: {
    backgroundColor: '#FFF3E0',
    borderColor: theme.colors.pantry,
  },
  locationIcon: {
    fontSize: 24,
    marginBottom: theme.spacing.xs,
  },
  locationText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  locationTextActive: {
    color: theme.colors.text,
    fontWeight: '600',
  },
  dateInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  dateText: {
    fontSize: 16,
    color: theme.colors.text,
  },
  datePlaceholder: {
    color: theme.colors.textSecondary,
  },
  calendarIcon: {
    fontSize: 20,
  },
  selectedCategories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  categoryChipText: {
    fontSize: 14,
    color: theme.colors.text,
    marginRight: theme.spacing.xs,
  },
  removeCategory: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  addCategoryButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  addCategoryText: {
    fontSize: 14,
    color: theme.colors.primary,
  },
  popularLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  deleteIcon: {
    fontSize: 18,
    color: theme.colors.error,
    marginRight: theme.spacing.xs,
  },
  deleteText: {
    fontSize: 16,
    color: theme.colors.error,
    fontWeight: '500',
  },
  saveChangesButton: {
    flex: 1,
  },
  categoryPicker: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.sm,
    maxHeight: 200,
  },
  categoryOption: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  categoryOptionText: {
    fontSize: 16,
    color: theme.colors.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownModal: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    width: '80%',
    maxHeight: 300,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  dropdownScroll: {
    maxHeight: 300,
  },
  dropdownOption: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  dropdownOptionText: {
    fontSize: 16,
    color: theme.colors.text,
  },
  selectedOption: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  customOption: {
    fontSize: 16,
    color: theme.colors.primary,
    fontStyle: 'italic',
  },
  customCategoryModal: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    width: '80%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  customCategoryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  customCategoryInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    marginBottom: theme.spacing.lg,
  },
  customCategoryButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  customCategoryCancel: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  customCategoryCancelText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  customCategoryAdd: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
  },
  customCategoryAddText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  webDatePickerModal: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: theme.spacing.lg,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 400,
  },
  webDatePickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  webDateInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    marginBottom: theme.spacing.lg,
  },
  webDatePickerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: theme.spacing.md,
  },
  webDatePickerButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  webDatePickerCancel: {
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  webDatePickerCancelText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  webDatePickerConfirm: {
    backgroundColor: theme.colors.primary,
  },
  webDatePickerConfirmText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  dateModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  dateModalContainer: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  dateModalHeader: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  dateModalPill: {
    width: 36,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    marginBottom: 12,
  },
  dateModalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.text,
  },
  dateModalButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 0,
    gap: 10,
  },
  dateModalCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dateModalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  dateModalConfirm: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
  },
  dateModalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});