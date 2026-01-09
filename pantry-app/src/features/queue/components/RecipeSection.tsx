/**
 * RecipeSection Component
 *
 * Purpose: Netflix-style carousel row
 * Pattern: Section header + list of cards
 * Example: "Ready to Cook (5)" with 5 recipe cards
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../core/constants/theme';
import type { QueueItem } from '../../../services/queueService';
import type { RecipeDatabaseItem } from '../../../services/recipeDatabaseService';
import RecipeCard from './RecipeCard';

interface RecipeSectionProps {
  title: string;
  subtitle?: string; // Like "Cook these tonight" or "Just need 1-2 items"
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  items: (QueueItem | RecipeDatabaseItem)[];
  onItemPress: (item: QueueItem | RecipeDatabaseItem) => void;
  onItemLongPress: (item: QueueItem | RecipeDatabaseItem) => void;
}

export default function RecipeSection({
  title,
  subtitle,
  icon,
  iconColor,
  items,
  onItemPress,
  onItemLongPress,
}: RecipeSectionProps) {
  // Don't render empty sections (like Netflix hiding empty rows)
  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      {/* Section Header (like "Continue Watching") */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name={icon} size={22} color={iconColor} />
          <View style={styles.headerText}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{title}</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{items.length}</Text>
              </View>
            </View>
            {subtitle && (
              <Text style={styles.subtitle}>{subtitle}</Text>
            )}
          </View>
        </View>
      </View>

      {/* Cards - Horizontal Carousel */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardsContainer}
        decelerationRate="fast"
        snapToInterval={320} // Width of card + margin
      >
        {items.map(item => (
          <RecipeCard
            key={item.id}
            item={item}
            onPress={() => onItemPress(item)}
            onLongPress={() => onItemLongPress(item)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: theme.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    flex: 1,
  },
  headerText: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  countBadge: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  cardsContainer: {
    paddingLeft: theme.spacing.md,
    gap: theme.spacing.md,
  },
});
