/**
 * RecipesHeroScreen - Production-Ready Recipe Discovery
 *
 * Purpose: Browse recipes with 2 modes
 * Modes:
 *  - Explore: Browse global recipe database (ranked by pantry match + freshness)
 *  - Saved: User's saved Cook Cards (recipes they've manually saved)
 * Design: Hero feed pattern with large image cards
 * Architecture: Combines v1 hero feed design with recipe database + saved recipes
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Pressable,
  Image,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../contexts/AuthContext';
import { theme } from '../../../core/constants/theme';
import { supabase } from '../../../lib/supabase';
import {
  getAllCategoriesWithRecipes,
  type RecipeDatabaseItem,
} from '../../../services/recipeDatabaseService';
import { rankRecipesWithFreshness } from '../../../services/recipeRankingService';
import { recipeViewHistory } from '../../../services/recipeViewHistoryService';

const { width: screenWidth } = Dimensions.get('window');

type Mode = 'explore' | 'saved';

interface SavedRecipe {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  platform: string;
  creator_name?: string;
  cook_time_minutes?: number;
  total_time_minutes?: number;
  ingredient_count?: number;
  pantry_match_percentage?: number;
  matched_ingredients?: number;
  created_at: string;
}

export default function RecipesHeroScreen() {
  const navigation = useNavigation<any>();
  const { user, householdId } = useAuth();
  const userId = user?.id;
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>('explore');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Explore mode state
  const [exploreRecipes, setExploreRecipes] = useState<RecipeDatabaseItem[]>([]);
  const [categorizedRecipes, setCategorizedRecipes] = useState<{
    [category: string]: RecipeDatabaseItem[];
  }>({});

  // Saved mode state
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  const categoryConfig = [
    { key: 'italian', emoji: '🍝', label: 'Italian' },
    { key: 'mexican', emoji: '🌮', label: 'Mexican' },
    { key: 'chinese', emoji: '🥡', label: 'Chinese' },
    { key: 'japanese', emoji: '🍜', label: 'Japanese' },
    { key: 'thai', emoji: '🍲', label: 'Thai' },
  ];

  const getUserName = () => {
    if (!user) return 'there';
    const email = user.email?.split('@')[0] || 'there';
    return email.charAt(0).toUpperCase() + email.slice(1);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Filter recipes based on search query
  const filterRecipes = <T extends { title: string }>(recipes: T[]): T[] => {
    if (!searchQuery.trim()) return recipes;

    const query = searchQuery.toLowerCase().trim();
    return recipes.filter((recipe) =>
      recipe.title.toLowerCase().includes(query)
    );
  };

  useEffect(() => {
    loadData();
  }, [mode]);

  const loadData = async () => {
    if (mode === 'explore') {
      await loadExploreRecipes();
    } else {
      await loadSavedRecipes();
    }
  };

  const loadExploreRecipes = async () => {
    if (!userId || !householdId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      console.log('[RecipesHero] Loading recipes for household:', householdId);
      const allRecipes = await getAllCategoriesWithRecipes(householdId, 30);
      const viewHistory = await recipeViewHistory.getViewHistoryMap();

      // Organize by category and rank each
      const categorized: { [category: string]: RecipeDatabaseItem[] } = {};

      for (const [category, recipes] of Object.entries(allRecipes)) {
        const ranked = rankRecipesWithFreshness(recipes, viewHistory);
        categorized[category] = ranked;
      }

      // Flatten all for general list
      const allFlat = Object.values(allRecipes).flat();
      const rankedAll = rankRecipesWithFreshness(allFlat, viewHistory);

      // Debug: Log sample pantry match values
      console.log('[RecipesHero] Sample pantry matches from first 3 recipes:');
      rankedAll.slice(0, 3).forEach(r => {
        console.log(`  - ${r.title}: ${r.pantry_match_percent}%`);
      });

      setExploreRecipes(rankedAll);
      setCategorizedRecipes(categorized);
    } catch (error) {
      console.error('[RecipesHero] Error loading explore recipes:', error);
      setExploreRecipes([]);
      setCategorizedRecipes({});
    } finally {
      setLoading(false);
    }
  };

  const loadSavedRecipes = async () => {
    if (!userId || !householdId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cook_cards')
        .select(`
          id,
          title,
          description,
          image_url,
          platform,
          creator_name,
          cook_time_minutes,
          total_time_minutes,
          created_at
        `)
        .eq('user_id', userId)
        .eq('is_archived', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get pantry items for match calculation
      console.log('[RecipesHero] Loading pantry items for household:', householdId);
      const { data: pantryData } = await supabase
        .from('pantry_items')
        .select('canonical_item_id')
        .eq('household_id', householdId)
        .eq('status', 'active');

      console.log('[RecipesHero] Found', pantryData?.length || 0, 'pantry items');

      const pantryCanonicalIds = new Set(
        pantryData?.map((item) => item.canonical_item_id).filter(Boolean) || []
      );

      // Get ingredient counts and calculate match percentage
      const recipesWithCounts = await Promise.all(
        (data || []).map(async (recipe) => {
          const { data: ingredients } = await supabase
            .from('cook_card_ingredients')
            .select('canonical_item_id')
            .eq('cook_card_id', recipe.id);

          const ingredientCount = ingredients?.length || 0;

          // Calculate pantry match
          const matchedIngredients = ingredients?.filter((ing) =>
            pantryCanonicalIds.has(ing.canonical_item_id)
          ).length || 0;

          const matchPercentage =
            ingredientCount > 0 ? Math.round((matchedIngredients / ingredientCount) * 100) : 0;

          return {
            ...recipe,
            ingredient_count: ingredientCount,
            pantry_match_percentage: matchPercentage,
            matched_ingredients: matchedIngredients,
          };
        })
      );

      // Debug: Log sample pantry match values for saved recipes
      console.log('[RecipesHero] Sample saved recipe matches from first 3:');
      recipesWithCounts.slice(0, 3).forEach(r => {
        console.log(`  - ${r.title}: ${r.pantry_match_percentage}% (${r.matched_ingredients}/${r.ingredient_count} ingredients)`);
      });

      setSavedRecipes(recipesWithCounts);
    } catch (error) {
      console.error('[RecipesHero] Error loading saved recipes:', error);
      setSavedRecipes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleExploreRecipePress = async (recipe: RecipeDatabaseItem) => {
    await recipeViewHistory.recordView(recipe.id);
    navigation.navigate('CookCard', { recipeDatabaseId: recipe.id });
  };

  const handleSavedRecipePress = async (recipe: SavedRecipe) => {
    try {
      // Load full Cook Card with ingredients
      const { data: cookCardData, error: cardError } = await supabase
        .from('cook_cards')
        .select('*')
        .eq('id', recipe.id)
        .single();

      if (cardError) throw cardError;

      const { data: ingredientsData, error: ingredientsError } = await supabase
        .from('cook_card_ingredients')
        .select('*')
        .eq('cook_card_id', recipe.id)
        .order('sort_order');

      if (ingredientsError) throw ingredientsError;

      // Transform to CookCard format
      const cookCard = {
        id: cookCardData.id,
        version: '1.0',
        source: {
          url: cookCardData.source_url,
          platform: cookCardData.platform,
          creator: {
            handle: cookCardData.creator_handle,
            name: cookCardData.creator_name,
            avatar_url: cookCardData.creator_avatar_url,
          },
        },
        title: cookCardData.title,
        description: cookCardData.description,
        image_url: cookCardData.image_url,
        prep_time_minutes: cookCardData.prep_time_minutes,
        cook_time_minutes: cookCardData.cook_time_minutes,
        total_time_minutes: cookCardData.total_time_minutes,
        servings: cookCardData.servings,
        instructions: {
          type: cookCardData.instructions_type || 'link_only',
          text: cookCardData.instructions_text,
          steps: cookCardData.instructions_json,
        },
        ingredients: (ingredientsData || []).map((ing: any, idx: number) => ({
          name: ing.ingredient_name,
          normalized_name: ing.normalized_name,
          canonical_item_id: ing.canonical_item_id,
          amount: ing.amount,
          unit: ing.unit,
          preparation: ing.preparation,
          confidence: ing.confidence,
          provenance: ing.provenance,
          in_pantry: ing.in_pantry,
          is_substitution: ing.is_substitution,
          substitution_rationale: ing.substitution_rationale,
          group: ing.ingredient_group,
          sort_order: ing.sort_order !== null ? ing.sort_order : idx,
          is_optional: ing.is_optional,
        })),
        extraction: {
          method: cookCardData.extraction_method,
          confidence: cookCardData.extraction_confidence,
          version: cookCardData.extraction_version,
          timestamp: cookCardData.created_at,
          cost_cents: cookCardData.extraction_cost_cents,
        },
        created_at: cookCardData.created_at,
        updated_at: cookCardData.updated_at,
      };

      navigation.navigate('CookCard', { cookCard, mode: 'normal' });
    } catch (error) {
      console.error('[RecipesHero] Failed to load saved recipe:', error);
    }
  };

  const renderExploreHeroCard = (recipe: RecipeDatabaseItem) => {
    const matchPercentage = Math.round(recipe.pantry_match_percent || 0);

    return (
      <Pressable
        key={recipe.id}
        style={styles.heroCard}
        onPress={() => handleExploreRecipePress(recipe)}
      >
        <Image
          source={{ uri: recipe.image_url || 'https://via.placeholder.com/400x300' }}
          style={styles.heroImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.75)']}
          style={styles.heroGradient}
        >
          <View style={styles.heroContent}>
            <View style={styles.matchBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
              <Text style={styles.matchBadgeText}>{matchPercentage}% Match</Text>
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {recipe.title}
            </Text>
            <View style={styles.heroMeta}>
              {recipe.total_time_minutes && (
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={14} color="#fff" />
                  <Text style={styles.metaText}>{recipe.total_time_minutes} min</Text>
                </View>
              )}
              {recipe.creator_name && (
                <View style={styles.metaItem}>
                  <Ionicons name="person-outline" size={14} color="#fff" />
                  <Text style={styles.metaText}>{recipe.creator_name}</Text>
                </View>
              )}
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    );
  };

  const renderSavedHeroCard = (recipe: SavedRecipe) => {
    const cookTime = recipe.cook_time_minutes || recipe.total_time_minutes;
    const matchPercentage = recipe.pantry_match_percentage || 0;

    return (
      <Pressable
        key={recipe.id}
        style={styles.heroCard}
        onPress={() => handleSavedRecipePress(recipe)}
      >
        <Image
          source={{
            uri: recipe.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
          }}
          style={styles.heroImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.75)']}
          style={styles.heroGradient}
        >
          <View style={styles.heroContent}>
            <View style={styles.matchBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
              <Text style={styles.matchBadgeText}>{matchPercentage}% Match</Text>
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {recipe.title}
            </Text>
            <View style={styles.heroMeta}>
              {cookTime && (
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={14} color="#fff" />
                  <Text style={styles.metaText}>{cookTime} min</Text>
                </View>
              )}
              {recipe.ingredient_count && (
                <View style={styles.metaItem}>
                  <Ionicons name="restaurant-outline" size={14} color="#fff" />
                  <Text style={styles.metaText}>{recipe.ingredient_count} ingredients</Text>
                </View>
              )}
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    );
  };

  const renderStandardExploreCard = (recipe: RecipeDatabaseItem) => {
    const matchPercentage = Math.round(recipe.pantry_match_percent || 0);

    return (
      <Pressable
        key={recipe.id}
        style={styles.standardCard}
        onPress={() => handleExploreRecipePress(recipe)}
      >
        <Image
          source={{ uri: recipe.image_url || 'https://via.placeholder.com/200x200' }}
          style={styles.standardImage}
          resizeMode="cover"
        />
        <View style={styles.standardContent}>
          <Text style={styles.standardTitle} numberOfLines={2}>
            {recipe.title}
          </Text>
          <View style={styles.standardMeta}>
            {recipe.total_time_minutes && (
              <View style={styles.standardMetaItem}>
                <Ionicons name="time-outline" size={12} color={theme.colors.textSecondary} />
                <Text style={styles.standardMetaText}>{recipe.total_time_minutes} min</Text>
              </View>
            )}
            <View style={[styles.standardMetaItem, styles.matchTag]}>
              <Text style={styles.matchTagText}>{matchPercentage}% match</Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  const renderStandardSavedCard = (recipe: SavedRecipe) => {
    const cookTime = recipe.cook_time_minutes || recipe.total_time_minutes;
    const matchPercentage = recipe.pantry_match_percentage || 0;

    return (
      <Pressable
        key={recipe.id}
        style={styles.standardCard}
        onPress={() => handleSavedRecipePress(recipe)}
      >
        <Image
          source={{
            uri: recipe.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
          }}
          style={styles.standardImage}
          resizeMode="cover"
        />
        <View style={styles.standardContent}>
          <Text style={styles.standardTitle} numberOfLines={2}>
            {recipe.title}
          </Text>
          <View style={styles.standardMeta}>
            {cookTime && (
              <View style={styles.standardMetaItem}>
                <Ionicons name="time-outline" size={12} color={theme.colors.textSecondary} />
                <Text style={styles.standardMetaText}>{cookTime} min</Text>
              </View>
            )}
            <View style={[styles.standardMetaItem, styles.matchTag]}>
              <Text style={styles.matchTagText}>{matchPercentage}% match</Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  const currentRecipes = mode === 'explore' ? exploreRecipes : savedRecipes;
  const hasRecipes = currentRecipes.length > 0;

  // Apply search filter to all recipes
  const filteredExploreRecipes = filterRecipes(exploreRecipes);
  const filteredSavedRecipes = filterRecipes(savedRecipes);

  // Smart categorization for Explore mode
  const getReadyToCookRecipes = () =>
    filteredExploreRecipes.filter((r) => {
      const match = r.pantry_match_percent || 0; // Already 0-100
      return match >= 95; // 100% match (95+ to account for rounding)
    });

  const getAlmostThereRecipes = () => {
    const almostReady = filteredExploreRecipes.filter((r) => {
      const match = r.pantry_match_percent || 0; // Already 0-100
      return match >= 60 && match < 95; // Missing 1-2 ingredients typically
    });

    // If we have matches, return them. Otherwise show top recipes sorted by match
    if (almostReady.length > 0) {
      return almostReady;
    }

    // Fallback: Show top recipes sorted by pantry match
    return [...filteredExploreRecipes]
      .sort((a, b) => (b.pantry_match_percent || 0) - (a.pantry_match_percent || 0))
      .slice(0, 10);
  };

  const renderHorizontalCard = (recipe: RecipeDatabaseItem) => {
    const matchPercentage = Math.round(recipe.pantry_match_percent || 0);

    return (
      <Pressable
        key={recipe.id}
        style={styles.horizontalCard}
        onPress={() => handleExploreRecipePress(recipe)}
      >
        <Image
          source={{ uri: recipe.image_url || 'https://via.placeholder.com/280x200' }}
          style={styles.horizontalImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.75)']}
          style={styles.horizontalGradient}
        >
          <View style={styles.horizontalContent}>
            <View style={styles.horizontalBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#fff" />
              <Text style={styles.horizontalBadgeText}>{matchPercentage}%</Text>
            </View>
            <Text style={styles.horizontalTitle} numberOfLines={2}>
              {recipe.title}
            </Text>
            <View style={styles.horizontalMeta}>
              {recipe.total_time_minutes && (
                <View style={styles.horizontalMetaItem}>
                  <Ionicons name="time-outline" size={12} color="#fff" />
                  <Text style={styles.horizontalMetaText}>{recipe.total_time_minutes} min</Text>
                </View>
              )}
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    );
  };

  const renderCategorySection = (categoryKey: string, emoji: string, label: string) => {
    const recipes = filterRecipes(categorizedRecipes[categoryKey] || []);
    if (recipes.length === 0) return null;

    return (
      <View key={categoryKey} style={styles.categorySection}>
        <View style={styles.categorySectionHeader}>
          <View style={styles.categorySectionLeft}>
            <Text style={styles.categoryEmoji}>{emoji}</Text>
            <Text style={styles.categorySectionTitle}>{label}</Text>
            <View style={styles.categoryCount}>
              <Text style={styles.categoryCountText}>{recipes.length}</Text>
            </View>
          </View>
          {recipes.length > 10 && (
            <Pressable onPress={() => navigation.navigate('RecipeListScreen' as never, {
              title: `${label} Recipes`,
              recipes: recipes,
              filterType: 'category',
            } as never)}>
              <View style={styles.viewAllButton}>
                <Text style={styles.viewAllText}>
                  View all {recipes.length}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
              </View>
            </Pressable>
          )}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryCarousel}
        >
          {recipes.slice(0, 10).map((recipe) => renderHorizontalCard(recipe))}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View>
            <Text style={styles.greeting}>
              {getGreeting()}, {getUserName()}
            </Text>
            <Text style={styles.headerTitle}>What would you like to cook today?</Text>
          </View>
          <Pressable style={styles.avatarContainer}>
            <Ionicons name="person-circle-outline" size={40} color={theme.colors.primary} />
          </Pressable>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons
            name="search"
            size={20}
            color={theme.colors.textSecondary}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search any recipes"
            placeholderTextColor={theme.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          )}
        </View>

        {/* Mode Toggle */}
        <View style={styles.modeToggle}>
          <Pressable
            style={[styles.modeButton, mode === 'explore' && styles.modeButtonActive]}
            onPress={() => setMode('explore')}
          >
            <Text style={[styles.modeButtonText, mode === 'explore' && styles.modeButtonTextActive]}>
              Explore
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, mode === 'saved' && styles.modeButtonActive]}
            onPress={() => setMode('saved')}
          >
            <Ionicons
              name="bookmark"
              size={16}
              color={mode === 'saved' ? '#fff' : theme.colors.primary}
              style={styles.modeButtonIcon}
            />
            <Text style={[styles.modeButtonText, mode === 'saved' && styles.modeButtonTextActive]}>
              Saved Recipes
            </Text>
          </Pressable>
        </View>

        {/* Feature Card - Add from Social Media (Saved Mode Only) */}
        {mode === 'saved' && (
          <Pressable
            style={styles.pasteRecipeCard}
            onPress={() => navigation.navigate('PasteLink' as never)}
          >
            <View style={styles.pasteRecipeLeft}>
              <View style={styles.pasteRecipeIconContainer}>
                <Ionicons name="link" size={24} color={theme.colors.primary} />
              </View>
              <View style={styles.pasteRecipeText}>
                <Text style={styles.pasteRecipeTitle}>Add from Social Media</Text>
                <Text style={styles.pasteRecipeSubtitle}>Instagram, TikTok, YouTube & more</Text>
              </View>
            </View>
            <Ionicons name="arrow-forward" size={20} color={theme.colors.textSecondary} />
          </Pressable>
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : !hasRecipes ? (
          <View style={styles.emptyState}>
            <Ionicons
              name={mode === 'explore' ? 'restaurant-outline' : 'bookmark-outline'}
              size={64}
              color="#D1D5DB"
            />
            <Text style={styles.emptyTitle}>
              {mode === 'explore' ? 'No Recipes Found' : 'No Saved Recipes Yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {mode === 'explore'
                ? 'Try adjusting your filters'
                : 'Paste recipe links to save them to your collection'}
            </Text>
            {mode === 'saved' && (
              <Pressable
                style={styles.pasteLinkButton}
                onPress={() => navigation.navigate('PasteLink' as never)}
              >
                <Ionicons name="link" size={20} color="#FFFFFF" />
                <Text style={styles.pasteLinkButtonText}>Paste Recipe Link</Text>
              </Pressable>
            )}
          </View>
        ) : mode === 'explore' ? (
          <>
            {/* Ready to Cook Section - Hero Cards */}
            {getReadyToCookRecipes().length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderLeft}>
                    <Ionicons name="checkmark-circle" size={24} color={theme.colors.primary} />
                    <Text style={styles.sectionTitle}>Ready to Cook</Text>
                    <View style={styles.sectionBadge}>
                      <Text style={styles.sectionBadgeText}>
                        {getReadyToCookRecipes().length}
                      </Text>
                    </View>
                  </View>
                  {getReadyToCookRecipes().length > 3 && (
                    <Pressable onPress={() => navigation.navigate('RecipeListScreen' as never, {
                      title: 'Ready to Cook',
                      recipes: getReadyToCookRecipes(),
                      filterType: 'readyToCook',
                    } as never)}>
                      <View style={styles.viewAllButton}>
                        <Text style={styles.viewAllText}>
                          View all {getReadyToCookRecipes().length}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
                      </View>
                    </Pressable>
                  )}
                </View>
                <Text style={styles.sectionSubtitle}>You have all the ingredients</Text>

                {getReadyToCookRecipes()
                  .slice(0, 3)
                  .map((recipe) => renderExploreHeroCard(recipe))}
              </View>
            )}

            {/* Almost There Section - Hero Cards */}
            {getAlmostThereRecipes().length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderLeft}>
                    <Ionicons name="basket" size={24} color="#F59E0B" />
                    <Text style={styles.sectionTitle}>Almost There</Text>
                    <View style={styles.sectionBadge}>
                      <Text style={styles.sectionBadgeText}>{getAlmostThereRecipes().length}</Text>
                    </View>
                  </View>
                  {getAlmostThereRecipes().length > 3 && (
                    <Pressable onPress={() => navigation.navigate('RecipeListScreen' as never, {
                      title: 'Almost There',
                      recipes: getAlmostThereRecipes(),
                      filterType: 'almostThere',
                    } as never)}>
                      <View style={styles.viewAllButton}>
                        <Text style={styles.viewAllText}>
                          View all {getAlmostThereRecipes().length}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
                      </View>
                    </Pressable>
                  )}
                </View>
                <Text style={styles.sectionSubtitle}>
                  Just a few ingredients away
                </Text>

                {getAlmostThereRecipes()
                  .slice(0, 3)
                  .map((recipe) => renderExploreHeroCard(recipe))}
              </View>
            )}

            {/* Category Carousels */}
            {categoryConfig.map((cat) =>
              renderCategorySection(cat.key, cat.emoji, cat.label)
            )}

            {/* More Recommendations */}
            {filteredExploreRecipes.length > 10 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>More For You</Text>
                  {filteredExploreRecipes.length > 20 && (
                    <Pressable onPress={() => navigation.navigate('RecipeListScreen' as never, {
                      title: 'More Recipes',
                      recipes: filteredExploreRecipes.slice(10),
                      filterType: 'all',
                    } as never)}>
                      <View style={styles.viewAllButton}>
                        <Text style={styles.viewAllText}>
                          View all {filteredExploreRecipes.length - 10}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
                      </View>
                    </Pressable>
                  )}
                </View>

                <View style={styles.standardGrid}>
                  {filteredExploreRecipes
                    .slice(10, 20)
                    .map((recipe) => renderStandardExploreCard(recipe))}
                </View>
              </View>
            )}
          </>
        ) : (
          <>
            {/* Saved Recipes - Hero Cards */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent Saves</Text>
                {filteredSavedRecipes.length > 3 && (
                  <Pressable onPress={() => navigation.navigate('RecipeListScreen' as never, {
                    title: 'Saved Recipes',
                    recipes: filteredSavedRecipes,
                    filterType: 'all',
                  } as never)}>
                    <View style={styles.viewAllButton}>
                      <Text style={styles.viewAllText}>
                        View all {filteredSavedRecipes.length}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
                    </View>
                  </Pressable>
                )}
              </View>

              {filteredSavedRecipes
                .slice(0, 3)
                .map((recipe) => renderSavedHeroCard(recipe))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFBFC',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    lineHeight: 32,
    maxWidth: screenWidth - 120,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F9F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 16,
    height: 52,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
  },
  clearButton: {
    padding: 4,
  },
  filterButton: {
    padding: 4,
  },
  modeToggle: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  modeButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  modeButtonIcon: {
    marginRight: 6,
  },
  modeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  // Paste Recipe Feature Card
  pasteRecipeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0F9F6',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary + '20',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  pasteRecipeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  pasteRecipeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pasteRecipeText: {
    flex: 1,
  },
  pasteRecipeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  pasteRecipeSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
  },
  pasteLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 24,
  },
  pasteLinkButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  heroCard: {
    height: 240,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
    justifyContent: 'flex-end',
    padding: 20,
  },
  heroContent: {
    gap: 8,
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  matchBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 28,
  },
  heroMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
  standardGrid: {
    paddingHorizontal: 20,
    gap: 16,
  },
  standardCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  standardImage: {
    width: 100,
    height: 100,
  },
  standardContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  standardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    lineHeight: 22,
  },
  standardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  standardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  standardMetaText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  matchTag: {
    backgroundColor: '#E8F5F1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  matchTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  // Horizontal cards for carousels
  horizontalCard: {
    width: 280,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  horizontalImage: {
    width: '100%',
    height: '100%',
  },
  horizontalGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
    justifyContent: 'flex-end',
    padding: 12,
  },
  horizontalContent: {
    gap: 6,
  },
  horizontalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  horizontalBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  horizontalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    lineHeight: 20,
  },
  horizontalMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  horizontalMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  horizontalMetaText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  // Category sections
  categorySection: {
    marginBottom: 32,
  },
  categorySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  categorySectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryEmoji: {
    fontSize: 24,
  },
  categorySectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  categoryCount: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categoryCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  categoryCarousel: {
    paddingLeft: 20,
    gap: 12,
  },
});
