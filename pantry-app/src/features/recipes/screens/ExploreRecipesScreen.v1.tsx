// Variant 1: Hero Visual Feed
// Inspired by references 1, 2, 6 - Large hero images, personalized greeting, category filtering
// 2025 trends: Full-screen visuals, card-based layout, generous white space

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

export const ExploreRecipesScreenV1: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, householdId } = useAuth();
  const userId = user?.id;

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [activeCategory, setActiveCategory] = useState('All Recipes');
  const [fromPantry, setFromPantry] = useState(false);

  const categories = fromPantry
    ? ['High Match', 'Quick Meals', 'Use Soon', 'Family Favorites']
    : ['All Recipes', 'Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Quick & Easy'];

  const getUserName = () => {
    if (!user) return 'there';
    return user.email?.split('@')[0] || 'there';
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  useEffect(() => {
    loadRecipes();
  }, [fromPantry, activeCategory]);

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

  const renderHeroCard = (recipe: Recipe) => (
    <Pressable
      key={recipe.id}
      style={styles.heroCard}
      onPress={() => handleRecipePress(recipe)}
    >
      <Image
        source={{ uri: recipe.imageUrl || 'https://via.placeholder.com/400x300' }}
        style={styles.heroImage}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.7)']}
        style={styles.heroGradient}
      >
        <View style={styles.heroContent}>
          {recipe.matchPercentage && recipe.matchPercentage > 0 && (
            <View style={styles.matchBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#fff" />
              <Text style={styles.matchBadgeText}>{recipe.matchPercentage}% Match</Text>
            </View>
          )}
          <Text style={styles.heroTitle} numberOfLines={2}>{recipe.title}</Text>
          <View style={styles.heroMeta}>
            {recipe.cookTime && (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={14} color="#fff" />
                <Text style={styles.metaText}>{recipe.cookTime} min</Text>
              </View>
            )}
            {recipe.totalIngredients && (
              <View style={styles.metaItem}>
                <Ionicons name="restaurant-outline" size={14} color="#fff" />
                <Text style={styles.metaText}>{recipe.totalIngredients} ingredients</Text>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );

  const renderStandardCard = (recipe: Recipe) => (
    <Pressable
      key={recipe.id}
      style={styles.standardCard}
      onPress={() => handleRecipePress(recipe)}
    >
      <Image
        source={{ uri: recipe.imageUrl || 'https://via.placeholder.com/200x200' }}
        style={styles.standardImage}
        resizeMode="cover"
      />
      <View style={styles.standardContent}>
        <Text style={styles.standardTitle} numberOfLines={2}>{recipe.title}</Text>
        <View style={styles.standardMeta}>
          {recipe.cookTime && (
            <View style={styles.standardMetaItem}>
              <Ionicons name="time-outline" size={12} color={theme.colors.textSecondary} />
              <Text style={styles.standardMetaText}>{recipe.cookTime} min</Text>
            </View>
          )}
          {recipe.matchPercentage && recipe.matchPercentage > 0 && (
            <View style={[styles.standardMetaItem, styles.matchTag]}>
              <Text style={styles.matchTagText}>{recipe.matchPercentage}% match</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );

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
            <Text style={styles.greeting}>{getGreeting()}, {getUserName()}</Text>
            <Text style={styles.headerTitle}>What would you like to cook today?</Text>
          </View>
          <Pressable style={styles.avatarContainer}>
            <Ionicons name="person-circle-outline" size={40} color={theme.colors.primary} />
          </Pressable>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={theme.colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search any recipes"
            placeholderTextColor={theme.colors.textSecondary}
          />
          <Pressable style={styles.filterButton}>
            <Ionicons name="options-outline" size={20} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        {/* Mode Toggle */}
        <View style={styles.modeToggle}>
          <Pressable
            style={[styles.modeButton, !fromPantry && styles.modeButtonActive]}
            onPress={() => setFromPantry(false)}
          >
            <Text style={[styles.modeButtonText, !fromPantry && styles.modeButtonTextActive]}>
              Explore
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, fromPantry && styles.modeButtonActive]}
            onPress={() => setFromPantry(true)}
          >
            <Ionicons
              name="leaf"
              size={16}
              color={fromPantry ? '#fff' : theme.colors.primary}
              style={styles.modeButtonIcon}
            />
            <Text style={[styles.modeButtonText, fromPantry && styles.modeButtonTextActive]}>
              From Your Pantry
            </Text>
          </Pressable>
        </View>

        {/* Category Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesContainer}
        >
          {categories.map((category) => (
            <Pressable
              key={category}
              style={[
                styles.categoryPill,
                activeCategory === category && styles.categoryPillActive
              ]}
              onPress={() => setActiveCategory(category)}
            >
              <Text
                style={[
                  styles.categoryPillText,
                  activeCategory === category && styles.categoryPillTextActive
                ]}
              >
                {category}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <>
            {/* Recommendations Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recommendations</Text>
                <Pressable>
                  <Text style={styles.seeAllText}>See all</Text>
                </Pressable>
              </View>

              {recipes.slice(0, 3).map(recipe => renderHeroCard(recipe))}
            </View>

            {/* More Recipes Section */}
            {recipes.length > 3 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>More For You</Text>
                  <Pressable>
                    <Text style={styles.seeAllText}>See all</Text>
                  </Pressable>
                </View>

                <View style={styles.standardGrid}>
                  {recipes.slice(3).map(recipe => renderStandardCard(recipe))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

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
    paddingTop: 16,
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
  categoriesContainer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  categoryPill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#fff',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categoryPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  categoryPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  categoryPillTextActive: {
    color: '#fff',
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  heroCard: {
    height: 240,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
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
});
