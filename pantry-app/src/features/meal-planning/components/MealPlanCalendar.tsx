/**
 * MealPlanCalendar Component
 *
 * Purpose: 7-day horizontal calendar showing planned meals with pantry match indicators
 * UX Pattern: Horizontal scroll, tap to add/view meals, swipe to delete
 * Design: Follows theme.ts constants, pantry match color coding
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../../core/constants/theme';
import type { PlannedMeal } from '../../../services/mealPlanningService';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_CARD_WIDTH = SCREEN_WIDTH * 0.85;

interface MealPlanCalendarProps {
  meals: PlannedMeal[];
  weekStartDate: string; // ISO date string (Monday)
  onAddMeal: (date: string, mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack') => void;
  onMealPress: (meal: PlannedMeal) => void;
  onRemoveMeal: (mealId: string) => void;
}

const MEAL_TYPES: Array<'breakfast' | 'lunch' | 'dinner' | 'snack'> = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
];

const MEAL_TYPE_ICONS = {
  breakfast: 'sunny-outline',
  lunch: 'restaurant-outline',
  dinner: 'moon-outline',
  snack: 'ice-cream-outline',
};

export default function MealPlanCalendar({
  meals,
  weekStartDate,
  onAddMeal,
  onMealPress,
  onRemoveMeal,
}: MealPlanCalendarProps) {
  // Generate 7 days starting from weekStartDate
  const days = React.useMemo(() => {
    const startDate = new Date(weekStartDate);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      return {
        date: date.toISOString().split('T')[0],
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNumber: date.getDate(),
        isToday: isToday(date),
      };
    });
  }, [weekStartDate]);

  // Organize meals by date and meal type
  const mealsByDate = React.useMemo(() => {
    const map = new Map<string, Map<string, PlannedMeal>>();
    meals.forEach(meal => {
      if (!map.has(meal.planned_date)) {
        map.set(meal.planned_date, new Map());
      }
      if (meal.meal_type) {
        map.get(meal.planned_date)!.set(meal.meal_type, meal);
      }
    });
    return map;
  }, [meals]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      snapToInterval={DAY_CARD_WIDTH + theme.spacing.md}
      decelerationRate="fast"
    >
      {days.map(day => (
        <View key={day.date} style={styles.dayCard}>
          {/* Day Header */}
          <View style={[styles.dayHeader, day.isToday && styles.todayHeader]}>
            <Text style={[styles.dayName, day.isToday && styles.todayText]}>
              {day.dayName}
            </Text>
            <Text style={[styles.dayNumber, day.isToday && styles.todayText]}>
              {day.dayNumber}
            </Text>
          </View>

          {/* Meal Slots */}
          <View style={styles.mealsContainer}>
            {MEAL_TYPES.map(mealType => {
              const meal = mealsByDate.get(day.date)?.get(mealType);
              return (
                <View key={mealType} style={styles.mealSlot}>
                  {meal ? (
                    <MealCard
                      meal={meal}
                      mealType={mealType}
                      onPress={() => onMealPress(meal)}
                      onRemove={() => onRemoveMeal(meal.id)}
                    />
                  ) : (
                    <EmptyMealSlot
                      mealType={mealType}
                      onPress={() => onAddMeal(day.date, mealType)}
                    />
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// Helper: Check if date is today
function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

// ============================================================================
// MealCard: Display a planned meal with pantry match indicator
// ============================================================================

interface MealCardProps {
  meal: PlannedMeal;
  mealType: string;
  onPress: () => void;
  onRemove: () => void;
}

function MealCard({ meal, mealType, onPress, onRemove }: MealCardProps) {
  const cookCard = meal.cook_card;
  const pantryMatch = meal.pantry_match_percent || 0;

  // Determine pantry match color
  const matchColor =
    pantryMatch >= 70
      ? theme.colors.pantryMatch.high
      : pantryMatch >= 40
      ? theme.colors.pantryMatch.medium
      : theme.colors.pantryMatch.low;

  return (
    <Pressable style={styles.mealCard} onPress={onPress}>
      {/* Recipe Image */}
      {cookCard?.image_url ? (
        <View style={styles.mealImageContainer}>
          <Image
            source={{ uri: cookCard.image_url }}
            style={styles.mealImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={styles.mealImageGradient}
          />
        </View>
      ) : (
        <View style={[styles.mealImageContainer, styles.placeholderImage]}>
          <Ionicons
            name={MEAL_TYPE_ICONS[mealType as keyof typeof MEAL_TYPE_ICONS] || 'restaurant-outline'}
            size={32}
            color={theme.colors.textSecondary}
          />
        </View>
      )}

      {/* Meal Info */}
      <View style={styles.mealInfo}>
        <Text style={styles.mealTitle} numberOfLines={2}>
          {cookCard?.title || 'Untitled Recipe'}
        </Text>

        {/* Pantry Match Badge */}
        <View style={styles.mealMetadata}>
          <View style={[styles.pantryBadge, { backgroundColor: matchColor }]}>
            <Text style={styles.pantryBadgeText}>{Math.round(pantryMatch)}%</Text>
          </View>

          {/* Missing Ingredients Count */}
          {(meal.missing_ingredients_count || 0) > 0 && (
            <View style={styles.missingBadge}>
              <Ionicons name="alert-circle-outline" size={12} color={theme.colors.error} />
              <Text style={styles.missingText}>
                {meal.missing_ingredients_count} missing
              </Text>
            </View>
          )}
        </View>

        {/* Status Indicators */}
        <View style={styles.statusRow}>
          {meal.status === 'cooked' && (
            <View style={styles.statusBadge}>
              <Ionicons name="checkmark-circle" size={14} color={theme.colors.success} />
              <Text style={styles.statusText}>Cooked</Text>
            </View>
          )}
          {meal.is_locked && (
            <Ionicons name="lock-closed" size={14} color={theme.colors.primary} />
          )}
        </View>
      </View>

      {/* Remove Button */}
      <Pressable
        style={styles.removeButton}
        onPress={onRemove}
        hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
      >
        <Ionicons name="close-circle" size={20} color={theme.colors.error} />
      </Pressable>
    </Pressable>
  );
}

// ============================================================================
// EmptyMealSlot: "+ Add Meal" button
// ============================================================================

interface EmptyMealSlotProps {
  mealType: string;
  onPress: () => void;
}

function EmptyMealSlot({ mealType, onPress }: EmptyMealSlotProps) {
  return (
    <Pressable style={styles.emptySlot} onPress={onPress}>
      <Ionicons
        name={MEAL_TYPE_ICONS[mealType as keyof typeof MEAL_TYPE_ICONS] || 'add-circle-outline'}
        size={24}
        color={theme.colors.textSecondary}
      />
      <Text style={styles.emptySlotText}>Add {mealType}</Text>
    </Pressable>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  dayCard: {
    width: DAY_CARD_WIDTH,
    marginRight: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },

  // Day Header
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  todayHeader: {
    borderBottomColor: theme.colors.primary,
    borderBottomWidth: 2,
  },
  dayName: {
    ...theme.typography.h3,
    color: theme.colors.textSecondary,
  },
  dayNumber: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
  },
  todayText: {
    color: theme.colors.primary,
  },

  // Meals Container
  mealsContainer: {
    gap: theme.spacing.sm,
  },
  mealSlot: {
    minHeight: 100,
  },

  // Meal Card
  mealCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  mealImageContainer: {
    width: 80,
    height: '100%',
    backgroundColor: theme.colors.backgroundSecondary,
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealImage: {
    width: '100%',
    height: '100%',
  },
  mealImageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  mealInfo: {
    flex: 1,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  mealTitle: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  mealMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  pantryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pantryBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  missingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  missingText: {
    fontSize: 11,
    color: theme.colors.error,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    color: theme.colors.success,
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    padding: 4,
  },

  // Empty Slot
  emptySlot: {
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundSecondary,
  },
  emptySlotText: {
    marginTop: theme.spacing.xs,
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textTransform: 'capitalize',
  },
});
