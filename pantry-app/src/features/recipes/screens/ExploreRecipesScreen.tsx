import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  Pressable,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { shallow } from 'zustand/shallow';
import { FlashList } from '@shopify/flash-list';

// Components
import { HeroCard } from '../components/HeroCard';
import { SegmentedControl } from '../components/SegmentedControl';
import { ScrollableCategories } from '../components/ScrollableCategories';
import { RecipeCard } from '../components/RecipeCard';
import { SectionHeader } from '../components/SectionHeader';
import { CuisineChips } from '../components/CuisineChips';
import { PantryCTA } from '../components/PantryCTA';
import { PantryMatchingBanner } from '../components/PantryMatchingBanner';

// Hooks
import { useSupabaseRecipes } from '../../../hooks/useSupabaseRecipes';

// Stores
import { useInventoryStore } from '../../../stores/inventoryStore';
import { useMatchJobStore } from '../../../stores/matchJobStore';
import { theme } from '../../../core/constants/theme';

const { width: screenWidth } = Dimensions.get('window');

// Hero recipes now come from Supabase (v5.2 RuleChef recipes)
// Use the first 3 categoryRecipes as hero recipes
const heroRecipes = categoryRecipes.slice(0, 3).map(recipe => ({
  ...recipe,
  subtitle: 'Featured Recipe',
}));

// Note: Ingredients now come from Supabase recipes (v5.2)

