/**
 * AddMealModal
 *
 * Purpose: Lightweight modal for adding meals to plan (text-first, no forced extraction)
 * Features:
 *   - Text input for meal title (instant save, no quota used)
 *   - Optional URL field (for reference, not extracted)
 *   - Day picker (next 14 days)
 *   - Meal type picker (breakfast, lunch, dinner, snack)
 *   - Option to extract recipe later (uses quota, enables pantry matching)
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

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface AddMealModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (mealTitle: string, plannedDate: string, mealType: MealType, sourceUrl?: string) => void;
  onBrowseRecipes?: () => void; // Optional: open recipe browser
  preselectedDate?: string; // Optional: pre-fill date
  preselectedMealType?: MealType; // Optional: pre-fill meal type
}

export default function AddMealModal({
  visible,
  onClose,
  onSave,
  onBrowseRecipes,
  preselectedDate,
  preselectedMealType,
}: AddMealModalProps) {
  const [mealTitle, setMealTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [selectedDate, setSelectedDate] = useState(preselectedDate || getNextDay());
  const [selectedMealType, setSelectedMealType] = useState<MealType>(preselectedMealType || 'dinner');
  const [saving, setSaving] = useState(false);

  // Sync state when preselected values change (important for when modal reopens)
  useEffect(() => {
    if (preselectedDate) {
      setSelectedDate(preselectedDate);
    }
    if (preselectedMealType) {
      setSelectedMealType(preselectedMealType);
    }
  }, [preselectedDate, preselectedMealType]);

  // Generate next 14 days for picker (centered around preselected date if provided)
  const dayOptions = generateNext14Days(preselectedDate);

  const handleSave = async () => {
    if (!mealTitle.trim()) {
      Alert.alert('Missing Title', 'Please enter a meal title (e.g., "Tacos", "Pasta", "Stir Fry")');
      return;
    }

    setSaving(true);
    try {
      await onSave(
        mealTitle.trim(),
        selectedDate,
        selectedMealType,
        sourceUrl.trim() || undefined
      );

      // Reset form
      setMealTitle('');
      setSourceUrl('');
      setSelectedDate(preselectedDate || getNextDay());
      setSelectedMealType(preselectedMealType || 'dinner');
    } catch (error) {
      console.error('Error saving meal:', error);
      Alert.alert('Error', 'Failed to save meal. Please try again.');
    } finally {
      setSaving(false);
    }
  };

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
            <Text style={styles.title}>Add Meal to Plan</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.content}>
            {/* Meal Title Input */}
            <View style={styles.section}>
              <Text style={styles.label}>
                What are you planning to cook? <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Tacos, Pasta, Stir Fry"
                value={mealTitle}
                onChangeText={setMealTitle}
                autoFocus
                returnKeyType="next"
              />
              <Text style={styles.hint}>
                💡 Quick tip: Just type the meal name, save instantly!
              </Text>
            </View>

            {/* Optional URL Input */}
            <View style={styles.section}>
              <Text style={styles.label}>Recipe URL (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="https://instagram.com/reel/..."
                value={sourceUrl}
                onChangeText={setSourceUrl}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
              <Text style={styles.hint}>
                Save a link for reference (won't extract yet)
              </Text>
            </View>

            {/* Day Picker */}
            <View style={styles.section}>
              <Text style={styles.label}>
                When? {preselectedDate && <Text style={styles.labelHint}>(pre-selected from calendar)</Text>}
              </Text>
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

            {/* Info Box */}
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={20} color={theme.colors.primary} />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoText}>
                  This saves instantly (no recipe extraction). You can extract the full recipe later to enable pantry matching.
                </Text>
                {onBrowseRecipes && (
                  <Pressable onPress={onBrowseRecipes} style={styles.browseLink}>
                    <Ionicons name="library-outline" size={16} color={theme.colors.primary} />
                    <Text style={styles.browseLinkText}>
                      Or browse your recipe library →
                    </Text>
                  </Pressable>
                )}
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
              disabled={saving || !mealTitle.trim()}
            >
              <Ionicons name="checkmark" size={20} color="#FFF" />
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving...' : 'Add to Plan'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Helper functions
function getNextDay(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

function generateNext14Days(centerDate?: string): Array<{ date: string; label: string; dayOfMonth: number }> {
  const days = [];

  // Start from the center date if provided, otherwise start from today
  const startDate = centerDate ? new Date(centerDate) : new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Generate 14 days starting from the center date (or today)
  for (let i = 0; i < 14; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    date.setHours(0, 0, 0, 0);

    // Calculate label based on relationship to today
    const daysDiff = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let label = '';
    if (daysDiff === 0) label = 'Today';
    else if (daysDiff === 1) label = 'Tomorrow';
    else if (daysDiff === -1) label = 'Yesterday';
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
  labelHint: {
    fontSize: 13,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  },
  required: {
    color: theme.colors.error,
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
  infoBox: {
    flexDirection: 'row',
    padding: theme.spacing.sm,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    marginTop: theme.spacing.md,
  },
  infoTextContainer: {
    flex: 1,
    marginLeft: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  infoText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  browseLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: theme.spacing.xs,
  },
  browseLinkText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
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
