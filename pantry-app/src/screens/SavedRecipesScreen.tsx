/**
 * Saved Recipes Screen - Recipe Collection View
 *
 * Purpose: Display user's saved Cook Cards in a grid layout
 * Access: Recipes tab → "Saved" section or dedicated tab
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

interface SavedRecipe {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  platform: string;
  creator_name?: string;
  creator_handle?: string;
  source_url: string;
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  servings?: number;
  extraction_confidence: number;
  created_at: string;
  ingredient_count?: number;
}

export const SavedRecipesScreen: React.FC = () => {
  const navigation = useNavigation();
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedRecipes, setSelectedRecipes] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadSavedRecipes();
  }, []);

  const loadSavedRecipes = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to view saved recipes');
        return;
      }

      // Query cook_cards with ingredient count
      const { data, error } = await supabase
        .from('cook_cards')
        .select(`
          id,
          title,
          description,
          image_url,
          platform,
          creator_name,
          creator_handle,
          source_url,
          prep_time_minutes,
          cook_time_minutes,
          servings,
          extraction_confidence,
          created_at
        `)
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get ingredient counts for each recipe
      const recipesWithCounts = await Promise.all(
        (data || []).map(async (recipe) => {
          const { count } = await supabase
            .from('cook_card_ingredients')
            .select('*', { count: 'exact', head: true })
            .eq('cook_card_id', recipe.id);

          return {
            ...recipe,
            ingredient_count: count || 0,
          };
        })
      );

      setRecipes(recipesWithCounts);
    } catch (error) {
      console.error('Failed to load saved recipes:', error);
      Alert.alert('Error', 'Failed to load saved recipes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadSavedRecipes();
  };

  const toggleRecipeSelection = (recipeId: string) => {
    const newSelected = new Set(selectedRecipes);
    if (newSelected.has(recipeId)) {
      newSelected.delete(recipeId);
    } else {
      newSelected.add(recipeId);
    }
    setSelectedRecipes(newSelected);
  };

  const handleRecipePress = async (recipe: SavedRecipe) => {
    // In multi-select mode, toggle selection instead of navigating
    if (multiSelectMode) {
      toggleRecipeSelection(recipe.id);
      return;
    }

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

      // Navigate to CookCardScreen
      navigation.navigate('CookCard', { cookCard, mode: 'normal' });
    } catch (error) {
      console.error('Failed to load Cook Card:', error);
      Alert.alert('Error', 'Failed to load recipe details');
    }
  };

  const handleAddToShoppingList = async () => {
    if (selectedRecipes.size === 0) {
      Alert.alert('No Recipes Selected', 'Please select at least one recipe');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in');
        return;
      }

      // Get household_id from household_members table
      const { data: membership } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id)
        .single();

      if (!membership?.household_id) {
        Alert.alert('Setup Required', 'Please complete your profile setup');
        return;
      }

      const householdId = membership.household_id;

      // Get or create active shopping list for household
      let { data: lists, error: listsError } = await supabase
        .from('shopping_lists')
        .select('id')
        .eq('household_id', householdId)
        .eq('is_active', true)
        .limit(1);

      if (listsError) throw listsError;

      let listId: string;

      if (!lists || lists.length === 0) {
        // Create new shopping list
        const { data: newList, error: createError } = await supabase
          .from('shopping_lists')
          .insert({
            household_id: householdId,
            title: 'Shopping List',
            is_active: true,
          })
          .select('id')
          .single();

        if (createError) throw createError;
        listId = newList.id;
      } else {
        listId = lists[0].id;
      }

      // Fetch all ingredients for selected recipes
      const selectedRecipeIds = Array.from(selectedRecipes);
      const { data: allIngredients, error: ingredientsError } = await supabase
        .from('cook_card_ingredients')
        .select('ingredient_name, canonical_item_id, amount, unit, cook_card_id')
        .in('cook_card_id', selectedRecipeIds);

      if (ingredientsError) throw ingredientsError;

      // Get pantry items to check what user already has
      const { data: pantryItems } = await supabase
        .from('pantry_items')
        .select('canonical_item_id')
        .eq('household_id', householdId)
        .eq('status', 'active');

      const pantryCanonicalIds = new Set(
        pantryItems?.map(item => item.canonical_item_id).filter(Boolean) || []
      );

      // Get existing shopping list items to avoid duplicates
      const { data: existingItems } = await supabase
        .from('shopping_list_items')
        .select('canonical_item_id')
        .eq('list_id', listId)
        .eq('checked', false); // Only check unchecked items

      const shoppingListCanonicalIds = new Set(
        existingItems?.map(item => item.canonical_item_id).filter(Boolean) || []
      );

      // Deduplicate ingredients by canonical_item_id, SUM quantities when possible
      const ingredientMap = new Map<string, {
        name: string;
        amount: number | null;
        unit: string | null;
        canonicalId: string;
        cookCardIds: string[];
        recipeNames: string[];
      }>();

      // Get recipe names for attribution
      const recipeNamesMap = new Map<string, string>();
      recipes.forEach(recipe => {
        recipeNamesMap.set(recipe.id, recipe.title);
      });

      (allIngredients || []).forEach(ing => {
        if (!ing.canonical_item_id) return; // Skip ingredients without canonical mapping

        // Skip if already in pantry
        if (pantryCanonicalIds.has(ing.canonical_item_id)) return;

        // Skip if already in shopping list
        if (shoppingListCanonicalIds.has(ing.canonical_item_id)) return;

        const existing = ingredientMap.get(ing.canonical_item_id);

        if (!existing) {
          // First occurrence - add to map
          ingredientMap.set(ing.canonical_item_id, {
            name: ing.ingredient_name,
            amount: ing.amount ?? null,
            unit: ing.unit ?? null,
            canonicalId: ing.canonical_item_id,
            cookCardIds: [ing.cook_card_id],
            recipeNames: [recipeNamesMap.get(ing.cook_card_id) || 'Unknown Recipe'],
          });
        } else {
          // Duplicate found - try to sum quantities
          const sameUnit = existing.unit?.toLowerCase() === ing.unit?.toLowerCase();
          const bothHaveAmounts = existing.amount != null && ing.amount != null;

          if (sameUnit && bothHaveAmounts) {
            // ✅ Same unit - sum the quantities
            existing.amount = Number(existing.amount) + Number(ing.amount);
            console.log(`[Shopping] Summed ${ing.ingredient_name}: ${existing.amount} ${existing.unit}`);
          } else if (sameUnit && !bothHaveAmounts) {
            // Same unit but one is missing amount (e.g., "to taste")
            // Keep the one with amount, or keep existing if both missing
            if (ing.amount != null && existing.amount == null) {
              existing.amount = ing.amount;
            }
          } else if (!sameUnit && bothHaveAmounts) {
            // ⚠️ Different units - can't sum automatically
            // For MVP: keep larger amount, or first one
            // TODO: Unit conversion in future version
            console.warn(`[Shopping] Different units for ${ing.ingredient_name}: ${existing.unit} vs ${ing.unit} - keeping first`);
          }
          // else: no amounts on either - keep as-is (e.g., "to taste")

          // Track that this ingredient is used in multiple recipes
          existing.cookCardIds.push(ing.cook_card_id);
          const recipeName = recipeNamesMap.get(ing.cook_card_id) || 'Unknown Recipe';
          if (!existing.recipeNames.includes(recipeName)) {
            existing.recipeNames.push(recipeName);
          }
        }
      });

      if (ingredientMap.size === 0) {
        Alert.alert(
          'All Set!',
          'All ingredients are already in your pantry or shopping list!'
        );
        setMultiSelectMode(false);
        setSelectedRecipes(new Set());
        return;
      }

      // Add to shopping list
      const shoppingListItems = Array.from(ingredientMap.values()).map(ing => ({
        list_id: listId,
        name: ing.name,
        quantity: ing.amount,
        unit: ing.unit,
        canonical_item_id: ing.canonicalId,
        cook_card_id: ing.cookCardIds[0], // Store first recipe (FK constraint - can only store one)
        recipe_name: ing.recipeNames[0], // Primary recipe name
        // Note: If used in multiple recipes, the summed quantity reflects total needed
        checked: false,
      }));

      const { error: insertError } = await supabase
        .from('shopping_list_items')
        .insert(shoppingListItems);

      if (insertError) throw insertError;

      // Count ingredients used in multiple recipes
      const sharedCount = Array.from(ingredientMap.values()).filter(ing => ing.recipeNames.length > 1).length;
      const message = sharedCount > 0
        ? `Added ${ingredientMap.size} ingredients from ${selectedRecipes.size} recipes to your shopping list.\n\n${sharedCount} ingredient${sharedCount === 1 ? '' : 's'} used in multiple recipes (quantities summed).`
        : `Added ${ingredientMap.size} ingredients from ${selectedRecipes.size} recipes to your shopping list.`;

      Alert.alert('Success!', message);

      // Exit multi-select mode
      setMultiSelectMode(false);
      setSelectedRecipes(new Set());
    } catch (error) {
      console.error('Failed to add to shopping list:', error);
      Alert.alert('Error', 'Failed to add ingredients to shopping list');
    }
  };

  const formatTime = (minutes?: number): string => {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const renderRecipeCard = ({ item }: { item: SavedRecipe }) => {
    const isSelected = selectedRecipes.has(item.id);

    return (
      <Pressable
        style={[styles.recipeCard, isSelected && styles.recipeCardSelected]}
        onPress={() => handleRecipePress(item)}
      >
        <Image
          source={{
            uri: item.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
          }}
          style={styles.recipeImage}
          resizeMode="cover"
        />

        {/* Platform Badge */}
        <View style={[styles.platformBadge, { backgroundColor: getPlatformColor(item.platform) }]}>
          <Ionicons name={getPlatformIcon(item.platform)} size={14} color="#FFFFFF" />
        </View>

        {/* Selection Checkbox - Multi-Select Mode */}
        {multiSelectMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
          </View>
        )}

        {/* Recipe Info */}
        <View style={styles.recipeInfo}>
          <Text style={styles.recipeTitle} numberOfLines={2}>
            {item.title}
          </Text>

          {item.creator_name && (
            <Text style={styles.creatorText} numberOfLines={1}>
              by {item.creator_name}
            </Text>
          )}

          <View style={styles.metadata}>
            {item.ingredient_count ? (
              <View style={styles.metaItem}>
                <Ionicons name="restaurant-outline" size={14} color="#6B7280" />
                <Text style={styles.metaText}>{item.ingredient_count} ingredients</Text>
              </View>
            ) : null}
            {item.cook_time_minutes ? (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={14} color="#6B7280" />
                <Text style={styles.metaText}>{formatTime(item.cook_time_minutes)}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  const getPlatformIcon = (platform: string): any => {
    switch (platform) {
      case 'youtube':
        return 'logo-youtube';
      case 'instagram':
        return 'logo-instagram';
      case 'tiktok':
        return 'musical-notes';
      default:
        return 'link-outline';
    }
  };

  const getPlatformColor = (platform: string): string => {
    switch (platform) {
      case 'youtube':
        return '#FF0000';
      case 'instagram':
        return '#E4405F';
      case 'tiktok':
        return '#000000';
      default:
        return '#6B7280';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Saved Recipes</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Loading your recipes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Saved Recipes</Text>
          <Text style={styles.headerSubtitle}>
            {multiSelectMode
              ? `${selectedRecipes.size} selected`
              : `${recipes.length} recipes`}
          </Text>
        </View>
        {recipes.length > 0 && (
          <Pressable
            style={styles.selectButton}
            onPress={() => {
              setMultiSelectMode(!multiSelectMode);
              setSelectedRecipes(new Set());
            }}
          >
            <Text style={styles.selectButtonText}>
              {multiSelectMode ? 'Cancel' : 'Select'}
            </Text>
          </Pressable>
        )}
      </View>

      {recipes.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="bookmark-outline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No Saved Recipes Yet</Text>
          <Text style={styles.emptySubtitle}>
            Paste recipe links to save them to your collection
          </Text>
          <Pressable
            style={styles.pasteLinkButton}
            onPress={() => navigation.navigate('PasteLink')}
          >
            <Ionicons name="link" size={20} color="#FFFFFF" />
            <Text style={styles.pasteLinkButtonText}>Paste Recipe Link</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <FlatList
            data={recipes}
            renderItem={renderRecipeCard}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={[
              styles.grid,
              multiSelectMode && selectedRecipes.size > 0 && styles.gridWithBottomBar
            ]}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
          />

          {/* Bottom Action Bar - Multi-Select Mode */}
          {multiSelectMode && selectedRecipes.size > 0 && (
            <View style={styles.bottomActionBar}>
              <View style={styles.actionBarInfo}>
                <Ionicons name="cart-outline" size={24} color="#10B981" />
                <Text style={styles.actionBarText}>
                  {selectedRecipes.size} recipe{selectedRecipes.size > 1 ? 's' : ''} selected
                </Text>
              </View>
              <Pressable
                style={styles.addToListButton}
                onPress={handleAddToShoppingList}
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
                <Text style={styles.addToListButtonText}>Add to Shopping List</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  selectButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  selectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
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
    backgroundColor: '#10B981',
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
  grid: {
    padding: 12,
  },
  gridWithBottomBar: {
    paddingBottom: 80, // Add padding to prevent overlap with bottom action bar
  },
  recipeCard: {
    flex: 1,
    margin: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  recipeCardSelected: {
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOpacity: 0.3,
  },
  checkbox: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  recipeImage: {
    width: '100%',
    height: 140,
    backgroundColor: '#F3F4F6',
  },
  platformBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipeInfo: {
    padding: 12,
  },
  recipeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  creatorText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  metadata: {
    flexDirection: 'column',
    gap: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#6B7280',
  },
  bottomActionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  actionBarInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  addToListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addToListButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
