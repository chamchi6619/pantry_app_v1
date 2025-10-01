import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Database types (we'll generate these later)
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
        };
        Update: {
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
        };
      };
      households: {
        Row: {
          id: string;
          name: string;
          type: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      household_members: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'member' | 'viewer';
          can_edit_inventory: boolean;
          can_edit_shopping: boolean;
          joined_at: string;
        };
      };
      pantry_items: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          normalized_name: string;
          normalized: string; // Alias for app compatibility
          quantity: number;
          unit: string;
          location: 'fridge' | 'freezer' | 'pantry';
          category: string | null;
          notes: string | null;
          expiry_date: string | null;
          expiration_date: string | null; // Alias
          purchase_date: string;
          status: string;
          added_by: string | null;
          source: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          household_id: string;
          name: string;
          quantity?: number;
          unit?: string;
          location?: 'fridge' | 'freezer' | 'pantry';
          category?: string | null;
          notes?: string | null;
          expiry_date?: string | null;
          status?: string;
        };
        Update: {
          name?: string;
          quantity?: number;
          unit?: string;
          location?: 'fridge' | 'freezer' | 'pantry';
          category?: string | null;
          notes?: string | null;
          expiry_date?: string | null;
          status?: string;
        };
      };
      shopping_lists: {
        Row: {
          id: string;
          household_id: string;
          title: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      shopping_list_items: {
        Row: {
          id: string;
          list_id: string;
          name: string;
          quantity: number;
          unit: string | null;
          category: string | null;
          checked: boolean;
          status: 'pending' | 'done';
          pantry_item_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          list_id: string;
          name: string;
          quantity?: number;
          unit?: string | null;
          category?: string | null;
          checked?: boolean;
          pantry_item_id?: string | null;
        };
        Update: {
          name?: string;
          quantity?: number;
          unit?: string | null;
          category?: string | null;
          checked?: boolean;
          pantry_item_id?: string | null;
        };
      };
      recipes: {
        Row: {
          id: string;
          title: string;
          slug: string | null;
          description: string | null;
          instructions: string | null;
          prep_time_minutes: number | null;
          cook_time_minutes: number | null;
          total_time_minutes: number | null;
          servings: number;
          image_url: string | null;
          source: string | null;
          source_url: string | null;
          author: string | null;
          license: string | null;
          attribution_text: string | null;
          provenance: string;
          instructions_allowed: boolean;
          share_alike_required: boolean;
          open_collection: boolean;
          times_cooked: number;
          is_public: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      recipe_ingredients: {
        Row: {
          id: string;
          recipe_id: string;
          ingredient_name: string;
          normalized_name: string | null;
          amount: number | null;
          unit: string | null;
          preparation: string | null;
          notes: string | null;
          is_optional: boolean;
          ingredient_group: string | null;
          sort_order: number | null;
          created_at: string;
        };
      };
      receipts: {
        Row: {
          id: string;
          household_id: string;
          uploaded_by: string | null;
          store_name: string | null;
          receipt_date: string | null;
          total_amount: number | null;
          image_url: string | null;
          raw_ocr_text: string | null;
          ocr_confidence: number | null;
          status: 'pending' | 'processing' | 'needs_review' | 'completed' | 'failed';
          processed_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      receipt_items: {
        Row: {
          id: string;
          receipt_id: string;
          raw_text: string | null;
          line_number: number | null;
          product_name: string | null;
          normalized_name: string | null;
          pantry_item_id: string | null;
          quantity: number;
          unit: string | null;
          total_price: number | null;
          confidence_score: number | null;
          needs_review: boolean;
          reviewed: boolean;
          category: string | null;
          created_at: string;
        };
      };
    };
  };
};