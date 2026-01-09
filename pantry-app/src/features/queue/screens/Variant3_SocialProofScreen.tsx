/**
 * Variant 3: Social Proof Screen
 *
 * Reference: Screen 3 from reference_9.png (Favorites tab with ratings)
 * Pattern: Rating-first, review-driven discovery
 * Key Features:
 *  - Star ratings (4.4 ★)
 *  - Review counts (30+ Reviews)
 *  - Difficulty badges (Easy, Medium, Hard)
 *  - Time estimates (30+ Min)
 *  - Creator attribution (by David Lee, by Jacob Henry)
 *  - Heart/favorite icons
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

const DIFFICULTY_LEVELS = ['Easy', 'Medium', 'Hard'];

export default function Variant3_SocialProofScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<RecipeDatabaseItem[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    try {
      const allRecipes = await getAllCategoriesWithRecipes(user?.id || '', 10);
      const recipesList = Object.values(allRecipes).flat();
      const viewHistory = await recipeViewHistory.getViewHistoryMap();
      const ranked = rankRecipesWithFreshness(recipesList, viewHistory);

      setRecipes(ranked.slice(0, 10));
    } catch (error) {
      console.error('[Variant3] Error loading recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecipePress = async (recipe: RecipeDatabaseItem) => {
    await recipeViewHistory.recordView(recipe.id);
    navigation.navigate('CookCard' as never, { recipeDatabaseId: recipe.id } as never);
  };

  const toggleFavorite = (recipeId: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(recipeId)) {
        next.delete(recipeId);
      } else {
        next.add(recipeId);
      }
      return next;
    });
  };

  const getDifficulty = (): string => {
    return DIFFICULTY_LEVELS[Math.floor(Math.random() * DIFFICULTY_LEVELS.length)];
  };

  const getRating = (): number => {
    return 4 + Math.random();
  };

  const getReviews = (): number => {
    return Math.floor(Math.random() * 100 + 10);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Favourites</Text>
        <Pressable>
          <Ionicons name="search" size={24} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabNav}>
        <Pressable style={[styles.tabButton, styles.tabButtonActive]}>
          <Text style={[styles.tabText, styles.tabTextActive]}>Recipes</Text>
        </Pressable>
        <Pressable style={styles.tabButton}>
          <Text style={styles.tabText}>Chefs</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {recipes.map((recipe, index) => {
          const rating = getRating();
          const reviews = getReviews();
          const difficulty = getDifficulty();
          const isFavorite = favorites.has(recipe.id);

          return (
            <Pressable
              key={recipe.id}
              style={styles.recipeCard}
              onPress={() => handleRecipePress(recipe)}
            >
              {/* Image */}
              <View style={styles.imageContainer}>
                {recipe.image_url ? (
                  <>
                    <Image
                      source={{ uri: recipe.image_url }}
                      style={styles.recipeImage}
                      resizeMode="cover"
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.6)']}
                      style={styles.imageGradient}
                    />
                  </>
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="restaurant-outline" size={32} color={theme.colors.textSecondary} />
                  </View>
                )}

                {/* Favorite Button */}
                <Pressable
                  style={styles.favoriteButton}
                  onPress={() => toggleFavorite(recipe.id)}
                >
                  <Ionicons
                    name={isFavorite ? 'heart' : 'heart-outline'}
                    size={20}
                    color={isFavorite ? '#EF4444' : '#fff'}
                  />
                </Pressable>
              </View>

              {/* Content */}
              <View style={styles.cardContent}>
                {/* Title */}
                <Text style={styles.recipeTitle} numberOfLines={2}>
                  {recipe.title}
                </Text>

                {/* Rating & Reviews */}
                <View style={styles.ratingRow}>
                  <View style={styles.ratingContainer}>
                    <Ionicons name="star" size={14} color="#FFD700" />
                    <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
                  </View>
                  <Text style={styles.reviewsText}>({reviews}+ Reviews)</Text>
                </View>

                {/* Badges Row */}
                <View style={styles.badgesRow}>
                  {/* Difficulty Badge */}
                  <View style={[styles.badge, styles.difficultyBadge]}>
                    <Ionicons name="bar-chart" size={12} color={theme.colors.primary} />
                    <Text style={styles.badgeText}>{difficulty}</Text>
                  </View>

                  {/* Time Badge */}
                  <View style={[styles.badge, styles.timeBadge]}>
                    <Ionicons name="time" size={12} color={theme.colors.textSecondary} />
                    <Text style={styles.badgeText}>
                      {recipe.total_time_minutes || 30}+ Min
                    </Text>
                  </View>
                </View>

                {/* Creator */}
                <Text style={styles.creatorText}>
                  by {recipe.creator_name || 'Chef'}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  tabNav: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  tabButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  tabButtonActive: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl * 2,
  },
  recipeCard: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  imageContainer: {
    width: 120,
    height: 140,
    position: 'relative',
  },
  recipeImage: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoriteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    padding: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  recipeTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  reviewsText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginBottom: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  difficultyBadge: {
    backgroundColor: '#EFF6FF',
  },
  timeBadge: {
    backgroundColor: '#F5F5F5',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  creatorText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
});
