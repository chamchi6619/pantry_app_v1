/**
 * Search Recipes by Pantry Items
 * Finds recipes that can be made with items in the user's pantry
 *
 * Uses canonical_item_id matching to link pantry items to recipe ingredients
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchRequest {
  household_id: string;
  min_match_percent?: number; // Minimum % of ingredients user has (default: 70)
  max_missing?: number; // Maximum missing ingredients (default: 3)
  limit?: number; // Max recipes to return (default: 20)
}

interface RecipeMatch {
  recipe_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  total_time_minutes: number | null;
  servings: number | null;

  total_ingredients: number;
  matched_ingredients: number;
  missing_ingredients: number;
  match_percent: number;

  missing_ingredient_names: string[];
  matched_ingredient_names: string[];
}

interface SearchResponse {
  success: boolean;
  recipes?: RecipeMatch[];
  pantry_item_count?: number;
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const { household_id, min_match_percent = 70, max_missing = 3, limit = 20 } = await req.json() as SearchRequest;

    console.log(`\n🔍 Recipe Search - v1`);
    console.log(`   Household: ${household_id}`);
    console.log(`   Min Match: ${min_match_percent}%`);
    console.log(`   Max Missing: ${max_missing}`);

    // 1. Get all canonical items in user's pantry/purchase history
    console.log('\n📦 Finding pantry items...');

    // Check both pantry_items and purchase_history for canonical items
    const { data: pantryCanonical } = await supabase
      .from('pantry_items')
      .select('canonical_item_id')
      .eq('household_id', household_id)
      .eq('status', 'active')
      .not('canonical_item_id', 'is', null);

    const { data: purchaseCanonical } = await supabase
      .from('purchase_history')
      .select('canonical_item_id')
      .eq('household_id', household_id)
      .not('canonical_item_id', 'is', null)
      .gte('purchase_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days

    // Combine and deduplicate
    const allCanonicalIds = new Set<string>();
    pantryCanonical?.forEach(item => {
      if (item.canonical_item_id) allCanonicalIds.add(item.canonical_item_id);
    });
    purchaseCanonical?.forEach(item => {
      if (item.canonical_item_id) allCanonicalIds.add(item.canonical_item_id);
    });

    const userCanonicalIds = Array.from(allCanonicalIds);
    console.log(`   Found ${userCanonicalIds.length} unique canonical items`);

    if (userCanonicalIds.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        recipes: [],
        pantry_item_count: 0,
      } as SearchResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // 2. Find recipes with their ingredient counts
    console.log('\n🍳 Searching recipes...');

    const { data: recipeMatches, error: searchError } = await supabase.rpc('search_recipes_by_canonical_items', {
      p_canonical_item_ids: userCanonicalIds,
      p_min_match_percent: min_match_percent,
      p_max_missing: max_missing,
      p_limit: limit,
    });

    if (searchError) {
      console.error('Search error:', searchError);
      throw searchError;
    }

    console.log(`   Found ${recipeMatches?.length || 0} matching recipes`);

    // 3. Format response
    const formattedRecipes: RecipeMatch[] = (recipeMatches || []).map((recipe: any) => ({
      recipe_id: recipe.recipe_id,
      title: recipe.title,
      description: recipe.description,
      image_url: recipe.image_url,
      total_time_minutes: recipe.total_time_minutes,
      servings: recipe.servings,
      total_ingredients: recipe.total_ingredients,
      matched_ingredients: recipe.matched_ingredients,
      missing_ingredients: recipe.missing_ingredients,
      match_percent: Math.round((recipe.matched_ingredients / recipe.total_ingredients) * 100),
      missing_ingredient_names: recipe.missing_ingredient_names || [],
      matched_ingredient_names: recipe.matched_ingredient_names || [],
    }));

    return new Response(JSON.stringify({
      success: true,
      recipes: formattedRecipes,
      pantry_item_count: userCanonicalIds.length,
    } as SearchResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('❌ Error in recipe search:', error);

    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to search recipes',
    } as SearchResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
