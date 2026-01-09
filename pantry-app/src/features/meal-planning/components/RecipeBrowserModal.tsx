/**
 * RecipeBrowserModal Component
 *
 * Purpose: Modal for selecting recipes to add to meal plan
 * Features: Search, filter by pantry match, sort by match percentage
 * UX Pattern: Full-screen modal with search bar, follows CookCardScreen modal pattern
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  SafeAreaView,
  TextInput,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../../core/constants/theme';
import { supabase } from '../../../lib/supabase';
import { batchCalculatePantryMatch, type PantryMatchResult } from '../../../services/pantryMatchService';
import { addToQueue, isInQueue } from '../../../services/queueService';
import { useAuth } from '../../../contexts/AuthContext';

interface RecipeBrowserModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectRecipe: (cookCardId: string) => void;
  householdId: string;
  mealType?: string; // For context in header (legacy, can be removed)
  mode?: 'queue' | 'meal_plan'; // NEW: 'queue' for adding to queue, 'meal_plan' for meal planning
}

interface CookCard {
  id: string;
  title: string;
  image_url?: string;
  cook_time_minutes?: number;
  total_time_minutes?: number;
  servings?: number;
}

type SortOption = 'match' | 'name' | 'time';

export default function RecipeBrowserModal({
  visible,
  onClose,
  onSelectRecipe,
  householdId,
  mealType,
  mode = 'queue', // Default to queue mode (new behavior)
}: RecipeBrowserModalProps) {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<CookCard[]>([]);
  const [pantryMatches, setPantryMatches] = useState<Map<string, PantryMatchResult>>(new Map());
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('match');
  const [addingToQueue, setAddingToQueue] = useState<string | null>(null);

  // Fetch recipes and calculate pantry matches
  useEffect(() => {
    if (visible) {
      loadRecipes();
    }
  }, [visible]);

  const loadRecipes = async () => {
    setLoading(true);
    try {
      // Fetch cook cards
      const { data, error } = await supabase
        .from('cook_cards')
        .select('id, title, image_url, cook_time_minutes, total_time_minutes, servings')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      setRecipes(data || []);

      // Calculate pantry matches for all recipes
      if (data && data.length > 0) {
        const cookCardIds = data.map(r => r.id);
        const matches = await batchCalculatePantryMatch(cookCardIds, householdId);
        setPantryMatches(matches);
      }
    } catch (error) {
      console.error('Error loading recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort recipes
  const filteredRecipes = useMemo(() => {
    let filtered = recipes;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        r => r.title.toLowerCase().includes(query)
      );
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'match': {
          const matchA = pantryMatches.get(a.id)?.matchPercent || 0;
          const matchB = pantryMatches.get(b.id)?.matchPercent || 0;
          return matchB - matchA; // Descending
        }
        case 'name':
          return a.title.localeCompare(b.title);
        case 'time': {
          const timeA = a.total_time_minutes || a.cook_time_minutes || 999;
          const timeB = b.total_time_minutes || b.cook_time_minutes || 999;
          return timeA - timeB;
        }
        default:
          return 0;
      }
    });

    return sorted;
  }, [recipes, searchQuery, sortBy, pantryMatches]);

  const handleSelectRecipe = async (recipeId: string) => {
    if (mode === 'queue') {
      // Add to queue mode
      if (!user) {
        console.error('No user found');
        return;
      }

      try {
        setAddingToQueue(recipeId);

        // Check if already in queue
        const alreadyInQueue = await isInQueue(householdId, recipeId);
        if (alreadyInQueue) {
          alert('This recipe is already in your queue');
          setAddingToQueue(null);
          return;
        }

        // Add to queue
        await addToQueue(user.id, householdId, recipeId, 'user');

        // Success - call callback and close
        onSelectRecipe(recipeId);
        onClose();

        // Reset state
        setSearchQuery('');
        setSortBy('match');
        setAddingToQueue(null);
      } catch (error: any) {
        console.error('Error adding to queue:', error);
        alert(error.message || 'Failed to add to queue');
        setAddingToQueue(null);
      }
    } else {
      // Meal plan mode (legacy)
      onSelectRecipe(recipeId);
      onClose();
      // Reset state
      setSearchQuery('');
      setSortBy('match');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={28} color={theme.colors.textPrimary} />
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>
              {mode === 'queue' ? 'Add to Queue' : `Add ${mealType || 'Meal'}`}
            </Text>
            <Text style={styles.headerSubtitle}>
              {mode === 'queue' ? 'Choose recipes to cook' : 'Choose a recipe'}
            </Text>
          </View>
          <View style={{ width: 28 }} />
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search recipes..."
            placeholderTextColor={theme.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          )}
        </View>

        {/* Sort Options */}
        <View style={styles.sortContainer}>
          <Text style={styles.sortLabel}>Sort by:</Text>
          <Pressable
            style={[styles.sortButton, sortBy === 'match' && styles.sortButtonActive]}
            onPress={() => setSortBy('match')}
          >
            <Text style={[styles.sortButtonText, sortBy === 'match' && styles.sortButtonTextActive]}>
              Pantry Match
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sortButton, sortBy === 'name' && styles.sortButtonActive]}
            onPress={() => setSortBy('name')}
          >
            <Text style={[styles.sortButtonText, sortBy === 'name' && styles.sortButtonTextActive]}>
              Name
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sortButton, sortBy === 'time' && styles.sortButtonActive]}
            onPress={() => setSortBy('time')}
          >
            <Text style={[styles.sortButtonText, sortBy === 'time' && styles.sortButtonTextActive]}>
              Time
            </Text>
          </Pressable>
        </View>

        {/* Recipe List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Loading recipes...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredRecipes}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <RecipeCard
                recipe={item}
                pantryMatch={pantryMatches.get(item.id)}
                onPress={() => handleSelectRecipe(item.id)}
                isAdding={addingToQueue === item.id}
                mode={mode}
              />
            )}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="search-outline" size={48} color={theme.colors.textSecondary} />
                <Text style={styles.emptyText}>
                  {searchQuery ? 'No recipes found' : 'No recipes available'}
                </Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ============================================================================
// RecipeCard: Individual recipe item in the list
// ============================================================================

interface RecipeCardProps {
  recipe: CookCard;
  pantryMatch?: PantryMatchResult;
  onPress: () => void;
  isAdding?: boolean;
  mode?: 'queue' | 'meal_plan';
}

function RecipeCard({ recipe, pantryMatch, onPress, isAdding, mode = 'queue' }: RecipeCardProps) {
  const matchPercent = pantryMatch?.matchPercent || 0;
  const matchColor =
    matchPercent >= 70
      ? theme.colors.pantryMatch.high
      : matchPercent >= 40
      ? theme.colors.pantryMatch.medium
      : theme.colors.pantryMatch.low;

  return (
    <Pressable style={styles.recipeCard} onPress={onPress}>
      {/* Recipe Image */}
      <View style={styles.recipeImageContainer}>
        {recipe.image_url ? (
          <>
            <Image source={{ uri: recipe.image_url }} style={styles.recipeImage} />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.6)']}
              style={styles.recipeImageGradient}
            />
          </>
        ) : (
          <View style={styles.placeholderImage}>
            <Ionicons name="restaurant-outline" size={32} color={theme.colors.textSecondary} />
          </View>
        )}

        {/* Pantry Match Badge */}
        <View style={[styles.matchBadge, { backgroundColor: matchColor }]}>
          <Text style={styles.matchBadgeText}>{matchPercent}%</Text>
        </View>
      </View>

      {/* Recipe Info */}
      <View style={styles.recipeInfo}>
        <Text style={styles.recipeTitle} numberOfLines={2}>
          {recipe.title}
        </Text>

        <View style={styles.recipeMetadata}>
          {recipe.total_time_minutes && (
            <View style={styles.metadataItem}>
              <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
              <Text style={styles.metadataText}>{recipe.total_time_minutes}m</Text>
            </View>
          )}
          {recipe.servings && (
            <View style={styles.metadataItem}>
              <Ionicons name="people-outline" size={14} color={theme.colors.textSecondary} />
              <Text style={styles.metadataText}>{recipe.servings}</Text>
            </View>
          )}
          {pantryMatch && pantryMatch.missingIngredients.length > 0 && (
            <View style={styles.metadataItem}>
              <Ionicons name="alert-circle-outline" size={14} color={theme.colors.error} />
              <Text style={styles.missingText}>
                {pantryMatch.missingIngredients.length} missing
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Add Button */}
      <View style={styles.addButtonContainer}>
        {isAdding ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <Ionicons
            name={mode === 'queue' ? 'add-circle' : 'checkmark-circle'}
            size={32}
            color={theme.colors.primary}
          />
        )}
      </View>
    </Pressable>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
    textTransform: 'capitalize',
  },
  headerSubtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontSize: 12,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    margin: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...theme.typography.body,
    color: theme.colors.textPrimary,
  },

  // Sort
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  sortLabel: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  sortButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sortButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  sortButtonText: {
    ...theme.typography.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  sortButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },

  // List
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },

  // Recipe Card
  recipeCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  recipeImageContainer: {
    width: 100,
    height: 120,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  recipeImage: {
    width: '100%',
    height: '100%',
  },
  recipeImageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  matchBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  recipeInfo: {
    flex: 1,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  recipeTitle: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    fontSize: 15,
  },
  recipeMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metadataText: {
    ...theme.typography.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  missingText: {
    ...theme.typography.body,
    fontSize: 12,
    color: theme.colors.error,
  },
  cuisineType: {
    ...theme.typography.body,
    fontSize: 11,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  addButtonContainer: {
    justifyContent: 'center',
    paddingRight: theme.spacing.md,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  loadingText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },

  // Empty State
  emptyContainer: {
    paddingVertical: theme.spacing.xl * 2,
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
});
