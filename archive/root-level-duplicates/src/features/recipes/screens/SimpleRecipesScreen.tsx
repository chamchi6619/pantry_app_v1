import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../../../core/constants/theme';
import { useEnhancedRecipeStore } from '../../../stores/enhancedRecipeStore';
import { useInventoryStore } from '../../../stores/inventoryStore';
import { useMatchJobStore } from '../../../stores/matchJobStore';
import { shallow } from 'zustand/shallow';

interface SimpleRecipeCardProps {
  recipe: any;
  onPress: () => void;
  matchPercentage?: number;
  hasExpiring?: boolean;
  showMatch?: boolean;
  loading?: boolean;
}

const SimpleRecipeCard: React.FC<SimpleRecipeCardProps> = ({
  recipe,
  onPress,
  matchPercentage,
  hasExpiring,
  showMatch = false,
  loading = false
}) => {
  const canMake = (matchPercentage || 0) >= 70;
  const matchColor =
    (matchPercentage || 0) >= 70 ? theme.colors.success :
    (matchPercentage || 0) >= 40 ? '#F59E0B' :
    theme.colors.textLight;

  return (
    <Pressable style={styles.recipeCard} onPress={onPress}>
      <View style={styles.recipeHeader}>
        <Text style={styles.recipeIcon}>🍴</Text>
        <View style={styles.recipeInfo}>
          <View style={styles.recipeNameRow}>
            <Text style={styles.recipeName} numberOfLines={1}>
              {recipe.name}
            </Text>
            {hasExpiring && (
              <Text style={styles.expiringBadge}>⚠️ Use soon</Text>
            )}
          </View>
          <View style={styles.recipeMeta}>
            <Text style={styles.metaText}>⏱️ {recipe.prepTime + recipe.cookTime}min</Text>
            <Text style={styles.metaText}>• {recipe.servings} servings</Text>
            {showMatch && (
              loading ? (
                <ActivityIndicator size="small" color={theme.colors.textLight} style={{ marginLeft: 8 }} />
              ) : matchPercentage !== undefined ? (
                <Text style={[styles.metaText, { color: matchColor, fontWeight: '600' }]}>
                  • {matchPercentage}% match
                </Text>
              ) : null
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
};

export const SimpleRecipesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const recipes = useEnhancedRecipeStore((state) => state.recipes);
  const inventory = useInventoryStore((state) => state.items);
  const inventoryVersion = useInventoryStore((state) => state.version || 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [mode, setMode] = useState<'browse' | 'pantry'>('browse');

  // Match job store - use selectors to prevent re-renders
  const status = useMatchJobStore((state) => state.status);
  const progressTotal = useMatchJobStore((state) => state.progress.total);
  const progressDone = useMatchJobStore((state) => state.progress.done);
  const results = useMatchJobStore((state) => state.results, shallow);
  const startJob = useMatchJobStore((state) => state.startJob);
  const cancelJob = useMatchJobStore((state) => state.cancelJob);

  // Start matching when switching to pantry mode
  const startMatching = () => {
    setMode('pantry');
    startJob(recipes, inventory, inventoryVersion);
  };

  // Cancel matching and return to browse mode
  const stopMatching = () => {
    setMode('browse');
    cancelJob();
  };

  // In browse mode, no matching. In pantry mode, use job results
  const recipesWithAvailability = useMemo(() => {
    if (mode === 'browse') {
      // No matching in browse mode - instant render
      return recipes.map(recipe => ({
        recipe,
        matchPercentage: undefined,
        hasExpiring: false
      }));
    }
    // In pantry mode, use results from match job
    return recipes.map(recipe => {
      const key = `${recipe.id}|${inventoryVersion}`;
      const result = results[key];
      return {
        recipe,
        matchPercentage: result?.pct,
        hasExpiring: result?.hasExpiring || false
      };
    });
  }, [recipes, mode, results, inventoryVersion]);

  // Filter by search
  const filteredRecipes = useMemo(() => {
    if (!searchQuery.trim()) return recipesWithAvailability;

    const query = searchQuery.toLowerCase();
    return recipesWithAvailability.filter(({ recipe }) =>
      recipe.name.toLowerCase().includes(query) ||
      recipe.tags.some((tag: string) => tag.toLowerCase().includes(query))
    );
  }, [recipesWithAvailability, searchQuery]);

  // Sort: In pantry mode, sort by match. In browse mode, keep original order
  const sortedRecipes = useMemo(() => {
    if (mode === 'browse') {
      return filteredRecipes; // Keep original order in browse mode
    }

    return [...filteredRecipes].sort((a, b) => {
      // Put scored items first
      const aScored = a.matchPercentage !== undefined;
      const bScored = b.matchPercentage !== undefined;
      if (aScored && !bScored) return -1;
      if (!aScored && bScored) return 1;

      // Among scored items, sort by expiring and match percentage
      if (aScored && bScored) {
        if (a.hasExpiring && !b.hasExpiring) return -1;
        if (!a.hasExpiring && b.hasExpiring) return 1;
        return (b.matchPercentage || 0) - (a.matchPercentage || 0);
      }

      return 0; // Keep original order for unscored
    });
  }, [filteredRecipes, mode]);

  const handleRecipePress = (recipe: any) => {
    navigation.navigate('RecipeDetail', { recipe });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Recipes</Text>
          {mode === 'browse' ? (
            <Pressable style={styles.modeButton} onPress={startMatching}>
              <Text style={styles.modeButtonText}>📦 Use what I've got</Text>
            </Pressable>
          ) : (
            <View style={styles.pantryModeInfo}>
              {status === 'running' && (
                <Text style={styles.progressText}>
                  Matching {progressDone}/{progressTotal}
                </Text>
              )}
              <Pressable style={styles.turnOffButton} onPress={stopMatching}>
                <Text style={styles.turnOffText}>Turn off</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search recipes..."
            placeholderTextColor={theme.colors.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery !== '' && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Text style={styles.clearIcon}>✖</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.countText}>
          {sortedRecipes.length} recipes
          {mode === 'pantry' && status === 'completed' && inventory.length > 0 &&
            ` • ${sortedRecipes.filter(r => (r.matchPercentage || 0) >= 70).length} available`
          }
        </Text>
      </View>

      <FlatList
        data={sortedRecipes}
        keyExtractor={(item) => item.recipe.id}
        renderItem={({ item }) => (
          <SimpleRecipeCard
            recipe={item.recipe}
            onPress={() => handleRecipePress(item.recipe)}
            matchPercentage={item.matchPercentage}
            hasExpiring={item.hasExpiring}
            showMatch={mode === 'pantry'}
            loading={mode === 'pantry' && status === 'running' && item.matchPercentage === undefined}
          />
        )}
        contentContainerStyle={styles.listContent}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={10}
        removeClippedSubviews={true}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.text,
  },
  modeButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.medium,
  },
  modeButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  pantryModeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  progressText: {
    ...theme.typography.caption,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  turnOffButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  turnOffText: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    textDecorationLine: 'underline',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.medium,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: theme.spacing.xs,
  },
  searchInput: {
    flex: 1,
    ...theme.typography.body,
    color: theme.colors.text,
    padding: 0,
  },
  clearIcon: {
    fontSize: 14,
    color: theme.colors.textLight,
    padding: theme.spacing.xs,
  },
  countText: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
  },
  listContent: {
    paddingBottom: theme.spacing.lg,
  },
  recipeCard: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderRadius: theme.borderRadius.medium,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  recipeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recipeIcon: {
    fontSize: 32,
    marginRight: theme.spacing.sm,
  },
  recipeInfo: {
    flex: 1,
  },
  recipeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recipeName: {
    ...theme.typography.h3,
    color: theme.colors.text,
    flex: 1,
  },
  expiringBadge: {
    ...theme.typography.caption,
    color: theme.colors.error,
    marginLeft: theme.spacing.xs,
  },
  recipeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: theme.spacing.xs,
  },
  metaText: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    marginRight: theme.spacing.xs,
  },
});