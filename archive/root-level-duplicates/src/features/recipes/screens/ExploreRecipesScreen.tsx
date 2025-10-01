import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  FlatList,
  Text,
  Pressable,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { shallow } from 'zustand/shallow';

// Components
import { HeroCard } from '../components/HeroCard';
import { SegmentedControl } from '../components/SegmentedControl';
import { ScrollableCategories } from '../components/ScrollableCategories';
import { RecipeCard } from '../components/RecipeCard';
import { SectionHeader } from '../components/SectionHeader';
import { CuisineChips } from '../components/CuisineChips';
import { PantryCTA } from '../components/PantryCTA';
import { PantryMatchingBanner } from '../components/PantryMatchingBanner';

// Data
import { placeholderRecipes } from '../data/placeholderRecipes';

// Stores
import { useInventoryStore } from '../../../stores/inventoryStore';
import { useMatchJobStore } from '../../../stores/matchJobStore';
import { theme } from '../../../core/constants/theme';

const { width: screenWidth } = Dimensions.get('window');

// Sample hero recipes
const heroRecipes = [
  {
    id: 'hero-1',
    title: 'Mediterranean Bowl',
    subtitle: "Editor's Choice",
    imageUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800',
    creator: 'Chef Maria',
  },
  {
    id: 'hero-2',
    title: 'Asian Fusion Stir-fry',
    subtitle: 'Trending Now',
    imageUrl: 'https://images.unsplash.com/photo-1609501676725-7186f017a4b7?w=800',
    creator: 'Chef Lin',
  },
  {
    id: 'hero-3',
    title: 'Farm Fresh Salad',
    subtitle: 'Seasonal Special',
    imageUrl: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=800',
    creator: 'Chef Sophie',
  },
];

