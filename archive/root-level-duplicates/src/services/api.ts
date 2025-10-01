// API Service for connecting to the backend
import { config } from '../config';

export interface Recipe {
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
}

export interface SearchResponse {
  items: Recipe[];
  next_cursor: string | null;
  total: number | null;
}

class ApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.API_BASE_URL;
  }

  async searchRecipes(query: string, limit: number = 20): Promise<SearchResponse> {
    try {
      const url = `${this.baseUrl}/recipes/search?q=${encodeURIComponent(query)}&limit=${limit}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error searching recipes:', error);
      throw error;
    }
  }

  async getRecipe(id: string): Promise<Recipe> {
    try {
      const response = await fetch(`${this.baseUrl}/recipes/${id}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching recipe:', error);
      throw error;
    }
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

export default new ApiService();