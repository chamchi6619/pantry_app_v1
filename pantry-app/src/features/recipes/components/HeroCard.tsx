import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Pressable,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../../core/constants/theme';

const { width: screenWidth } = Dimensions.get('window');

interface HeroCardProps {
  title: string;
  subtitle?: string;
  imageUrl: string;
  onPress: () => void;
  creator?: string;
  isPantryMode?: boolean;
  expiringIngredients?: string[];
}

export const HeroCard: React.FC<HeroCardProps> = ({
  title,
  subtitle,
  imageUrl,
  onPress,
  creator,
  isPantryMode = false,
  expiringIngredients = [],
}) => {
  return (
    <Pressable onPress={onPress} style={styles.container}>
      <ImageBackground
        source={{ uri: imageUrl }}
        style={styles.imageBackground}
        imageStyle={styles.image}
      >
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={styles.gradient}
        >
          <View style={styles.content}>
            {isPantryMode && expiringIngredients.length > 0 && (
              <View style={styles.expiringBadge}>
                <Text style={styles.expiringText}>Use Soon</Text>
                <Text style={styles.expiringItems}>
                  {expiringIngredients.slice(0, 3).join(', ')}
                </Text>
              </View>
            )}

            {subtitle && (
              <Text style={styles.subtitle}>{subtitle}</Text>
            )}

            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>

            {creator && (
              <Text style={styles.creator}>by {creator}</Text>
            )}
          </View>
        </LinearGradient>
      </ImageBackground>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    width: screenWidth - 32,
    height: 280,
    marginHorizontal: 16,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.lg,
  },
  imageBackground: {
    flex: 1,
  },
  image: {
    borderRadius: theme.borderRadius.lg,
  },
  gradient: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  expiringBadge: {
    backgroundColor: theme.colors.warning,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  expiringText: {
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: '600',
  },
  expiringItems: {
    color: theme.colors.textInverse,
    fontSize: 10,
    marginTop: 2,
  },
  subtitle: {
    color: theme.colors.textInverse,
    fontSize: 14,
    opacity: 0.9,
    marginBottom: 4,
  },
  title: {
    color: theme.colors.textInverse,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
  },
  creator: {
    color: theme.colors.textInverse,
    fontSize: 14,
    opacity: 0.8,
    marginTop: 4,
  },
});