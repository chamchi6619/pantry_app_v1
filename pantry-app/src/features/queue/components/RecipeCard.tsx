/**
 * RecipeCard Component
 *
 * Purpose: Individual recipe card (like Netflix thumbnail)
 * Pattern: Tap to view details, swipe/long-press for actions
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../../core/constants/theme';
import type { QueueItem } from '../../../services/queueService';
import type { RecipeDatabaseItem } from '../../../services/recipeDatabaseService';

interface RecipeCardProps {
  item: QueueItem | RecipeDatabaseItem;
  onPress: () => void;
  onLongPress: () => void;
}

export default function RecipeCard({ item, onPress, onLongPress }: RecipeCardProps) {
  // Safely extract match percentage
  const match = typeof item.pantry_match_percent === 'number' ? item.pantry_match_percent : 0;

  // Debug logging
  if (match === 0 && __DEV__) {
    console.log('[RecipeCard] 0% match for recipe:', {
      title: item.title || (item as any).cook_card?.title,
      pantry_match_percent: item.pantry_match_percent,
      type: typeof item.pantry_match_percent,
      hasProperty: 'pantry_match_percent' in item,
      itemKeys: Object.keys(item).slice(0, 10),
    });
  }

  // Extract data (handle both QueueItem and RecipeDatabaseItem structures)
  const isQueueItem = 'cook_card' in item;
  const title = (isQueueItem ? item.cook_card?.title : item.title) || 'Untitled Recipe';
  const imageUrl = isQueueItem ? item.cook_card?.image_url : item.image_url;
  const totalTimeMinutes = isQueueItem ? item.cook_card?.total_time_minutes : item.total_time_minutes;
  const servings = isQueueItem ? item.cook_card?.servings : item.servings;
  const addedBy = isQueueItem ? item.added_by : null;
  const missingCount = typeof item.missing_ingredients_count === 'number' ? item.missing_ingredients_count : 0;

  // Color coding like traffic lights
  const matchColor = match >= 90 ? theme.colors.success :
                     match >= 60 ? '#F59E0B' :
                     theme.colors.error;

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
    >
      {/* Image (Netflix-style thumbnail) */}
      <View style={styles.imageContainer}>
        {imageUrl ? (
          <>
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.gradient}
            />
          </>
        ) : (
          <View style={styles.placeholderImage}>
            <Ionicons name="restaurant-outline" size={32} color={theme.colors.textSecondary} />
          </View>
        )}

        {/* Pantry Match Badge (like Netflix "97% Match") */}
        <View style={[styles.matchBadge, { backgroundColor: matchColor }]}>
          <Text style={styles.matchBadgeText}>{String(match)}%</Text>
        </View>

        {/* Quick Action Badge (AI suggested indicator) */}
        {addedBy === 'ai_suggested' && (
          <View style={styles.aiBadge}>
            <Ionicons name="sparkles" size={12} color="#fff" />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>

        <View style={styles.metadata}>
          {/* Time (like Netflix duration) */}
          {totalTimeMinutes && (
            <View style={styles.metadataItem}>
              <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
              <Text style={styles.metadataText}>
                {String(totalTimeMinutes)}m
              </Text>
            </View>
          )}

          {/* Servings */}
          {servings && (
            <View style={styles.metadataItem}>
              <Ionicons name="people-outline" size={14} color={theme.colors.textSecondary} />
              <Text style={styles.metadataText}>
                {String(servings)}
              </Text>
            </View>
          )}

          {/* Missing ingredients (only show if > 0) */}
          {missingCount > 0 && (
            <View style={styles.metadataItem}>
              <Ionicons name="alert-circle-outline" size={14} color={theme.colors.error} />
              <Text style={styles.missingText}>
                {String(missingCount)} missing
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 300, // Fixed width for horizontal carousel
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    marginRight: theme.spacing.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageContainer: {
    width: '100%',
    height: 180, // Taller for vertical card
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.backgroundSecondary,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  matchBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  aiBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  info: {
    padding: theme.spacing.md,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  metadata: {
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
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  missingText: {
    fontSize: 12,
    color: theme.colors.error,
  },
});
