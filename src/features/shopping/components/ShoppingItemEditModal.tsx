import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  SafeAreaView,
  Pressable,
  TextInput,
  ScrollView,
} from 'react-native';
import { theme } from '../../../core/constants/theme';
import { Button } from '../../../core/components/ui/Button';
import { toTitleCase } from '../../../core/utils/textUtils';

interface ShoppingItemEditModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (item: any) => void;
  item?: any;
}

export const ShoppingItemEditModal: React.FC<ShoppingItemEditModalProps> = ({
  visible,
  onClose,
  onSave,
  item,
}) => {
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showCustomCategoryInput, setShowCustomCategoryInput] = useState(false);
  const [customCategoryText, setCustomCategoryText] = useState('');
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  const baseCategories = ['Bakery', 'Beverages', 'Dairy', 'Frozen', 'Meat', 'Other', 'Pantry', 'Produce', 'Snacks'];
  const categories = [...baseCategories, ...customCategories].sort();

  useEffect(() => {
    if (item) {
      setItemName(item.name || '');
      setCategory(item.category || '');
    }
  }, [item]);

  const handleSave = () => {
    onSave({
      ...item,
      name: toTitleCase(itemName),
      category: category || 'Other',
    });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>{item ? 'Edit Item' : 'Add Item'}</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Item Name</Text>
            <TextInput
              style={styles.input}
              value={itemName}
              onChangeText={setItemName}
              placeholder="Enter item name"
              placeholderTextColor={theme.colors.textLight}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Category</Text>
            <Pressable
              style={styles.categorySelector}
              onPress={() => setShowCategoryPicker(!showCategoryPicker)}
            >
              <Text style={styles.categoryText}>{category || 'Select category'}</Text>
              <Text style={styles.chevron}>⌄</Text>
            </Pressable>

            {showCategoryPicker && (
              <Modal
                visible={showCategoryPicker}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowCategoryPicker(false)}
              >
                <Pressable style={styles.dropdownOverlay} onPress={() => setShowCategoryPicker(false)}>
                  <View style={styles.dropdownModal}>
                    <ScrollView style={styles.dropdownScroll} showsVerticalScrollIndicator={true}>
                      {categories.map((cat) => (
                        <Pressable
                          key={cat}
                          style={styles.dropdownOption}
                          onPress={() => {
                            setCategory(cat);
                            setShowCategoryPicker(false);
                          }}
                        >
                          <Text style={[
                            styles.dropdownOptionText,
                            cat === category && styles.selectedCategory
                          ]}>
                            {cat}
                          </Text>
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
                <Pressable style={styles.dropdownOverlay} onPress={() => setShowCustomCategoryInput(false)}>
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
                            const newCategory = toTitleCase(customCategoryText.trim());
                            setCustomCategories(prev => [...prev, newCategory]);
                            setCategory(newCategory);
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

          <View style={styles.actions}>
            <Button
              variant="ghost"
              onPress={onClose}
              style={styles.cancelButton}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onPress={handleSave}
              style={styles.saveButton}
            >
              Save
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    width: '90%',
    maxWidth: 400,
    padding: theme.spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
  },
  closeButton: {
    padding: theme.spacing.xs,
  },
  closeIcon: {
    fontSize: 24,
    color: theme.colors.textSecondary,
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
  categorySelector: {
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
  categoryText: {
    fontSize: 16,
    color: theme.colors.text,
  },
  chevron: {
    fontSize: 20,
    color: theme.colors.textSecondary,
  },
  dropdownOverlay: {
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
  selectedCategory: {
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
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.xl,
  },
  cancelButton: {
    flex: 1,
  },
  saveButton: {
    flex: 1,
  },
});