export const ExploreRecipesScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  // State
  const [activeMode, setActiveMode] = useState<'Explore' | 'From Your Pantry'>('Explore');
  const [activeCategory, setActiveCategory] = useState('Popular');
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);

  // Store selectors
  const items = useInventoryStore(state => state.items);
  const invVersion = useInventoryStore(state => state.version);

  // Match job store
  const status = useMatchJobStore((state) => state.status);
  const progressTotal = useMatchJobStore((state) => state.progress.total);
  const progressDone = useMatchJobStore((state) => state.progress.done);
  const results = useMatchJobStore((state) => state.results, shallow);
  const startJob = useMatchJobStore((state) => state.startJob);
  const getResult = useMatchJobStore((state) => state.getResult);
  const cancelJob = useMatchJobStore((state) => state.cancelJob);

  // Categories
  const exploreCategories = ['Popular', 'Quick & Easy', 'Healthy', 'Vegetarian', 'Comfort Food', 'Desserts', 'Breakfast'];
  const pantryCategories = ['Use Soon', 'High Match', 'Popular', 'Quick & Easy'];
  const cuisines = ['Italian', 'Asian', 'Mexican', 'Mediterranean', 'American', 'Indian', 'French'];

  // Get current categories based on mode
  const currentCategories = activeMode === 'From Your Pantry' ? pantryCategories : exploreCategories;

  // Map app categories to database categories
  const mapCategoryToDb = (category: string): string => {
    const categoryMap: Record<string, string> = {
      'Popular': 'all',
      'Quick & Easy': 'quick',
      'Healthy': 'healthy',
      'Vegetarian': 'healthy',
      'Comfort Food': 'comfort',
      'Desserts': 'dessert',
      'Breakfast': 'breakfast',
      'Use Soon': 'all',
      'High Match': 'all'
    };
    return categoryMap[category] || 'all';
  };

  // Fetch real recipes from Supabase (v5.2)
  const { recipes: supabaseRecipes, loading: recipesLoading, error: recipesError } = useSupabaseRecipes({
    category: mapCategoryToDb(activeCategory),
    limit: 50,
    enabled: activeMode === 'Explore' // Only fetch for Explore mode for now
  });

  // Safe recipe transformation with null checks
  // Note: Supabase recipes are already properly formatted, this is just for fallback
  const transformRecipes = (recipes: any[]): any[] => {
    if (!recipes || !Array.isArray(recipes)) {
      return [];
    }

    return recipes
      .filter(recipe => recipe && typeof recipe === 'object' && recipe.id) // Filter out null/undefined/invalid recipes
      .map(recipe => ({
        ...recipe, // Keep all existing fields (including ingredients from Supabase)
        id: recipe.id || `recipe-${Math.random()}`,
        name: recipe.name || 'Unnamed Recipe',
        imageUrl: recipe.imageUrl || recipe.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
        creator: recipe.creator || recipe.author || 'Community Chef',
        cookTime: recipe.cookTime || recipe.totalTime || '30 min',
        difficulty: recipe.difficulty || 'Medium',
        category: recipe.category || 'Popular',
        // Ingredients already come from Supabase recipes
      }));
  };

  // Get recipes based on category with robust error handling
  const getCategoryRecipes = (): any[] => {
    try {
      // Use real Supabase recipes for Explore mode
      if (activeMode === 'Explore' && supabaseRecipes && supabaseRecipes.length > 0) {
        return supabaseRecipes;
      }

      // For pantry mode or if no Supabase recipes, return empty for now
      // TODO: Implement pantry matching with Supabase recipes
      return [];
    } catch (error) {
      console.error('Error getting category recipes:', error);
      return [];
    }
  };

  // All recipes for the current category
  const categoryRecipes = getCategoryRecipes();

  // Get expiring ingredients
  const getExpiringIngredients = useCallback(() => {
    try {
      if (!items || !Array.isArray(items)) return [];

      const expiringItems = items
        .filter(item => {
          if (!item || !item.expirationDate) return false;
          const dateParts = item.expirationDate.split('-');
          if (dateParts.length !== 3) return false;

          const [year, month, day] = dateParts.map(Number);
          if (isNaN(year) || isNaN(month) || isNaN(day)) return false;

          const expiry = new Date(year, month - 1, day);
          const daysUntil = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return daysUntil <= 7 && daysUntil > 0;
        })
        .map(item => item.name || 'Unknown Item');
      return expiringItems;
    } catch (error) {
      console.error('Error getting expiring ingredients:', error);
      return [];
    }
  }, [items]);

  // Create pantry fingerprint to detect actual changes (not just reference changes)
  const pantryFingerprint = React.useMemo(() => {
    if (!items || items.length === 0) return '';
    return items
      .map(item => item.normalized || item.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .sort()
      .join('|');
  }, [items]);

  // Start matching when entering pantry mode or when pantry fingerprint changes
  useEffect(() => {
    if (activeMode === 'From Your Pantry' && categoryRecipes.length > 0 && pantryFingerprint) {
      // Debounce to prevent rapid re-matching
      const timeout = setTimeout(() => {
        startJob(categoryRecipes, items || [], invVersion);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [activeMode, categoryRecipes.length, pantryFingerprint, invVersion, startJob]);

  // Navigation functions
  const handleRecipePress = (recipeId: string) => {
    if (!recipeId) return;

    // Find recipe from all available sources
    const recipe = categoryRecipes.find(r => r.id === recipeId) ||
                   trendingRecipes.find(r => r?.id === recipeId) ||
                   fiveIngredientRecipes.find(r => r?.id === recipeId) ||
                   heroRecipes.find(r => r.id === recipeId);

    if (recipe) {
      console.log('=== PASSING RECIPE TO DETAIL ===');
      console.log('Recipe ID:', recipe.id);
      console.log('Recipe Name:', recipe.name);
      console.log('Recipe ingredients:', recipe.ingredients);
      console.log('Ingredients count:', recipe.ingredients?.length || 0);

      // Supabase recipes already have ingredients, just ensure required fields exist
      const detailRecipe = {
        ...recipe,
        ingredients: recipe.ingredients || [], // Use Supabase ingredients or empty array
        instructions: recipe.instructions || [],
        tags: recipe.tags || [],
        nutrition: recipe.nutrition || { calories: 0, protein: 0, carbs: 0, fat: 0 }
      };

      console.log('Detail recipe ingredients:', detailRecipe.ingredients);
      console.log('Detail ingredients count:', detailRecipe.ingredients?.length || 0);

      navigation.navigate('RecipeDetail', { recipe: detailRecipe });
    } else {
      console.warn(`Recipe ${recipeId} not found`);
    }
  };

  const handleScanPress = () => {
    navigation.navigate('ReceiptCapture');
  };

  // Filter recipes by cuisine with null safety
  const filteredRecipes = (() => {
    try {
      if (!selectedCuisine || !categoryRecipes || categoryRecipes.length === 0) {
        return categoryRecipes;
      }
      return categoryRecipes.filter(r => r && r.cuisine === selectedCuisine);
    } catch (error) {
      console.error('Error filtering recipes:', error);
      return categoryRecipes;
    }
  })();

  // Get recipe with match data - with null safety
  const getRecipeWithMatch = (recipe: any) => {
    if (!recipe) {
      return {
        id: 'error-recipe',
        name: 'Error Loading Recipe',
        imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
        creator: 'Unknown',
        ingredients: [], // Empty array if no recipe
      };
    }

    try {
      const result = recipe.id ? getResult(recipe.id) : null;
      return {
        ...recipe,
        imageUrl: recipe.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
        creator: recipe.creator || 'Community Chef',
        matchPercentage: result?.pct || recipe.matchPercentage,
        hasExpiring: result?.hasExpiring,
        // Ingredients come from Supabase recipe (already transformed)
      };
    } catch (error) {
      console.error('Error getting recipe with match:', error);
      return recipe; // Return recipe as-is if error
    }
  };

  // Render recipe item for FlatList with comprehensive null checks
  const renderRecipeItem = ({ item }: { item: any }) => {
    if (!item) return null;

    try {
      const recipeWithMatch = getRecipeWithMatch(item);
      const ingredients = recipeWithMatch.ingredients || [];
      const ingredientCount = Array.isArray(ingredients) ? ingredients.length : 0;

      return (
        <RecipeCard
          recipe={recipeWithMatch}
          variant="carousel"
          onPress={() => handleRecipePress(recipeWithMatch.id)}
          matchPercentage={activeMode === 'From Your Pantry' ? recipeWithMatch.matchPercentage : undefined}
          showMatchBadge={activeMode === 'From Your Pantry'}
          pantryInfo={
            activeMode === 'From Your Pantry'
              ? {
                  haveCount: Math.round((recipeWithMatch.matchPercentage || 0) / 100 * ingredientCount),
                  totalCount: ingredientCount,
                }
              : undefined
          }
        />
      );
    } catch (error) {
      console.error('Error rendering recipe item:', error);
      return null;
    }
  };

  // Get different recipe sets for different sections with error handling
  const trendingRecipes = (() => {
    try {
      // Use categoryRecipes directly since we removed placeholderRecipes
      return categoryRecipes.slice(0, 3);
    } catch (error) {
      console.error('Error getting trending recipes:', error);
      return [];
    }
  })();

  const fiveIngredientRecipes = (() => {
    try {
      // Use categoryRecipes directly since we removed placeholderRecipes
      return categoryRecipes.slice(0, 6);
    } catch (error) {
      console.error('Error getting five ingredient recipes:', error);
      return [];
    }
  })();

  // Safe slicing function
  const safeSlice = (array: any[], start: number, end: number) => {
    if (!array || !Array.isArray(array)) return [];
    return array.slice(start, end);
  };

  // Loading state for recipes
  if (recipesLoading && activeMode === 'Explore') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Recipes</Text>
        </View>
        <View style={[styles.content, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ fontSize: 18, color: theme.colors.primary }}>Loading recipes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state for recipes
  if (recipesError && activeMode === 'Explore') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Recipes</Text>
        </View>
        <View style={[styles.content, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
          <Text style={{ fontSize: 18, color: '#ff4444', marginBottom: 16, textAlign: 'center' }}>
            Failed to load recipes
          </Text>
          <Text style={{ fontSize: 14, color: '#666', marginBottom: 24, textAlign: 'center' }}>
            {recipesError.message}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header matching inventory/shopping list style */}
      <View style={styles.header}>
        <Text style={styles.title}>Recipes</Text>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        {/* Sticky Navigation */}
        <View style={styles.stickyNav}>
          <SegmentedControl
            segments={['Explore', 'From Your Pantry']}
            activeSegment={activeMode}
            onSegmentPress={(segment) => setActiveMode(segment as any)}
          />
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const newIndex = Math.round(e.nativeEvent.contentOffset.x / (screenWidth - 32));
              setCurrentHeroIndex(newIndex);
            }}
          >
            {heroRecipes.map((hero) => (
              <HeroCard
                key={hero.id}
                title={hero.title}
                subtitle={hero.subtitle}
                imageUrl={hero.imageUrl}
                creator={hero.creator}
                onPress={() => handleRecipePress(hero.id)}
                isPantryMode={activeMode === 'From Your Pantry'}
                expiringIngredients={activeMode === 'From Your Pantry' ? getExpiringIngredients() : []}
              />
            ))}
          </ScrollView>

          {/* Pagination dots */}
          <View style={styles.pagination}>
            {heroRecipes.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  index === currentHeroIndex && styles.dotActive,
                ]}
              />
            ))}
          </View>
        </View>

        {/* Categories */}
        <ScrollableCategories
          categories={currentCategories}
          activeCategory={activeCategory}
          onCategoryPress={setActiveCategory}
          isPantryMode={activeMode === 'From Your Pantry'}
        />

        {/* Pantry Mode Components */}
        {activeMode === 'From Your Pantry' && (
          <>
            <PantryMatchingBanner
              isMatching={status === 'running'}
              progress={{ total: progressTotal, done: progressDone }}
            />
            <PantryCTA onPress={handleScanPress} />
          </>
        )}

        {/* Recipe Sections */}
        <View style={styles.sections}>
          {/* First section - no header, just recipes */}
          {filteredRecipes && filteredRecipes.length > 0 && (
            <View style={{ height: 280 }}>
              <FlashList
                horizontal
                data={safeSlice(filteredRecipes, 0, 6)}
                renderItem={renderRecipeItem}
                keyExtractor={(item) => item?.id || `recipe-${Math.random()}`}
                showsHorizontalScrollIndicator={false}
                estimatedItemSize={200}
                contentContainerStyle={styles.horizontalList}
              />
            </View>
          )}

          {/* Trending Now */}
          {trendingRecipes && trendingRecipes.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Trending Now" />
              <View style={{ height: trendingRecipes.length * 120 }}>
                <FlashList
                  data={trendingRecipes}
                  renderItem={({ item }) => {
                    if (!item) return null;
                    const recipeWithMatch = getRecipeWithMatch(item);
                    return (
                      <RecipeCard
                        recipe={recipeWithMatch}
                        variant="full"
                        onPress={() => handleRecipePress(recipeWithMatch.id)}
                        matchPercentage={activeMode === 'From Your Pantry' ? recipeWithMatch.matchPercentage : undefined}
                        showMatchBadge={activeMode === 'From Your Pantry'}
                      />
                    );
                  }}
                  keyExtractor={(item) => item?.id || `trending-${Math.random()}`}
                  estimatedItemSize={120}
                  scrollEnabled={false}
                />
              </View>
            </View>
          )}

          {/* Five-ingredient dinners - Grid only */}
          {fiveIngredientRecipes && fiveIngredientRecipes.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Five-ingredient dinners" />

              <CuisineChips
                cuisines={cuisines}
                selectedCuisine={selectedCuisine}
                onCuisinePress={setSelectedCuisine}
              />

              <View style={styles.gridContainer}>
                {fiveIngredientRecipes.map((item) => {
                  if (!item) return null;
                  const recipeWithMatch = getRecipeWithMatch(item);
                  return (
                    <RecipeCard
                      key={recipeWithMatch.id}
                      recipe={recipeWithMatch}
                      variant="grid"
                      onPress={() => handleRecipePress(recipeWithMatch.id)}
                      matchPercentage={activeMode === 'From Your Pantry' ? recipeWithMatch.matchPercentage : undefined}
                      showMatchBadge={activeMode === 'From Your Pantry'}
                    />
                  );
                })}
              </View>
            </View>
          )}
        </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.text,
  },
  content: {
    flex: 1,
  },
  stickyNav: {
    backgroundColor: theme.colors.background,
    zIndex: 100,
  },
  heroSection: {
    marginTop: 16,
    marginBottom: 8,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.borderLight,
  },
  dotActive: {
    backgroundColor: theme.colors.primary,
    width: 24,
  },
  sections: {
    marginTop: 8,
  },
  section: {
    marginTop: 24,
  },
  horizontalList: {
    paddingHorizontal: 16,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 16,
  },
});