/**
 * Variant 2: Featured/Guided Screen
 *
 * Reference: Screen 2 from reference_9.png ("that recipe" app)
 * Pattern: Curated content with guidance badges
 * Key Features:
 *  - App branding ("that recipe" logo)
 *  - Tab navigation (Featured Recipes, Chefs)
 *  - Filter chips (Guided, For Only)
 *  - Hero featured recipe card
 *  - Categories grid (Main Course, Vegetables, Sea)
 *  - Bottom navigation
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../../../core/constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import type { RecipeDatabaseItem } from '../../../services/recipeDatabaseService';
import { getAllCategoriesWithRecipes } from '../../../services/recipeDatabaseService';
import { rankRecipesWithFreshness } from '../../../services/recipeRankingService';
import { recipeViewHistory } from '../../../services/recipeViewHistoryService';

const FILTERS = ['Guided', 'For Only'];
const CATEGORIES = [
  { key: 'main', label: 'Main Course', image: '🍖' },
  { key: 'vegetables', label: 'Vegetables', image: '🥗' },
  { key: 'sea', label: 'Sea', image: '🦞' },
];

export default function Variant2_FeaturedGuidedScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'recipes' | 'chefs'>('recipes');
  const [selectedFilter, setSelectedFilter] = useState<string>('Guided');
  const [featuredRecipe, setFeaturedRecipe] = useState<RecipeDatabaseItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeaturedRecipe();
  }, []);

  const loadFeaturedRecipe = async () => {
    try {
      const allRecipes = await getAllCategoriesWithRecipes(user?.id || '', 10);
      const recipes = Object.values(allRecipes).flat();
      const viewHistory = await recipeViewHistory.getViewHistoryMap();
      const ranked = rankRecipesWithFreshness(recipes, viewHistory);

      if (ranked.length > 0) {
        setFeaturedRecipe(ranked[0]);
      }
    } catch (error) {
      console.error('[Variant2] Error loading featured:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecipePress = async (recipe: RecipeDatabaseItem) => {
    await recipeViewHistory.recordView(recipe.id);
    navigation.navigate('CookCard' as never, { recipeDatabaseId: recipe.id } as never);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with Logo */}
      <View style={styles.header}>
        <View style={styles.logo}>
          <View style={styles.logoCircle}>
            <Ionicons name="restaurant" size={20} color="#FF6B35" />
          </View>
          <Text style={styles.logoText}>that recipe</Text>
        </View>
        <Pressable>
          <Ionicons name="search" size={24} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabNav}>
        <Pressable
          style={[styles.tabButton, activeTab === 'recipes' && styles.tabButtonActive]}
          onPress={() => setActiveTab('recipes')}
        >
          <Text style={[styles.tabText, activeTab === 'recipes' && styles.tabTextActive]}>
            Featured Recipes
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, activeTab === 'chefs' && styles.tabButtonActive]}
          onPress={() => setActiveTab('chefs')}
        >
          <Text style={[styles.tabText, activeTab === 'chefs' && styles.tabTextActive]}>
            Chefs
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Filter Chips */}
        <View style={styles.filterRow}>
          {FILTERS.map(filter => (
            <Pressable
              key={filter}
              style={[
                styles.filterChip,
                selectedFilter === filter && styles.filterChipActive,
              ]}
              onPress={() => setSelectedFilter(filter)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedFilter === filter && styles.filterChipTextActive,
                ]}
              >
                {filter}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Featured Recipe Card */}
        {featuredRecipe && (
          <Pressable
            style={styles.featuredCard}
            onPress={() => handleRecipePress(featuredRecipe)}
          >
            {featuredRecipe.image_url ? (
              <>
                <Image
                  source={{ uri: featuredRecipe.image_url }}
                  style={styles.featuredImage}
                  resizeMode="cover"
                />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.7)']}
                  style={styles.featuredGradient}
                />
              </>
            ) : (
              <View style={styles.featuredPlaceholder}>
                <Ionicons name="restaurant-outline" size={48} color={theme.colors.textSecondary} />
              </View>
            )}

            {/* Title Overlay */}
            <View style={styles.featuredContent}>
              <Text style={styles.featuredTitle} numberOfLines={2}>
                {featuredRecipe.title}
              </Text>
              <View style={styles.featuredMeta}>
                <View style={styles.featuredMetaItem}>
                  <Ionicons name="star" size={14} color="#FFD700" />
                  <Text style={styles.featuredMetaText}>4.{Math.floor(Math.random() * 9)}</Text>
                </View>
                <View style={styles.featuredMetaItem}>
                  <Ionicons name="time" size={14} color="#fff" />
                  <Text style={styles.featuredMetaText}>
                    {featuredRecipe.total_time_minutes || 30} Min
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
        )}

        {/* Categories Section */}
        <View style={styles.categoriesSection}>
          <Text style={styles.sectionTitle}>Categories</Text>
          <View style={styles.categoriesRow}>
            {CATEGORIES.map(category => (
              <Pressable key={category.key} style={styles.categoryCard}>
                <Text style={styles.categoryImage}>{category.image}</Text>
                <Text style={styles.categoryLabel}>{category.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <Pressable style={styles.navItem}>
          <Ionicons name="home" size={24} color="#FF6B35" />
        </Pressable>
        <Pressable style={styles.navItem}>
          <Ionicons name="search" size={24} color={theme.colors.textSecondary} />
        </Pressable>
        <Pressable style={styles.navItem}>
          <View style={styles.navItemCenter}>
            <Ionicons name="add-circle" size={32} color="#FF6B35" />
          </View>
        </Pressable>
        <Pressable style={styles.navItem}>
          <Ionicons name="bookmark" size={24} color={theme.colors.textSecondary} />
        </Pressable>
        <Pressable style={styles.navItem}>
          <Ionicons name="person" size={24} color={theme.colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  logo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  logoCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF0EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  tabNav: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  tabButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  tabButtonActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#FF6B35',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: '#FF6B35',
    fontWeight: '600',
  },
  content: {
    paddingBottom: 100,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  filterChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  filterChipActive: {
    backgroundColor: '#FFE8E0',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#FF6B35',
  },
  featuredCard: {
    marginHorizontal: theme.spacing.lg,
    height: 240,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
  },
  featuredImage: {
    width: '100%',
    height: '100%',
  },
  featuredGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  featuredPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: theme.spacing.lg,
  },
  featuredTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: theme.spacing.xs,
  },
  featuredMeta: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  featuredMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  featuredMetaText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
  },
  categoriesSection: {
    paddingHorizontal: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  categoriesRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  categoryCard: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  categoryImage: {
    fontSize: 40,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  navItem: {
    padding: theme.spacing.xs,
  },
  navItemCenter: {
    marginTop: -20,
  },
});
