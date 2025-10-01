export interface CanonicalIngredient {
  id: string;
  displayName: string;
  category: string;
  density: number;
  densityGroup: 'liquid' | 'meat' | 'dry' | 'produce' | 'leafy' | 'herbs' | 'bread' | 'fat' | 'dairy' | 'thick_paste' | 'legumes' | 'nuts' | 'seeds';
  safeConversions: boolean;
  aliases: string[];
}

export interface ParsedIngredient {
  quantity: number | null;
  unit: string | null;
  ingredient: string;
  preparation?: string;
  original: string;
  confidence: number;
}

export interface ConversionResult {
  success: boolean;
  value?: number;
  unit?: string;
  reason?: string;
  message?: string;
}

export interface UnitConversion {
  from: string;
  to: string;
  factor: number;
  requiresDensity: boolean;
  safeForDryGoods: boolean;
}

export enum MatchReason {
  EXACT = 'exact_match',
  ALIAS = 'alias_match',
  CATEGORY = 'category_match',
  FUZZY = 'fuzzy_match',
  NO_MATCH = 'no_match'
}

export interface MatchResult {
  canonicalId: string | null;
  confidence: number;
  matchReason: MatchReason;
  debugPath: string[];
}

export interface RecipeIngredient {
  id: string;
  recipeText: string;
  parsed: ParsedIngredient;
  canonicalId?: string;
  requiredQuantity: number | null;
  requiredUnit: string | null;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  category: 'quick' | 'healthy' | 'comfort' | 'dessert' | 'breakfast' | 'lunch' | 'dinner';
  prepTime: number;
  cookTime: number;
  servings: number;
  difficulty: 'easy' | 'medium' | 'hard';
  ingredients: RecipeIngredient[];
  instructions: string[];
  tags: string[];
  imageUrl?: string;
  nutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

export interface InventoryItem {
  id: string;
  name: string;
  canonicalId?: string;
  quantity: number;
  unit: string;
  expirationDate?: Date;
  category: string;
  location: 'fridge' | 'freezer' | 'pantry';
}

export interface RecipeScore {
  recipe: Recipe;
  totalScore: number;
  expiringScore: number;
  matchPercentage: number;
  availableIngredients: string[];
  missingIngredients: string[];
  expiringIngredients: InventoryItem[];
  scoreBreakdown: {
    baseMatch: number;
    expiringBonus: number;
    categoryBonus: number;
  };
  debugInfo?: {
    inventoryHash: string;
    matchedCount: number;
    totalRequired: number;
    expiringPoints: number;
    categoryWeights: Record<string, number>;
  };
}

export interface CachedMatchResult {
  result: RecipeScore;
  timestamp: number;
  inventoryHash: string;
}

export interface RecipeConfig {
  matching: {
    minConfidence: number;
    aliasPenalty: number;
    categoryBonus: number;
  };
  scoring: {
    expiringWeight: number;
    categoryWeights: Record<string, number>;
  };
  cache: {
    ttlMinutes: number;
    maxEntries: number;
  };
}