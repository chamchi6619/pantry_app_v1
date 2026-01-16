/**
 * RecipesHeroScreen - V1 My Recipes
 *
 * Purpose: Display user's saved recipes with manual entry option
 * V1 Scope: My Recipes only (no Explore, no recommendations)
 * Features:
 *  - View saved Cook Cards
 *  - Add new recipes (manual entry or URL import)
 *  - Search saved recipes
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
  TextInput,
  Modal,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../contexts/AuthContext';
import { theme } from '../../../core/constants/theme';
import { supabase } from '../../../lib/supabase';

const { width: screenWidth } = Dimensions.get('window');

interface SavedRecipe {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  platform: string;
  extraction_method?: string;
  source_url?: string;
  creator_name?: string;
  cook_time_minutes?: number;
  total_time_minutes?: number;
  ingredient_count?: number;
  pantry_match_percentage?: number;
  matched_ingredients?: number;
  created_at: string;
}

// Get source icon and label based on recipe origin
const getSourceInfo = (recipe: SavedRecipe): { icon: string; label: string; color: string } => {
  // Manual entry detection
  if (recipe.extraction_method === 'user_manual') {
    return { icon: '✏️', label: 'Manual', color: '#6B7280' };
  }

  // Xiaohongshu detection from URL
  if (recipe.source_url?.includes('xiaohongshu.com') || recipe.source_url?.includes('xhslink.com')) {
    return { icon: '📕', label: '小红书', color: '#FE2C55' };
  }

  // Platform-based icons
  switch (recipe.platform) {
    case 'youtube':
      return { icon: '▶️', label: 'YouTube', color: '#FF0000' };
    case 'tiktok':
      return { icon: '🎵', label: 'TikTok', color: '#000000' };
    case 'instagram':
      return { icon: '📷', label: 'Instagram', color: '#E4405F' };
    case 'web':
    default:
      return { icon: '🌐', label: 'Web', color: '#4B5563' };
  }
};

export default function RecipesHeroScreen() {
  const navigation = useNavigation<any>();
  const { user, householdId } = useAuth();
  const userId = user?.id;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true); // Start true for initial load
  const [refreshing, setRefreshing] = useState(false);
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Reload recipes when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadSavedRecipes(!hasLoadedOnce); // Only show loading spinner on first load
    }, [userId, householdId, hasLoadedOnce])
  );

  const loadSavedRecipes = async (showLoadingSpinner: boolean = false) => {
    if (!userId) {
      setLoading(false);
      return;
    }

    // Only show loading spinner on first load, not on subsequent refreshes
    if (showLoadingSpinner) {
      setLoading(true);
    }

    try {
      const { data, error } = await supabase
        .from('cook_cards')
        .select(`
          id,
          title,
          description,
          image_url,
          platform,
          extraction_method,
          source_url,
          creator_name,
          cook_time_minutes,
          total_time_minutes,
          created_at
        `)
        .eq('user_id', userId)
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

      setSavedRecipes(recipesWithCounts);
    } catch (error) {
      console.error('[RecipesHero] Error loading saved recipes:', error);
      setSavedRecipes([]);
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSavedRecipes();
    setRefreshing(false);
  };

  const handleRecipePress = async (recipe: SavedRecipe) => {
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
      console.error('[RecipesHero] Failed to load recipe:', error);
    }
  };

  const handleAddManual = () => {
    setShowAddModal(false);
    navigation.navigate('ManualRecipeEntry');
  };

  const handleAddFromUrl = () => {
    setShowAddModal(false);
    navigation.navigate('PasteLink');
  };

  // Filter recipes based on search query
  const filteredRecipes = searchQuery.trim()
    ? savedRecipes.filter((recipe) =>
        recipe.title.toLowerCase().includes(searchQuery.toLowerCase().trim())
      )
    : savedRecipes;

  const renderRecipeCard = (recipe: SavedRecipe) => {
    const cookTime = recipe.cook_time_minutes || recipe.total_time_minutes;
    const sourceInfo = getSourceInfo(recipe);

    return (
      <Pressable
        key={recipe.id}
        style={styles.recipeCard}
        onPress={() => handleRecipePress(recipe)}
      >
        {/* Source badge */}
        <View style={styles.sourceBadge}>
          <Text style={styles.sourceIcon}>{sourceInfo.icon}</Text>
          <Text style={styles.sourceLabel}>{sourceInfo.label}</Text>
        </View>

        {/* Title */}
        <Text style={styles.recipeTitle} numberOfLines={2}>
          {recipe.title}
        </Text>

        {/* Meta info */}
        <View style={styles.recipeMeta}>
          {cookTime && (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color="#6B7280" />
              <Text style={styles.metaText}>{cookTime} min</Text>
            </View>
          )}
          {recipe.ingredient_count && recipe.ingredient_count > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="restaurant-outline" size={14} color="#6B7280" />
              <Text style={styles.metaText}>{recipe.ingredient_count} ingredients</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="book-outline" size={64} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>No Recipes Yet</Text>
      <Text style={styles.emptySubtitle}>
        Start building your recipe collection by adding recipes manually or importing from links.
      </Text>
      <View style={styles.emptyActions}>
        <Pressable style={styles.emptyActionButton} onPress={handleAddManual}>
          <Ionicons name="create-outline" size={20} color="#fff" />
          <Text style={styles.emptyActionText}>Add Manually</Text>
        </Pressable>
        <Pressable
          style={[styles.emptyActionButton, styles.emptyActionButtonSecondary]}
          onPress={handleAddFromUrl}
        >
          <Ionicons name="link" size={20} color={theme.colors.primary} />
          <Text style={[styles.emptyActionText, styles.emptyActionTextSecondary]}>
            Import from URL
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const renderAddModal = () => (
    <Modal
      visible={showAddModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowAddModal(false)}
    >
      <Pressable style={styles.modalOverlay} onPress={() => setShowAddModal(false)}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Add Recipe</Text>
          <Text style={styles.modalSubtitle}>How would you like to add a recipe?</Text>

          <Pressable style={styles.modalOption} onPress={handleAddManual}>
            <View style={styles.modalOptionIcon}>
              <Ionicons name="create-outline" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.modalOptionText}>
              <Text style={styles.modalOptionTitle}>Add Manually</Text>
              <Text style={styles.modalOptionDescription}>
                Enter recipe details yourself (free)
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
          </Pressable>

          <Pressable style={styles.modalOption} onPress={handleAddFromUrl}>
            <View style={styles.modalOptionIcon}>
              <Ionicons name="link" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.modalOptionText}>
              <Text style={styles.modalOptionTitle}>Import from URL</Text>
              <Text style={styles.modalOptionDescription}>
                Paste a link from Instagram, TikTok, YouTube
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
          </Pressable>

          <Pressable style={styles.modalCancel} onPress={() => setShowAddModal(false)}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );

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
            <Text style={styles.headerTitle}>My Recipes</Text>
            <Text style={styles.headerSubtitle}>
              {savedRecipes.length} {savedRecipes.length === 1 ? 'recipe' : 'recipes'} saved
            </Text>
          </View>
          <Pressable style={styles.addButton} onPress={() => setShowAddModal(true)}>
            <Ionicons name="add" size={24} color="#fff" />
          </Pressable>
        </View>

        {/* Search Bar */}
        {savedRecipes.length > 0 && (
          <View style={styles.searchContainer}>
            <Ionicons
              name="search"
              size={20}
              color={theme.colors.textSecondary}
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by title"
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
        )}

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : savedRecipes.length === 0 ? (
          renderEmptyState()
        ) : filteredRecipes.length === 0 ? (
          <View style={styles.noResults}>
            <Ionicons name="search-outline" size={48} color="#D1D5DB" />
            <Text style={styles.noResultsText}>No recipes match "{searchQuery}"</Text>
          </View>
        ) : (
          <View style={styles.recipeList}>
            {filteredRecipes.map((recipe) => renderRecipeCard(recipe))}
          </View>
        )}
      </ScrollView>

      {renderAddModal()}
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
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 16,
    height: 48,
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
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  recipeList: {
    paddingHorizontal: 20,
    gap: 16,
  },
  recipeCard: {
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    padding: 16,
  },
  sourceBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginBottom: 10,
  },
  sourceIcon: {
    fontSize: 12,
  },
  sourceLabel: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
  },
  recipeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 24,
    marginBottom: 8,
  },
  recipeMeta: {
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
    color: '#6B7280',
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    marginTop: 20,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  emptyActions: {
    marginTop: 32,
    gap: 12,
    width: '100%',
  },
  emptyActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  emptyActionButtonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  emptyActionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyActionTextSecondary: {
    color: theme.colors.primary,
  },
  noResults: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  noResultsText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 16,
    textAlign: 'center',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  modalOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F5F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  modalOptionText: {
    flex: 1,
  },
  modalOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  modalOptionDescription: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  modalCancel: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
});
