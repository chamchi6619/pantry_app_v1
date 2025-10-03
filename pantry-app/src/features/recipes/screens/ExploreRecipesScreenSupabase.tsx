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
  Pressable,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../contexts/AuthContext';

// Components
import { HeroCard } from '../components/HeroCard';
import { SegmentedControl } from '../components/SegmentedControl';
import { ScrollableCategories } from '../components/ScrollableCategories';
import { RecipeCard } from '../components/RecipeCard';
import { SectionHeader } from '../components/SectionHeader';
import { CuisineChips } from '../components/CuisineChips';
import { PantryCTA } from '../components/PantryCTA';

// Services
import recipeServiceSupabase from '../../../services/recipeServiceSupabase';
import { canonicalItemsService } from '../../../services/canonicalItemsService';
import { supabase } from '../../../lib/supabase';

// Stores
import { useInventorySupabaseStore } from '../../../stores/inventorySupabaseStore';
import { theme } from '../../../core/constants/theme';

const { width: screenWidth } = Dimensions.get('window');

export const ExploreRecipesScreenSupabase: React.FC = () => {
  const navigation = useNavigation<any>();
  const { householdId } = useAuth();

  // State
  const [activeMode, setActiveMode] = useState<'Explore' | 'From Your Pantry'>('Explore');
  const [activeCategory, setActiveCategory] = useState('Popular');
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);

  // Recipe state
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [heroRecipes, setHeroRecipes] = useState<any[]>([]);
  const [trendingRecipes, setTrendingRecipes] = useState<any[]>([]);
  const [quickRecipes, setQuickRecipes] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalRecipes: 0, totalIngredients: 0, totalCanonicalItems: 0 });

  // Store selectors
  const items = useInventorySupabaseStore(state => state.items);

  // Categories
  const exploreCategories = ['Popular', 'Quick & Easy', 'Healthy', 'Vegetarian', 'Comfort Food', 'Desserts', 'Breakfast'];
  const pantryCategories = ['High Match', 'Use Soon', 'Popular', 'Quick & Easy'];
  const cuisines = ['Italian', 'Asian', 'Mexican', 'Mediterranean', 'American', 'Indian', 'French'];

  // Get current categories based on mode
  const currentCategories = activeMode === 'From Your Pantry' ? pantryCategories : exploreCategories;

  // Initialize services on mount
  useEffect(() => {
    initializeServices();
  }, []);

  const initializeServices = async () => {
    try {
      // Initialize canonical items service
      await canonicalItemsService.initialize();

      // Get stats
      const recipeStats = await recipeServiceSupabase.getStats();
      setStats(recipeStats);

      console.log('✅ Recipe services initialized:', recipeStats);
    } catch (error) {
      console.error('Error initializing services:', error);
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
      // Load hero recipes (popular)
      const popularRecipes = await recipeServiceSupabase.getPopularRecipes(3);
      if (popularRecipes.length > 0) {
        setHeroRecipes(popularRecipes.map((recipe, index) => ({
          ...recipeServiceSupabase.transformToUIFormat(recipe),
          subtitle: index === 0 ? "Editor's Choice" : index === 1 ? 'Trending Now' : 'Seasonal Special',
        })));
      }

      // Load trending recipes
      const trending = await recipeServiceSupabase.getPopularRecipes(5);
      setTrendingRecipes(trending.map(r => recipeServiceSupabase.transformToUIFormat(r)));

      // Load quick recipes
      const quick = await recipeServiceSupabase.getQuickRecipes(6);
      setQuickRecipes(quick.map(r => recipeServiceSupabase.transformToUIFormat(r)));
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
      let fetchedRecipes: any[];

      if (activeMode === 'From Your Pantry') {
        // Use new Edge Function for canonical-based recipe matching
        if (!householdId) {
          console.warn('No household ID available for pantry matching');
          fetchedRecipes = [];
          setRecipes([]);
          setLoading(false);
          return;
        }

        // Dynamic thresholds based on matchable pantry size
        // Count only items that can be matched (have canonical_item_id in DB)
        // Note: We can't check this client-side, so we'll use total active count as proxy
        // and rely on Edge Function to return the actual matchable count
        const totalPantryItems = items?.filter(i => i.status === 'active').length || 0;

        // Use very lenient thresholds for small pantries
        // As users add more items, we can be more selective
        const minMatch = activeCategory === 'High Match' ? 70 :
                        totalPantryItems < 5 ? 5 :   // Tiny pantry: match if ANY ingredient matches
                        totalPantryItems < 10 ? 20 :  // Small pantry: low threshold
                        totalPantryItems < 20 ? 40 :  // Medium pantry: moderate threshold
                        50;  // Large pantry: reasonable threshold

        const maxMissing = activeCategory === 'High Match' ? 3 :
                          totalPantryItems < 5 ? 25 :   // Tiny pantry: allow lots of missing ingredients
                          totalPantryItems < 10 ? 15 :  // Small pantry: moderately lenient
                          totalPantryItems < 20 ? 10 :
                          7;

        console.log(`🔍 Recipe search: totalPantry=${totalPantryItems}, minMatch=${minMatch}%, maxMissing=${maxMissing}`);

        // Call search-recipes-by-pantry Edge Function
        const { data, error } = await supabase.functions.invoke('search-recipes-by-pantry', {
          body: {
            household_id: householdId,
            min_match_percent: minMatch,
            max_missing: maxMissing,
            limit: 50,
          },
        });

        if (error) {
          console.error('Recipe search error:', error);
          fetchedRecipes = [];
        } else if (data.success) {
          const edgeFunctionRecipes = data.recipes || [];

          // Transform Edge Function results to UI format
          fetchedRecipes = edgeFunctionRecipes.map((r: any) => ({
            id: r.recipe_id,
            title: r.title,
            name: r.title,
            summary: r.description,
            imageUrl: r.image_url,
            cookTime: r.total_time_minutes,
            servings: r.servings,
            matchPercentage: r.match_percent,
            // Counts
            totalIngredients: r.total_ingredients,
            matchedCount: r.matched_ingredients,
            missingCount: r.missing_ingredients,
            // Arrays
            matchedIngredients: r.matched_ingredient_names || [],
            missingIngredients: r.missing_ingredient_names || [],
          }));

          // Filter by category
          if (activeCategory === 'Use Soon') {
            const expiringItems = getExpiringIngredients();
            fetchedRecipes = fetchedRecipes.filter((r: any) => {
              return r.matchedIngredients?.some((ing: string) =>
                expiringItems.some(exp => ing.toLowerCase().includes(exp.toLowerCase()))
              );
            });
          }
        } else {
          fetchedRecipes = [];
        }
      } else {
        // Explore mode - search by category
        let searchOptions: any = { limit: 20 };

        if (activeCategory === 'Quick & Easy') {
          searchOptions.maxTime = 30;
        } else if (activeCategory !== 'Popular') {
          searchOptions.query = activeCategory;
        }

        const searchResults = await recipeServiceSupabase.searchRecipes(searchOptions);
        fetchedRecipes = searchResults.map(r => recipeServiceSupabase.transformToUIFormat(r));
      }

      setRecipes(fetchedRecipes);
    } catch (error) {
      console.error('Error loading recipes:', error);
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await canonicalItemsService.syncFromSupabase();
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
  const handleRecipePress = (recipe: any) => {
    if (!recipe) return;
    navigation.navigate('RecipeDetail', { recipe });
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

  // Render recipe item for FlatList
  const renderRecipeItem = ({ item }: { item: any }) => {
    if (!item) return null;

    try {
      const ingredientCount = item.ingredients?.length || 5;

      return (
        <RecipeCard
          recipe={item}
          variant="carousel"
          onPress={() => handleRecipePress(item)}
          matchPercentage={activeMode === 'From Your Pantry' ? item.matchPercentage : undefined}
          showMatchBadge={activeMode === 'From Your Pantry'}
          pantryInfo={
            activeMode === 'From Your Pantry'
              ? {
                  haveCount: Math.round((item.matchPercentage || 0) / 100 * ingredientCount),
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
          <View style={styles.connectionBadge}>
            <Text style={styles.connectionText}>
              ● {stats.totalRecipes} recipes
            </Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading delicious recipes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Calculate pantry stats
  const pantryItemCount = items?.length || 0;
  const matchedRecipeCount = recipes.length;
  const bestMatchPercent = recipes.length > 0 ? Math.max(...recipes.map(r => r.matchPercentage || 0)) : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Clean Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="restaurant" size={28} color={theme.colors.primary} />
          <View>
            <Text style={styles.headerTitle}>Recipes</Text>
            <Text style={styles.headerSubtitle}>What's for dinner?</Text>
          </View>
        </View>
        <Pressable onPress={() => {}}>
          <Ionicons name="options-outline" size={24} color="#6B7280" />
        </Pressable>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Mode Toggle */}
        <View style={styles.modeToggle}>
          <SegmentedControl
            segments={['Explore', 'From Your Pantry']}
            activeSegment={activeMode}
            onSegmentPress={(segment) => setActiveMode(segment as any)}
          />
        </View>

        {/* Pantry Match Summary - Only in Pantry Mode */}
        {activeMode === 'From Your Pantry' && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>What You Can Make</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{pantryItemCount}</Text>
                <Text style={styles.summaryLabel}>Items</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{matchedRecipeCount}</Text>
                <Text style={styles.summaryLabel}>Recipes</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{bestMatchPercent}%</Text>
                <Text style={styles.summaryLabel}>Best Match</Text>
              </View>
            </View>
            <Text style={styles.summaryFooter}>● Based on your pantry items</Text>
          </View>
        )}

        {/* Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterChips}
          contentContainerStyle={styles.filterChipsContent}
        >
          {currentCategories.map((category) => (
            <Pressable
              key={category}
              style={[
                styles.filterChip,
                activeCategory === category && styles.filterChipActive
              ]}
              onPress={() => setActiveCategory(category)}
            >
              <Text style={[
                styles.filterChipText,
                activeCategory === category && styles.filterChipTextActive
              ]}>
                {category}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Recipe List - Full Width Cards */}
        <View style={styles.recipeList}>
          {filteredRecipes && filteredRecipes.length > 0 ? (
            filteredRecipes.map((recipe) => {
              if (!recipe) return null;

              const matchPercentage = recipe.matchPercentage || 0;
              const matchColor = matchPercentage >= 80 ? '#10B981' : matchPercentage >= 50 ? '#F59E0B' : '#9CA3AF';
              const matchLabel = matchPercentage >= 90 ? 'Perfect Match!' : matchPercentage >= 70 ? 'Almost there' : `Missing ${recipe.missingCount || 0} items`;

              return (
                <Pressable
                  key={recipe.id}
                  style={styles.recipeCardLarge}
                  onPress={() => handleRecipePress(recipe)}
                >
                  {/* Recipe Image */}
                  <Image
                    source={{ uri: recipe.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500' }}
                    style={styles.recipeImageLarge}
                    resizeMode="cover"
                  />

                  {/* Match Badge */}
                  {activeMode === 'From Your Pantry' && (
                    <View style={[styles.matchBadgeLarge, { backgroundColor: matchColor }]}>
                      <Text style={styles.matchBadgeText}>{matchPercentage}%</Text>
                    </View>
                  )}

                  {/* Recipe Info */}
                  <View style={styles.recipeInfo}>
                    <Text style={styles.recipeTitle}>{recipe.title || recipe.name}</Text>

                    <View style={styles.recipeMetadata}>
                      {recipe.cookTime && (
                        <View style={styles.metaItem}>
                          <Ionicons name="time-outline" size={16} color="#6B7280" />
                          <Text style={styles.metaText}>{recipe.cookTime} min</Text>
                        </View>
                      )}
                      {recipe.servings && (
                        <View style={styles.metaItem}>
                          <Ionicons name="people-outline" size={16} color="#6B7280" />
                          <Text style={styles.metaText}>{recipe.servings} servings</Text>
                        </View>
                      )}
                    </View>

                    {/* Match Info - Only in Pantry Mode */}
                    {activeMode === 'From Your Pantry' && (
                      <View style={styles.matchInfo}>
                        <View style={styles.matchRow}>
                          <Ionicons name="checkmark-circle" size={18} color={matchColor} />
                          <Text style={styles.matchText}>
                            {recipe.matchedCount || 0}/{recipe.totalIngredients || 0} ingredients
                          </Text>
                          <Text style={[styles.matchLabel, { color: matchColor }]}>{matchLabel}</Text>
                        </View>

                        {recipe.missingIngredients && recipe.missingIngredients.length > 0 && (
                          <>
                            <Text style={styles.missingLabel}>
                              Missing: {recipe.missingIngredients.slice(0, 3).join(', ')}
                              {recipe.missingIngredients.length > 3 ? ` +${recipe.missingIngredients.length - 3} more` : ''}
                            </Text>
                            <Pressable style={styles.addToListButton}>
                              <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary} />
                              <Text style={styles.addToListText}>Add to Shopping List</Text>
                            </Pressable>
                          </>
                        )}
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="restaurant-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No recipes found</Text>
              <Text style={styles.emptySubtitle}>
                {activeMode === 'From Your Pantry'
                  ? 'Add items to your pantry to discover matching recipes'
                  : 'Try adjusting your filters'}
              </Text>
              {activeMode === 'From Your Pantry' && (
                <View style={styles.emptyActions}>
                  <Pressable style={styles.emptyButton} onPress={handleScanPress}>
                    <Text style={styles.emptyButtonText}>Scan Receipt</Text>
                  </Pressable>
                  <Pressable style={[styles.emptyButton, styles.emptyButtonOutline]} onPress={() => navigation.navigate('Inventory')}>
                    <Text style={[styles.emptyButtonText, styles.emptyButtonTextOutline]}>Add Items</Text>
                  </Pressable>
                </View>
              )}
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
    backgroundColor: '#F9FAFB',
  },
  // Clean Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  // Mode Toggle
  modeToggle: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F9FAFB',
  },
  // Pantry Match Summary
  summaryCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  summaryTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
  },
  summaryFooter: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  // Filter Chips
  filterChips: {
    marginBottom: 20,
  },
  filterChipsContent: {
    paddingHorizontal: 20,
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  // Recipe List
  recipeList: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  recipeCardLarge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  recipeImageLarge: {
    width: '100%',
    height: 220,
  },
  matchBadgeLarge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  matchBadgeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  recipeInfo: {
    padding: 16,
  },
  recipeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  recipeMetadata: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  // Match Info
  matchInfo: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
    marginTop: 4,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  matchText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  matchLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  missingLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 10,
    lineHeight: 18,
  },
  addToListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
  },
  addToListText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: 12,
  },
  emptyButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  emptyButtonOutline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyButtonTextOutline: {
    color: theme.colors.primary,
  },
  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    color: '#6B7280',
    fontSize: 16,
  },
});
