/**
 * MealPlanningScreen
 *
 * Purpose: Main meal planning interface - weekly calendar view with tap-to-add meals
 * Features: View/edit weekly meal plan, add recipes, pantry match indicators, generate shopping list
 * Navigation: Accessible from Recipes tab
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../core/constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import MealPlanCalendar from '../components/MealPlanCalendar';
import RecipeBrowserModal from '../components/RecipeBrowserModal';
import {
  getOrCreateActiveMealPlan,
  getMealsForPlan,
  addMealToPlan,
  removeMealFromPlan,
  getMealPlanSummary,
  getCurrentWeekRange,
  type MealPlan,
  type PlannedMeal,
} from '../../../services/mealPlanningService';
import { addRecipeIngredientsToShoppingList } from '../../../services/shoppingListService';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../../lib/supabase';

export default function MealPlanningScreen() {
  console.log('[MealPlanning] 🎬 Component mounting...');

  const navigation = useNavigation();
  const { user, householdId } = useAuth();

  // Create household object from householdId (for compatibility)
  // IMPORTANT: useMemo prevents infinite re-render loop
  const household = useMemo(
    () => (householdId ? { id: householdId } : null),
    [householdId]
  );

  console.log('[MealPlanning] Auth state:', {
    hasUser: !!user,
    userId: user?.id,
    hasHousehold: !!household,
    householdId: household?.id
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [summary, setSummary] = useState<{
    totalMeals: number;
    avgPantryMatch: number;
    totalMissingIngredients: number;
  } | null>(null);

  // Recipe browser modal state
  const [browserVisible, setBrowserVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedMealType, setSelectedMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('dinner');

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, 1 = next week, etc.

  // AI generation state
  const [aiGenerating, setAiGenerating] = useState(false);

  const loadMealPlan = useCallback(async () => {
    if (!user || !household) {
      console.log('[MealPlanning] Missing user or household:', { user: !!user, household: !!household });
      return;
    }

    try {
      setLoading(true);
      console.log('[MealPlanning] Loading meal plan...', {
        userId: user.id,
        householdId: household.id,
        weekOffset
      });

      // Get or create meal plan for week (with offset)
      console.log('[MealPlanning] Calling getOrCreateActiveMealPlan...');
      const plan = await getOrCreateActiveMealPlan(user.id, household.id, weekOffset);
      console.log('[MealPlanning] Meal plan loaded:', plan.id);
      setMealPlan(plan);

      // Load meals for this plan
      console.log('[MealPlanning] Loading meals for plan...');
      const planMeals = await getMealsForPlan(plan.id);
      console.log('[MealPlanning] Loaded meals:', planMeals.length);
      setMeals(planMeals);

      // Load summary statistics
      console.log('[MealPlanning] Loading summary...');
      const stats = await getMealPlanSummary(plan.id);
      console.log('[MealPlanning] Summary loaded:', stats);
      setSummary(stats);

      console.log('[MealPlanning] ✅ Load complete');
    } catch (error: any) {
      console.error('[MealPlanning] ❌ Error loading meal plan:', error);
      console.error('[MealPlanning] Error details:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      });
      Alert.alert(
        'Error Loading Meal Plan',
        error?.message || 'Failed to load meal plan. Please check console for details.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, household, weekOffset]); // Dependency array for useCallback

  // Load meal plan when component mounts or dependencies change
  useEffect(() => {
    console.log('[MealPlanning] ⚡ useEffect triggered', {
      hasUser: !!user,
      hasHousehold: !!household,
      weekOffset
    });

    if (user && household) {
      console.log('[MealPlanning] ✅ Both user and household present, calling loadMealPlan()');
      loadMealPlan();
    } else {
      console.log('[MealPlanning] ⚠️ Missing user or household, skipping load');
      setLoading(false); // Important: Stop loading spinner!
    }
  }, [user, household, weekOffset, loadMealPlan]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadMealPlan();
  };

  // Open recipe browser for specific meal slot
  const handleAddMeal = (date: string, mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack') => {
    setSelectedDate(date);
    setSelectedMealType(mealType);
    setBrowserVisible(true);
  };

  // Add selected recipe to meal plan
  const handleSelectRecipe = async (cookCardId: string) => {
    if (!mealPlan || !household) return;

    try {
      await addMealToPlan(
        {
          meal_plan_id: mealPlan.id,
          cook_card_id: cookCardId,
          planned_date: selectedDate,
          meal_type: selectedMealType,
        },
        household.id
      );

      // Reload meals
      loadMealPlan();

      Alert.alert('Success', 'Meal added to plan!');
    } catch (error) {
      console.error('Error adding meal:', error);
      Alert.alert('Error', 'Failed to add meal to plan');
    }
  };

  // Remove meal from plan
  const handleRemoveMeal = (mealId: string) => {
    Alert.alert(
      'Remove Meal',
      'Remove this meal from your plan?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMealFromPlan(mealId);
              loadMealPlan();
            } catch (error) {
              console.error('Error removing meal:', error);
              Alert.alert('Error', 'Failed to remove meal');
            }
          },
        },
      ]
    );
  };

  // View meal details (navigate to CookCardScreen)
  const handleMealPress = (meal: PlannedMeal) => {
    if (meal.cook_card?.id) {
      navigation.navigate('CookCard' as never, { cookCardId: meal.cook_card.id } as never);
    }
  };

  // Generate meal plan with AI
  const handleAIGeneration = async () => {
    if (!user || !household || !mealPlan) {
      Alert.alert('Error', 'Unable to generate meal plan');
      return;
    }

    try {
      setAiGenerating(true);

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Call Edge Function
      const { data, error } = await supabase.functions.invoke('generate-meal-plan', {
        body: {
          household_id: household.id,
          meal_plan_id: mealPlan.id,
          user_id: user.id,
          constraints: {
            // Future: Allow user to set these
            dietary_restrictions: [],
            max_prep_time: undefined,
            avoid_ingredients: [],
            preferred_cuisines: [],
          },
        },
      });

      if (error) throw error;

      console.log('AI Response:', data);

      // Show results to user
      Alert.alert(
        'Meal Plan Generated!',
        `AI suggested ${data.meals?.length || 0} meals. ${data.rationale}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add All',
            onPress: async () => {
              // Add all suggested meals
              let addedCount = 0;
              for (const suggestedMeal of data.meals || []) {
                try {
                  await addMealToPlan(
                    {
                      meal_plan_id: mealPlan.id,
                      cook_card_id: suggestedMeal.cook_card_id,
                      planned_date: suggestedMeal.day,
                      meal_type: suggestedMeal.meal_type,
                    },
                    household.id
                  );
                  addedCount++;
                } catch (error) {
                  console.error('Error adding meal:', error);
                }
              }

              loadMealPlan();
              Alert.alert('Success', `Added ${addedCount} meals to your plan!`);
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error generating meal plan:', error);
      Alert.alert('Error', 'Failed to generate meal plan with AI');
    } finally {
      setAiGenerating(false);
    }
  };

  // Generate shopping list from meal plan
  const handleGenerateShoppingList = async () => {
    if (!household || meals.length === 0) {
      Alert.alert('No Meals', 'Add some meals to your plan first!');
      return;
    }

    try {
      Alert.alert(
        'Generate Shopping List',
        `Add ingredients from ${meals.length} meal(s) to your shopping list?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Generate',
            onPress: async () => {
              let addedCount = 0;

              for (const meal of meals) {
                if (meal.cook_card_id && meal.status === 'planned') {
                  try {
                    await addRecipeIngredientsToShoppingList(
                      meal.cook_card_id,
                      household.id,
                      user!.id
                    );
                    addedCount++;
                  } catch (error) {
                    console.error(`Error adding ingredients for ${meal.cook_card_id}:`, error);
                  }
                }
              }

              Alert.alert(
                'Success',
                `Added ingredients from ${addedCount} meal(s) to shopping list!`,
                [
                  {
                    text: 'View List',
                    onPress: () => navigation.navigate('Shopping' as never),
                  },
                  { text: 'OK' },
                ]
              );
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error generating shopping list:', error);
      Alert.alert('Error', 'Failed to generate shopping list');
    }
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading meal plan...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show helpful message if user has no household
  if (!household && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="people-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.errorTitle}>No Household Found</Text>
          <Text style={styles.errorText}>
            Meal planning requires a household. Please join or create a household in your profile settings.
          </Text>
          <Pressable style={styles.retryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.retryButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!mealPlan && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="calendar-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.errorTitle}>Unable to Load Meal Plan</Text>
          <Text style={styles.errorText}>There was a problem loading your meal plan.</Text>
          <Pressable style={styles.retryButton} onPress={loadMealPlan}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const weekRange = getCurrentWeekRange(weekOffset);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Meal Planning</Text>
          <Pressable onPress={handleRefresh} hitSlop={10}>
            <Ionicons name="refresh" size={24} color={theme.colors.textPrimary} />
          </Pressable>
        </View>

        {/* Week Navigation */}
        <View style={styles.weekHeader}>
          <Pressable
            style={styles.weekNavButton}
            onPress={() => setWeekOffset(prev => prev - 1)}
          >
            <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
          </Pressable>

          <View style={styles.weekInfo}>
            <Text style={styles.weekTitle}>{mealPlan.title}</Text>
            <Text style={styles.weekDates}>
              {formatDateRange(weekRange.start, weekRange.end)}
            </Text>
          </View>

          <Pressable
            style={styles.weekNavButton}
            onPress={() => setWeekOffset(prev => prev + 1)}
          >
            <Ionicons name="chevron-forward" size={20} color={theme.colors.primary} />
          </Pressable>
        </View>

        {/* Summary Stats */}
        {summary && summary.totalMeals > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryItem}>
              <Ionicons name="restaurant" size={20} color={theme.colors.primary} />
              <Text style={styles.summaryValue}>{summary.totalMeals}</Text>
              <Text style={styles.summaryLabel}>Meals</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
              <Text style={styles.summaryValue}>{summary.avgPantryMatch}%</Text>
              <Text style={styles.summaryLabel}>Avg Match</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Ionicons name="cart" size={20} color={theme.colors.error} />
              <Text style={styles.summaryValue}>{summary.totalMissingIngredients}</Text>
              <Text style={styles.summaryLabel}>Missing</Text>
            </View>
          </View>
        )}

        {/* Calendar */}
        <View style={styles.calendarSection}>
          <MealPlanCalendar
            meals={meals}
            weekStartDate={weekRange.start}
            onAddMeal={handleAddMeal}
            onMealPress={handleMealPress}
            onRemoveMeal={handleRemoveMeal}
          />
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          {/* AI Generation Button */}
          <Pressable
            style={[styles.secondaryButton, aiGenerating && styles.buttonDisabled]}
            onPress={handleAIGeneration}
            disabled={aiGenerating}
          >
            {aiGenerating ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Ionicons name="sparkles" size={20} color={theme.colors.primary} />
            )}
            <Text style={styles.secondaryButtonText}>
              {aiGenerating ? 'Generating...' : 'AI Generate Meal Plan'}
            </Text>
          </Pressable>

          {meals.length > 0 && (
            <Pressable
              style={styles.primaryButton}
              onPress={handleGenerateShoppingList}
            >
              <Ionicons name="cart" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>Generate Shopping List</Text>
            </Pressable>
          )}

          {meals.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={64} color={theme.colors.textSecondary} />
              <Text style={styles.emptyStateTitle}>No meals planned yet</Text>
              <Text style={styles.emptyStateText}>
                Tap the + button on any meal slot to add a recipe
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Recipe Browser Modal */}
      <RecipeBrowserModal
        visible={browserVisible}
        onClose={() => setBrowserVisible(false)}
        onSelectRecipe={handleSelectRecipe}
        householdId={household?.id || ''}
        mealType={selectedMealType}
      />
    </SafeAreaView>
  );
}

