/**
 * EditMealModal
 *
 * Purpose: Edit existing planned meals (change date, meal type, or title for text-only meals)
 * Features:
 *   - Pre-filled with existing meal data
 *   - Title editing disabled for extracted meals (linked to cook_card)
 *   - Day picker (next 14 days)
 *   - Meal type picker (breakfast, lunch, dinner, snack)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../core/constants/theme';
import type { PlannedMeal } from '../../../services/mealPlanningService';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface EditMealModalProps {
  visible: boolean;
  meal: PlannedMeal | null;
  onClose: () => void;
  onSave: (updates: { meal_title?: string; planned_date: string; meal_type: MealType }) => void;
}

export default function EditMealModal({
  visible,
  meal,
  onClose,
  onSave,
}: EditMealModalProps) {
  const [mealTitle, setMealTitle] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedMealType, setSelectedMealType] = useState<MealType>('dinner');
  const [saving, setSaving] = useState(false);

  // Update state when meal changes
  useEffect(() => {
    if (meal) {
      setMealTitle(meal.meal_title || meal.cook_card?.title || '');
      setSelectedDate(meal.planned_date);
      setSelectedMealType(meal.meal_type);
    }
  }, [meal]);

  // Generate next 14 days for picker
  const dayOptions = generateNext14Days();

  const handleSave = async () => {
    if (!meal) return;

    if (!mealTitle.trim() && !meal.is_extracted) {
      Alert.alert('Missing Title', 'Please enter a meal title');
      return;
    }

    setSaving(true);
    try {
      const updates: { meal_title?: string; planned_date: string; meal_type: MealType } = {
        planned_date: selectedDate,
        meal_type: selectedMealType,
      };

      // Only include title for text-only meals (extracted meals can't change title)
      if (!meal.is_extracted) {
        updates.meal_title = mealTitle.trim();
      }

      await onSave(updates);
      onClose();
    } catch (error) {
      console.error('Error saving meal:', error);
      Alert.alert('Error', 'Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!meal) return null;

  const isExtracted = meal.is_extracted || !!meal.cook_card_id;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Edit Meal</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.content}>
            {/* Meal Title Input */}
            <View style={styles.section}>
              <Text style={styles.label}>Meal Title</Text>
              <TextInput
                style={[
                  styles.input,
                  isExtracted && styles.inputDisabled,
                ]}
                placeholder="e.g., Tacos, Pasta, Stir Fry"
                value={mealTitle}
                onChangeText={setMealTitle}
                editable={!isExtracted}
                returnKeyType="next"
              />
              {isExtracted && (
                <Text style={styles.hint}>
                  💡 This meal is linked to a recipe. Title cannot be changed.
                </Text>
              )}
            </View>

            {/* Day Picker */}
            <View style={styles.section}>
              <Text style={styles.label}>When?</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayPicker}>
                {dayOptions.map((day) => (
                  <Pressable
                    key={day.date}
                    style={[
                      styles.dayOption,
                      selectedDate === day.date && styles.dayOptionSelected,
                    ]}
                    onPress={() => setSelectedDate(day.date)}
                  >
                    <Text
                      style={[
                        styles.dayLabel,
                        selectedDate === day.date && styles.dayLabelSelected,
                      ]}
                    >
                      {day.label}
                    </Text>
                    <Text
                      style={[
                        styles.dayDate,
                        selectedDate === day.date && styles.dayDateSelected,
                      ]}
                    >
                      {day.dayOfMonth}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Meal Type Picker */}
            <View style={styles.section}>
              <Text style={styles.label}>Meal Type</Text>
              <View style={styles.mealTypePicker}>
                {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((type) => (
                  <Pressable
                    key={type}
                    style={[
                      styles.mealTypeOption,
                      selectedMealType === type && styles.mealTypeOptionSelected,
                    ]}
                    onPress={() => setSelectedMealType(type)}
                  >
                    <Text
                      style={[
                        styles.mealTypeLabel,
                        selectedMealType === type && styles.mealTypeLabelSelected,
                      ]}
                    >
                      {getMealTypeIcon(type)} {capitalize(type)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              style={[styles.button, styles.saveButton]}
              onPress={handleSave}
              disabled={saving}
            >
              <Ionicons name="checkmark" size={20} color="#FFF" />
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Helper functions
function generateNext14Days(): Array<{ date: string; label: string; dayOfMonth: number }> {
  const days = [];
  const today = new Date();

  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);

    let label = '';
    if (i === 0) label = 'Today';
    else if (i === 1) label = 'Tomorrow';
    else {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      label = dayNames[date.getDay()];
    }

    days.push({
      date: date.toISOString().split('T')[0],
      label,
      dayOfMonth: date.getDate(),
    });
  }

  return days;
}

function getMealTypeIcon(type: MealType): string {
  const icons = {
    breakfast: '🌅',
    lunch: '☀️',
    dinner: '🌙',
    snack: '🍪',
  };
  return icons[type];
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
  },
  closeButton: {
    padding: theme.spacing.xs,
  },
  content: {
    padding: theme.spacing.md,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: theme.spacing.sm + 4,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: '#F9FAFB',
  },
  inputDisabled: {
    backgroundColor: '#E5E7EB',
    color: theme.colors.textSecondary,
  },
  hint: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  dayPicker: {
    flexDirection: 'row',
  },
  dayOption: {
    alignItems: 'center',
    padding: theme.spacing.sm,
    marginRight: theme.spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 70,
  },
  dayOptionSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  dayLabelSelected: {
    color: '#FFF',
  },
  dayDate: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 4,
  },
  dayDateSelected: {
    color: '#FFF',
  },
  mealTypePicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  mealTypeOption: {
    flex: 1,
    minWidth: '45%',
    padding: theme.spacing.sm + 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  mealTypeOptionSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  mealTypeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  mealTypeLabelSelected: {
    color: '#FFF',
  },
  footer: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.sm + 4,
    borderRadius: 8,
    gap: theme.spacing.xs,
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
});
