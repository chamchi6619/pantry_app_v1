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
  Alert,
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
import { canonicalItemsService } from '../../../services/canonicalItemsService';
import { supabase } from '../../../lib/supabase';
import { getHybridRecommendations, getPersonalizedRecommendations } from '../../../services/recommendationEngine';

// Stores
import { useInventorySupabaseStore } from '../../../stores/inventorySupabaseStore';
import { theme } from '../../../core/constants/theme';

const { width: screenWidth } = Dimensions.get('window');

export const ExploreRecipesScreenSupabase: React.FC = () => {
  const navigation = useNavigation<any>();
  const { householdId, user } = useAuth();
  const userId = user?.id;

  // State
  const [activeMode, setActiveMode] = useState<'Explore' | 'From Your Pantry'>('Explore');
  const [activeCategory, setActiveCategory] = useState('Popular');
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);
  const [recommendationMode, setRecommendationMode] = useState<'Your Recipes' | 'Discover New'>('Your Recipes');

  // Recipe state
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalCanonicalItems: 0 });

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

      // Get canonical items count
      const { count } = await supabase
        .from('canonical_items')
        .select('*', { count: 'exact', head: true });

      setStats({ totalCanonicalItems: count || 0 });

      console.log('✅ Recipe services initialized. Canonical items:', count);
    } catch (error) {
      console.error('Error initializing services:', error);
    }
  };

  // Load recipes when category, mode, or recommendation mode changes
  useEffect(() => {
    console.log(`🔄 loadRecipes triggered: mode=${activeMode}, category=${activeCategory}, recMode=${recommendationMode}`);
    loadRecipes();

    // Log telemetry when entering "From Your Pantry" mode
    if (activeMode === 'From Your Pantry') {
      (async () => {
        try {
          const { logIngressEvent, generateSessionId } = await import('../../../services/telemetry');
          logIngressEvent({
            sessionId: generateSessionId(),
            eventType: 'ingress_opened',
            ingressMethod: 'paste_link',
            platform: 'youtube',
            metadata: {
              screen: 'FromYourPantry',
              category: activeCategory,
              pantry_item_count: items?.length || 0,
            },
          });
        } catch (err) {
          console.warn('Failed to log pantry mode telemetry:', err);
        }
      })();
    }
  }, [activeCategory, activeMode, recommendationMode, items]);

  // No initial data loading needed - all recipes come from Cook Cards

  const loadRecipes = async () => {
    if (loading) return;

    console.log(`📥 loadRecipes EXECUTING: activeMode="${activeMode}", activeCategory="${activeCategory}"`);

    setLoading(true);
    try {
      let fetchedRecipes: any[];

      if (activeMode === 'From Your Pantry') {
        // Phase 3: NEW - Personalized recommendations from saved Cook Cards
        if (!householdId || !userId) {
          console.warn('No household ID or user ID available for pantry matching');
          fetchedRecipes = [];
          setRecipes([]);
          setLoading(false);
          return;
        }

        // OPTION 1: Use personalized recommendations (Phase 3) - Controlled by toggle
        if (recommendationMode === 'Your Recipes') {
        try {
          console.log('🎯 Using personalized recommendations from saved Cook Cards');
          const personalizedRecs = await getPersonalizedRecommendations(userId, householdId, 20);

          if (personalizedRecs.length > 0) {
            fetchedRecipes = personalizedRecs.map(rec => ({
              id: rec.cook_card.id,
              title: rec.cook_card.title,
              name: rec.cook_card.title,
              summary: rec.cook_card.description,
              imageUrl: rec.cook_card.image_url,
              cookTime: rec.cook_card.cook_time_minutes || rec.cook_card.total_time_minutes,
              servings: rec.cook_card.servings,
              matchPercentage: Math.round(rec.completeness * 100),
              matchScore: rec.match_score,
              priorityReasons: rec.priority_reasons,
              totalIngredients: rec.cook_card.ingredients?.length || 0,
              matchedCount: rec.have_ingredients.length,
              missingCount: rec.missing_ingredients.length,
              matchedIngredients: rec.have_ingredients.map(i => i.ingredient_name),
              missingIngredients: rec.missing_ingredients.map(i => i.ingredient_name),
              source_url: rec.cook_card.source_url,
              isPersonalized: true, // Flag for UI - navigate to CookCardScreen
              cookCard: rec.cook_card, // Full cook card data for navigation
            }));

            console.log(`✅ Got ${fetchedRecipes.length} personalized recommendations`);
          } else {
            // Fallback to YouTube discovery if no saved recipes
            console.log('📭 No saved recipes, falling back to YouTube discovery');
            fetchedRecipes = [];
            // Continue to OPTION 2 below
          }
        } catch (error) {
          console.error('❌ Error getting personalized recommendations:', error);
          fetchedRecipes = [];
        }
        } else {
          // Recommendation mode is 'Discover New' - skip personalized, go straight to YouTube
          fetchedRecipes = [];
        }

        // OPTION 2: Use YouTube discovery (fallback if no saved recipes OR if in 'Discover New' mode)
        if (fetchedRecipes.length === 0) {

        // Dynamic thresholds based on matchable pantry size
        // Count only items that can be matched (have canonical_item_id in DB)
        // Note: Store already filters to active items in loadFromSupabase()
        const totalPantryItems = items?.length || 0;

        // Use very lenient thresholds for small pantries
        // As users add more items, we can be more selective
        // High Match mode: aim for best possible matches given pantry size
        const baseMinMatch = totalPantryItems < 5 ? 5 :   // Tiny pantry: match if ANY ingredient matches
                            totalPantryItems < 10 ? 20 :  // Small pantry: low threshold
                            totalPantryItems < 20 ? 40 :  // Medium pantry: moderate threshold
                            50;  // Large pantry: reasonable threshold

        const baseMaxMissing = totalPantryItems < 5 ? 25 :   // Tiny pantry: allow lots of missing ingredients
                              totalPantryItems < 10 ? 15 :  // Small pantry: moderately lenient
                              totalPantryItems < 20 ? 10 :
                              7;

        // High Match: Use stricter thresholds, but still adaptive to pantry size
        const minMatch = activeCategory === 'High Match'
          ? Math.min(baseMinMatch + 30, 70)  // Add 30% to base, cap at 70%
          : baseMinMatch;

        const maxMissing = activeCategory === 'High Match'
          ? Math.max(Math.floor(baseMaxMissing / 3), 2)  // 1/3 of base, minimum 2
          : baseMaxMissing;

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

        console.log('🔍 Edge Function Response:', {
          hasError: !!error,
          success: data?.success,
          recipeCount: data?.recipes?.length,
          pantryCount: data?.pantry_item_count
        });

        if (error) {
          console.error('❌ Recipe search error:', error);
          fetchedRecipes = [];
        } else if (data.success) {
          const edgeFunctionRecipes = data.recipes || [];
          console.log('📊 First recipe raw data:', edgeFunctionRecipes[0]);

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

          console.log('✅ Transformed first recipe:', fetchedRecipes[0]);

          // Filter by category
          if (activeCategory === 'Use Soon') {
            const expiringItems = getExpiringIngredients();
            fetchedRecipes = fetchedRecipes.filter((r: any) => {
              return r.matchedIngredients?.some((ing: string) =>
                expiringItems.some(exp => ing.toLowerCase().includes(exp.name.toLowerCase()))
                // ✅ FIXED: Access exp.name instead of exp (now an object)
              );
            });
          }
        } else {
          fetchedRecipes = [];
        }
        } // Close: if (fetchedRecipes.length === 0)
      } else {
        // Explore mode - currently no recipes in Explore mode
        // All recipes are from saved Cook Cards in "From Your Pantry" mode
        // TODO: Add public recipe discovery in future phase
        fetchedRecipes = [];
      }

      console.log(`📝 Setting ${fetchedRecipes.length} recipes to state`);
      setRecipes(fetchedRecipes);
    } catch (error) {
      console.error('❌ Error loading recipes:', error);
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await canonicalItemsService.syncFromSupabase();
    await loadRecipes();
    setRefreshing(false);
  }, [activeCategory, activeMode]);

  // Handle add to shopping list
  const handleAddToShoppingList = async (recipe: any) => {
    try {
      const { addIngredientsToShoppingList } = await import('../../../services/shoppingListService');
      const { supabase } = await import('../../../lib/supabase');

      // Get household ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to add items to shopping list');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('household_id')
        .eq('id', user.id)
        .single();

      if (!profile?.household_id) {
        Alert.alert('Error', 'Could not find your household');
        return;
      }

      // Get missing ingredients
      const missingIngredients = recipe.missingIngredients || [];

      if (missingIngredients.length === 0) {
        Alert.alert('Nothing to Add', 'You have all the ingredients for this recipe!');
        return;
      }

      // Add to shopping list
      const result = await addIngredientsToShoppingList(
        missingIngredients,
        profile.household_id,
        recipe.id,
        recipe.title || recipe.name
      );

      // Show success message
      if (result.added > 0) {
        const message = result.duplicates > 0
          ? `Added ${result.added} item${result.added > 1 ? 's' : ''} (${result.duplicates} already in list)`
          : `Added ${result.added} item${result.added > 1 ? 's' : ''} to your shopping list`;

        Alert.alert('Success', message);
      } else {
        Alert.alert('Already Added', 'All items are already in your shopping list');
      }
    } catch (error) {
      console.error('Failed to add to shopping list:', error);
      Alert.alert('Error', 'Failed to add items to shopping list');
    }
  };

  // Get expiring ingredients
  const getExpiringIngredients = useCallback(() => {
    try {
      if (!items || !Array.isArray(items)) {
        console.log('[ExpiryDebug] No items or items not an array:', { hasItems: !!items, isArray: Array.isArray(items) });
        return [];
      }

      console.log('[ExpiryDebug] Total pantry items:', items.length);

      const expiringItems = items
        .filter(item => {
          try {
            if (!item || !item.expirationDate) {
              return false;
            }
            if (typeof item.expirationDate !== 'string') {
              console.log('[ExpiryDebug] Invalid expiration date type:', item.name, typeof item.expirationDate);
              return false;
            }

            const dateParts = item.expirationDate.split('-');
            if (!dateParts || dateParts.length !== 3) {
              console.log('[ExpiryDebug] Invalid date format:', item.name, item.expirationDate);
              return false;
            }

            const [year, month, day] = dateParts.map(Number);
            if (isNaN(year) || isNaN(month) || isNaN(day)) {
              console.log('[ExpiryDebug] Invalid date parts:', item.name, { year, month, day });
              return false;
            }

            const expiry = new Date(year, month - 1, day);
            const daysUntil = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const isExpiring = daysUntil <= 7 && daysUntil > 0;

            if (isExpiring) {
              console.log('[ExpiryDebug] Found expiring item:', item.name, { daysUntil, expirationDate: item.expirationDate, canonicalItemId: item.canonicalItemId });
            }

            return isExpiring;
          } catch (err) {
            console.error('[ExpiryDebug] Error processing expiration date for item:', item?.name, err);
            return false;
          }
        })
        .map(item => ({
          name: item.name || 'Unknown Item',
          canonicalItemId: item.canonicalItemId,
          daysUntilExpiry: item.expirationDate ? Math.ceil((new Date(item.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null,
        }));

      console.log('[ExpiryDebug] Total expiring items found:', expiringItems.length, expiringItems);
      return expiringItems;
    } catch (error) {
      console.error('[ExpiryDebug] Error getting expiring ingredients:', error);
      return [];
    }
  }, [items]);

  /**
   * Check if a recipe uses any expiring ingredients
   */
  const getRecipeExpiringItems = useCallback((recipe: any) => {
    const expiringIngredients = getExpiringIngredients();

    // Get ingredients array - handle both personalized (cookCard.ingredients) and YouTube (no ingredients)
    // Personalized recipes have cookCard.ingredients from saved Cook Cards
    // YouTube recipes don't have detailed ingredient data with canonical IDs
    const ingredients = recipe.cookCard?.ingredients || recipe.ingredients || [];

    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      console.log('[ExpiryDebug] Recipe has no ingredients:', recipe.title || recipe.name);
      return [];
    }

    console.log('[ExpiryDebug] Checking recipe:', recipe.title || recipe.name, {
      totalIngredients: ingredients.length,
      expiringIngredientsAvailable: expiringIngredients.length,
      sampleIngredient: ingredients[0]
    });

    const matchingExpiring = ingredients
      .filter((ing: any) => {
        const hasMatch = expiringIngredients.some(exp =>
          exp.canonicalItemId && ing.canonical_item_id === exp.canonicalItemId
        );
        if (hasMatch) {
          console.log('[ExpiryDebug] Found match!', ing.ingredient_name || ing.name, ing.canonical_item_id);
        }
        return hasMatch;
      })
      .map((ing: any) => {
        const expiringItem = expiringIngredients.find(exp => exp.canonicalItemId === ing.canonical_item_id);
        return {
          name: ing.ingredient_name || ing.name, // Handle both formats
          daysUntilExpiry: expiringItem?.daysUntilExpiry || 0,
        };
      });

    if (matchingExpiring.length > 0) {
      console.log('[ExpiryDebug] Recipe uses expiring ingredients:', recipe.title || recipe.name, matchingExpiring);
    }

    return matchingExpiring;
  }, [getExpiringIngredients]);

  /**
   * Transform database cook_card to CookCard TypeScript format
   */
  const transformCookCardFromDB = (dbCard: any): any => {
    return {
      id: dbCard.id,
      version: '1.0',
      source: {
        url: dbCard.source_url,
        platform: dbCard.platform,
        creator: {
          handle: dbCard.creator_handle,
          name: dbCard.creator_name,
          avatar_url: dbCard.creator_avatar_url,
        },
      },
      title: dbCard.title,
      description: dbCard.description,
      image_url: dbCard.image_url,
      prep_time_minutes: dbCard.prep_time_minutes,
      cook_time_minutes: dbCard.cook_time_minutes,
      total_time_minutes: dbCard.total_time_minutes,
      servings: dbCard.servings,
      instructions: {
        type: dbCard.instructions_type || 'link_only',
        text: dbCard.instructions_text,
        steps: dbCard.instructions_json,
      },
      ingredients: (dbCard.ingredients || []).map((ing: any, idx: number) => ({
        name: ing.ingredient_name,
        normalized_name: ing.normalized_name,
        canonical_item_id: ing.canonical_item_id,
        amount: ing.amount,
        unit: ing.unit,
        preparation: ing.preparation,
        confidence: ing.confidence || 1.0,
        provenance: ing.provenance || 'creator_provided',
        in_pantry: ing.in_pantry,
        is_substitution: ing.is_substitution,
        substitution_rationale: ing.substitution_rationale,
        group: ing.ingredient_group,
        sort_order: ing.sort_order !== null ? ing.sort_order : idx,
        is_optional: ing.is_optional,
      })),
      extraction: {
        method: dbCard.extraction_method || 'metadata',
        confidence: dbCard.extraction_confidence || 1.0,
        version: dbCard.extraction_version || '1.0',
        timestamp: dbCard.created_at || new Date().toISOString(),
        cost_cents: dbCard.extraction_cost_cents || 0,
      },
      created_at: dbCard.created_at,
      updated_at: dbCard.updated_at,
    };
  };

  // Navigation functions
  const handleRecipePress = async (recipe: any) => {
    if (!recipe) return;

    console.log('🔘 Recipe tapped:', recipe.title, 'Has ingredients?', !!recipe.ingredients, 'isPersonalized?', recipe.isPersonalized);

    // If this is a personalized recipe (from saved Cook Cards), navigate to CookCardScreen
    if (recipe.isPersonalized && recipe.cookCard) {
      console.log('🎯 Navigating to CookCardScreen for personalized recipe');
      const cookCard = transformCookCardFromDB(recipe.cookCard);
      navigation.navigate('CookCard', {
        cookCard,
        mode: 'normal',
      });
      return;
    }

    // Log telemetry for pantry recommendations
    if (activeMode === 'From Your Pantry' && recipe.source_url) {
      try {
        const { logIngressEvent, generateSessionId } = await import('../../../services/telemetry');
        logIngressEvent({
          sessionId: generateSessionId(),
          eventType: 'video_opened',
          ingressMethod: 'paste_link',
          platform: recipe.source_url.includes('youtube') ? 'youtube' : 'unknown',
          recipeUrl: recipe.source_url,
          metadata: {
            match_percentage: recipe.matchPercentage || 0,
            pantry_mode: activeMode,
            category: activeCategory,
          },
        });
      } catch (err) {
        console.warn('Failed to log telemetry:', err);
      }
    }

    // If recipe has YouTube URL, open in YouTube app
    if (recipe.source_url && recipe.source_url.includes('youtube')) {
      try {
        const { openYouTubeDeepLink } = await import('../../../services/cookCardService');
        await openYouTubeDeepLink(recipe.source_url, recipe.title || recipe.name);
        return;
      } catch (err) {
        console.error('Failed to open YouTube link:', err);
        // Fall through to normal navigation
      }
    }

    // If recipe doesn't have ingredients array, fetch full details from database
    if (!recipe.ingredients || !Array.isArray(recipe.ingredients)) {
      try {
        console.log('📡 Fetching full recipe details for:', recipe.id);
        const { data: fullRecipe, error } = await supabase
          .from('recipes')
          .select(`
            *,
            recipe_ingredients (
              id,
              ingredient_name,
              amount,
              unit,
              notes,
              is_optional,
              sort_order
            )
          `)
          .eq('id', recipe.id)
          .single();

        if (error) {
          console.error('❌ Error fetching recipe:', error);
          throw error;
        }

        if (fullRecipe) {
          console.log('✅ Got full recipe, ingredients count:', fullRecipe.recipe_ingredients?.length);

          // Transform to expected format - merge database recipe with existing recipe data
          const recipeWithIngredients = {
            ...recipe,
            ...fullRecipe, // Include all database fields
            id: fullRecipe.id,
            name: fullRecipe.title || recipe.title || recipe.name,
            ingredients: fullRecipe.recipe_ingredients?.map((ing: any) => ({
              id: ing.id,
              name: ing.ingredient_name,
              amount: ing.amount,
              unit: ing.unit,
              recipeText: ing.notes || `${ing.amount || ''} ${ing.unit || ''} ${ing.ingredient_name}`.trim(),
              isOptional: ing.is_optional,
              sortOrder: ing.sort_order,
              // Add parsed field for RecipeDetailScreen availability check
              parsed: {
                ingredient: ing.ingredient_name,
                quantity: ing.amount,
                unit: ing.unit,
              },
            })) || [],
            instructions: Array.isArray(fullRecipe.instructions)
              ? fullRecipe.instructions
              : fullRecipe.instructions
                ? fullRecipe.instructions
                    .split(/\r?\n\r?\n/)  // Split by double newlines (paragraph breaks)
                    .map((step: string) => step.replace(/^STEP \d+\r?\n?/i, '').trim())  // Remove "STEP X" prefix
                    .filter((step: string) => step.length > 0)  // Remove empty steps
                : [],
            tags: fullRecipe.tags || [],
            prepTime: fullRecipe.prep_time_minutes || 0,
            cookTime: fullRecipe.total_time_minutes || fullRecipe.cook_time_minutes || 0,
            servings: fullRecipe.servings || 4,
            difficulty: fullRecipe.difficulty || 'medium',
            category: fullRecipe.category || 'general',
            description: fullRecipe.description || recipe.description || '',
            source_url: fullRecipe.source_url || null,
          };

          console.log('🎯 Recipe details fetched:', recipeWithIngredients.ingredients.length);
          // RecipeDetailScreen deprecated - old recipes table no longer used
          Alert.alert(
            'Feature Not Available',
            'Recipe details for traditional recipes are no longer supported. Please use Cook Cards from social media instead.',
            [{ text: 'OK' }]
          );
          return;
        }
      } catch (error) {
        console.error('❌ Error fetching recipe details:', error);
        return;
      }
    }

    console.log('🎯 Recipe (old format)');
    // RecipeDetailScreen deprecated - old recipes table no longer used
    Alert.alert(
      'Feature Not Available',
      'Recipe details for traditional recipes are no longer supported. Please use Cook Cards from social media instead.',
      [{ text: 'OK' }]
    );
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
              ● {stats.totalCanonicalItems} ingredients
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

  console.log('📊 Pantry Summary Stats:', {
    pantryItemCount,
    matchedRecipeCount,
    bestMatchPercent,
    recipesArrayLength: recipes.length,
    firstRecipeMatch: recipes[0]?.matchPercentage,
    firstRecipeCounts: recipes[0] ? `${recipes[0].matchedCount}/${recipes[0].totalIngredients}` : 'N/A'
  });

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
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => navigation.navigate('BrowsePlatforms')}
            style={styles.browseButton}
          >
            <Ionicons name="search" size={20} color="#007AFF" />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('SocialRecipesTest')}
            style={styles.testButton}
          >
            <Ionicons name="flask" size={20} color="#6B7280" />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('SavedRecipes')}
            style={styles.savedButton}
          >
            <Ionicons name="bookmark" size={24} color={theme.colors.primary} />
            <Text style={styles.savedButtonText}>Saved</Text>
          </Pressable>
        </View>
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

        {/* Recommendation Mode Toggle - Only in Pantry Mode */}
        {activeMode === 'From Your Pantry' && (
          <View style={styles.recommendationToggle}>
            <SegmentedControl
              segments={['Your Recipes', 'Discover New']}
              activeSegment={recommendationMode}
              onSegmentPress={(segment) => setRecommendationMode(segment as any)}
            />
          </View>
        )}

        {/* Pantry Match Summary - Only in Pantry Mode */}
        {activeMode === 'From Your Pantry' && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>
              {recommendationMode === 'Your Recipes' ? 'From Your Collection' : 'What You Can Make'}
            </Text>
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

              // Check for expiring ingredients in this recipe
              const expiringItems = getRecipeExpiringItems(recipe);
              const hasExpiringIngredients = expiringItems.length > 0;

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

                  {/* Use-It-Up Badge - Expiring Ingredients */}
                  {activeMode === 'From Your Pantry' && hasExpiringIngredients && (
                    <View style={styles.expiryBadge}>
                      <Ionicons name="time" size={14} color="#DC2626" />
                      <Text style={styles.expiryBadgeText}>
                        Uses {expiringItems[0].name} (exp in {expiringItems[0].daysUntilExpiry}d)
                      </Text>
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
                            <Pressable
                              style={styles.addToListButton}
                              onPress={(e) => {
                                e.stopPropagation();
                                handleAddToShoppingList(recipe);
                              }}
                            >
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

      {/* Floating Action Button - Paste Recipe Link */}
      <Pressable
        style={styles.fab}
        onPress={() => navigation.navigate('PasteLink')}
      >
        <Ionicons name="link" size={24} color="#FFFFFF" />
        <Text style={styles.fabText}>Paste Link</Text>
      </Pressable>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  browseButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#E6F2FF',
    marginRight: 8,
  },
  testButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  savedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F0FDF4',
  },
  savedButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
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
  // Recommendation Toggle
  recommendationToggle: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
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
  expiryBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  expiryBadgeText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
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
  // Floating Action Button
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
