import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Dimensions,
} from 'react-native';
import { theme } from '../../../core/constants/theme';

const { width: screenWidth } = Dimensions.get('window');

interface RecipeCardProps {
  recipe: {
    id: string;
    name: string;
    imageUrl?: string;
    creator?: string;
    cookTime?: string;
    difficulty?: string;
  };
  variant?: 'carousel' | 'grid' | 'full';
  onPress: () => void;
  matchPercentage?: number;
  pantryInfo?: {
    haveCount: number;
    totalCount: number;
  };
  showMatchBadge?: boolean;
}

export const RecipeCard: React.FC<RecipeCardProps> = ({
  recipe,
  variant = 'carousel',
  onPress,
  matchPercentage,
  pantryInfo,
  showMatchBadge = false,
}) => {
  const getCardStyle = () => {
    switch (variant) {
      case 'carousel':
        return styles.carouselCard;
      case 'grid':
        return styles.gridCard;
      case 'full':
        return styles.fullCard;
      default:
        return styles.carouselCard;
    }
  };

  const getImageStyle = () => {
    switch (variant) {
      case 'carousel':
        return styles.carouselImage;
      case 'grid':
        return styles.gridImage;
      case 'full':
        return styles.fullImage;
      default:
        return styles.carouselImage;
    }
  };

  const getMatchColor = () => {
    if (!matchPercentage) return theme.colors.textLight;
    if (matchPercentage >= 80) return theme.colors.success;
    if (matchPercentage >= 50) return theme.colors.warning;
    return theme.colors.textLight;
  };

  const defaultImage = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500';

  return (
    <Pressable style={getCardStyle()} onPress={onPress}>
      <Image
        source={{ uri: recipe.imageUrl || defaultImage }}
        style={getImageStyle()}
        resizeMode="cover"
      />

      {showMatchBadge && matchPercentage !== undefined && (
        <View style={[styles.matchBadge, { backgroundColor: getMatchColor() }]}>
          <Text style={styles.matchText}>{matchPercentage}%</Text>
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={variant === 'grid' ? 2 : 1}>
          {recipe.name}
        </Text>

        {recipe.creator && (
          <Text style={styles.creator} numberOfLines={1}>
            by {recipe.creator}
          </Text>
        )}

        {pantryInfo && (
          <View style={styles.pantryInfo}>
            <Text style={styles.pantryText}>
              {pantryInfo.haveCount}/{pantryInfo.totalCount} ingredients
            </Text>
          </View>
        )}

        {variant === 'full' && recipe.cookTime && (
          <View style={styles.metadata}>
            <Text style={styles.metaText}>{recipe.cookTime}</Text>
            {recipe.difficulty && (
              <Text style={styles.metaText}> • {recipe.difficulty}</Text>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  // Carousel variant
  carouselCard: {
    width: 180,
    marginRight: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  carouselImage: {
    width: '100%',
    height: 120,
  },

  // Grid variant
  gridCard: {
    width: (screenWidth - 48) / 2,
    marginBottom: 16,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  gridImage: {
    width: '100%',
    height: 140,
  },

  // Full width variant
  fullCard: {
    width: screenWidth - 32,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.background,
    overflow: 'hidden',
    ...theme.shadows.md,
  },
  fullImage: {
    width: '100%',
    height: 200,
  },

  // Shared styles
  content: {
    padding: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  creator: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  matchBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  matchText: {
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: '600',
  },
  pantryInfo: {
    marginTop: 4,
  },
  pantryText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  metadata: {
    flexDirection: 'row',
    marginTop: 4,
  },
  metaText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
});