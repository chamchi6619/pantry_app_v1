import { supabase } from '../lib/supabase';
import type { Database } from '../lib/supabase';

type Recipe = Database['public']['Tables']['recipes']['Row'];
type RecipeIngredient = Database['public']['Tables']['recipe_ingredients']['Row'];
type CanonicalItem = Database['public']['Tables']['canonical_items']['Row'];

export interface RecipeWithIngredients extends Recipe {
  recipe_ingredients: RecipeIngredient[];
}

export interface SearchRecipesOptions {
  query?: string;
  category?: string;
  maxTime?: number;
  limit?: number;
  offset?: number;
}

class RecipeServiceSupabase {
  private canonicalItemsCache: Map<string, CanonicalItem> = new Map();
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Load canonical items for ingredient matching
   */
  async loadCanonicalItems(): Promise<CanonicalItem[]> {
    // Return cached if still valid
    if (Date.now() < this.cacheExpiry && this.canonicalItemsCache.size > 0) {
      return Array.from(this.canonicalItemsCache.values());
    }

    const { data, error } = await supabase
      .from('canonical_items')
      .select('*');

    if (error) {
      console.error('Error loading canonical items:', error);
      return [];
    }

    // Update cache
    this.canonicalItemsCache.clear();
    data.forEach(item => {
      this.canonicalItemsCache.set(item.canonical_name, item);
    });
    this.cacheExpiry = Date.now() + this.CACHE_TTL;

    return data;
  }

  /**
   * Search recipes with filters
   */
  async searchRecipes(options: SearchRecipesOptions = {}): Promise<RecipeWithIngredients[]> {
    const {
      query = '',
      category,
      maxTime,
      limit = 50,
      offset = 0,
    } = options;

    let queryBuilder = supabase
      .from('recipes')
      .select(`
        *,
        recipe_ingredients (*)
      `)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Text search on title
    if (query) {
      queryBuilder = queryBuilder.ilike('title', `%${query}%`);
    }

    // Filter by cooking time
    if (maxTime) {
      queryBuilder = queryBuilder.lte('total_time_minutes', maxTime);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      console.error('Error searching recipes:', error);
      return [];
    }

    return (data as RecipeWithIngredients[]) || [];
  }

