// Variant 2: Bento Grid Modern
// Inspired by 2025 bento grid trend + reference 7 (warm colors)
// Asymmetric card layouts with mixed sizes, warm accent colors, visual hierarchy

import React, { useState, useEffect } from 'react';
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
import { useAuth } from '../../../contexts/AuthContext';
import { getPersonalizedRecommendations } from '../../../services/recommendationEngine';
import { theme } from '../../../core/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

const { width: screenWidth } = Dimensions.get('window');
const CARD_PADDING = 16;
const CARD_GAP = 12;

interface Recipe {
  id: string;
  title: string;
  imageUrl?: string;
  cookTime?: number;
  matchPercentage?: number;
  matchedCount?: number;
  totalIngredients?: number;
  cookCard?: any;
  isPersonalized?: boolean;
  source_url?: string;
}

export const ExploreRecipesScreenV2: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, householdId } = useAuth();
  const userId = user?.id;

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  const getUserName = () => {
    if (!user) return 'there';
    const name = user.email?.split('@')[0] || 'there';
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    if (!userId || !householdId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const personalizedRecs = await getPersonalizedRecommendations(userId, householdId, 20);
      const formattedRecipes = personalizedRecs.map(rec => ({
        id: rec.cook_card.id,
        title: rec.cook_card.title,
        imageUrl: rec.cook_card.image_url,
        cookTime: rec.cook_card.cook_time_minutes || rec.cook_card.total_time_minutes,
        matchPercentage: Math.round(rec.completeness * 100),
        matchedCount: rec.have_ingredients.length,
        totalIngredients: rec.cook_card.ingredients?.length || 0,
        cookCard: rec.cook_card,
        isPersonalized: true,
        source_url: rec.cook_card.source_url,
      }));
      setRecipes(formattedRecipes);
    } catch (error) {
      console.error('Error loading recipes:', error);
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadRecipes();
    setRefreshing(false);
  };

  const handleRecipePress = (recipe: Recipe) => {
    if (recipe.cookCard) {
      navigation.navigate('CookCard', { cookCard: recipe.cookCard });
    }
  };

  // Category cards with warm colors
  const renderCategoryCard = (title: string, emoji: string, color: string, index: number) => (
    <Pressable key={index} style={[styles.categoryCard, { backgroundColor: color }]}>
      <Text style={styles.categoryEmoji}>{emoji}</Text>
      <Text style={styles.categoryText}>{title}</Text>
    </Pressable>
  );

  // Large featured card (takes full width)
  const renderFeaturedCard = (recipe: Recipe) => (
    <Pressable
      key={`featured-${recipe.id}`}
      style={styles.featuredCard}
      onPress={() => handleRecipePress(recipe)}
    >
      <Image
        source={{ uri: recipe.imageUrl || 'https://via.placeholder.com/400x300' }}
        style={styles.featuredImage}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={styles.featuredGradient}
      >
        <View style={styles.featuredBadge}>
          <Ionicons name="star" size={14} color="#FFA500" />
          <Text style={styles.featuredBadgeText}>Top Pick</Text>
        </View>
        <Text style={styles.featuredTitle} numberOfLines={2}>{recipe.title}</Text>
        <View style={styles.featuredMeta}>
          <Text style={styles.featuredMetaText}>{recipe.totalIngredients} ingredients</Text>
          <Text style={styles.featuredMetaDot}>•</Text>
          <Text style={styles.featuredMetaText}>{recipe.cookTime} min</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );

  // Medium card (half width)
  const renderMediumCard = (recipe: Recipe, position: 'left' | 'right') => (
    <Pressable
      key={`medium-${recipe.id}`}
      style={[styles.mediumCard, position === 'left' ? styles.mediumCardLeft : styles.mediumCardRight]}
      onPress={() => handleRecipePress(recipe)}
    >
      <Image
        source={{ uri: recipe.imageUrl || 'https://via.placeholder.com/200x200' }}
        style={styles.mediumImage}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.7)']}
        style={styles.mediumGradient}
      >
        {recipe.matchPercentage && recipe.matchPercentage > 0 && (
          <View style={styles.mediumMatchBadge}>
            <Text style={styles.mediumMatchText}>{recipe.matchPercentage}%</Text>
          </View>
        )}
        <Text style={styles.mediumTitle} numberOfLines={2}>{recipe.title}</Text>
        {recipe.cookTime && (
          <View style={styles.mediumTimeContainer}>
            <Ionicons name="time-outline" size={12} color="#fff" />
            <Text style={styles.mediumTimeText}>{recipe.cookTime} min</Text>
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );

  // Small card (one third width)
  const renderSmallCard = (recipe: Recipe) => (
    <Pressable
      key={`small-${recipe.id}`}
      style={styles.smallCard}
      onPress={() => handleRecipePress(recipe)}
    >
      <Image
        source={{ uri: recipe.imageUrl || 'https://via.placeholder.com/150x150' }}
        style={styles.smallImage}
        resizeMode="cover"
      />
      <View style={styles.smallOverlay}>
        <Text style={styles.smallTitle} numberOfLines={2}>{recipe.title}</Text>
      </View>
    </Pressable>
  );

  const renderBentoGrid = () => {
    if (recipes.length === 0) return null;

    return (
      <View style={styles.bentoContainer}>
        {/* Categories Row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesScroll}
        >
          {renderCategoryCard('Breakfast', '🍳', '#FFD699', 0)}
          {renderCategoryCard('Fresh', '🥗', '#A8E6CF', 1)}
          {renderCategoryCard('Quick', '⚡', '#FFB6C1', 2)}
          {renderCategoryCard('Comfort', '🍲', '#DDA0DD', 3)}
        </ScrollView>

        {/* Featured Large Card */}
        {recipes[0] && renderFeaturedCard(recipes[0])}

        {/* Two Medium Cards Row */}
        {recipes.length >= 3 && (
          <View style={styles.mediumRow}>
            {renderMediumCard(recipes[1], 'left')}
            {renderMediumCard(recipes[2], 'right')}
          </View>
        )}

        {/* Three Small Cards Row */}
        {recipes.length >= 6 && (
          <View style={styles.smallRow}>
            {renderSmallCard(recipes[3])}
            {renderSmallCard(recipes[4])}
            {renderSmallCard(recipes[5])}
          </View>
        )}

        {/* Another Featured Card */}
        {recipes[6] && renderFeaturedCard(recipes[6])}

        {/* Mixed: One Featured + Two Small */}
        {recipes.length >= 10 && (
          <>
            <View style={styles.mediumRow}>
              {renderMediumCard(recipes[7], 'left')}
              {renderMediumCard(recipes[8], 'right')}
            </View>
            {recipes[9] && renderFeaturedCard(recipes[9])}
          </>
        )}

        {/* Remaining recipes in pairs */}
        {recipes.slice(10).reduce((acc, recipe, index) => {
          if (index % 2 === 0) {
            acc.push(
              <View key={`row-${index}`} style={styles.mediumRow}>
                {renderMediumCard(recipe, 'left')}
                {recipes[10 + index + 1] && renderMediumCard(recipes[10 + index + 1], 'right')}
              </View>
            );
          }
          return acc;
        }, [] as React.ReactNode[])}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <View style={styles.greetingRow}>
              <Text style={styles.greeting}>Hello, {getUserName()}</Text>
              <Text style={styles.wave}>👋</Text>
            </View>
            <Text style={styles.headerTitle}>What do you want to cook today?</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for recipes"
            placeholderTextColor={theme.colors.textSecondary}
          />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <>
            {/* Section Header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recommended</Text>
              <Pressable>
                <Ionicons name="heart-outline" size={24} color={theme.colors.textSecondary} />
              </Pressable>
            </View>

            {/* Bento Grid */}
            {renderBentoGrid()}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    paddingHorizontal: CARD_PADDING,
    paddingTop: 16,
    paddingBottom: 20,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  greeting: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginRight: 4,
  },
  wave: {
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: CARD_PADDING,
    marginBottom: 24,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
    marginLeft: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: CARD_PADDING,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  bentoContainer: {
    paddingHorizontal: CARD_PADDING,
    gap: CARD_GAP,
  },
  categoriesScroll: {
    paddingBottom: CARD_GAP,
  },
  categoryCard: {
    width: 100,
    height: 100,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginRight: 12,
  },
  categoryEmoji: {
    fontSize: 32,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  featuredCard: {
    height: 280,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#fff',
    marginBottom: CARD_GAP,
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
    height: '65%',
    justifyContent: 'flex-end',
    padding: 20,
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    marginBottom: 12,
  },
  featuredBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  featuredTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 32,
    marginBottom: 8,
  },
  featuredMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featuredMetaText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  featuredMetaDot: {
    fontSize: 14,
    color: '#fff',
    marginHorizontal: 8,
  },
  mediumRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
  },
  mediumCard: {
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  mediumCardLeft: {
    width: (screenWidth - CARD_PADDING * 2 - CARD_GAP) / 2,
  },
  mediumCardRight: {
    width: (screenWidth - CARD_PADDING * 2 - CARD_GAP) / 2,
  },
  mediumImage: {
    width: '100%',
    height: '100%',
  },
  mediumGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '100%',
    justifyContent: 'flex-end',
    padding: 12,
  },
  mediumMatchBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  mediumMatchText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  mediumTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 22,
    marginBottom: 6,
  },
  mediumTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mediumTimeText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  smallRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
  },
  smallCard: {
    width: (screenWidth - CARD_PADDING * 2 - CARD_GAP * 2) / 3,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  smallImage: {
    width: '100%',
    height: '100%',
  },
  smallOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 8,
  },
  smallTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    lineHeight: 14,
  },
});