// Helper: Format date range for display
function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });

  if (startMonth === endMonth) {
    return `${startMonth} ${startDate.getDate()}-${endDate.getDate()}`;
  } else {
    return `${startMonth} ${startDate.getDate()} - ${endMonth} ${endDate.getDate()}`;
  }
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xl,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    ...theme.typography.h1,
    color: theme.colors.textPrimary,
  },

  // Week Header
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
  },
  weekNavButton: {
    padding: theme.spacing.sm,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
  },
  weekInfo: {
    alignItems: 'center',
  },
  weekTitle: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
  },
  weekDates: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginTop: theme.spacing.xs,
  },

  // Summary Card
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  summaryValue: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
  },
  summaryLabel: {
    ...theme.typography.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: theme.colors.border,
  },

  // Calendar Section
  calendarSection: {
    marginTop: theme.spacing.md,
  },

  // Actions
  actionsSection: {
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: 12,
    gap: theme.spacing.sm,
  },
  primaryButtonText: {
    ...theme.typography.button,
    color: '#fff',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: theme.spacing.md,
    borderRadius: 12,
    gap: theme.spacing.sm,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    marginBottom: theme.spacing.md,
  },
  secondaryButtonText: {
    ...theme.typography.button,
    color: theme.colors.primary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl * 2,
    gap: theme.spacing.md,
  },
  emptyStateTitle: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
  },
  emptyStateText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.xl,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  loadingText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },

  // Error
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
  },
  errorTitle: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  errorText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    ...theme.typography.button,
    color: '#fff',
  },
});
