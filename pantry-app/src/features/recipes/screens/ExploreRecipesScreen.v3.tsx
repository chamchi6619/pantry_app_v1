// Variant 3: Minimalist Elegant
// Inspired by reference 8 (Cookbook app with serif typography)
// Clean, sophisticated, lots of white space, elegant list-based layout

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
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../contexts/AuthContext';
import { getPersonalizedRecommendations } from '../../../services/recommendationEngine';
import { theme } from '../../../core/constants/theme';

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

export const ExploreRecipesScreenV3: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, householdId } = useAuth();
  const userId = user?.id;

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [activeTab, setActiveTab] = useState<'Recipes' | 'Collections'>('Recipes');
  const [activeFilter, setActiveFilter] = useState('All');

  const filters = ['All', 'From Pantry', 'Quick Meals', 'Favorites'];

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

  const renderRecipeItem = (recipe: Recipe) => (
    <Pressable
      key={recipe.id}
      style={styles.recipeItem}
      onPress={() => handleRecipePress(recipe)}
    >
      <Image
        source={{ uri: recipe.imageUrl || 'https://via.placeholder.com/120x120' }}
        style={styles.recipeImage}
        resizeMode="cover"
      />
      <View style={styles.recipeContent}>
        <Text style={styles.recipeTitle} numberOfLines={2}>{recipe.title}</Text>
        <Text style={styles.recipeMeta}>
          {recipe.cookTime ? `${recipe.cookTime}m Cook Time` : 'Cooking time varies'}
        </Text>
        {recipe.matchPercentage && recipe.matchPercentage > 0 && (
          <View style={styles.matchIndicator}>
            <View style={[styles.matchBar, { width: `${recipe.matchPercentage}%` }]} />
          </View>
        )}
      </View>
      <Pressable style={styles.menuButton}>
        <Ionicons name="ellipsis-horizontal" size={20} color="#9CA3AF" />
      </Pressable>
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
          <View style={styles.headerLeft}>
            <Text style={styles.appTitle}>Recipe Book</Text>
            <Text style={styles.appSubtitle}>Your curated collection</Text>
          </View>
          <Pressable style={styles.upgradeButton}>
            <Text style={styles.upgradeButtonText}>Upgrade</Text>
          </Pressable>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <Pressable
            style={[styles.tab, activeTab === 'Recipes' && styles.tabActive]}
            onPress={() => setActiveTab('Recipes')}
          >
            <Text style={[styles.tabText, activeTab === 'Recipes' && styles.tabTextActive]}>
              Recipes
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'Collections' && styles.tabActive]}
            onPress={() => setActiveTab('Collections')}
          >
            <Text style={[styles.tabText, activeTab === 'Collections' && styles.tabTextActive]}>
              Collections
            </Text>
          </Pressable>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterContainer}>
          <Pressable style={styles.filterPillDark}>
            <Text style={styles.filterPillDarkText}>{activeFilter}</Text>
          </Pressable>
          <Pressable style={styles.addButton}>
            <Ionicons name="add" size={16} color="#111827" />
            <Text style={styles.addButtonText}>Add collection</Text>
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search saved recipes"
            placeholderTextColor="#D1D5DB"
          />
          <Pressable style={styles.sortButton}>
            <Ionicons name="options-outline" size={18} color="#6B7280" />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6B7280" />
          </View>
        ) : (
          <View style={styles.recipeList}>
            {recipes.map(recipe => renderRecipeItem(recipe))}
          </View>
        )}

        {/* Empty State */}
        {!loading && recipes.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="restaurant-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateTitle}>No recipes yet</Text>
            <Text style={styles.emptyStateText}>Start building your collection</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  headerLeft: {
    flex: 1,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: '400',
    color: '#111827',
    marginBottom: 4,
    // Serif-like weight - use system serif on iOS
    ...(Platform.OS === 'ios' && {
      fontFamily: 'Georgia',
    }),
  },
  appSubtitle: {
    fontSize: 15,
    color: '#9CA3AF',
    fontWeight: '400',
  },
  upgradeButton: {
    backgroundColor: '#D97B54',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  upgradeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginBottom: 24,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#111827',
    fontWeight: '600',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginBottom: 20,
    gap: 12,
  },
  filterPillDark: {
    backgroundColor: '#2C3338',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterPillDarkText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 28,
    paddingHorizontal: 16,
    height: 48,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  sortButton: {
    padding: 4,
  },
  recipeList: {
    paddingHorizontal: 24,
  },
  recipeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  recipeImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
  },
  recipeContent: {
    flex: 1,
    marginLeft: 16,
    marginRight: 12,
  },
  recipeTitle: {
    fontSize: 17,
    fontWeight: '400',
    color: '#111827',
    marginBottom: 6,
    lineHeight: 24,
    // Serif-like for elegance
    ...(Platform.OS === 'ios' && {
      fontFamily: 'Georgia',
    }),
  },
  recipeMeta: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  matchIndicator: {
    height: 3,
    backgroundColor: '#F3F4F6',
    borderRadius: 2,
    overflow: 'hidden',
  },
  matchBar: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
  },
  menuButton: {
    padding: 8,
  },
  loadingContainer: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  emptyState: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
});
