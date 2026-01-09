/**
 * RecipesScreen - "What are we cooking?"
 *
 * Purpose: Browse global recipe database (Netflix-style discovery)
 * Pattern: Category carousels sorted by pantry match
 * Structure:
 *   - 10 cuisine/style categories (Italian, Mexican, Thai, etc.)
 *   - Each category shows top 10 recipes sorted by pantry match
 *   - Tap any recipe → View in CookCard format
 * Architecture:
 *   - Recipes from recipe_database (global, read-only)
 *   - User's saved recipes moved to Profile/My Recipes (future)
 * UX: Browse → Find recipe → Tap → See full recipe → Save to collection
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../../../core/constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import RecipeSection from '../components/RecipeSection';
import {
  getRecipesByCategory,
  type RecipeDatabaseItem,
  type RecipesByCategory,
} from '../../../services/recipeDatabaseService';
import { recipeCache } from '../../../services/recipeCacheService';
import { generateEnhancedCategories, rankCategoryRecipes } from '../../../services/recipeRankingService';
import { recipeViewHistory } from '../../../services/recipeViewHistoryService';

// Category configuration for display
function getCategoryConfig() {
  return [
    // Priority categories (most universal, shown first)
    { key: 'quick & easy', emoji: '⚡', title: 'Quick & Easy', subtitle: 'Ready in 30 minutes or less' },
    { key: 'healthy', emoji: '🥗', title: 'Healthy', subtitle: 'Nutritious and delicious' },

    // Popular cuisines (sorted alphabetically)
    { key: 'american comfort', emoji: '🍔', title: 'American Comfort', subtitle: 'Burgers, mac & cheese, BBQ' },
    { key: 'chinese', emoji: '🥡', title: 'Chinese', subtitle: 'Stir-fry, dumplings, noodles' },
    { key: 'indian', emoji: '🍛', title: 'Indian', subtitle: 'Curry, naan, biryani' },
    { key: 'italian', emoji: '🍝', title: 'Italian', subtitle: 'Pasta, pizza, and more' },
    { key: 'japanese', emoji: '🍜', title: 'Japanese', subtitle: 'Ramen, sushi, teriyaki' },
    { key: 'korean', emoji: '🍱', title: 'Korean', subtitle: 'Bibimbap, kimchi, BBQ' },
    { key: 'mexican', emoji: '🌮', title: 'Mexican', subtitle: 'Tacos, burritos, enchiladas' },
    { key: 'thai', emoji: '🍲', title: 'Thai', subtitle: 'Curry, pad thai, tom yum' },
  ];
}

export default function RecipesScreen() {
  const navigation = useNavigation();
  const { user, householdId } = useAuth();

  const [dbRecipes, setDbRecipes] = useState<RecipesByCategory>({});
  const [enhancedCategories, setEnhancedCategories] = useState<RecipesByCategory>({});
  const [viewHistory, setViewHistory] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState<Set<string>>(new Set());

  // Priority categories - load these FIRST
  const PRIORITY_CATEGORIES = ['quick & easy', 'healthy', 'italian'];

  // All categories in order
  const ALL_CATEGORIES = [
    'quick & easy',
    'healthy',
    'american comfort',
    'chinese',
    'indian',
    'italian',
    'japanese',
    'korean',
    'mexican',
    'thai',
  ];

  /**
   * Regenerate enhanced categories from all loaded recipes
   */
  const regenerateEnhancedCategories = useCallback(() => {
    const allRecipes = Object.values(dbRecipes).flat();
    if (allRecipes.length === 0) return;

    console.log(`[Recipes] Regenerating enhanced categories from ${allRecipes.length} recipes`);
    const enhanced = generateEnhancedCategories(allRecipes, viewHistory);
    setEnhancedCategories(enhanced);
  }, [dbRecipes, viewHistory]);

  /**
   * Load a single category with caching
   */
  const loadCategory = useCallback(async (category: string, useCache = true) => {
    if (!householdId) return;

    // Check if already loading
    if (loadingCategories.has(category)) return;

    setLoadingCategories(prev => new Set(prev).add(category));

    try {
      // Try cache first (if not force refresh)
      if (useCache) {
        const cached = await recipeCache.getCachedCategory(category, householdId);
        if (cached) {
          // Apply ranking to cached recipes
          const ranked = rankCategoryRecipes(cached, viewHistory);
          setDbRecipes(prev => ({ ...prev, [category]: ranked }));
          setLoadingCategories(prev => {
            const next = new Set(prev);
            next.delete(category);
            return next;
          });
          // Trigger enhanced category regeneration
          setTimeout(regenerateEnhancedCategories, 100);
          return;
        }
      }

      // Fetch from API
      const recipes = await getRecipesByCategory(category, householdId, 10);

      // Apply ranking
      const ranked = rankCategoryRecipes(recipes, viewHistory);

      // Cache the result (store ranked recipes)
      await recipeCache.setCachedCategory(category, householdId, ranked);

      // Update state
      setDbRecipes(prev => ({ ...prev, [category]: ranked }));

      // Trigger enhanced category regeneration
      setTimeout(regenerateEnhancedCategories, 100);
    } catch (error) {
      console.error(`[Recipes] Error loading ${category}:`, error);
    } finally {
      setLoadingCategories(prev => {
        const next = new Set(prev);
        next.delete(category);
        return next;
      });
    }
  }, [householdId, loadingCategories, viewHistory, regenerateEnhancedCategories]);

  /**
   * Load priority categories first, then rest in background
   */
  const loadRecipes = useCallback(async (forceRefresh = false) => {
    if (!user || !householdId) return;

    console.log('[RecipesScreen] Loading recipes (forceRefresh:', forceRefresh, ')');
    const startTime = Date.now();

    try {
      setLoading(true);

      if (forceRefresh) {
        // Invalidate cache on force refresh
        await recipeCache.invalidate(householdId);
      } else {
        // Try to load all from cache instantly
        const allCached = await recipeCache.getAllCached(householdId);
        if (allCached && Object.keys(allCached).length >= 8) {
          console.log('[RecipesScreen] Using cached data for all categories');
          setDbRecipes(allCached);
          setLoading(false);

          // Still refresh in background
          setTimeout(() => {
            console.log('[RecipesScreen] Refreshing cache in background');
            loadPriorityCategories(false);
          }, 1000);
          return;
        }
      }

      // Phase 1: Load priority categories (300-500ms)
      await loadPriorityCategories(!forceRefresh);
      setLoading(false);

      const elapsed = Date.now() - startTime;
      console.log(`[RecipesScreen] Priority categories loaded in ${elapsed}ms`);

      // Phase 2: Load remaining categories in background
      setTimeout(() => {
        loadRemainingCategories();
      }, 500);

    } catch (error) {
      console.error('[Recipes] Error loading:', error);
      Alert.alert('Error', 'Failed to load recipes');
      setLoading(false);
    } finally {
      setRefreshing(false);
    }
  }, [user, householdId]);

  /**
   * Load priority categories (Quick & Easy, Healthy, Italian)
   */
  const loadPriorityCategories = async (useCache = true) => {
    await Promise.all(
      PRIORITY_CATEGORIES.map(cat => loadCategory(cat, useCache))
    );
  };

  /**
   * Load remaining categories progressively
   */
  const loadRemainingCategories = async () => {
    const remaining = ALL_CATEGORIES.filter(
      cat => !PRIORITY_CATEGORIES.includes(cat)
    );

    // Load one at a time to avoid overwhelming the UI
    for (const category of remaining) {
      await loadCategory(category, true);
      // Small delay to let UI breathe
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('[RecipesScreen] All categories loaded');
  };

  // Load view history on mount
  useEffect(() => {
    const loadViewHistory = async () => {
      const history = await recipeViewHistory.getViewHistoryMap();
      setViewHistory(history);
      console.log(`[Recipes] Loaded ${history.size} view records`);
    };
    loadViewHistory();
  }, []);

  useEffect(() => {
    if (user && householdId) {
      loadRecipes(false);
    }
  }, [user, householdId]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadRecipes(true); // Force refresh, skip cache
  };

  const handleItemPress = async (item: RecipeDatabaseItem) => {
    // Track view for recency penalties
    await recipeViewHistory.recordView(item.id);

    // Update local state
    const updatedHistory = await recipeViewHistory.getViewHistoryMap();
    setViewHistory(updatedHistory);

    // Navigate to CookCard screen with recipeDatabaseId
    navigation.navigate('CookCard' as never, { recipeDatabaseId: item.id } as never);
  };

  const handleItemLongPress = (item: RecipeDatabaseItem) => {
    // Show quick info for recipe
    Alert.alert(
      item.title,
      `Pantry Match: ${item.pantry_match_percent}%\n${item.missing_ingredients_count || 0} ingredients needed`,
      [
        {
          text: 'View Recipe',
          onPress: () => handleItemPress(item),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading your queue...</Text>
        </View>
      </SafeAreaView>
    );
  }

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
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>What are we cooking?</Text>
            <Text style={styles.headerSubtitle}>
              Browse recipes sorted by what's in your pantry
            </Text>
          </View>
        </View>

        {/* Recipe Carousels */}
        <View style={styles.content}>
          {Object.keys(dbRecipes).length > 0 || Object.keys(enhancedCategories).length > 0 ? (
            <>
              {/* 🌟 Enhanced Categories (Generated from all recipes) */}
              {Object.keys(enhancedCategories).length > 0 && (
                <>
                  {enhancedCategories['Best Match']?.length > 0 && (
                    <RecipeSection
                      key="best-match"
                      title="⭐ Best Match"
                      subtitle="Top recipes for your pantry (refreshed daily)"
                      icon="star"
                      iconColor={theme.colors.success}
                      items={enhancedCategories['Best Match']}
                      onItemPress={handleItemPress}
                      onItemLongPress={handleItemLongPress}
                    />
                  )}

                  {enhancedCategories['Quick & Easy']?.length > 0 && (
                    <RecipeSection
                      key="quick-easy"
                      title="⚡ Quick & Easy"
                      subtitle="Ready in 30 minutes or less"
                      icon="flash"
                      iconColor="#F59E0B"
                      items={enhancedCategories['Quick & Easy']}
                      onItemPress={handleItemPress}
                      onItemLongPress={handleItemLongPress}
                    />
                  )}

                  {enhancedCategories['Just Need 1 Thing']?.length > 0 && (
                    <RecipeSection
                      key="just-need-one"
                      title="🛒 Just Need 1 Thing"
                      subtitle="Only 1 ingredient missing"
                      icon="cart"
                      iconColor={theme.colors.primary}
                      items={enhancedCategories['Just Need 1 Thing']}
                      onItemPress={handleItemPress}
                      onItemLongPress={handleItemLongPress}
                    />
                  )}

                  {enhancedCategories['Meal Prep']?.length > 0 && (
                    <RecipeSection
                      key="meal-prep"
                      title="🍱 Meal Prep"
                      subtitle="Serves 4+, perfect for leftovers"
                      icon="restaurant"
                      iconColor="#8B5CF6"
                      items={enhancedCategories['Meal Prep']}
                      onItemPress={handleItemPress}
                      onItemLongPress={handleItemLongPress}
                    />
                  )}
                </>
              )}

              {/* 📚 Cuisine Categories */}
              {getCategoryConfig().map(({ key, emoji, title, subtitle }) => {
                const recipes = dbRecipes[key];
                if (!recipes || recipes.length === 0) return null;

                return (
                  <RecipeSection
                    key={key}
                    title={`${emoji} ${title}`}
                    subtitle={subtitle}
                    icon="restaurant"
                    iconColor={theme.colors.primary}
                    items={recipes}
                    onItemPress={handleItemPress}
                    onItemLongPress={handleItemLongPress}
                  />
                );
              })}
            </>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="restaurant-outline" size={64} color={theme.colors.textSecondary} />
              <Text style={styles.emptyStateTitle}>No recipes available</Text>
              <Text style={styles.emptyStateText}>
                We're loading our recipe collection. Pull down to refresh.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xl * 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  content: {
    paddingTop: theme.spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl * 3,
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  browseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: 12,
    marginTop: theme.spacing.md,
  },
  browseButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  refillPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: '#EFF6FF',
    padding: theme.spacing.md,
    borderRadius: 12,
    marginTop: theme.spacing.lg,
  },
  refillText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.primary,
    lineHeight: 20,
  },
});
