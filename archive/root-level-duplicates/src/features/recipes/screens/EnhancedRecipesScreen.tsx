import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
// Icon component removed - using emoji instead for consistency
import { theme } from '../../../core/constants/theme';
import { useEnhancedRecipeStore } from '../../../stores/enhancedRecipeStore';
import { useInventoryStore } from '../../../stores/inventoryStore';
import { useShoppingListStore } from '../../../stores/shoppingListStore';
import { RecipeScore } from '../types';
import { RecipeExplainModal } from '../components/RecipeExplainModal';
import { shoppingListMerger } from '../utils/shoppingListMerger';

const { width: screenWidth } = Dimensions.get('window');

interface RecipeCardProps {
  recipeScore: RecipeScore;
  onPress: () => void;
  onAddToShopping: () => void;
  showUseItUp?: boolean;
  isLarge?: boolean;
}

const RecipeCard: React.FC<RecipeCardProps> = ({
  recipeScore,
  onPress,
  onAddToShopping,
  showUseItUp = false,
  isLarge = false,
}) => {
  const { recipe, matchPercentage, missingIngredients, expiringIngredients } = recipeScore;
  const hasExpiring = expiringIngredients.length > 0;
  const availableCount = recipe.ingredients.length - missingIngredients.length;

  return (
    <Pressable
      style={[styles.recipeCard, isLarge && styles.recipeCardLarge]}
      onPress={onPress}
    >
      {(showUseItUp || hasExpiring) && (
        <View style={styles.useItUpBadge}>
          <Text style={styles.useItUpBadgeIcon}>⚠️</Text>
          <Text style={styles.useItUpBadgeText}>Use it up</Text>
        </View>
      )}

      <View style={styles.recipeImage}>
        <Text style={[styles.recipeImageIcon, isLarge && styles.recipeImageIconLarge]}>🍴</Text>
      </View>

      <View style={styles.recipeContent}>
        <Text style={styles.recipeName} numberOfLines={1}>{recipe.name}</Text>

        <View style={styles.recipeMetaRow}>
          <View style={styles.recipeMetaItem}>
            <Text style={styles.recipeMetaIcon}>⏱️</Text>
            <Text style={styles.recipeMetaText}>{recipe.prepTime + recipe.cookTime}min</Text>
          </View>
          <View style={styles.recipeMetaItem}>
            <Text style={styles.recipeMetaIcon}>👥</Text>
            <Text style={styles.recipeMetaText}>{recipe.servings}</Text>
          </View>
        </View>

        <View style={styles.ingredientStatus}>
          <Text style={styles.haveText}>Have {availableCount}</Text>
          {missingIngredients.length > 0 && (
            <Pressable onPress={onAddToShopping}>
              <Text style={styles.missingText}>Missing {missingIngredients.length}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.tagRow}>
          {recipe.tags.slice(0, 2).map((tag, index) => (
            <View key={index} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.matchContainer}>
        <Text style={styles.matchPercent}>{matchPercentage}% match</Text>
      </View>
    </Pressable>
  );
};

export const EnhancedRecipesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const recipeScores = useEnhancedRecipeStore((state) => state.getRecipeScores);
  const allRecipes = useEnhancedRecipeStore((state) => state.recipes);
  const clearCache = useEnhancedRecipeStore((state) => state.clearScoreCache);
  const inventory = useInventoryStore((state) => state.items);
  const addItemsToShoppingList = useShoppingListStore((state) => state.addBatchItems);

  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRecipeScore, setSelectedRecipeScore] = useState<RecipeScore | null>(null);
  const [explainModalVisible, setExplainModalVisible] = useState(false);
  const [inventoryVersion, setInventoryVersion] = useState(0);

  // Create a stable inventory key for dependency tracking
  const inventoryKey = useMemo(() => {
    return inventory.map(i => `${i.id}:${i.quantity}:${i.updatedAt}`).join(',');
  }, [inventory]);

  // Clear recipe cache and force re-render when inventory changes
  useEffect(() => {
    clearCache();
    setInventoryVersion(prev => prev + 1);
  }, [inventoryKey, clearCache]);

  // Get all recipe scores - with fallback to show all recipes even without inventory
  const [allRecipeScores, setAllRecipeScores] = useState<RecipeScore[]>([]);
  const [isCalculating, setIsCalculating] = useState(true);

  useEffect(() => {
    // Defer heavy computation to avoid blocking UI
    setIsCalculating(true);

    const timer = setTimeout(() => {
      // If no inventory, still show recipes with 0% match
      if (inventory.length === 0) {
        const emptyScores = allRecipes.map(recipe => ({
          recipe,
          totalScore: 0,
          matchPercentage: 0,
          availableIngredients: [],
          missingIngredients: recipe.ingredients.map(ing =>
            ing.parsed?.ingredient || ing.recipeText
          ),
          expiringIngredients: [],
          expiringScore: 0,
          scoreBreakdown: {
            baseMatch: 0,
            expiringBonus: 0,
            categoryBonus: 0,
          }
        }));
        setAllRecipeScores(emptyScores);
        setIsCalculating(false);
        return;
      }

      // Calculate scores in background
      const scores = recipeScores(inventory);
      setAllRecipeScores(scores);
      setIsCalculating(false);
    }, 100);

    return () => clearTimeout(timer);
  }, [inventory, recipeScores, allRecipes, inventoryVersion]);

  // Filter by search
  const searchResults = useMemo(() => {
    if (!searchQuery) return allRecipeScores;

    const query = searchQuery.toLowerCase();
    return allRecipeScores.filter(score =>
      score.recipe.name.toLowerCase().includes(query) ||
      score.recipe.description.toLowerCase().includes(query) ||
      score.recipe.tags.some(tag => tag.toLowerCase().includes(query))
    );
  }, [allRecipeScores, searchQuery]);

  // Categorize recipes like Julienne
  const categorizedRecipes = useMemo(() => {
    const expiringItems = inventory.filter(item => {
      if (!item.expirationDate) return false;
      const daysUntil = Math.ceil(
        (new Date(item.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return daysUntil <= 7;
    });


    const useItUp = allRecipeScores
      .filter(score => score.expiringIngredients && score.expiringIngredients.length > 0)
      .sort((a, b) => (b.expiringIngredients?.length || 0) - (a.expiringIngredients?.length || 0))
      .slice(0, 5);

    const perfectMatch = allRecipeScores
      .filter(score => score.matchPercentage >= 80)  // Lowered from 90% to 80%
      .sort((a, b) => b.matchPercentage - a.matchPercentage)
      .slice(0, 5);

    const discoveries = allRecipeScores
      .filter(score =>
        score.matchPercentage >= 50 &&  // Lowered from 70% to 50%
        score.matchPercentage < 80 &&   // Lowered from 90% to 80%
        (!score.expiringIngredients || score.expiringIngredients.length === 0)
      )
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10);

    const quick = allRecipeScores
      .filter(score => (score.recipe.prepTime + score.recipe.cookTime) <= 30)  // Increased from 20 to 30 minutes
      .sort((a, b) => b.matchPercentage - a.matchPercentage)
      .slice(0, 5);

    const healthy = allRecipeScores
      .filter(score =>
        score.recipe.category === 'healthy' ||
        score.recipe.tags.some(tag =>
          tag.toLowerCase().includes('healthy') ||
          tag.toLowerCase().includes('vegetarian')
        )
      )
      .slice(0, 5);

    return {
      expiringCount: expiringItems.length,
      useItUp,
      perfectMatch,
      discoveries,
      quick,
      healthy,
      all: searchResults
    };
  }, [allRecipeScores, inventory, searchResults]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    clearCache();
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  }, [clearCache]);

  const handleRecipePress = useCallback((recipeScore: RecipeScore) => {
    navigation.navigate('RecipeDetail', {
      recipe: recipeScore.recipe,
      matchedIngredients: recipeScore.availableIngredients,
      missingIngredients: recipeScore.missingIngredients
    });
  }, [navigation]);

  const handleAddToShopping = useCallback(async (recipeScore: RecipeScore) => {
    try {
      // Ensure we have missing ingredients
      if (!recipeScore.missingIngredients || recipeScore.missingIngredients.length === 0) {
        Alert.alert(
          'No Missing Ingredients',
          'All ingredients for this recipe are available in your inventory',
          [{ text: 'OK' }]
        );
        return;
      }

      const items = shoppingListMerger.convertMissingToShoppingItems(
        recipeScore.recipe,
        recipeScore.missingIngredients
      );

      if (items.length > 0) {
        addItemsToShoppingList(items);
        Alert.alert(
          'Added to Shopping List',
          `${items.length} ingredient${items.length > 1 ? 's' : ''} added to your shopping list`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Conversion Error',
          'Failed to convert missing ingredients to shopping items',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error adding to shopping list:', error);
      Alert.alert(
        'Error',
        'Failed to add items to shopping list: ' + (error as Error).message,
        [{ text: 'OK' }]
      );
    }
  }, [addItemsToShoppingList]);

  const renderHorizontalRecipes = (recipes: RecipeScore[], showBadge: boolean = false) => (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={recipes}
      keyExtractor={(item) => item.recipe.id}
      renderItem={({ item }) => (
        <RecipeCard
          recipeScore={item}
          onPress={() => handleRecipePress(item)}
          onAddToShopping={() => handleAddToShopping(item)}
          showUseItUp={showBadge}
          isLarge
        />
      )}
      contentContainerStyle={styles.horizontalContent}
    />
  );

  const renderSection = (title: string, iconName: string, recipes: RecipeScore[], showBadge: boolean = false) => {
    if (recipes.length === 0) return null;

    return (
      <View style={styles.discoverySection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionIcon}>{iconName}</Text>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionCount}>{recipes.length}</Text>
        </View>
        {renderHorizontalRecipes(recipes, showBadge)}
      </View>
    );
  };

  // Show loading state during initial calculation
  if (isCalculating) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Recipes</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Finding recipes for you...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        {/* Header */}
        <View style={styles.headerContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Recipes</Text>

            <View style={styles.searchBar}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search recipes..."
                placeholderTextColor={theme.colors.textLight}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery !== '' && (
                <Pressable onPress={() => setSearchQuery('')}>
                  <Text style={styles.clearIcon}>✖</Text>
                </Pressable>
              )}
            </View>

            {/* Debug info - remove in production */}
            {__DEV__ && (
              <Text style={styles.debugText}>
                Inventory: {inventory.length} items (v{inventoryVersion}) | Recipes: {allRecipes.length} | Cache cleared
              </Text>
            )}
          </View>
        </View>

        {/* Search Results */}
        {searchQuery ? (
          <View style={styles.searchResults}>
            <Text style={styles.searchResultsTitle}>
              {categorizedRecipes.all.length} results for "{searchQuery}"
            </Text>
            {categorizedRecipes.all.map((score) => (
              <RecipeCard
                key={score.recipe.id}
                recipeScore={score}
                onPress={() => handleRecipePress(score)}
                onAddToShopping={() => handleAddToShopping(score)}
              />
            ))}
            {categorizedRecipes.all.length === 0 && (
              <View style={styles.noResults}>
                <Text style={styles.noResultsIcon}>🔍</Text>
                <Text style={styles.noResultsText}>No recipes found</Text>
              </View>
            )}
          </View>
        ) : (
          <>
            {/* Use it up Alert */}
            {categorizedRecipes.expiringCount > 0 && (
              <View style={styles.useItUpAlert}>
                <Text style={styles.warningIcon}>⚠️</Text>
                <Text style={styles.alertTitle}>Use it up</Text>
                <Text style={styles.alertSubtitle}>
                  {categorizedRecipes.expiringCount} items expiring ≤7d
                </Text>
              </View>
            )}

            {/* Discovery Sections */}
            {renderSection('Use It Up', '⏰', categorizedRecipes.useItUp, true)}
            {renderSection('Perfect Match', '⭐', categorizedRecipes.perfectMatch)}
            {renderSection('Discoveries', '✨', categorizedRecipes.discoveries)}
            {renderSection('Quick & Easy', '⚡', categorizedRecipes.quick)}
            {renderSection('Healthy Choices', '🥗', categorizedRecipes.healthy)}

            {/* All Recipes Section */}
            <View style={styles.allRecipesSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>🍴</Text>
                <Text style={styles.sectionTitle}>All Recipes</Text>
                <Text style={styles.sectionCount}>{allRecipeScores.length}</Text>
              </View>

              <View style={styles.recipeList}>
                {allRecipeScores.slice(0, 20).map((score) => (
                  <RecipeCard
                    key={score.recipe.id}
                    recipeScore={score}
                    onPress={() => handleRecipePress(score)}
                    onAddToShopping={() => handleAddToShopping(score)}
                  />
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Explainability Modal */}
      <RecipeExplainModal
        visible={explainModalVisible}
        onClose={() => setExplainModalVisible(false)}
        recipeScore={selectedRecipeScore}
        inventory={inventory}
      />

      {/* FAB for adding new recipe */}
      <Pressable
        style={styles.fab}
        onPress={() => navigation.navigate('RecipeForm')}
      >
        <Text style={styles.fabIcon}>➕</Text>
      </Pressable>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerContainer: {
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...theme.typography.body,
    color: theme.colors.text,
    padding: 0,
  },
  debugText: {
    fontSize: 10,
    color: theme.colors.textLight,
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  useItUpAlert: {
    backgroundColor: '#FEE2E2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.pill,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  alertSubtitle: {
    fontSize: 12,
    color: '#DC2626',
  },
  discoverySection: {
    marginBottom: theme.spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  sectionEmoji: {
    fontSize: 20,
    marginRight: theme.spacing.xs,
  },
  sectionTitle: {
    ...theme.typography.h3,
    color: theme.colors.text,
    flex: 1,
  },
  sectionCount: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  horizontalContent: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  },
  allRecipesSection: {
    marginBottom: 80, // Space for FAB
  },
  recipeList: {
    paddingHorizontal: theme.spacing.md,
  },
  recipeCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  recipeCardLarge: {
    width: screenWidth * 0.75,
    padding: theme.spacing.md,
  },
  useItUpBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderTopLeftRadius: theme.borderRadius.md,
    borderBottomRightRadius: theme.borderRadius.md,
    gap: 4,
    zIndex: 1,
  },
  useItUpBadgeText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  recipeImage: {
    width: 80,
    height: 80,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  recipeContent: {
    flex: 1,
    justifyContent: 'center',
  },
  recipeName: {
    ...theme.typography.bodyBold,
    color: theme.colors.text,
    marginBottom: 4,
  },
  recipeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: 6,
  },
  recipeMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  recipeMetaText: {
    fontSize: 11,
    color: theme.colors.textLight,
  },
  ingredientStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: 6,
  },
  haveText: {
    fontSize: 12,
    color: theme.colors.text,
  },
  missingText: {
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '500',
  },
  tagRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  tag: {
    backgroundColor: theme.colors.background,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.xs,
  },
  tagText: {
    fontSize: 10,
    color: theme.colors.textLight,
  },
  matchContainer: {
    marginLeft: theme.spacing.sm,
  },
  matchPercent: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  searchResults: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 80,
  },
  searchResultsTitle: {
    ...theme.typography.body,
    color: theme.colors.textLight,
    marginVertical: theme.spacing.md,
  },
  noResults: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  noResultsText: {
    ...theme.typography.body,
    color: theme.colors.textLight,
    marginTop: theme.spacing.md,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  useItUpBadgeIcon: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  recipeImageIcon: {
    fontSize: 40,
    color: theme.colors.textLight,
  },
  recipeImageIconLarge: {
    fontSize: 48,
  },
  recipeMetaIcon: {
    fontSize: 12,
  },
  fabIcon: {
    fontSize: 28,
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xl * 4,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    ...theme.typography.body,
    color: theme.colors.textLight,
  },
});