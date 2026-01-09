/**
 * Variant 4: Commerce/Offers Screen
 *
 * Reference: Screen 4 from reference_9.png (Special offers, brown theme)
 * Pattern: Commerce-driven, promotional
 * Key Features:
 *  - Location header (New York, USA)
 *  - Search + filter buttons
 *  - Special Offers banner (Up to 40% OFF)
 *  - Category icons (Cup Cake, Cookies, Donuts, Breads)
 *  - Featured Products grid with ratings
 *  - Bottom tab navigation
 *  - Warm brown color scheme
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
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

const CATEGORIES = [
  { key: 'cupcake', label: 'Cup Cake', icon: '🧁' },
  { key: 'cookies', label: 'Cookies', icon: '🍪' },
  { key: 'donuts', label: 'Donuts', icon: '🍩' },
  { key: 'breads', label: 'Breads', icon: '🍞' },
];

export default function Variant4_CommerceOffersScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [featuredRecipes, setFeaturedRecipes] = useState<RecipeDatabaseItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeaturedRecipes();
  }, []);

  const loadFeaturedRecipes = async () => {
    try {
      const allRecipes = await getAllCategoriesWithRecipes(user?.id || '', 10);
      const recipes = Object.values(allRecipes).flat();
      const viewHistory = await recipeViewHistory.getViewHistoryMap();
      const ranked = rankRecipesWithFreshness(recipes, viewHistory);

      setFeaturedRecipes(ranked.slice(0, 6));
    } catch (error) {
      console.error('[Variant4] Error loading featured:', error);
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
        <ActivityIndicator size="large" color="#8B6F47" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#8B6F47', '#6B5539']}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <View style={styles.locationContainer}>
            <Ionicons name="location" size={16} color="#fff" />
            <Text style={styles.locationText}>New York, USA</Text>
            <Ionicons name="chevron-down" size={16} color="#fff" />
          </View>
          <View style={styles.headerIcons}>
            <Pressable style={styles.headerIconButton}>
              <Ionicons name="menu" size={24} color="#fff" />
            </Pressable>
            <Pressable style={styles.headerIconButton}>
              <Ionicons name="flame" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#8B6F47" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search"
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          <Pressable style={styles.filterButton}>
            <Ionicons name="options" size={24} color="#fff" />
          </Pressable>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Special Offers Banner */}
        <View style={styles.offersBanner}>
          <View style={styles.offersContent}>
            <Text style={styles.offersTitle}>Special Offers</Text>
            <Text style={styles.offersSubtitle}>Get Special Offer</Text>
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>Up to</Text>
              <Text style={styles.discountAmount}>40</Text>
              <Text style={styles.discountPercent}>%</Text>
            </View>
            <Pressable style={styles.shopNowButton}>
              <Text style={styles.shopNowText}>Shop Now</Text>
            </Pressable>
          </View>
          <Image
            source={{ uri: featuredRecipes[0]?.image_url }}
            style={styles.offersImage}
            resizeMode="cover"
          />
        </View>

        {/* Categories */}
        <View style={styles.categoriesSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Categories</Text>
            <Pressable>
              <Text style={styles.seeAllText}>See All</Text>
            </Pressable>
          </View>

          <View style={styles.categoriesRow}>
            {CATEGORIES.map(category => (
              <View key={category.key} style={styles.categoryItem}>
                <View style={styles.categoryIconContainer}>
                  <Text style={styles.categoryIcon}>{category.icon}</Text>
                </View>
                <Text style={styles.categoryLabel}>{category.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Featured Products */}
        <View style={styles.featuredSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Featured Products</Text>
            <Pressable>
              <Text style={styles.seeAllText}>See All</Text>
            </Pressable>
          </View>

          <View style={styles.productsGrid}>
            {featuredRecipes.map(recipe => {
              const rating = (4 + Math.random()).toFixed(1);
              return (
                <Pressable
                  key={recipe.id}
                  style={styles.productCard}
                  onPress={() => handleRecipePress(recipe)}
                >
                  <Image
                    source={{ uri: recipe.image_url }}
                    style={styles.productImage}
                    resizeMode="cover"
                  />
                  <View style={styles.productContent}>
                    <Text style={styles.productTitle} numberOfLines={2}>
                      {recipe.title}
                    </Text>
                    <View style={styles.productRating}>
                      <Ionicons name="star" size={12} color="#FFD700" />
                      <Text style={styles.productRatingText}>{rating}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <Pressable style={styles.navItem}>
          <Ionicons name="home" size={24} color="#8B6F47" />
          <Text style={[styles.navLabel, styles.navLabelActive]}>Home</Text>
        </Pressable>
        <Pressable style={styles.navItem}>
          <Ionicons name="heart-outline" size={24} color="#999" />
          <Text style={styles.navLabel}>Likes</Text>
        </Pressable>
        <Pressable style={styles.navItem}>
          <Ionicons name="bookmark-outline" size={24} color="#999" />
          <Text style={styles.navLabel}>Bookmark</Text>
        </Pressable>
        <Pressable style={styles.navItem}>
          <Ionicons name="person-outline" size={24} color="#999" />
          <Text style={styles.navLabel}>Profile</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  headerIcons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  headerIconButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: 12,
    gap: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  filterButton: {
    width: 48,
    height: 48,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingBottom: 100,
  },
  offersBanner: {
    flexDirection: 'row',
    margin: theme.spacing.lg,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  offersContent: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  offersTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  offersSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  discountBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: theme.spacing.sm,
  },
  discountText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginRight: 4,
  },
  discountAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#8B6F47',
  },
  discountPercent: {
    fontSize: 20,
    fontWeight: '700',
    color: '#8B6F47',
  },
  shopNowButton: {
    backgroundColor: '#8B6F47',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  shopNowText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  offersImage: {
    width: 120,
    height: '100%',
  },
  categoriesSection: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8B6F47',
  },
  categoriesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  categoryItem: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  categoryIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryIcon: {
    fontSize: 32,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
  featuredSection: {
    paddingHorizontal: theme.spacing.lg,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  productCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  productImage: {
    width: '100%',
    height: 120,
  },
  productContent: {
    padding: theme.spacing.sm,
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  productRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  productRatingText: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  navItem: {
    alignItems: 'center',
    gap: 4,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#999',
  },
  navLabelActive: {
    color: '#8B6F47',
  },
});
