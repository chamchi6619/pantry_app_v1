/**
 * HeroRecipeCard Component
 *
 * Purpose: Large featured card for "Recipe of the Day"
 * Design: Full-width, prominent imagery, rich details
 * Pattern: Like Netflix's hero banner or TikTok's featured content
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../../core/constants/theme';
import type { RecipeDatabaseItem } from '../../../services/recipeDatabaseService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - theme.spacing.md * 2;

interface HeroRecipeCardProps {
  recipe: RecipeDatabaseItem;
  onPress: () => void;
}

export default function HeroRecipeCard({ recipe, onPress }: HeroRecipeCardProps) {
  const match = recipe.pantry_match_percent || 0;
  const missingCount = recipe.missing_ingredients_count || 0;

  // Color for match badge
  const matchColor = match >= 90 ? theme.colors.success :
                     match >= 60 ? '#F59E0B' :
                     theme.colors.error;

  return (
    <Pressable
      style={styles.container}
      onPress={onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.1)' }}
    >
      <View style={styles.card}>
        {/* Large Image */}
        <View style={styles.imageContainer}>
          {recipe.image_url ? (
            <>
              <Image
                source={{ uri: recipe.image_url }}
                style={styles.image}
                resizeMode="cover"
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.8)']}
                style={styles.gradient}
              />
            </>
          ) : (
            <View style={styles.placeholderImage}>
              <Ionicons name="restaurant-outline" size={64} color={theme.colors.textSecondary} />
            </View>
          )}

          {/* "Recipe of the Day" Badge */}
          <View style={styles.featureBadge}>
            <Ionicons name="star" size={14} color="#FFD700" />
            <Text style={styles.featureBadgeText}>Recipe of the Day</Text>
          </View>

          {/* Pantry Match Badge */}
          <View style={[styles.matchBadge, { backgroundColor: matchColor }]}>
            <Text style={styles.matchBadgeText}>{match}%</Text>
            <Text style={styles.matchBadgeLabel}>Match</Text>
          </View>
        </View>

        {/* Content Overlay */}
        <View style={styles.contentOverlay}>
          {/* Title */}
          <Text style={styles.title} numberOfLines={2}>
            {recipe.title}
          </Text>

          {/* Description */}
          {recipe.description && (
            <Text style={styles.description} numberOfLines={2}>
              {recipe.description}
            </Text>
          )}

          {/* Stats Row */}
          <View style={styles.statsRow}>
            {recipe.total_time_minutes && (
              <View style={styles.statItem}>
                <Ionicons name="time" size={18} color="#fff" />
                <Text style={styles.statText}>{recipe.total_time_minutes}m</Text>
              </View>
            )}

            {recipe.servings && (
              <View style={styles.statItem}>
                <Ionicons name="people" size={18} color="#fff" />
                <Text style={styles.statText}>{recipe.servings} servings</Text>
              </View>
            )}

            {missingCount > 0 && (
              <View style={styles.statItem}>
                <Ionicons name="cart" size={18} color="#FFD700" />
                <Text style={styles.statTextHighlight}>+{missingCount} item{missingCount > 1 ? 's' : ''}</Text>
              </View>
            )}
          </View>

          {/* CTA Button */}
          <View style={styles.ctaButton}>
            <Text style={styles.ctaText}>View Recipe</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  card: {
    width: CARD_WIDTH,
    height: 400,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  imageContainer: {
    width: '100%',
    height: '100%',
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
    height: '60%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  featureBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFD700',
  },
  matchBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 60,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  matchBadgeText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  matchBadgeLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    opacity: 0.9,
  },
  contentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: theme.spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: theme.spacing.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  description: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    marginBottom: theme.spacing.md,
    lineHeight: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  statTextHighlight: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: '600',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
