// Variant 4: Smart Sections
// Inspired by references 3, 6 - Smart categorization with horizontal scrolling sections
// Organized discovery with filter pills, section-based browsing

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
  servings?: number;
  cookCard?: any;
  isPersonalized?: boolean;
  source_url?: string;
  priorityReasons?: string[];
}

export const ExploreRecipesScreenV4: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, householdId } = useAuth();
  const userId = user?.id;

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [activeFilter, setActiveFilter] = useState('All');

  const filters = [
    { id: 'All', label: 'All', icon: 'apps' as const },
    { id: 'Match', label: 'High Match', icon: 'checkmark-circle' as const },
    { id: 'Quick', label: 'Quick', icon: 'flash' as const },
    { id: 'Healthy', label: 'Healthy', icon: 'leaf' as const },
  ];

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
      const personalizedRecs = await getPersonalizedRecommendations(userId, householdId, 30);
      const formattedRecipes: Recipe[] = personalizedRecs.map(rec => ({
        id: rec.cook_card.id,
        title: rec.cook_card.title,
        imageUrl: rec.cook_card.image_url,
        cookTime: rec.cook_card.cook_time_minutes || rec.cook_card.total_time_minutes,
        servings: rec.cook_card.servings,
        matchPercentage: Math.round(rec.completeness * 100),
        matchedCount: rec.have_ingredients.length,
        totalIngredients: rec.cook_card.ingredients?.length || 0,
        cookCard: rec.cook_card,
        isPersonalized: true,
        source_url: rec.cook_card.source_url,
        priorityReasons: rec.priority_reasons,
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

  // Categorize recipes into sections
  const getHighMatchRecipes = () => recipes.filter(r => r.matchPercentage && r.matchPercentage >= 70);
  const getQuickRecipes = () => recipes.filter(r => r.cookTime && r.cookTime <= 30);
  const getExpiringRecipes = () => recipes.filter(r =>
    r.priorityReasons?.some(reason => reason.toLowerCase().includes('expiring'))
  );

  const renderHorizontalCard = (recipe: Recipe) => (
    <Pressable
      key={recipe.id}
      style={styles.horizontalCard}
      onPress={() => handleRecipePress(recipe)}
    >
      <Image
        source={{ uri: recipe.imageUrl || 'https://via.placeholder.com/280x200' }}
        style={styles.horizontalImage}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)']}
        style={styles.horizontalGradient}
      >
        <View style={styles.horizontalContent}>
          <Text style={styles.horizontalTitle} numberOfLines={2}>{recipe.title}</Text>
          <View style={styles.horizontalMeta}>
            <View style={styles.horizontalMetaItem}>
              <Ionicons name="time-outline" size={14} color="#fff" />
              <Text style={styles.horizontalMetaText}>{recipe.cookTime || '—'} min</Text>
            </View>
            <View style={styles.horizontalMetaItem}>
              <Ionicons name="bar-chart-outline" size={14} color="#fff" />
              <Text style={styles.horizontalMetaText}>{recipe.matchPercentage || 0}% match</Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );

  const renderGridCard = (recipe: Recipe) => (
    <Pressable
      key={recipe.id}
      style={styles.gridCard}
      onPress={() => handleRecipePress(recipe)}
    >
      <Image
        source={{ uri: recipe.imageUrl || 'https://via.placeholder.com/200x200' }}
        style={styles.gridImage}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)']}
        style={styles.gridGradient}
      >
        {recipe.matchPercentage && recipe.matchPercentage > 0 && (
          <View style={styles.gridBadge}>
            <Text style={styles.gridBadgeText}>{recipe.matchPercentage}%</Text>
          </View>
        )}
        <Text style={styles.gridTitle} numberOfLines={2}>{recipe.title}</Text>
        <View style={styles.gridFooter}>
          <Text style={styles.gridTime}>{recipe.cookTime || '—'} mins</Text>
          <View style={styles.gridViews}>
            <Ionicons name="eye-outline" size={12} color="rgba(255,255,255,0.8)" />
            <Text style={styles.gridViewsText}>{recipe.servings || '—'}</Text>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );

  const renderSection = (title: string, subtitle: string, data: Recipe[], renderType: 'horizontal' | 'grid') => {
    if (data.length === 0) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text style={styles.sectionSubtitle}>{subtitle}</Text>
          </View>
          <Pressable>
            <Text style={styles.seeMore}>See More</Text>
          </Pressable>
        </View>

        {renderType === 'horizontal' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
            {data.slice(0, 5).map(recipe => renderHorizontalCard(recipe))}
          </ScrollView>
        ) : (
          <View style={styles.gridContainer}>
            {data.slice(0, 6).map(recipe => renderGridCard(recipe))}
          </View>
        )}
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
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={20} color={theme.colors.primary} />
          </View>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Get cooking today!</Text>
          </View>
          <Pressable
            style={styles.menuIcon}
            onPress={() => navigation.navigate('MealPlanning')}
          >
            <Ionicons name="calendar" size={24} color={theme.colors.primary} />
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search recipes"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersScroll}
        >
          {filters.map(filter => (
            <Pressable
              key={filter.id}
              style={[
                styles.filterPill,
                activeFilter === filter.id && styles.filterPillActive
              ]}
              onPress={() => setActiveFilter(filter.id)}
            >
              <Ionicons
                name={filter.icon}
                size={16}
                color={activeFilter === filter.id ? '#fff' : '#6B7280'}
                style={styles.filterIcon}
              />
              <Text
                style={[
                  styles.filterText,
                  activeFilter === filter.id && styles.filterTextActive
                ]}
              >
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Recipe Count & View Toggle */}
        <View style={styles.controlBar}>
          <Text style={styles.recipeCount}>{recipes.length} recipes</Text>
          <View style={styles.viewToggle}>
            <Pressable style={styles.viewButton}>
              <Ionicons name="list" size={20} color="#111827" />
            </Pressable>
            <Pressable style={[styles.viewButton, styles.viewButtonActive]}>
              <Ionicons name="grid" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <>
            {/* High Match Section */}
            {renderSection(
              'Perfect Matches',
              'Recipes you can make now',
              getHighMatchRecipes(),
              'horizontal'
            )}

            {/* Quick Meals Section */}
            {renderSection(
              'Quick & Easy',
              'Ready in 30 minutes or less',
              getQuickRecipes(),
              'grid'
            )}

            {/* Use Expiring Ingredients */}
            {getExpiringRecipes().length > 0 && renderSection(
              'Use Soon',
              'Before ingredients expire',
              getExpiringRecipes(),
              'horizontal'
            )}

            {/* All Recommendations */}
            {recipes.length > 10 && renderSection(
              'More Recommendations',
              'Discover new favorites',
              recipes.slice(10),
              'grid'
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
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  menuIcon: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 16,
    height: 48,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    marginLeft: 12,
  },
  filtersScroll: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
  },
  filterPillActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  filterIcon: {
    marginRight: 6,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterTextActive: {
    color: '#fff',
  },
  controlBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  recipeCount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 2,
  },
  viewButton: {
    padding: 8,
    borderRadius: 6,
  },
  viewButtonActive: {
    backgroundColor: '#111827',
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  seeMore: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  horizontalScroll: {
    paddingHorizontal: 20,
    gap: 12,
  },
  horizontalCard: {
    width: 280,
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  horizontalImage: {
    width: '100%',
    height: '100%',
  },
  horizontalGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    justifyContent: 'flex-end',
    padding: 16,
  },
  horizontalContent: {
    gap: 8,
  },
  horizontalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 24,
  },
  horizontalMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  horizontalMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  horizontalMetaText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
  },
  gridCard: {
    width: (screenWidth - 40 - 12) / 2,
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '100%',
    justifyContent: 'flex-end',
    padding: 12,
  },
  gridBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  gridBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  gridTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 20,
    marginBottom: 8,
  },
  gridFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gridTime: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  gridViews: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gridViewsText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
});
