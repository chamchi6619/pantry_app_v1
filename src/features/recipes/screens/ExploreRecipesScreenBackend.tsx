import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  FlatList,
  Text,
  ActivityIndicator,
  RefreshControl,
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

// Services
import recipeService from '../services/recipeService';

// Stores
import { useInventoryStore } from '../../../stores/inventoryStore';
import { useMatchJobStore } from '../../../stores/matchJobStore';
import { theme } from '../../../core/constants/theme';

const { width: screenWidth } = Dimensions.get('window');

export const ExploreRecipesScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  // State
  const [activeMode, setActiveMode] = useState<'Explore' | 'From Your Pantry'>('Explore');
  const [activeCategory, setActiveCategory] = useState('Popular');
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);

  // Backend state
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [heroRecipes, setHeroRecipes] = useState<any[]>([]);
  const [trendingRecipes, setTrendingRecipes] = useState<any[]>([]);
  const [quickRecipes, setQuickRecipes] = useState<any[]>([]);

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

  // Check backend connection on mount
  useEffect(() => {
    checkBackendConnection();
  }, []);

  const checkBackendConnection = async () => {
    try {
      const isConnected = await recipeService.checkHealth();
      setBackendConnected(isConnected);
    } catch (error) {
      setBackendConnected(false);
    }
  };

  // Load recipes when category or mode changes
  useEffect(() => {
    loadRecipes();
  }, [activeCategory, activeMode]);

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // Load hero recipes (featured)
      const popularRecipes = await recipeService.getPopularRecipes(3);
      if (popularRecipes.length > 0) {
        setHeroRecipes(popularRecipes.map((recipe, index) => ({
          ...recipe,
          subtitle: index === 0 ? "Editor's Choice" : index === 1 ? 'Trending Now' : 'Seasonal Special',
        })));
      }

      // Load trending recipes
      const trending = await recipeService.getTrendingRecipes(5);
      setTrendingRecipes(trending);

      // Load quick recipes
      const quick = await recipeService.getQuickRecipes(6);
      setQuickRecipes(quick);
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecipes = async () => {
    if (loading) return;

    setLoading(true);
    try {
      let searchQuery = '';

      // Map category to search terms
      if (activeMode === 'From Your Pantry') {
        // For pantry mode, use inventory items as search base
        if (items && items.length > 0) {
          // Use first few pantry items for search
          searchQuery = items.slice(0, 3).map(item => item.name).join(' ');
        }
      }

      // Fetch recipes based on category
      const fetchedRecipes = await recipeService.searchRecipes(searchQuery, activeCategory, 20);
      setRecipes(fetchedRecipes);

      // Start matching if in pantry mode
      if (activeMode === 'From Your Pantry' && fetchedRecipes.length > 0) {
        cancelJob();
        setTimeout(() => {
          startJob(fetchedRecipes, items || [], invVersion);
        }, 100);
      }
    } catch (error) {
      console.error('Error loading recipes:', error);
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await checkBackendConnection();
    await loadRecipes();
    await loadInitialData();
    setRefreshing(false);
  }, [activeCategory]);

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

  // Navigation functions
  const handleRecipePress = async (recipeId: string) => {
    if (!recipeId) return;

    try {
      // Try to find recipe in current lists
      let recipe = recipes.find(r => r.id === recipeId) ||
                   trendingRecipes.find(r => r.id === recipeId) ||
                   quickRecipes.find(r => r.id === recipeId) ||
                   heroRecipes.find(r => r.id === recipeId);

      // If not found, fetch from backend
      if (!recipe) {
        recipe = await recipeService.getRecipe(recipeId);
      }

      if (recipe) {
        navigation.navigate('RecipeDetail', { recipe });
      }
    } catch (error) {
      console.error('Error navigating to recipe:', error);
    }
  };

  const handleScanPress = () => {
    navigation.navigate('ReceiptCapture');
  };

  // Filter recipes by cuisine
  const filteredRecipes = (() => {
    try {
      if (!selectedCuisine || !recipes || recipes.length === 0) {
        return recipes;
      }
      return recipes.filter(r => r && r.cuisine === selectedCuisine);
    } catch (error) {
      console.error('Error filtering recipes:', error);
      return recipes;
    }
  })();

  // Get recipe with match data
  const getRecipeWithMatch = (recipe: any) => {
    if (!recipe) return null;

    try {
      const result = recipe.id ? getResult(recipe.id) : null;
      return {
        ...recipe,
        matchPercentage: result?.pct || recipe.matchPercentage,
        hasExpiring: result?.hasExpiring,
      };
    } catch (error) {
      console.error('Error getting recipe with match:', error);
      return recipe;
    }
  };

  // Render recipe item for FlatList
  const renderRecipeItem = ({ item }: { item: any }) => {
    if (!item) return null;

    try {
      const recipeWithMatch = getRecipeWithMatch(item);
      const ingredientCount = item.ingredients?.length || 5;

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

  // Loading state
  if (loading && recipes.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Recipes</Text>
          {backendConnected !== null && (
            <View style={[styles.connectionBadge, { backgroundColor: backendConnected ? '#10B981' : '#EF4444' }]}>
              <Text style={styles.connectionText}>
                {backendConnected ? '● Connected' : '● Offline'}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading delicious recipes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header matching inventory/shopping list style */}
      <View style={styles.header}>
        <Text style={styles.title}>Recipes</Text>
        {backendConnected !== null && (
          <View style={[styles.connectionBadge, { backgroundColor: backendConnected ? '#10B981' : '#EF4444' }]}>
            <Text style={styles.connectionText}>
              {backendConnected ? `● ${recipes.length || 684} recipes` : '● Offline'}
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
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
        {heroRecipes.length > 0 && (
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
                  title={hero.title || hero.name}
                  subtitle={hero.subtitle || hero.summary}
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
        )}

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
          {/* First section - category recipes */}
          {filteredRecipes && filteredRecipes.length > 0 && (
            <View>
              <FlatList
                horizontal
                data={filteredRecipes.slice(0, 6)}
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
                data={trendingRecipes.slice(0, 3)}
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

          {/* Quick Recipes */}
          {quickRecipes && quickRecipes.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Quick & Easy Dinners" />

              <CuisineChips
                cuisines={cuisines}
                selectedCuisine={selectedCuisine}
                onCuisinePress={setSelectedCuisine}
              />

              <View style={styles.gridContainer}>
                {quickRecipes.map((item) => {
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
  connectionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  connectionText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: theme.colors.textLight,
    fontSize: 16,
  },
});