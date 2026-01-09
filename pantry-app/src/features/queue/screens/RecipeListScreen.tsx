import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../../core/constants/theme';

type SortOption = 'match' | 'time' | 'difficulty';

interface RecipeDatabaseItem {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  category?: string;
  total_time_minutes?: number;
  difficulty?: string;
  pantry_match_percent?: number;
  creator_name?: string;
}

type RouteParams = {
  RecipeListScreen: {
    title: string;
    recipes: RecipeDatabaseItem[];
    filterType?: 'readyToCook' | 'almostThere' | 'category' | 'all';
  };
};

export const RecipeListScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'RecipeListScreen'>>();
  const { title, recipes: initialRecipes, filterType } = route.params;

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('match');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    // In a real app, re-fetch data here
    setTimeout(() => setRefreshing(false), 1000);
  };

  // Filter and sort recipes
  const filteredAndSortedRecipes = useMemo(() => {
    let result = [...initialRecipes];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((recipe) =>
        recipe.title.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    switch (sortBy) {
      case 'match':
        result.sort((a, b) => (b.pantry_match_percent || 0) - (a.pantry_match_percent || 0));
        break;
      case 'time':
        result.sort((a, b) => (a.total_time_minutes || 999) - (b.total_time_minutes || 999));
        break;
      case 'difficulty':
        const difficultyOrder = { easy: 1, medium: 2, hard: 3 };
        result.sort((a, b) => {
          const aVal = difficultyOrder[a.difficulty?.toLowerCase() as keyof typeof difficultyOrder] || 2;
          const bVal = difficultyOrder[b.difficulty?.toLowerCase() as keyof typeof difficultyOrder] || 2;
          return aVal - bVal;
        });
        break;
    }

    return result;
  }, [initialRecipes, searchQuery, sortBy]);

  const handleRecipePress = (recipe: RecipeDatabaseItem) => {
    navigation.navigate('CookCard' as never, { recipeDatabaseId: recipe.id } as never);
  };

  const renderRecipeCard = (recipe: RecipeDatabaseItem) => {
    const matchPercentage = Math.round(recipe.pantry_match_percent || 0);

    return (
      <Pressable
        key={recipe.id}
        style={styles.recipeCard}
        onPress={() => handleRecipePress(recipe)}
      >
        <Image
          source={{
            uri: recipe.image_url || 'https://via.placeholder.com/280x200',
          }}
          style={styles.recipeImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.75)']}
          style={styles.recipeGradient}
        >
          <View style={styles.recipeContent}>
            <View style={styles.matchBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#fff" />
              <Text style={styles.matchBadgeText}>{matchPercentage}%</Text>
            </View>
            <Text style={styles.recipeTitle} numberOfLines={2}>
              {recipe.title}
            </Text>
            <View style={styles.recipeMeta}>
              {recipe.total_time_minutes && (
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={12} color="#fff" />
                  <Text style={styles.metaText}>{recipe.total_time_minutes} min</Text>
                </View>
              )}
              {recipe.difficulty && (
                <View style={styles.metaItem}>
                  <Ionicons name="bar-chart-outline" size={12} color="#fff" />
                  <Text style={styles.metaText}>{recipe.difficulty}</Text>
                </View>
              )}
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    );
  };

  const getSortLabel = () => {
    switch (sortBy) {
      case 'match':
        return 'Best Match';
      case 'time':
        return 'Fastest';
      case 'difficulty':
        return 'Easiest';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.count}>{filteredAndSortedRecipes.length} recipes</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={theme.colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search recipes"
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
      </View>

      {/* Sort Options */}
      <View style={styles.sortContainer}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortOptions}>
          <Pressable
            style={[styles.sortChip, sortBy === 'match' && styles.sortChipActive]}
            onPress={() => setSortBy('match')}
          >
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={sortBy === 'match' ? '#fff' : theme.colors.primary}
              style={styles.sortChipIcon}
            />
            <Text style={[styles.sortChipText, sortBy === 'match' && styles.sortChipTextActive]}>
              Best Match
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sortChip, sortBy === 'time' && styles.sortChipActive]}
            onPress={() => setSortBy('time')}
          >
            <Ionicons
              name="time-outline"
              size={16}
              color={sortBy === 'time' ? '#fff' : theme.colors.primary}
              style={styles.sortChipIcon}
            />
            <Text style={[styles.sortChipText, sortBy === 'time' && styles.sortChipTextActive]}>
              Fastest
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sortChip, sortBy === 'difficulty' && styles.sortChipActive]}
            onPress={() => setSortBy('difficulty')}
          >
            <Ionicons
              name="bar-chart-outline"
              size={16}
              color={sortBy === 'difficulty' ? '#fff' : theme.colors.primary}
              style={styles.sortChipIcon}
            />
            <Text style={[styles.sortChipText, sortBy === 'difficulty' && styles.sortChipTextActive]}>
              Easiest
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* Recipes Grid */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {filteredAndSortedRecipes.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyTitle}>No recipes found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery ? 'Try adjusting your search' : 'Check back later for more recipes'}
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {filteredAndSortedRecipes.map((recipe) => renderRecipeCard(recipe))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFBFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  headerTitle: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  count: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  headerSpacer: {
    width: 40,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 44,
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
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sortLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginRight: 12,
  },
  sortOptions: {
    flex: 1,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    marginRight: 8,
  },
  sortChipActive: {
    backgroundColor: theme.colors.primary,
  },
  sortChipIcon: {
    marginRight: 4,
  },
  sortChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  sortChipTextActive: {
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  recipeCard: {
    width: '50%',
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  recipeImage: {
    width: '100%',
    height: 160,
    borderRadius: 12,
  },
  recipeGradient: {
    position: 'absolute',
    bottom: 0,
    left: 6,
    right: 6,
    height: 120,
    borderRadius: 12,
    justifyContent: 'flex-end',
  },
  recipeContent: {
    padding: 12,
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34, 197, 94, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 6,
  },
  matchBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    marginLeft: 4,
  },
  recipeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  recipeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  metaText: {
    fontSize: 11,
    color: '#fff',
    marginLeft: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
});