  /**
   * Get a single recipe by ID
   */
  async getRecipe(id: string): Promise<RecipeWithIngredients | null> {
    const { data, error } = await supabase
      .from('recipes')
      .select(`
        *,
        recipe_ingredients (*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching recipe:', error);
      return null;
    }

    return data as RecipeWithIngredients;
  }

  /**
   * Get popular recipes
   */
  async getPopularRecipes(limit: number = 20): Promise<RecipeWithIngredients[]> {
    const { data, error } = await supabase
      .from('recipes')
      .select(`
        *,
        recipe_ingredients (*)
      `)
      .eq('is_public', true)
      .order('times_cooked', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching popular recipes:', error);
      return [];
    }

    return (data as RecipeWithIngredients[]) || [];
  }

  /**
   * Get quick recipes (under 30 minutes)
   */
  async getQuickRecipes(limit: number = 20): Promise<RecipeWithIngredients[]> {
    return this.searchRecipes({ maxTime: 30, limit });
  }

  /**
   * Get recipes by source
   */
  async getRecipesBySource(source: string, limit: number = 50): Promise<RecipeWithIngredients[]> {
    const { data, error } = await supabase
      .from('recipes')
      .select(`
        *,
        recipe_ingredients (*)
      `)
      .eq('source', source)
      .eq('is_public', true)
      .limit(limit);

    if (error) {
      console.error('Error fetching recipes by source:', error);
      return [];
    }

    return (data as RecipeWithIngredients[]) || [];
  }

  /**
   * Match recipes with user's pantry items using canonical item IDs (SQL-based)
   * Returns recipes sorted by match percentage
   */
  async matchRecipesWithPantry(
    householdId: string,
    limit: number = 50
  ): Promise<Array<RecipeWithIngredients & { matchPercentage: number }>> {
    // Use SQL function for fast matching via canonical_item_id joins
    const { data: matchedRecipes, error } = await supabase
      .rpc('match_recipes_to_pantry', {
        p_household_id: householdId,
        p_limit: limit
      });

    if (error) {
      console.error('Error matching recipes to pantry:', error);
      return [];
    }

    if (!matchedRecipes || matchedRecipes.length === 0) {
      return [];
    }

    // Fetch full recipe details for matched recipes
    const recipeIds = matchedRecipes.map((r: any) => r.recipe_id);

    const { data: recipes, error: recipesError } = await supabase
      .from('recipes')
      .select(`
        *,
        recipe_ingredients (*)
      `)
      .in('id', recipeIds);

    if (recipesError) {
      console.error('Error fetching recipe details:', error);
      return [];
    }

    // Map match percentages to recipes
    const recipesWithMatch = (recipes as RecipeWithIngredients[]).map(recipe => {
      const match = matchedRecipes.find((m: any) => m.recipe_id === recipe.id);
      return {
        ...recipe,
        matchPercentage: match?.match_percentage || 0,
      };
    });

    // Already sorted by SQL, but ensure order
    return recipesWithMatch.sort((a, b) => b.matchPercentage - a.matchPercentage);
  }

  /**
   * Legacy client-side matching (fallback if canonical linking not available)
   * @deprecated Use matchRecipesWithPantry(householdId) instead
   */
  async matchRecipesWithPantryLegacy(
    pantryItems: Array<{ name: string; normalized?: string }>,
    limit: number = 50
  ): Promise<Array<RecipeWithIngredients & { matchPercentage: number }>> {
    // Get recipes
    const recipes = await this.searchRecipes({ limit });

    // Load canonical items for matching
    await this.loadCanonicalItems();

    // Calculate match percentage for each recipe
    const recipesWithMatch = recipes.map(recipe => {
      const matchPercentage = this.calculateMatchPercentage(
        pantryItems,
        recipe.recipe_ingredients
      );

      return {
        ...recipe,
        matchPercentage,
      };
    });

    // Sort by match percentage (highest first)
    return recipesWithMatch.sort((a, b) => b.matchPercentage - a.matchPercentage);
  }

  /**
   * Calculate match percentage between pantry items and recipe ingredients
   */
  private calculateMatchPercentage(
    pantryItems: Array<{ name: string; normalized?: string }>,
    recipeIngredients: RecipeIngredient[]
  ): number {
    if (!recipeIngredients || recipeIngredients.length === 0) {
      return 0;
    }

    // Normalize pantry item names
    const pantryNormalized = new Set(
      pantryItems.map(item =>
        (item.normalized || this.normalizeString(item.name)).toLowerCase()
      )
    );

    let matchCount = 0;

    for (const ingredient of recipeIngredients) {
      const normalizedIngredient = (
        ingredient.normalized_name ||
        this.normalizeString(ingredient.ingredient_name)
      ).toLowerCase();

      // Check for exact match
      if (pantryNormalized.has(normalizedIngredient)) {
        matchCount++;
        continue;
      }

      // Check if any pantry item contains the ingredient or vice versa
      const matched = Array.from(pantryNormalized).some(pantryItem => {
        return (
          pantryItem.includes(normalizedIngredient) ||
          normalizedIngredient.includes(pantryItem)
        );
      });

      if (matched) {
        matchCount += 0.5; // Partial match
      }
    }

    return Math.round((matchCount / recipeIngredients.length) * 100);
  }

  /**
   * Normalize string for matching (remove special chars, lowercase)
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get recipe statistics
   */
  async getStats(): Promise<{
    totalRecipes: number;
    totalIngredients: number;
    totalCanonicalItems: number;
  }> {
    const [recipesCount, ingredientsCount, canonicalCount] = await Promise.all([
      supabase.from('recipes').select('*', { count: 'exact', head: true }),
      supabase.from('recipe_ingredients').select('*', { count: 'exact', head: true }),
      supabase.from('canonical_items').select('*', { count: 'exact', head: true }),
    ]);

    return {
      totalRecipes: recipesCount.count || 0,
      totalIngredients: ingredientsCount.count || 0,
      totalCanonicalItems: canonicalCount.count || 0,
    };
  }

  /**
   * Transform recipe to UI format (compatible with existing RecipeCard)
   */
  transformToUIFormat(recipe: RecipeWithIngredients): any {
    // Determine cuisine from title or source
    const text = `${recipe.title} ${recipe.description || ''}`.toLowerCase();
    let cuisine = 'International';

    if (text.includes('italian') || text.includes('pasta') || text.includes('pizza')) {
      cuisine = 'Italian';
    } else if (text.includes('asian') || text.includes('chinese') || text.includes('thai')) {
      cuisine = 'Asian';
    } else if (text.includes('mexican') || text.includes('taco')) {
      cuisine = 'Mexican';
    } else if (text.includes('indian') || text.includes('curry')) {
      cuisine = 'Indian';
    } else if (text.includes('mediterranean') || text.includes('greek')) {
      cuisine = 'Mediterranean';
    }

    // Determine category
    let category = 'Popular';
    if (recipe.total_time_minutes && recipe.total_time_minutes <= 30) {
      category = 'Quick & Easy';
    } else if (text.includes('healthy') || text.includes('salad')) {
      category = 'Healthy';
    } else if (text.includes('vegetarian') || text.includes('vegan')) {
      category = 'Vegetarian';
    }

    // Determine difficulty
    let difficulty = 'Medium';
    if (recipe.total_time_minutes) {
      if (recipe.total_time_minutes <= 20) difficulty = 'Easy';
      else if (recipe.total_time_minutes > 45) difficulty = 'Hard';
    }

    // Determine creator
    let creator = 'Community Chef';
    if (recipe.source?.includes('USDA') || recipe.source?.includes('MyPlate')) {
      creator = 'USDA Chef';
    } else if (recipe.source?.includes('TheMealDB')) {
      creator = `Chef ${cuisine}`;
    }

    // Transform ingredients to match RecipeDetailScreen expectations
    const transformedIngredients = recipe.recipe_ingredients.map((ing, index) => {
      // Use notes field (original text) if available, otherwise build from parts
      let recipeText = '';
      let ingredientForMatching = '';

      if (ing.notes) {
        // Use the original full ingredient text from ingestion
        recipeText = ing.notes;
        // For matching, extract just the core ingredient name
        // Remove quantity/units at the start, and common preparations after commas
        let extracted = ing.notes
          .replace(/^[\d\/\.\s]+(tablespoon|tbsp|teaspoon|tsp|cup|ounce|oz|pound|lb|can|clove|medium|large|small|piece|package|bottle|jar|box)?s?\s+/i, '')
          .trim();

        // Remove common preparation instructions after comma
        extracted = extracted.replace(/,\s*(minced|diced|chopped|sliced|cut|peeled|crushed|grated|shredded|cubed|halved|quartered|trimmed|cleaned|skinless|boneless).*$/i, '').trim();

        ingredientForMatching = extracted;
      } else {
        // Fallback to building from parts
        if (ing.amount) {
          recipeText += `${ing.amount} `;
        }
        if (ing.unit) {
          recipeText += `${ing.unit} `;
        }
        recipeText += ing.ingredient_name;
        if (ing.preparation) {
          recipeText += `, ${ing.preparation}`;
        }
        ingredientForMatching = ing.ingredient_name;
      }

      return {
        id: ing.id || `ing-${index}`,
        recipeText: recipeText.trim(),
        parsed: {
          ingredient: ingredientForMatching,
          amount: ing.amount,
          unit: ing.unit,
          preparation: ing.preparation,
        },
        ingredient: ingredientForMatching, // Keep for backward compatibility
        amount: ing.amount,
        unit: ing.unit,
        preparation: ing.preparation,
      };
    });

    return {
      id: recipe.id,
      name: recipe.title,
      title: recipe.title,
      summary: recipe.description || '',
      imageUrl: recipe.image_url || `https://source.unsplash.com/800x600/?${encodeURIComponent(recipe.title)},food`,
      creator,
      cookTime: recipe.total_time_minutes ? `${recipe.total_time_minutes} min` : '30 min',
      difficulty,
      category,
      cuisine,
      servings: recipe.servings || 4,
      instructions: recipe.instructions ? recipe.instructions.split(/\.\s+/).filter(s => s.trim()) : [],
      ingredients: transformedIngredients,
      tags: [category],
      nutrition: {
        calories: Math.floor(Math.random() * 200 + 250),
        protein: Math.floor(Math.random() * 20 + 10),
        carbs: Math.floor(Math.random() * 30 + 20),
        fat: Math.floor(Math.random() * 15 + 5),
      },
      attribution: recipe.attribution_text,
      license: recipe.license,
    };
  }
}

export default new RecipeServiceSupabase();