// Default ingredients for recipes - properly formatted
const DEFAULT_INGREDIENTS = [
  {
    id: 'ing-1',
    recipeText: '2 tbsp olive oil',
    parsed: { quantity: 2, unit: 'tbsp', ingredient: 'olive oil' },
    name: 'Olive Oil',
    amount: 2,
    unit: 'tbsp'
  },
  {
    id: 'ing-2',
    recipeText: '3 cloves garlic',
    parsed: { quantity: 3, unit: 'cloves', ingredient: 'garlic' },
    name: 'Garlic',
    amount: 3,
    unit: 'cloves'
  },
  {
    id: 'ing-3',
    recipeText: '1 medium onion',
    parsed: { quantity: 1, unit: 'medium', ingredient: 'onion' },
    name: 'Onion',
    amount: 1,
    unit: 'medium'
  },
  {
    id: 'ing-4',
    recipeText: '1 tsp salt',
    parsed: { quantity: 1, unit: 'tsp', ingredient: 'salt' },
    name: 'Salt',
    amount: 1,
    unit: 'tsp'
  },
  {
    id: 'ing-5',
    recipeText: '0.5 tsp black pepper',
    parsed: { quantity: 0.5, unit: 'tsp', ingredient: 'black pepper' },
    name: 'Black Pepper',
    amount: 0.5,
    unit: 'tsp'
  },
];

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

  // Safe recipe transformation with null checks
  const transformRecipes = (recipes: any[]): any[] => {
    if (!recipes || !Array.isArray(recipes)) {
      return [];
    }

    return recipes
      .filter(recipe => recipe && typeof recipe === 'object' && recipe.id) // Filter out null/undefined/invalid recipes
      .map(recipe => ({
        id: recipe.id || `recipe-${Math.random()}`,
        name: recipe.name || 'Unnamed Recipe',
        imageUrl: recipe.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
        creator: recipe.creator || 'Community Chef',
        cookTime: recipe.cookTime || '30 min',
        difficulty: recipe.difficulty || 'Medium',
        category: recipe.category || 'Popular',
        matchPercentage: recipe.matchPercentage,
        ingredients: DEFAULT_INGREDIENTS,
        cuisine: recipe.category === 'Italian' ? 'Italian' :
                 recipe.category === 'Asian' ? 'Asian' :
                 'American',
      }));
  };

  // Get recipes based on category with robust error handling
  const getCategoryRecipes = (): any[] => {
    try {
      const categoryKey = activeMode === 'From Your Pantry' && (activeCategory === 'Use Soon' || activeCategory === 'High Match')
        ? activeCategory
        : activeCategory;

      const rawRecipes = placeholderRecipes?.[categoryKey];

      // Fallback to Popular if category doesn't exist
      if (!rawRecipes || !Array.isArray(rawRecipes) || rawRecipes.length === 0) {
        const fallbackRecipes = placeholderRecipes?.['Popular'];
        if (!fallbackRecipes || !Array.isArray(fallbackRecipes)) {
          // Return empty array with one default recipe if everything fails
          return transformRecipes([{
            id: 'default-1',
            name: 'Sample Recipe',
            imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
            creator: 'Chef',
            cookTime: '30 min',
            difficulty: 'Easy',
            category: 'Popular'
          }]);
        }
        return transformRecipes(fallbackRecipes);
      }

      return transformRecipes(rawRecipes);
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

  // Start matching when entering pantry mode or when inventory changes
  useEffect(() => {
    if (activeMode === 'From Your Pantry' && categoryRecipes.length > 0) {
      // Cancel any existing job and restart with updated inventory
      cancelJob();
      // Small delay to ensure cancel completes
      const timeout = setTimeout(() => {
        startJob(categoryRecipes, items || [], invVersion);
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [activeMode, categoryRecipes.length, items, invVersion, startJob, cancelJob]);

  // Navigation functions
  const handleRecipePress = (recipeId: string) => {
    if (!recipeId) return;
    // For now, navigate with a placeholder recipe since we don't have a store to fetch from
    // In a real app, you'd fetch the recipe from a store or API
    const recipe = categoryRecipes.find(r => r.id === recipeId) ||
                   trendingRecipes.find(r => r.id === recipeId) ||
                   fiveIngredientRecipes.find(r => r.id === recipeId) ||
                   heroRecipes.find(r => r.id === recipeId);

    if (recipe) {
      // Convert to the format RecipeDetailScreen expects
      const detailRecipe = {
        ...recipe,
        ingredients: recipe.ingredients || DEFAULT_INGREDIENTS,
        instructions: ['Step 1', 'Step 2', 'Step 3'], // Placeholder instructions
        tags: ['Popular'],
        nutrition: { calories: 350, protein: 20, carbs: 40, fat: 15 }
      };
      navigation.navigate('RecipeDetail', { recipe: detailRecipe });
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
        ingredients: DEFAULT_INGREDIENTS,
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
        ingredients: recipe.ingredients || DEFAULT_INGREDIENTS,
      };
    } catch (error) {
      console.error('Error getting recipe with match:', error);
      return {
        ...recipe,
        ingredients: DEFAULT_INGREDIENTS,
      };
    }
  };

  // Render recipe item for FlatList with comprehensive null checks
  const renderRecipeItem = ({ item }: { item: any }) => {
    if (!item) return null;

    try {
      const recipeWithMatch = getRecipeWithMatch(item);
      const ingredients = recipeWithMatch.ingredients || DEFAULT_INGREDIENTS;
      const ingredientCount = Array.isArray(ingredients) ? ingredients.length : 5;

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
      const quickEasy = placeholderRecipes?.['Quick & Easy'];
      if (!quickEasy || !Array.isArray(quickEasy)) {
        return transformRecipes(categoryRecipes.slice(0, 3));
      }
      return transformRecipes(quickEasy.slice(0, 3));
    } catch (error) {
      console.error('Error getting trending recipes:', error);
      return [];
    }
  })();

  const fiveIngredientRecipes = (() => {
    try {
      const healthy = placeholderRecipes?.['Healthy'];
      if (!healthy || !Array.isArray(healthy)) {
        return transformRecipes(categoryRecipes.slice(0, 6));
      }
      return transformRecipes(healthy.slice(0, 6));
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
            <View>
              <FlatList
                horizontal
                data={safeSlice(filteredRecipes, 0, 6)}
                renderItem={renderRecipeItem}
                keyExtractor={(item) => item?.id || `recipe-${Math.random()}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalList}
              />
            </View>
          )}

          {/* Trending Now */}
          {trendingRecipes && trendingRecipes.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Trending Now" />
              <FlatList
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
                scrollEnabled={false}
              />
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