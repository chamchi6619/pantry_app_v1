import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  FlatList,
  Text,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

// Components
import { HeroCard } from '../components/HeroCard';
import { SegmentedControl } from '../components/SegmentedControl';
import { ScrollableCategories } from '../components/ScrollableCategories';
import { RecipeCard } from '../components/RecipeCard';
import { SectionHeader } from '../components/SectionHeader';

// Use placeholder data as fallback
import { placeholderRecipes } from '../data/placeholderRecipes';

// Services
import { config } from '../../../config';
import { theme } from '../../../core/constants/theme';

const { width: screenWidth } = Dimensions.get('window');

export const ExploreRecipesScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  // State
  const [activeMode, setActiveMode] = useState<'Explore' | 'From Your Pantry'>('Explore');
  const [activeCategory, setActiveCategory] = useState('Popular');
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Categories
  const categories = ['Popular', 'Quick & Easy', 'Healthy', 'Vegetarian', 'Comfort Food', 'Desserts', 'Breakfast'];

  // Check backend and load recipes on mount
  useEffect(() => {
    testBackendAndLoadRecipes();
  }, [activeCategory]);

  const testBackendAndLoadRecipes = async () => {
    setLoading(true);
    setError(null);

    try {
      // Test backend connection
      console.log('Testing backend at:', config.API_BASE_URL);
      const healthResponse = await fetch(`${config.API_BASE_URL}/healthz`);
      const healthData = await healthResponse.json();

      if (healthData.status === 'healthy') {
        setBackendConnected(true);
        console.log('Backend is healthy!');

        // Load ALL recipes from backend (or filter by category)
        const searchQuery = activeCategory === 'Popular' ? '' : activeCategory.toLowerCase();
        const url = `${config.API_BASE_URL}/recipes/search?q=${encodeURIComponent(searchQuery)}&limit=100`;
        console.log('Fetching recipes from:', url);

        const recipesResponse = await fetch(url);
        const recipesData = await recipesResponse.json();

        if (recipesData.items && Array.isArray(recipesData.items)) {
          // Nice food images for recipes
          const foodImages = [
            'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500', // healthy bowl
            'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=500', // pasta
            'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500', // pizza
            'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=500', // salad
            'https://images.unsplash.com/photo-1607532941433-304659e8198a?w=500', // steak
            'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500', // veggie bowl
            'https://images.unsplash.com/photo-1547592034-2b47298a6b90?w=500', // salmon
            'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500', // burger
            'https://images.unsplash.com/photo-1546039907-7fa05f864c02?w=500', // breakfast
            'https://images.unsplash.com/photo-1609501676725-7186f017a4b7?w=500', // asian
            'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=500', // chicken
            'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=500', // burger2
            'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?w=500', // toast
            'https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=500', // korean
            'https://images.unsplash.com/photo-1572449043416-55f4685c9bb7?w=500', // thai
          ];

          // Transform backend recipes to match our component format
          const transformedRecipes = recipesData.items.map((item: any, index: number) => ({
            id: item.id,
            name: item.title,
            imageUrl: item.image_url || foodImages[index % foodImages.length],
            creator: item.title.includes('NHS') ? 'NHS Chef' :
                     item.title.includes('Thai') || item.title.includes('Asian') ? 'Chef Lin' :
                     item.title.includes('Italian') || item.title.includes('Pasta') ? 'Chef Mario' :
                     item.title.includes('Mexican') ? 'Chef Carlos' : 'Community Chef',
            cookTime: item.total_time_min ? `${item.total_time_min} min` : '30 min',
            difficulty: item.total_time_min <= 20 ? 'Easy' : item.total_time_min >= 45 ? 'Hard' : 'Medium',
            category: activeCategory,
          }));

          setRecipes(transformedRecipes);
          console.log(`Loaded ${transformedRecipes.length} recipes from backend`);
        } else {
          throw new Error('Invalid recipe data format');
        }
      } else {
        throw new Error('Backend not healthy');
      }
    } catch (err) {
      console.error('Backend error:', err);
      setError(err.message || 'Failed to connect to backend');
      setBackendConnected(false);

      // Fall back to placeholder data
      console.log('Using placeholder recipes as fallback');
      const fallbackRecipes = placeholderRecipes[activeCategory] || placeholderRecipes['Popular'] || [];
      setRecipes(fallbackRecipes);
    } finally {
      setLoading(false);
    }
  };

  // Get hero recipes (first 3 recipes)
  const heroRecipes = recipes.slice(0, 3).map((recipe, index) => ({
    ...recipe,
    title: recipe.name,
    subtitle: index === 0 ? "Editor's Choice" : index === 1 ? 'Trending Now' : 'Seasonal Special',
    imageUrl: recipe.imageUrl,
  }));

  // Handle navigation
  const handleRecipePress = async (recipeId: string) => {
    const recipe = recipes.find(r => r.id === recipeId);
    if (recipe) {
      let detailRecipe = { ...recipe };

      // Try to fetch full recipe details from backend
      if (backendConnected) {
        try {
          const response = await fetch(`${config.API_BASE_URL}/recipes/${recipeId}`);
          if (response.ok) {
            const fullRecipe = await response.json();

            // Parse ingredients from the response
            let ingredients = [];

            console.log('Full recipe response:', fullRecipe);

            // Parse from ingredients_flat (comma-separated string) - this is what we actually have
            if (fullRecipe.ingredients_flat) {
              console.log('Parsing ingredients_flat:', fullRecipe.ingredients_flat);
              const ingredientsList = fullRecipe.ingredients_flat.split(',').map((i: string) => i.trim());
              ingredients = ingredientsList.map((ing: string, idx: number) => {
                // Keep the full text as recipeText
                const recipeText = ing;

                // Try to parse quantity, unit, and name
                // Patterns like: "400g spaghetti", "2 tbsp oil", "1 large onion"
                const patterns = [
                  /^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s+(.+)$/,  // "400g spaghetti"
                  /^(\d+(?:\.\d+)?)\s+([a-zA-Z]+)\s+(.+)$/,   // "2 tbsp oil"
                  /^(\d+)\s+(.+)$/,                            // "4 eggs"
                ];

                for (const pattern of patterns) {
                  const match = ing.match(pattern);
                  if (match) {
                    if (match.length === 4) {
                      // Has quantity, unit, and name
                      return {
                        id: String(idx + 1),
                        name: match[3],
                        amount: parseFloat(match[1]),
                        unit: match[2],
                        recipeText: recipeText
                      };
                    } else if (match.length === 3) {
                      // Has quantity and name (no unit)
                      return {
                        id: String(idx + 1),
                        name: match[2],
                        amount: parseFloat(match[1]),
                        unit: '',
                        recipeText: recipeText
                      };
                    }
                  }
                }

                // Couldn't parse, use the whole string as name
                return {
                  id: String(idx + 1),
                  name: ing,
                  amount: '',
                  unit: '',
                  recipeText: recipeText
                };
              });
            }
            // Check if we have structured ingredients array
            else if (fullRecipe.ingredients?.length > 0 && typeof fullRecipe.ingredients[0] === 'object') {
              ingredients = fullRecipe.ingredients.map((ing: any, idx: number) => {
                // If we have raw_text, parse it to extract quantities
                if (ing.raw_text && !ing.qty_value) {
                  const recipeText = ing.raw_text.trim();

                  // Try to parse quantity and unit from raw_text
                  const patterns = [
                    /^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s+(.+)$/,  // "400g spaghetti"
                    /^(\d+(?:\.\d+)?)\s+([a-zA-Z]+)\s+(.+)$/,   // "2 tbsp oil"
                    /^(\d+)\s+(.+)$/,                            // "4 eggs"
                    /^([½¼¾⅓⅔⅛⅜⅝⅞])\s*([a-zA-Z]+)\s+(.+)$/,   // "½ cup flour"
                  ];

                  for (const pattern of patterns) {
                    const match = recipeText.match(pattern);
                    if (match) {
                      if (match.length === 4) {
                        // Has quantity, unit and name
                        return {
                          id: String(idx + 1),
                          name: match[3],
                          amount: match[1],
                          unit: match[2],
                          recipeText: recipeText
                        };
                      } else if (match.length === 3) {
                        // Has quantity and name (no unit)
                        return {
                          id: String(idx + 1),
                          name: match[2],
                          amount: match[1],
                          unit: '',
                          recipeText: recipeText
                        };
                      }
                    }
                  }

                  // Couldn't parse, use the whole raw_text as name
                  return {
                    id: String(idx + 1),
                    name: recipeText,
                    amount: '',
                    unit: '',
                    recipeText: recipeText
                  };
                }

                // Already structured data
                return {
                  id: String(idx + 1),
                  name: ing.ingredient_name || ing.name || ing.raw_text || 'Ingredient',
                  amount: ing.qty_value || '',
                  unit: ing.qty_unit || '',
                  recipeText: ing.raw_text || ing.ingredient_name || ''
                };
              });
            }
            // Parse from simple array
            else if (fullRecipe.ingredients?.length > 0) {
              ingredients = fullRecipe.ingredients.map((ing: any, idx: number) => ({
                id: String(idx + 1),
                name: typeof ing === 'string' ? ing : (ing.raw_text || 'Ingredient'),
                amount: '',
                unit: '',
                recipeText: typeof ing === 'string' ? ing : (ing.raw_text || '')
              }));
            }

            console.log('Parsed ingredients:', ingredients);

            // Only use fallback if we truly have no ingredients
            if (ingredients.length === 0 && !fullRecipe.ingredients_flat) {
              console.log('No ingredients found, using fallback');
              ingredients = [
                { id: '1', name: 'Check recipe source', amount: '', unit: '', recipeText: 'Ingredients not available' }
              ];
            }

            // Parse instructions
            let instructions = [];

            if (fullRecipe.instructions) {
              console.log('Raw instructions:', fullRecipe.instructions);

              // Split by period followed by space, or newline
              // But keep periods that are part of measurements (e.g., "2.5 minutes")
              const instructionText = fullRecipe.instructions
                .replace(/(\d)\.(\d)/g, '$1DECIMAL$2')  // Protect decimals
                .replace(/\. /g, '.|')  // Mark sentence ends
                .replace(/\n/g, '|')    // Mark line breaks
                .replace(/DECIMAL/g, '.')  // Restore decimals
                .split('|')
                .map(s => s.trim())
                .filter(s => s.length > 5);  // Remove very short fragments

              instructions = instructionText.length > 0 ? instructionText : ['Instructions not available'];

              console.log('Parsed instructions:', instructions);
            } else {
              instructions = ['Instructions not available'];
            }

            detailRecipe = {
              ...recipe,
              ingredients,
              instructions,
              nutrition: fullRecipe.nutrition || {
                calories: 350,
                protein: 20,
                carbs: 40,
                fat: 15
              },
              tags: fullRecipe.tags || ['Popular', activeCategory],
              servings: fullRecipe.servings || 4,
              summary: fullRecipe.summary || recipe.summary,
            };
          }
        } catch (error) {
          console.log('Could not fetch full recipe details, using defaults');
        }
      }

      // Ensure we have all required fields
      if (!detailRecipe.ingredients || detailRecipe.ingredients.length === 0) {
        detailRecipe.ingredients = [
          { id: '1', name: 'Ingredients not available', amount: '', unit: '', recipeText: 'Please check the recipe source' }
        ];
      }

      if (!detailRecipe.instructions || detailRecipe.instructions.length === 0) {
        detailRecipe.instructions = ['Instructions not available'];
      }

      navigation.navigate('RecipeDetail', { recipe: detailRecipe });
    }
  };

  // Render recipe card
  const renderRecipeItem = ({ item }: { item: any }) => (
    <RecipeCard
      recipe={item}
      variant="carousel"
      onPress={() => handleRecipePress(item.id)}
    />
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Recipes</Text>
        {backendConnected !== null && (
          <View style={[styles.badge, { backgroundColor: backendConnected ? '#10B981' : '#EF4444' }]}>
            <Text style={styles.badgeText}>
              {backendConnected ? `● ${recipes.length || 684} recipes` : '● Offline'}
            </Text>
          </View>
        )}
      </View>

      {/* Error message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <Text style={styles.errorHint}>Using offline recipes</Text>
        </View>
      )}

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        {/* Sticky Navigation */}
        <View style={styles.stickyNav}>
          <SegmentedControl
            segments={['Explore', 'From Your Pantry']}
            activeSegment={activeMode}
            onSegmentPress={(segment) => setActiveMode(segment as any)}
          />
        </View>

        {/* Hero Section */}
        {heroRecipes.length > 0 && (
          <View style={styles.heroSection}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const newIndex = Math.round(e.nativeEvent.contentOffset.x / (screenWidth - 32));
                setCurrentHeroIndex(newIndex);
              }}
            >
              {heroRecipes.map((hero) => (
                <HeroCard
                  key={hero.id}
                  title={hero.title}
                  subtitle={hero.subtitle}
                  imageUrl={hero.imageUrl}
                  creator={hero.creator}
                  onPress={() => handleRecipePress(hero.id)}
                  isPantryMode={false}
                  expiringIngredients={[]}
                />
              ))}
            </ScrollView>

            {/* Pagination dots */}
            <View style={styles.pagination}>
              {heroRecipes.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    index === currentHeroIndex && styles.dotActive,
                  ]}
                />
              ))}
            </View>
          </View>
        )}

        {/* Categories */}
        <ScrollableCategories
          categories={categories}
          activeCategory={activeCategory}
          onCategoryPress={setActiveCategory}
          isPantryMode={false}
        />

        {/* Loading state */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Loading recipes...</Text>
          </View>
        )}

        {/* Recipe list */}
        {!loading && recipes.length > 0 && (
          <View style={styles.sections}>
            <FlatList
              horizontal
              data={recipes.slice(3, 9)}
              renderItem={renderRecipeItem}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            />

            {/* Trending section */}
            <View style={styles.section}>
              <SectionHeader title="Trending Now" />
              <FlatList
                data={recipes.slice(9, 12)}
                renderItem={({ item }) => (
                  <RecipeCard
                    recipe={item}
                    variant="full"
                    onPress={() => handleRecipePress(item.id)}
                  />
                )}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            </View>
          </View>
        )}

        {/* No recipes message */}
        {!loading && recipes.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No recipes found</Text>
          </View>
        )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.text,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '500',
  },
  errorHint: {
    color: '#7F1D1D',
    fontSize: 12,
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  stickyNav: {
    backgroundColor: theme.colors.background,
    zIndex: 100,
  },
  heroSection: {
    marginTop: 16,
    marginBottom: 8,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.borderLight,
  },
  dotActive: {
    backgroundColor: theme.colors.primary,
    width: 24,
  },
  sections: {
    marginTop: 8,
  },
  section: {
    marginTop: 24,
  },
  horizontalList: {
    paddingHorizontal: 16,
  },
  loadingContainer: {
    padding: 50,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: theme.colors.textLight,
    fontSize: 14,
  },
  emptyContainer: {
    padding: 50,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.textLight,
    fontSize: 16,
  },
});