// Variant 5: Full-Screen Immersive
// Inspired by 2025 full-screen visual trend + references 2, 5
// Vertical swipeable feed, Instagram/TikTok-style immersive experience

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Pressable,
  Image,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../contexts/AuthContext';
import { getPersonalizedRecommendations } from '../../../services/recommendationEngine';
import { theme } from '../../../core/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface Recipe {
  id: string;
  title: string;
  imageUrl?: string;
  cookTime?: number;
  matchPercentage?: number;
  matchedCount?: number;
  totalIngredients?: number;
  servings?: number;
  cookCard?: any;
  isPersonalized?: boolean;
  source_url?: string;
}

export const ExploreRecipesScreenV5: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, householdId } = useAuth();
  const userId = user?.id;

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fromPantry, setFromPantry] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const getUserName = () => {
    if (!user) return 'Chef';
    const name = user.email?.split('@')[0] || 'Chef';
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    if (!userId || !householdId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const personalizedRecs = await getPersonalizedRecommendations(userId, householdId, 20);
      const formattedRecipes = personalizedRecs.map(rec => ({
        id: rec.cook_card.id,
        title: rec.cook_card.title,
        imageUrl: rec.cook_card.image_url,
        cookTime: rec.cook_card.cook_time_minutes || rec.cook_card.total_time_minutes,
        servings: rec.cook_card.servings,
        matchPercentage: Math.round(rec.completeness * 100),
        matchedCount: rec.have_ingredients.length,
        totalIngredients: rec.cook_card.ingredients?.length || 0,
        cookCard: rec.cook_card,
        isPersonalized: true,
        source_url: rec.cook_card.source_url,
      }));
      setRecipes(formattedRecipes);
    } catch (error) {
      console.error('Error loading recipes:', error);
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadRecipes();
    setRefreshing(false);
  };

  const handleRecipePress = (recipe: Recipe) => {
    if (recipe.cookCard) {
      navigation.navigate('CookCard', { cookCard: recipe.cookCard });
    }
  };

  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const index = Math.round(offsetY / (screenHeight - 100));
    setCurrentIndex(index);
  };

  const renderFullScreenCard = (recipe: Recipe, index: number) => (
    <Pressable
      key={recipe.id}
      style={styles.fullScreenCard}
      onPress={() => handleRecipePress(recipe)}
    >
      <Image
        source={{ uri: recipe.imageUrl || 'https://via.placeholder.com/400x800' }}
        style={styles.fullScreenImage}
        resizeMode="cover"
      />

      {/* Top Gradient Overlay */}
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent']}
        style={styles.topGradient}
      >
        <View style={styles.topBar}>
          <Pressable
            style={[styles.modeChip, !fromPantry && styles.modeChipActive]}
            onPress={() => setFromPantry(false)}
          >
            <Ionicons name="compass" size={16} color={!fromPantry ? '#fff' : 'rgba(255,255,255,0.7)'} />
            <Text style={[styles.modeChipText, !fromPantry && styles.modeChipTextActive]}>Discover</Text>
          </Pressable>
          <Pressable
            style={[styles.modeChip, fromPantry && styles.modeChipActive]}
            onPress={() => setFromPantry(true)}
          >
            <Ionicons name="leaf" size={16} color={fromPantry ? '#fff' : 'rgba(255,255,255,0.7)'} />
            <Text style={[styles.modeChipText, fromPantry && styles.modeChipTextActive]}>Pantry</Text>
          </Pressable>
        </View>
      </LinearGradient>

      {/* Bottom Gradient Overlay with Content */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={styles.bottomGradient}
      >
        {/* Recipe Info */}
        <View style={styles.recipeInfo}>
          {recipe.matchPercentage && recipe.matchPercentage > 0 && (
            <View style={styles.matchIndicator}>
              <View style={styles.matchCircle}>
                <Text style={styles.matchPercentageText}>{recipe.matchPercentage}%</Text>
              </View>
              <View style={styles.matchBar}>
                <View style={[styles.matchBarFill, { width: `${recipe.matchPercentage}%` }]} />
              </View>
            </View>
          )}

          <Text style={styles.fullScreenTitle}>{recipe.title}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Ionicons name="time" size={16} color="#fff" />
              <Text style={styles.metaChipText}>{recipe.cookTime || '—'} min</Text>
            </View>
            <View style={styles.metaChip}>
              <Ionicons name="restaurant" size={16} color="#fff" />
              <Text style={styles.metaChipText}>{recipe.totalIngredients} ingredients</Text>
            </View>
            {recipe.servings && (
              <View style={styles.metaChip}>
                <Ionicons name="people" size={16} color="#fff" />
                <Text style={styles.metaChipText}>{recipe.servings} servings</Text>
              </View>
            )}
          </View>

          {recipe.matchPercentage && recipe.matchPercentage > 0 && (
            <View style={styles.ingredientsPreview}>
              <Text style={styles.ingredientsTitle}>
                You have {recipe.matchedCount}/{recipe.totalIngredients} ingredients
              </Text>
              <Pressable style={styles.viewDetailsButton}>
                <Text style={styles.viewDetailsText}>View Details</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </Pressable>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <Pressable style={styles.actionButton}>
            <Ionicons name="heart-outline" size={28} color="#fff" />
            <Text style={styles.actionText}>Save</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, styles.primaryActionButton]}>
            <Ionicons name="play-circle" size={32} color="#fff" />
            <Text style={styles.primaryActionText}>Start Cooking</Text>
          </Pressable>
          <Pressable style={styles.actionButton}>
            <Ionicons name="share-outline" size={28} color="#fff" />
            <Text style={styles.actionText}>Share</Text>
          </Pressable>
        </View>
      </LinearGradient>

      {/* Scroll Indicator */}
      <View style={styles.scrollIndicator}>
        {recipes.slice(0, 5).map((_, i) => (
          <View
            key={i}
            style={[
              styles.scrollDot,
              i === index && styles.scrollDotActive
            ]}
          />
        ))}
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Finding perfect recipes...</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#fff"
            />
          }
        >
          {recipes.map((recipe, index) => renderFullScreenCard(recipe, index))}
        </ScrollView>
      )}

      {/* Floating Action Button */}
      {!loading && (
        <Pressable style={styles.fab}>
          <Ionicons name="options" size={24} color="#fff" />
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
    fontWeight: '500',
  },
  fullScreenCard: {
    width: screenWidth,
    height: screenHeight - 100,
    position: 'relative',
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    gap: 8,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    gap: 6,
  },
  modeChipActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  modeChipText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
  modeChipTextActive: {
    color: '#fff',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 100,
    paddingBottom: 32,
  },
  recipeInfo: {
    marginBottom: 24,
  },
  matchIndicator: {
    marginBottom: 16,
  },
  matchCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  matchPercentageText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  matchBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  matchBarFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 3,
  },
  fullScreenTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 40,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  metaChipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  ingredientsPreview: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  ingredientsTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewDetailsText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionButton: {
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  primaryActionButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 28,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  scrollIndicator: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -50 }],
    gap: 8,
  },
  scrollDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  scrollDotActive: {
    backgroundColor: '#fff',
    height: 24,
  },
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});
