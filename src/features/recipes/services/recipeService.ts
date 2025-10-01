import { config } from '../../../config';

export interface BackendRecipe {
  id: string;
  slug: string | null;
  title: string;
  summary: string;
  instructions: string | null;
  total_time_min: number | null;
  servings: number | null;
  image_url: string | null;
  attribution_text: string;
  license_code: string;
  instructions_allowed: boolean;
  ingredients?: any[];
  tags?: string[];
}

export interface SearchResponse {
  items: BackendRecipe[];
  next_cursor: string | null;
  total: number | null;
}

// Transform backend recipe to our UI format
export const transformBackendRecipe = (recipe: BackendRecipe): any => {
  // Determine cuisine from title or summary
  const text = `${recipe.title} ${recipe.summary}`.toLowerCase();
  let cuisine = 'International';

  if (text.includes('italian') || text.includes('pasta') || text.includes('pizza')) {
    cuisine = 'Italian';
  } else if (text.includes('asian') || text.includes('chinese') || text.includes('thai') || text.includes('japanese')) {
    cuisine = 'Asian';
  } else if (text.includes('mexican') || text.includes('taco') || text.includes('burrito')) {
    cuisine = 'Mexican';
  } else if (text.includes('indian') || text.includes('curry') || text.includes('masala')) {
    cuisine = 'Indian';
  } else if (text.includes('mediterranean') || text.includes('greek')) {
    cuisine = 'Mediterranean';
  } else if (text.includes('french')) {
    cuisine = 'French';
  } else if (text.includes('american') || text.includes('burger')) {
    cuisine = 'American';
  }

  // Determine category
  let category = 'Popular';
  if (recipe.total_time_min && recipe.total_time_min <= 30) {
    category = 'Quick & Easy';
  } else if (text.includes('healthy') || text.includes('salad') || text.includes('veggie')) {
    category = 'Healthy';
  } else if (text.includes('vegetarian') || text.includes('vegan')) {
    category = 'Vegetarian';
  } else if (text.includes('dessert') || text.includes('cake') || text.includes('cookie')) {
    category = 'Desserts';
  } else if (text.includes('breakfast')) {
    category = 'Breakfast';
  }

  // Determine difficulty based on time
  let difficulty = 'Medium';
  if (recipe.total_time_min) {
    if (recipe.total_time_min <= 20) difficulty = 'Easy';
    else if (recipe.total_time_min > 45) difficulty = 'Hard';
  }

  // Extract creator from attribution
  let creator = 'Community Chef';
  if (recipe.attribution_text.includes('NHS')) {
    creator = 'NHS Chef';
  } else if (recipe.attribution_text.includes('MyPlate')) {
    creator = 'USDA Chef';
  } else if (recipe.attribution_text.includes('TheMealDB')) {
    creator = 'Chef ' + cuisine;
  }

  return {
    id: recipe.id,
    name: recipe.title,
    title: recipe.title,
    summary: recipe.summary,
    imageUrl: recipe.image_url || `https://source.unsplash.com/800x600/?${encodeURIComponent(recipe.title)},food`,
    creator: creator,
    cookTime: recipe.total_time_min ? `${recipe.total_time_min} min` : '30 min',
    difficulty: difficulty,
    category: category,
    cuisine: cuisine,
    servings: recipe.servings || 4,
    instructions: recipe.instructions ? recipe.instructions.split('. ').filter(s => s.trim()) : [],
    ingredients: recipe.ingredients || [],
    tags: recipe.tags || [category],
    nutrition: {
      calories: Math.floor(Math.random() * 200 + 250),
      protein: Math.floor(Math.random() * 20 + 10),
      carbs: Math.floor(Math.random() * 30 + 20),
      fat: Math.floor(Math.random() * 15 + 5),
    },
    attribution: recipe.attribution_text,
    license: recipe.license_code,
  };
};

class RecipeService {
  private baseUrl: string;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.baseUrl = config.API_BASE_URL;
  }

  private getCacheKey(method: string, params: any): string {
    return `${method}_${JSON.stringify(params)}`;
  }

  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  async searchRecipes(query: string = '', category?: string, limit: number = 50): Promise<any[]> {
    try {
      // Check cache first
      const cacheKey = this.getCacheKey('search', { query, category, limit });
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      // Build search query
      let searchQuery = query;
      if (category && !query) {
        // If no query but category selected, search by category keywords
        const categoryKeywords: Record<string, string> = {
          'Popular': '',
          'Quick & Easy': 'quick easy simple',
          'Healthy': 'healthy salad vegetable',
          'Vegetarian': 'vegetarian vegan plant',
          'Comfort Food': 'comfort hearty warm',
          'Desserts': 'dessert cake cookie sweet',
          'Breakfast': 'breakfast morning eggs pancake',
        };
        searchQuery = categoryKeywords[category] || category.toLowerCase();
      }

      const url = `${this.baseUrl}/recipes/search?q=${encodeURIComponent(searchQuery)}&limit=${limit}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: SearchResponse = await response.json();
      const transformed = data.items.map(transformBackendRecipe);

      // Filter by category if specified
      let filtered = transformed;
      if (category && category !== 'Popular') {
        filtered = transformed.filter(r => r.category === category);
        // If no exact matches, return all but sort by relevance
        if (filtered.length === 0) {
          filtered = transformed;
        }
      }

      this.setCache(cacheKey, filtered);
      return filtered;
    } catch (error) {
      console.error('Error searching recipes:', error);
      // Return empty array instead of throwing
      return [];
    }
  }

  async getRecipe(id: string): Promise<any> {
    try {
      // Check cache first
      const cacheKey = this.getCacheKey('get', { id });
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const response = await fetch(`${this.baseUrl}/recipes/${id}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const transformed = transformBackendRecipe(data);

      this.setCache(cacheKey, transformed);
      return transformed;
    } catch (error) {
      console.error('Error fetching recipe:', error);
      throw error;
    }
  }

  async getPopularRecipes(limit: number = 20): Promise<any[]> {
    // Get recipes without search query
    return this.searchRecipes('', 'Popular', limit);
  }

  async getTrendingRecipes(limit: number = 10): Promise<any[]> {
    // Search for trending/popular recipes
    return this.searchRecipes('popular trending', '', limit);
  }

  async getQuickRecipes(limit: number = 20): Promise<any[]> {
    return this.searchRecipes('', 'Quick & Easy', limit);
  }

  async getHealthyRecipes(limit: number = 20): Promise<any[]> {
    return this.searchRecipes('', 'Healthy', limit);
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`);
      const data = await response.json();
      return data.status === 'healthy';
    } catch (error) {
      console.error('Backend not reachable:', error);
      return false;
    }
  }
}

export default new RecipeService();