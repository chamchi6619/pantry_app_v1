/**
 * Variant 1: Social/Trending Screen
 *
 * Reference: Left screen from reference_9.png
 * Pattern: Personal greeting + category icons + trending content
 * Key Features:
 *  - Avatar + personalized greeting
 *  - Search bar
 *  - 8 visual category icons (Breakfast, Lunch, Dinner, etc.)
 *  - Trending Recipe with social engagement (likes, comments, shares)
 *  - Video indicator (play button)
 *  - Creator attribution
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

// Category icons
const CATEGORIES = [
  { key: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { key: 'lunch', label: 'Lunch', icon: '🍱' },
  { key: 'dinner', label: 'Dinner', icon: '🍽️' },
  { key: 'snack', label: 'Snack', icon: '🍪' },
  { key: 'cuisine', label: 'Cuisine', icon: '🌎' },
  { key: 'smoothies', label: 'Smoothies', icon: '🥤' },
  { key: 'dessert', label: 'Dessert', icon: '🍰' },
  { key: 'more', label: 'More', icon: '⋯' },
];

export default function Variant1_SocialTrendingScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [trendingRecipe, setTrendingRecipe] = useState<RecipeDatabaseItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrendingRecipe();
  }, []);

  const loadTrendingRecipe = async () => {
    try {
      const allRecipes = await getAllCategoriesWithRecipes(user?.id || '', 10);
      const recipes = Object.values(allRecipes).flat();
      const viewHistory = await recipeViewHistory.getViewHistoryMap();
      const ranked = rankRecipesWithFreshness(recipes, viewHistory);

      // Pick top recipe as "trending"
      if (ranked.length > 0) {
        setTrendingRecipe(ranked[0]);
      }
    } catch (error) {
      console.error('[Variant1] Error loading trending:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecipePress = async (recipe: RecipeDatabaseItem) => {
    await recipeViewHistory.recordView(recipe.id);
    navigation.navigate('CookCard' as never, { recipeDatabaseId: recipe.id } as never);
  };

  const getFirstName = () => {
    if (!user?.email) return 'Chef';
    return user.email.split('@')[0].charAt(0).toUpperCase() + user.email.split('@')[0].slice(1);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header with Avatar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getFirstName().charAt(0)}</Text>
          </View>
          <Text style={styles.userName}>{getFirstName()}</Text>
        </View>
        <Pressable style={styles.notificationButton}>
          <Ionicons name="notifications-outline" size={24} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      {/* Greeting */}
      <Text style={styles.greeting}>What's cooking today?</Text>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search here"
          placeholderTextColor={theme.colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Category Icons Grid */}
      <View style={styles.categoriesGrid}>
        {CATEGORIES.map(category => (
          <Pressable key={category.key} style={styles.categoryItem}>
            <View style={styles.categoryIcon}>
              <Text style={styles.categoryEmoji}>{category.icon}</Text>
            </View>
            <Text style={styles.categoryLabel}>{category.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Trending Recipe Section */}
      {trendingRecipe && (
        <View style={styles.trendingSection}>
          <Text style={styles.sectionTitle}>Trending Recipe</Text>

          <Pressable
            style={styles.trendingCard}
            onPress={() => handleRecipePress(trendingRecipe)}
          >
            {/* Image with gradient overlay */}
            <View style={styles.trendingImageContainer}>
              {trendingRecipe.image_url ? (
                <>
                  <Image
                    source={{ uri: trendingRecipe.image_url }}
                    style={styles.trendingImage}
                    resizeMode="cover"
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.8)']}
                    style={styles.trendingGradient}
                  />
                </>
              ) : (
                <View style={styles.trendingPlaceholder}>
                  <Ionicons name="restaurant-outline" size={48} color={theme.colors.textSecondary} />
                </View>
              )}

              {/* Play Button (for video recipes) */}
              {trendingRecipe.video_url && (
                <View style={styles.playButton}>
                  <Ionicons name="play" size={24} color="#fff" />
                </View>
              )}

              {/* Content Overlay */}
              <View style={styles.trendingContent}>
                <Text style={styles.trendingTitle} numberOfLines={2}>
                  {trendingRecipe.title}
                </Text>
                <Text style={styles.trendingCreator}>
                  by {trendingRecipe.creator_name || 'Chef'}
                </Text>
              </View>

              {/* Engagement Bar */}
              <View style={styles.engagementBar}>
                <View style={styles.engagementItem}>
                  <Ionicons name="heart" size={18} color="#fff" />
                  <Text style={styles.engagementText}>
                    {Math.floor(Math.random() * 1000 + 100)}
                  </Text>
                </View>

                <View style={styles.engagementItem}>
                  <Ionicons name="chatbubble" size={18} color="#fff" />
                  <Text style={styles.engagementText}>
                    {Math.floor(Math.random() * 100 + 10)}
                  </Text>
                </View>

                <View style={styles.engagementItem}>
                  <Ionicons name="bookmark" size={18} color="#fff" />
                  <Text style={styles.engagementText}>
                    {Math.floor(Math.random() * 200 + 20)}
                  </Text>
                </View>

                <View style={styles.engagementItem}>
                  <Ionicons name="share-social" size={18} color="#fff" />
                  <Text style={styles.engagementText}>
                    {Math.floor(Math.random() * 50 + 5)}
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    paddingBottom: theme.spacing.xl * 2,
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
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  notificationButton: {
    padding: theme.spacing.xs,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    marginHorizontal: theme.spacing.lg,
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
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  categoryItem: {
    width: '22%',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  categoryIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryEmoji: {
    fontSize: 32,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  trendingSection: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  trendingCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  trendingImageContainer: {
    width: '100%',
    height: 320,
    position: 'relative',
  },
  trendingImage: {
    width: '100%',
    height: '100%',
  },
  trendingGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
  },
  trendingPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -32,
    marginTop: -32,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  trendingContent: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    paddingHorizontal: theme.spacing.lg,
  },
  trendingTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  trendingCreator: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    opacity: 0.9,
  },
  engagementBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  engagementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  engagementText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
