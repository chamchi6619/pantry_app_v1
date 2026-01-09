/**
 * DiscoverScreen - "Discover" Tab
 *
 * Purpose: Search-first, active exploration interface
 * Pattern: Search bar + filters + category grid + moodboard
 * Design: Based on JSON spec (chips, hero spotlight, moodboard layout)
 * Strategy: User agency over algorithmic curation
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../../../core/constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import HeroRecipeCard from '../components/HeroRecipeCard';
import {
  getAllCategoriesWithRecipes,
  type RecipeDatabaseItem,
} from '../../../services/recipeDatabaseService';
import { rankRecipesWithFreshness } from '../../../services/recipeRankingService';
import { recipeViewHistory } from '../../../services/recipeViewHistoryService';

// Filter chip definitions
const FILTER_CHIPS = [
  { key: 'ready_now', label: 'Ready now', icon: 'checkmark-circle' as const },
  { key: 'lte_20m', label: '≤20m', icon: 'flash' as const },
  { key: 'use_it_up', label: 'Use-it-up', icon: 'leaf' as const },
  { key: 'high_protein', label: 'High protein', icon: 'fitness' as const },
  { key: 'budget', label: 'Budget', icon: 'wallet' as const },
  { key: 'vegetarian', label: 'Veg', icon: 'leaf-outline' as const },
  { key: 'no_oven', label: 'No oven', icon: 'bonfire-outline' as const },
];

// Category grid items
const CATEGORIES = [
  { key: 'breakfast', label: 'Breakfast', icon: 'sunny' as const, color: '#F59E0B' },
  { key: 'lunch', label: 'Lunch', icon: 'restaurant' as const, color: '#10B981' },
  { key: 'dinner', label: 'Dinner', icon: 'moon' as const, color: '#8B5CF6' },
  { key: 'smoothies', label: 'Smoothies', icon: 'nutrition' as const, color: '#EC4899' },
  { key: 'vegetarian', label: 'Veg', icon: 'leaf' as const, color: '#22C55E' },
  { key: 'quick', label: 'Quick', icon: 'flash' as const, color: '#F59E0B' },
  { key: 'comfort', label: 'Comfort', icon: 'heart' as const, color: '#EF4444' },
  { key: 'more', label: 'More', icon: 'grid' as const, color: theme.colors.textSecondary },
];

export default function DiscoverScreen() {
  const navigation = useNavigation();
  const { user, householdId } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set());
  const [allRecipes, setAllRecipes] = useState<RecipeDatabaseItem[]>([]);
  const [heroRecipes, setHeroRecipes] = useState<RecipeDatabaseItem[]>([]);
  const [viewHistory, setViewHistory] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load view history
  useEffect(() => {
    const loadHistory = async () => {
      const history = await recipeViewHistory.getViewHistoryMap();
      setViewHistory(history);
    };
    loadHistory();
  }, []);

  // Load all recipes
  const loadRecipes = useCallback(async () => {
    if (!user || !householdId) return;

    try {
      setLoading(true);
      const recipesByCategory = await getAllCategoriesWithRecipes(householdId, 10);
      const recipes = Object.values(recipesByCategory).flat();

      // Apply ranking
      const ranked = rankRecipesWithFreshness(recipes, viewHistory);

      setAllRecipes(ranked);
      setHeroRecipes(ranked.slice(0, 5)); // Top 5 for hero carousel
    } catch (error) {
      console.error('[Discover] Error loading recipes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, householdId, viewHistory]);

  useEffect(() => {
    if (user && householdId) {
      loadRecipes();
    }
  }, [user, householdId]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadRecipes();
  };

  const handleFilterToggle = (filterKey: string) => {
    setSelectedFilters(prev => {
      const next = new Set(prev);
      if (next.has(filterKey)) {
        next.delete(filterKey);
      } else {
        next.add(filterKey);
      }
      return next;
    });
  };

  const handleRecipePress = async (recipe: RecipeDatabaseItem) => {
    // Track view
    await recipeViewHistory.recordView(recipe.id);
    const updatedHistory = await recipeViewHistory.getViewHistoryMap();
    setViewHistory(updatedHistory);

    // Navigate to CookCard
    navigation.navigate('CookCard' as never, { recipeDatabaseId: recipe.id } as never);
  };

  const handleCategoryPress = (categoryKey: string) => {
    console.log('[Discover] Category pressed:', categoryKey);
    // TODO: Navigate to category-specific screen or filter
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading recipes...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search recipes or ingredients"
            placeholderTextColor={theme.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <Pressable onPress={() => console.log('Open filters')}>
            <Ionicons name="options" size={20} color={theme.colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsContainer}
        contentContainerStyle={styles.chipsContent}
      >
        {FILTER_CHIPS.map(chip => (
          <Pressable
            key={chip.key}
            style={[
              styles.chip,
              selectedFilters.has(chip.key) && styles.chipSelected,
            ]}
            onPress={() => handleFilterToggle(chip.key)}
          >
            <Ionicons
              name={chip.icon}
              size={14}
              color={selectedFilters.has(chip.key) ? theme.colors.primary : theme.colors.textSecondary}
            />
            <Text
              style={[
                styles.chipText,
                selectedFilters.has(chip.key) && styles.chipTextSelected,
              ]}
            >
              {chip.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Hero Carousel */}
      {heroRecipes.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Spotlight</Text>
            <Text style={styles.sectionSubtitle}>Based on your pantry</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={360}
            decelerationRate="fast"
            contentContainerStyle={styles.heroScrollContent}
          >
            {heroRecipes.map(recipe => (
              <HeroRecipeCard
                key={recipe.id}
                recipe={recipe}
                onPress={() => handleRecipePress(recipe)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Categories Grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Categories</Text>
        <View style={styles.categoriesGrid}>
          {CATEGORIES.map(category => (
            <Pressable
              key={category.key}
              style={styles.categoryItem}
              onPress={() => handleCategoryPress(category.key)}
            >
              <View style={[styles.categoryIcon, { backgroundColor: `${category.color}20` }]}>
                <Ionicons name={category.icon} size={24} color={category.color} />
              </View>
              <Text style={styles.categoryLabel}>{category.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Moodboard - Coming soon */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Discover</Text>
        <Text style={styles.comingSoon}>Moodboard layout coming soon...</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingBottom: theme.spacing.xl * 2,
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
  searchContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: 12,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  chipsContainer: {
    marginBottom: theme.spacing.md,
  },
  chipsContent: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipSelected: {
    backgroundColor: '#E7F4EB',
    borderColor: theme.colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  chipTextSelected: {
    color: theme.colors.primary,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  heroScrollContent: {
    gap: 0,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  categoryItem: {
    width: '23%',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  categoryIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  comingSoon: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: theme.spacing.xl,
  },
});
