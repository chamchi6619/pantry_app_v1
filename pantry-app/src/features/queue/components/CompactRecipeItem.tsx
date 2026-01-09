/**
 * CompactRecipeItem Component
 *
 * Purpose: Simple list item for recipes that need minimal shopping
 * Design: Horizontal layout, small thumbnail, checkbox style
 * Pattern: Like a task list or shopping list item
 * Use Case: "Just Need 1 Thing" recipes (minimal friction)
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../core/constants/theme';
import type { RecipeDatabaseItem } from '../../../services/recipeDatabaseService';

interface CompactRecipeItemProps {
  recipe: RecipeDatabaseItem;
  onPress: () => void;
  index: number;
}

export default function CompactRecipeItem({ recipe, onPress, index }: CompactRecipeItemProps) {
  const match = recipe.pantry_match_percent || 0;
  const timeMinutes = recipe.total_time_minutes || 0;

  return (
    <Pressable
      style={styles.container}
      onPress={onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
    >
      {/* Number Badge */}
      <View style={styles.numberBadge}>
        <Text style={styles.numberText}>{index + 1}</Text>
      </View>

      {/* Thumbnail */}
      {recipe.image_url ? (
        <Image
          source={{ uri: recipe.image_url }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.thumbnailPlaceholder}>
          <Ionicons name="restaurant-outline" size={20} color={theme.colors.textSecondary} />
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {recipe.title}
        </Text>

        <View style={styles.metadata}>
          {/* Time */}
          {timeMinutes > 0 && (
            <View style={styles.metadataItem}>
              <Ionicons name="time-outline" size={12} color={theme.colors.textSecondary} />
              <Text style={styles.metadataText}>{timeMinutes}m</Text>
            </View>
          )}

          {/* Match */}
          <View style={styles.metadataItem}>
            <Ionicons name="checkmark-circle" size={12} color={theme.colors.success} />
            <Text style={styles.metadataTextSuccess}>{match}%</Text>
          </View>
        </View>
      </View>

      {/* Shopping badge (what you need) */}
      <View style={styles.shoppingBadge}>
        <Ionicons name="cart-outline" size={16} color={theme.colors.primary} />
        <Text style={styles.shoppingText}>+1</Text>
      </View>

      {/* Arrow */}
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    borderRadius: 12,
    gap: theme.spacing.sm,
  },
  numberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  thumbnailPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: theme.colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metadataText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  metadataTextSuccess: {
    fontSize: 12,
    color: theme.colors.success,
    fontWeight: '500',
  },
  shoppingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  shoppingText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
  },
});
