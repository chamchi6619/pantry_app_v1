import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { theme } from '../../../core/constants/theme';
import { Recipe, RecipeIngredient } from '../types';
import { useInventoryStore } from '../../../stores/inventoryStore';
import { useShoppingListStore } from '../../../stores/shoppingListStore';
import { ingredientMatcher } from '../utils/ingredientMatcher';
import { shoppingListMerger } from '../utils/shoppingListMerger';
import recipeConfig from '../config/recipeConfig.json';

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
  const { recipe } = route.params;

  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [servingsMultiplier, setServingsMultiplier] = useState(1);

  const inventory = useInventoryStore((state) => state.items);
  const shoppingItems = useShoppingListStore((state) => state.items);
  const addShoppingItem = useShoppingListStore((state) => state.addItem);

  // Check which ingredients are available
  const ingredientAvailability = useMemo(() => {
    const availability: Record<string, boolean> = {};

    console.log('🔍 Checking ingredient availability for:', recipe.name);
    console.log('📦 Inventory items:', inventory.length);
    console.log('🧪 Recipe ingredients:', recipe.ingredients.length);
    console.log('Confidence threshold:', recipeConfig.matching.minConfidence);

    for (const recipeIngredient of recipe.ingredients) {
      let isAvailable = false;
      const parsed = recipeIngredient.parsed;

      console.log(`  Checking "${parsed.ingredient}"...`);

      for (const invItem of inventory) {
        const matchResult = ingredientMatcher.match(
          invItem.name,
          parsed.ingredient
        );

        console.log(`    vs "${invItem.name}": confidence=${matchResult.confidence.toFixed(2)}`);

        if (matchResult.confidence >= recipeConfig.matching.minConfidence) {
          console.log(`    ✅ Match found!`);
          // Check quantity if needed
          if (recipeIngredient.requiredQuantity && invItem.quantity) {
            isAvailable = invItem.quantity >= recipeIngredient.requiredQuantity * servingsMultiplier;
          } else {
            isAvailable = true;
          }
          break;
        }
      }

      availability[recipeIngredient.id] = isAvailable;
      console.log(`  Result: ${isAvailable ? '✅ Available' : '❌ Not available'}`);
    }

    return availability;
  }, [recipe.ingredients, inventory, servingsMultiplier]);

  const availableCount = Object.values(ingredientAvailability).filter(Boolean).length;
  const totalIngredients = recipe.ingredients.length;
  const matchPercentage = Math.round((availableCount / totalIngredients) * 100);

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
    const missingIngredients = recipe.ingredients.filter(
      (ing) => !ingredientAvailability[ing.id]
    );

    if (missingIngredients.length === 0) {
      Alert.alert('All Set!', 'You have all the ingredients for this recipe.');
      return;
    }

    const mergeResult = shoppingListMerger.mergeRecipeIngredients(
      recipe,
      inventory,
      shoppingItems
    );

    // Add new items to shopping list
    for (const item of mergeResult.itemsToAdd) {
      addShoppingItem(item);
    }

    Alert.alert(
      'Added to Shopping List',
      `Added ${mergeResult.newItems} missing ingredients to your shopping list.${
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

      <ScrollView showsVerticalScrollIndicator={false}>
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
            <View style={styles.matchBar}>
              <View style={[styles.matchBarFill, { width: `${matchPercentage}%` }]} />
            </View>
            <Text style={styles.matchText}>
              {availableCount} of {totalIngredients} ingredients available ({matchPercentage}%)
            </Text>
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
                {Math.round(recipe.servings * servingsMultiplier)}
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

          {recipe.ingredients.map((ingredient) => {
            const adjustedIngredient = {
              ...ingredient,
              recipeText: ingredient.parsed.quantity
                ? ingredient.recipeText.replace(
                    ingredient.parsed.quantity.toString(),
                    formatQuantity(ingredient.parsed.quantity, servingsMultiplier)
                  )
                : ingredient.recipeText,
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
});