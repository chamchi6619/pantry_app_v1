import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../../core/constants/theme';
import { Badge } from '../../../core/components/ui/Badge';

interface RecipeCardProps {
  title: string;
  time: string;
  servings: string;
  matchPercent: number;
  haveCount: number;
  missingCount: number;
  tags: string[];
  isUseItUp?: boolean;
}

const RecipeCard: React.FC<RecipeCardProps> = ({
  title,
  time,
  servings,
  matchPercent,
  haveCount,
  missingCount,
  tags,
  isUseItUp = false,
}) => {
  return (
    <Pressable style={styles.recipeCard}>
      {isUseItUp && (
        <View style={styles.useItUpBadge}>
          <Text style={styles.useItUpText}>⚠️ Use it up</Text>
        </View>
      )}

      <View style={styles.recipeImage}>
        <Text style={styles.recipePlaceholder}>🍴</Text>
      </View>

      <View style={styles.recipeInfo}>
        <Text style={styles.recipeTitle}>{title}</Text>

        <View style={styles.recipeMeta}>
          <Text style={styles.metaText}>⏱️ {time}</Text>
          <Text style={styles.metaText}>👥 {servings}</Text>
        </View>

        <View style={styles.ingredientStatus}>
          <Text style={styles.haveText}>Have {haveCount}</Text>
          {missingCount > 0 && (
            <Text style={styles.missingText}>Missing {missingCount}</Text>
          )}
        </View>

        <View style={styles.tags}>
          {tags.map((tag, index) => (
            <View key={index} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.matchContainer}>
        <Text style={styles.matchPercent}>{matchPercent}%</Text>
        <Text style={styles.matchLabel}>match</Text>
      </View>
    </Pressable>
  );
};

export const RecipesScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'useItUp' | 'high' | 'classic' | null>(null);

  const recipes = [
    {
      title: 'Quick Lettuce Wraps',
      time: '15min',
      servings: '2-3',
      matchPercent: 85,
      haveCount: 4,
      missingCount: 1,
      tags: ['Asian', 'Light'],
      isUseItUp: true,
    },
    {
      title: 'Carrot Ginger Soup',
      time: '25min',
      servings: '4',
      matchPercent: 95,
      haveCount: 6,
      missingCount: 0,
      tags: ['Vegetarian', 'Healthy'],
      isUseItUp: false,
    },
    {
      title: 'Classic Pasta',
      time: '20min',
      servings: '4',
      matchPercent: 92,
      haveCount: 7,
      missingCount: 2,
      tags: ['Italian', 'Classic'],
      isUseItUp: false,
    },
  ];

  const useItUpRecipes = recipes.filter(r => r.isUseItUp);
  const highMatchRecipes = recipes.filter(r => r.matchPercent >= 70);
  const classicRecipes = recipes.filter(r => r.tags.includes('Classic'));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recipes</Text>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search recipes..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={theme.colors.textLight}
          />
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Use It Up Section */}
        <View style={styles.section}>
          <Pressable
            style={styles.sectionHeader}
            onPress={() => setActiveFilter(activeFilter === 'useItUp' ? null : 'useItUp')}
          >
            <View style={styles.sectionTitleContainer}>
              <Text style={styles.alertIcon}>⚠️</Text>
              <Text style={styles.sectionTitle}>Use it up</Text>
              <View style={styles.expiringBadge}>
                <Text style={styles.expiringText}>Items expiring ≤72h</Text>
              </View>
            </View>
            <Text style={styles.chevron}>{activeFilter === 'useItUp' ? '⌃' : '⌄'}</Text>
          </Pressable>

          {(activeFilter === null || activeFilter === 'useItUp') && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalScroll}
            >
              {useItUpRecipes.map((recipe, index) => (
                <View key={index} style={styles.horizontalCard}>
                  <RecipeCard {...recipe} />
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* High Match Section */}
        <View style={styles.section}>
          <Pressable
            style={styles.sectionHeader}
            onPress={() => setActiveFilter(activeFilter === 'high' ? null : 'high')}
          >
            <Text style={styles.sectionTitle}>High Match (≥70%)</Text>
            <Text style={styles.chevron}>{activeFilter === 'high' ? '⌃' : '⌄'}</Text>
          </Pressable>

          {(activeFilter === null || activeFilter === 'high') && (
            <View>
              {highMatchRecipes.map((recipe, index) => (
                <RecipeCard key={index} {...recipe} />
              ))}
            </View>
          )}
        </View>

        {/* Classic Recipes Section */}
        <View style={styles.section}>
          <Pressable
            style={styles.sectionHeader}
            onPress={() => setActiveFilter(activeFilter === 'classic' ? null : 'classic')}
          >
            <Text style={styles.sectionTitle}>Classic Recipes</Text>
            <Text style={styles.chevron}>{activeFilter === 'classic' ? '⌃' : '⌄'}</Text>
          </Pressable>

          {(activeFilter === null || activeFilter === 'classic') && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalScroll}
            >
              {classicRecipes.map((recipe, index) => (
                <View key={index} style={styles.horizontalCard}>
                  <RecipeCard {...recipe} />
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </ScrollView>
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
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  searchIcon: {
    fontSize: 20,
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
    color: theme.colors.text,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  alertIcon: {
    fontSize: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  expiringBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
  },
  expiringText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
  },
  chevron: {
    fontSize: 20,
    color: theme.colors.textSecondary,
  },
  horizontalScroll: {
    paddingHorizontal: theme.spacing.md,
  },
  horizontalCard: {
    width: 280,
    marginRight: theme.spacing.md,
  },
  recipeCard: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.sm,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    ...theme.shadows.sm,
  },
  useItUpBadge: {
    position: 'absolute',
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    zIndex: 1,
  },
  useItUpText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '600',
  },
  recipeImage: {
    width: 80,
    height: 80,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  recipePlaceholder: {
    fontSize: 32,
  },
  recipeInfo: {
    flex: 1,
  },
  recipeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  recipeMeta: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  metaText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  ingredientStatus: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  haveText: {
    fontSize: 13,
    color: theme.colors.success,
    fontWeight: '500',
  },
  missingText: {
    fontSize: 13,
    color: theme.colors.error,
    fontWeight: '500',
  },
  tags: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  tagText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  matchContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchPercent: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
  },
  matchLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
});