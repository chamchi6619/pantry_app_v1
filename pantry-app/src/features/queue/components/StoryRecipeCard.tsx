/**
 * StoryRecipeCard Component
 *
 * Purpose: Instagram story-style cards for quick browsing
 * Design: Tall, narrow, minimal info, swipeable
 * Pattern: Like Instagram/Snapchat stories or Reels
 * Use Case: Quick & Easy recipes (fast decision making)
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../../core/constants/theme';
import type { RecipeDatabaseItem } from '../../../services/recipeDatabaseService';

interface StoryRecipeCardProps {
  recipe: RecipeDatabaseItem;
  onPress: () => void;
}

export default function StoryRecipeCard({ recipe, onPress }: StoryRecipeCardProps) {
  const match = recipe.pantry_match_percent || 0;
  const timeMinutes = recipe.total_time_minutes || 0;

  // Gradient color based on match (subtle)
  const gradientColors = match >= 90
    ? ['rgba(34, 197, 94, 0.3)', 'rgba(0,0,0,0.8)']
    : match >= 60
    ? ['rgba(245, 158, 11, 0.3)', 'rgba(0,0,0,0.8)']
    : ['rgba(239, 68, 68, 0.3)', 'rgba(0,0,0,0.8)'];

  return (
    <Pressable
      style={styles.container}
      onPress={onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.1)' }}
    >
      {/* Image */}
      {recipe.image_url ? (
        <>
          <Image
            source={{ uri: recipe.image_url }}
            style={styles.image}
            resizeMode="cover"
          />
          <LinearGradient
            colors={gradientColors}
            style={styles.gradient}
          />
        </>
      ) : (
        <View style={styles.placeholderImage}>
          <Ionicons name="restaurant-outline" size={40} color={theme.colors.textSecondary} />
        </View>
      )}

      {/* Match indicator bar (top) */}
      <View style={styles.matchBar}>
        <View style={[styles.matchBarFill, { width: `${match}%` }]} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Time badge */}
        {timeMinutes > 0 && (
          <View style={styles.timeBadge}>
            <Ionicons name="flash" size={14} color="#fff" />
            <Text style={styles.timeBadgeText}>{timeMinutes}m</Text>
          </View>
        )}

        {/* Title */}
        <Text style={styles.title} numberOfLines={3}>
          {recipe.title}
        </Text>

        {/* Match percentage */}
        <Text style={styles.matchText}>{match}% match</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 140,
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    marginRight: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  matchBarFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 3,
  },
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: theme.spacing.sm,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.xs,
  },
  timeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    lineHeight: 18,
  },
  matchText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#fff',
    opacity: 0.9,
  },
});
