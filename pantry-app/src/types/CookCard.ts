/**
 * CookCard TypeScript Types
 *
 * Generated from COOKCARD_SCHEMA_V1.md
 * Version: 1.0.0
 */

export type Platform = "instagram" | "tiktok" | "youtube" | "web";

export type InstructionType = "link_only" | "creator_provided" | "user_notes";

export type ExtractionMethod =
  | "metadata"
  | "creator_text"
  | "llm_assisted"
  | "user_manual";

export type IngredientProvenance =
  | "creator_provided"
  | "detected"
  | "user_edited"
  | "substitution";

export interface Creator {
  handle?: string;
  name?: string;
  avatar_url?: string;
  verified?: boolean;
}

export interface Source {
  url: string;
  platform: Platform;
  creator: Creator;
}

export interface InstructionStep {
  step_number: number;
  instruction: string; // Main instruction text
  ingredients?: string[]; // Ingredients used in this step (names only)
  tip?: string; // Optional cooking tip for this step
  timestamp?: number; // Seconds into video
  duration?: number; // Seconds for this step
}

export interface Instructions {
  type: InstructionType;
  text?: string;
  steps?: InstructionStep[];
}

export interface Ingredient {
  name: string;
  normalized_name?: string;
  canonical_item_id?: string;

  // Quantities
  amount?: number;
  unit?: string;
  preparation?: string;

  // Provenance
  confidence: number; // 0.0 - 1.0
  provenance: IngredientProvenance;

  // Pantry matching
  in_pantry?: boolean;
  is_substitution?: boolean;
  substitution_for?: string;
  substitution_rationale?: string;

  // Grouping
  group?: string;
  sort_order: number;
  is_optional?: boolean;
}

export interface ExtractionMetadata {
  method: ExtractionMethod;
  confidence: number; // 0.0 - 1.0
  version: string; // e.g., "L2-regex", "L3-gemini-flash"
  timestamp: string; // ISO 8601
  cost_cents: number;
}

export interface UserData {
  confirm_taps: number;
  edited: boolean;
  times_cooked: number;
  last_cooked_at?: string; // ISO 8601
  is_favorite: boolean;
}

export interface Compliance {
  flagged: boolean;
  reason?: string; // "copyright" | "ToS" | "dietary_safety"
}

export interface CookCard {
  // Metadata
  id?: string; // UUID (assigned by backend)
  version: string; // "1.0"

  // Source Attribution
  source: Source;

  // Recipe Metadata
  title: string;
  description?: string;
  image_url?: string;

  // Time Estimates
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  total_time_minutes?: number;
  servings?: number;

  // Instructions
  instructions: Instructions;

  // Ingredients
  ingredients: Ingredient[];

  // Extraction Metadata
  extraction: ExtractionMetadata;

  // User Interaction
  user_data?: UserData;

  // Compliance
  compliance?: Compliance;

  // Timestamps
  created_at?: string; // ISO 8601
  updated_at?: string; // ISO 8601
}

/**
 * Response from extract-cook-card Edge Function
 */
export interface ExtractionResponse {
  cook_card: CookCard;
  requires_confirmation: boolean;
  cache_status: "cached" | "fresh";
}

/**
 * Pantry match calculation result
 */
export interface PantryMatch {
  have: number; // Number of ingredients in pantry
  need: number; // Number of missing ingredients
  match_percentage: number; // 0-100
  missing_ingredients: Ingredient[];
  available_ingredients: Ingredient[];
}

/**
 * Cost range calculation result
 */
export interface CostRange {
  min_cents: number;
  max_cents: number;
  currency: string; // "USD"
  stores: string[]; // ["Costco", "Target"]
  time_period_days: number; // 60
  confidence: number; // 0.0 - 1.0
}
