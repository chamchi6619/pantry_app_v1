import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Alert,
  InteractionManager,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { theme } from '../../../core/constants/theme';
import { Recipe, RecipeIngredient } from '../types';
import { useInventoryStore } from '../../../stores/inventoryStore';
import { useShoppingListStore } from '../../../stores/shoppingListStore';
import { shoppingListMerger } from '../utils/shoppingListMerger';
import { matchIngredientToInventory } from '../utils/simpleMatcher';
import { normalizeName } from '../utils/normalizer';

type RecipeDetailRouteParams = {
  RecipeDetail: {
    recipe: Recipe;
    matchedIngredients?: string[];
    missingIngredients?: string[];
  };
};

interface IngredientItemProps {
  ingredient: RecipeIngredient;
  isAvailable: boolean;
  onToggle: () => void;
  checked: boolean;
}

const IngredientItem: React.FC<IngredientItemProps> = ({
  ingredient,
  isAvailable,
  onToggle,
  checked,
}) => {
  const statusColor = isAvailable ? '#10B981' : '#F59E0B';

  return (
    <Pressable style={styles.ingredientItem} onPress={onToggle}>
      <View style={styles.ingredientCheckbox}>
        <Text style={[styles.checkboxIcon, { color: checked ? '#10B981' : '#9CA3AF' }]}>
          {checked ? '☑' : '☐'}
        </Text>
      </View>
      <Text style={[styles.ingredientText, checked && styles.ingredientTextChecked]}>
        {ingredient.recipeText}
      </Text>
      <Text style={[styles.statusIcon, { color: statusColor }]}>
        {isAvailable ? '✓' : '🛒'}
      </Text>
    </Pressable>
  );
};

export const RecipeDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RecipeDetailRouteParams, 'RecipeDetail'>>();
  const { recipe } = route.params || {};

  // If no recipe provided, show error
  if (!recipe || !recipe.ingredients || !Array.isArray(recipe.ingredients)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Recipe not found</Text>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [servingsMultiplier, setServingsMultiplier] = useState(1);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [ingredientAvailability, setIngredientAvailability] = useState<Record<string, boolean>>({});

  const inventory = useInventoryStore((state) => state.items);
  const inventoryVersion = useInventoryStore((state) => state.version || 0);
  const shoppingItems = useShoppingListStore((state) => state.items);
  const addShoppingItem = useShoppingListStore((state) => state.addItem);
  const updateShoppingItem = useShoppingListStore((state) => state.updateItem);

  // Pre-normalize inventory items once
  const inventoryNorms = useMemo(() => {
    return inventory.map(item => item.normalized || normalizeName(item.name));
  }, [inventory, inventoryVersion]);

  // Check ingredient availability when recipe or inventory changes
  useEffect(() => {
    if (!recipe?.ingredients) return;
    if (inventoryNorms.length === 0) {
      // If no inventory, mark all as missing
      const availability: Record<string, boolean> = {};
      recipe.ingredients.forEach(ing => {
        availability[ing.id] = false;
      });
      setIngredientAvailability(availability);
      setAvailabilityLoading(false);
      console.log('No inventory items, marking all as missing');
      return;
    }

    // Delay computation slightly to let navigation animation complete
    const timeout = setTimeout(() => {
      const availability: Record<string, boolean> = {};

      console.log('=== CHECKING AVAILABILITY ===');
      console.log('Recipe ingredients:', recipe.ingredients);
      console.log('Inventory normalized:', inventoryNorms);

      if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
        for (const recipeIngredient of recipe.ingredients) {
          if (recipeIngredient?.parsed?.ingredient) {
            const ingredientNorm = normalizeName(recipeIngredient.parsed.ingredient);
            const match = matchIngredientToInventory(ingredientNorm, inventoryNorms);
            availability[recipeIngredient.id] = match.isAvailable;
            console.log(`Ingredient "${recipeIngredient.parsed.ingredient}" (${ingredientNorm}): ${match.isAvailable ? 'AVAILABLE' : 'MISSING'} - ${match.reason}`);
          } else {
            // If no parsed data, mark as missing
            availability[recipeIngredient.id] = false;
            console.log(`Ingredient ${recipeIngredient.id} has no parsed data, marking as MISSING`);
          }
        }
      }

      console.log('Final availability:', availability);
      setIngredientAvailability(availability);
      setAvailabilityLoading(false);
    }, 300); // Delay to allow smooth navigation

    return () => clearTimeout(timeout);
  }, [recipe, inventoryNorms]); // Re-run when recipe or inventory changes

  // Memoize calculations to prevent re-computation during swipe
  const availableCount = useMemo(() =>
    Object.values(ingredientAvailability).filter(Boolean).length,
    [ingredientAvailability]
  );
  const totalIngredients = recipe.ingredients?.length || 0;
  const matchPercentage = useMemo(() =>
    totalIngredients > 0 ? Math.round((availableCount / totalIngredients) * 100) : 0,
    [availableCount, totalIngredients]
  );

  const handleToggleIngredient = (id: string) => {
    setCheckedIngredients((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleToggleStep = (index: number) => {
    setCheckedSteps((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleAddMissingToShopping = () => {
    console.log('=== ADD MISSING DEBUG ===');
    console.log('Recipe ingredients:', recipe.ingredients);
    console.log('Ingredient availability:', ingredientAvailability);
    console.log('Checked ingredients:', checkedIngredients);

    // Get ingredients to add to shopping list:
    // 1. All unchecked ingredients that are missing (not in inventory)
    // 2. All checked ingredients (regardless of inventory status)
    const ingredientsToAdd = (recipe.ingredients || []).filter((ing) => {
      const isChecked = checkedIngredients.has(ing.id);
      const isAvailable = ingredientAvailability[ing.id];

      // Add if: checked (user wants it) OR (unchecked AND missing from inventory)
      return isChecked || (!isChecked && !isAvailable);
    });

    console.log('Ingredients to add to shopping:', ingredientsToAdd);

    if (ingredientsToAdd.length === 0) {
      Alert.alert('All Set!', 'You have all the unchecked ingredients for this recipe.');
      return;
    }

    // Apply serving multiplier to ingredient quantities
    const adjustedIngredients = ingredientsToAdd.map(ing => ({
      ...ing,
      requiredQuantity: (ing.requiredQuantity || ing.parsed?.quantity || 1) * servingsMultiplier,
      parsed: ing.parsed ? {
        ...ing.parsed,
        quantity: (ing.parsed.quantity || 1) * servingsMultiplier
      } : undefined
    }));

    // Create a recipe with adjusted ingredients to pass to the merger
    const recipeForMerge = {
      ...recipe,
      name: recipe.name || 'Recipe',
      ingredients: adjustedIngredients,
    };

    console.log('Recipe for merge:', recipeForMerge);
    console.log('Current shopping items:', shoppingItems);

    // Process the ingredients
    // Pass actual inventory so quantities are calculated correctly
    const mergeResult = shoppingListMerger.mergeRecipeIngredients(
      recipeForMerge,
      inventory, // Use actual inventory for proper quantity calculation
      shoppingItems
    );

    console.log('Merge result:', mergeResult);

    // Add new items to shopping list
    for (const item of mergeResult.itemsToAdd) {
      addShoppingItem(item);
    }

    // Update existing items' quantities
    for (const update of mergeResult.itemsToUpdate || []) {
      updateShoppingItem(update.id, update.updates);
    }

    // Clear checked ingredients after adding
    setCheckedIngredients(new Set());

    Alert.alert(
      'Added to Shopping List',
      `Added ${mergeResult.newItems} ingredients to your shopping list.${
        mergeResult.mergedItems > 0
          ? ` Updated quantities for ${mergeResult.mergedItems} existing items.`
          : ''
      }`
    );
  };

  const adjustServings = (direction: 'increase' | 'decrease') => {
    setServingsMultiplier((prev) => {
      if (direction === 'increase') {
        return Math.min(prev + 0.5, 10);
      } else {
        return Math.max(prev - 0.5, 0.5);
      }
    });
  };

  const formatQuantity = (quantity: number | null, multiplier: number) => {
    if (!quantity) return '';
    const adjusted = quantity * multiplier;
    // Format nicely - show fractions for common values
    if (adjusted % 1 === 0) return adjusted.toString();
    if (adjusted % 0.5 === 0) {
      const whole = Math.floor(adjusted);
      return whole > 0 ? `${whole}½` : '½';
    }
    return adjusted.toFixed(2);
  };

  const getTimeString = () => {
    const totalTime = recipe.prepTime + recipe.cookTime;
    return `⏱️ ${recipe.prepTime}min prep • ${recipe.cookTime}min cook • ${totalTime}min total`;
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return '#10B981';
      case 'medium':
        return '#F59E0B';
      case 'hard':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.iconText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recipe</Text>
        <TouchableOpacity style={styles.favoriteButton}>
          <Text style={styles.iconText}>♡</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        scrollEventThrottle={16}
        decelerationRate="fast"
        overScrollMode="never"
      >
        {/* Recipe Image Placeholder */}
        <View style={styles.imageContainer}>
          <Text style={styles.imagePlaceholder}>
            {recipe.category === 'quick'
              ? '⚡'
              : recipe.category === 'healthy'
              ? '🥗'
              : recipe.category === 'comfort'
              ? '🍲'
              : recipe.category === 'dessert'
              ? '🍰'
              : '🍴'}
          </Text>
        </View>

        {/* Recipe Info */}
        <View style={styles.recipeInfo}>
          <Text style={styles.recipeName}>{recipe.name}</Text>
          <Text style={styles.recipeDescription}>{recipe.description}</Text>

          {/* Meta Info */}
          <View style={styles.metaContainer}>
            <View style={styles.metaBadge}>
              <Text style={styles.metaText}>{getTimeString()}</Text>
            </View>
            <View
              style={[
                styles.difficultyBadge,
                { backgroundColor: getDifficultyColor(recipe.difficulty) + '20' },
              ]}
            >
              <Text style={[styles.difficultyText, { color: getDifficultyColor(recipe.difficulty) }]}>
                {recipe.difficulty}
              </Text>
            </View>
          </View>

          {/* Tags */}
          <View style={styles.tagsContainer}>
            {recipe.tags.map((tag, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>

          {/* Match Status */}
          <View style={styles.matchStatus}>
            {availabilityLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Checking pantry...</Text>
              </View>
            ) : (
              <>
                <View style={styles.matchBar}>
                  <View style={[styles.matchBarFill, { width: `${matchPercentage}%` }]} />
                </View>
                <Text style={styles.matchText}>
                  {availableCount} of {totalIngredients} ingredients available ({matchPercentage}%)
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Servings Adjuster */}
        <View style={styles.servingsContainer}>
          <Text style={styles.sectionTitle}>Servings</Text>
          <View style={styles.servingsAdjuster}>
            <TouchableOpacity
              onPress={() => adjustServings('decrease')}
              style={styles.servingButton}
            >
              <Text style={[styles.servingIcon, { color: theme.colors.primary }]}>➖</Text>
            </TouchableOpacity>
            <View style={styles.servingsDisplay}>
              <Text style={styles.servingsNumber}>
                {Math.round((recipe.servings || 4) * servingsMultiplier)}
              </Text>
              <Text style={styles.servingsLabel}>
                {servingsMultiplier !== 1 && `(${servingsMultiplier}x)`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => adjustServings('increase')}
              style={styles.servingButton}
            >
              <Text style={[styles.servingIcon, { color: theme.colors.primary }]}>➕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Ingredients */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            <TouchableOpacity
              onPress={handleAddMissingToShopping}
              style={styles.addToShoppingButton}
            >
              <Text style={[styles.cartIcon, { color: '#F59E0B' }]}>🛒</Text>
              <Text style={styles.addToShoppingText}>Add Missing</Text>
            </TouchableOpacity>
          </View>

          {(recipe.ingredients || []).map((ingredient) => {
            const adjustedIngredient = {
              ...ingredient,
              recipeText: ingredient?.parsed?.quantity
                ? ingredient.recipeText.replace(
                    ingredient.parsed.quantity.toString(),
                    formatQuantity(ingredient.parsed.quantity, servingsMultiplier)
                  )
                : ingredient?.recipeText || '',
            };

            return (
              <IngredientItem
                key={ingredient.id}
                ingredient={adjustedIngredient}
                isAvailable={ingredientAvailability[ingredient.id]}
                onToggle={() => handleToggleIngredient(ingredient.id)}
                checked={checkedIngredients.has(ingredient.id)}
              />
            );
          })}
        </View>

        {/* Instructions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Instructions</Text>

          {recipe.instructions.map((instruction, index) => (
            <Pressable
              key={index}
              style={styles.instructionItem}
              onPress={() => handleToggleStep(index)}
            >
              <View
                style={[
                  styles.stepNumber,
                  checkedSteps.has(index) && styles.stepNumberChecked,
                ]}
              >
                <Text
                  style={[
                    styles.stepNumberText,
                    checkedSteps.has(index) && styles.stepNumberTextChecked,
                  ]}
                >
                  {index + 1}
                </Text>
              </View>
              <Text
                style={[
                  styles.instructionText,
                  checkedSteps.has(index) && styles.instructionTextChecked,
                ]}
              >
                {instruction}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Nutrition (if available) */}
        {recipe.nutrition && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Nutrition per Serving</Text>
            <View style={styles.nutritionGrid}>
              <View style={styles.nutritionItem}>
                <Text style={styles.nutritionValue}>{recipe.nutrition.calories}</Text>
                <Text style={styles.nutritionLabel}>Calories</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Text style={styles.nutritionValue}>{recipe.nutrition.protein}g</Text>
                <Text style={styles.nutritionLabel}>Protein</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Text style={styles.nutritionValue}>{recipe.nutrition.carbs}g</Text>
                <Text style={styles.nutritionLabel}>Carbs</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Text style={styles.nutritionValue}>{recipe.nutrition.fat}g</Text>
                <Text style={styles.nutritionLabel}>Fat</Text>
              </View>
            </View>
          </View>
        )}

        {/* Cook Now Button */}
        <TouchableOpacity style={styles.cookNowButton}>
          <Text style={styles.cookIcon}>🍴</Text>
          <Text style={styles.cookNowText}>Start Cooking</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  favoriteButton: {
    padding: 4,
  },
  imageContainer: {
    height: 250,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholder: {
    fontSize: 80,
  },
  recipeInfo: {
    padding: theme.spacing.lg,
  },
  recipeName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  recipeDescription: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    lineHeight: 22,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  metaBadge: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
  },
  metaText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  difficultyBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
  },
  difficultyText: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  tag: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    color: '#4338CA',
    fontWeight: '500',
  },
  matchStatus: {
    marginTop: theme.spacing.sm,
  },
  matchBar: {
    height: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: theme.spacing.xs,
  },
  matchBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  matchText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  loadingText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  servingsContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  servingsAdjuster: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xl,
    marginTop: theme.spacing.sm,
  },
  servingButton: {
    padding: 4,
  },
  servingsDisplay: {
    alignItems: 'center',
  },
  servingsNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  servingsLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  section: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
  },
  addToShoppingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
  },
  addToShoppingText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#92400E',
  },
  ingredientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  ingredientCheckbox: {
    marginRight: theme.spacing.sm,
  },
  ingredientText: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
    lineHeight: 20,
  },
  ingredientTextChecked: {
    textDecorationLine: 'line-through',
    color: theme.colors.textLight,
  },
  instructionItem: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  stepNumberChecked: {
    backgroundColor: '#10B981',
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  stepNumberTextChecked: {
    color: 'white',
  },
  instructionText: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
    lineHeight: 22,
  },
  instructionTextChecked: {
    textDecorationLine: 'line-through',
    color: theme.colors.textLight,
  },
  nutritionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
  },
  nutritionItem: {
    alignItems: 'center',
  },
  nutritionValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  nutritionLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  cookNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    paddingVertical: 16,
    borderRadius: theme.borderRadius.md,
  },
  cookNowText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  iconText: {
    fontSize: 24,
    color: theme.colors.text,
  },
  checkboxIcon: {
    fontSize: 20,
  },
  statusIcon: {
    fontSize: 16,
  },
  servingIcon: {
    fontSize: 28,
  },
  cartIcon: {
    fontSize: 20,
  },
  cookIcon: {
    fontSize: 20,
    color: 'white',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  errorText: {
    fontSize: 18,
    color: theme.colors.textLight,
    marginBottom: theme.spacing.lg,
  },
  backButtonText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});