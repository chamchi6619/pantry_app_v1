/**
 * Add to Pantry Edge Function
 * Centralized pantry item creation with canonical matching
 *
 * This is the SINGLE entry point for adding items to pantry_items.
 * All inventory additions (manual, shopping list, etc.) go through here.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { findMatch, type CanonicalItem } from '../_shared/canonicalMatcher.ts';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AddToPantryRequest {
  household_id: string;
  name: string;
  quantity: number;
  unit: string;
  location: 'fridge' | 'freezer' | 'pantry';
  category?: string;
  notes?: string;
  expiry_date?: string;
  added_by?: string;
  source?: string;
}

interface AddToPantryResponse {
  success: boolean;
  item?: any;
  canonical_match?: {
    canonical_item_id: string;
    canonical_name: string;
    confidence: string;
    score?: number;
  };
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

    const requestData = await req.json() as AddToPantryRequest;
    const {
      household_id,
      name,
      quantity,
      unit,
      location,
      category,
      notes,
      expiry_date,
      added_by,
      source = 'manual'
    } = requestData;

    console.log(`\n📦 Add to Pantry - v1`);
    console.log(`   Item: "${name}"`);
    console.log(`   Household: ${household_id}`);
    console.log(`   Location: ${location}`);

    // Load canonical items for matching
    console.log('\n📚 Loading canonical items for matching...');
    const { data: canonicalItems, error: canonicalError } = await supabase
      .from('canonical_items')
      .select('id, canonical_name, aliases, category');

    if (canonicalError) {
      console.error('❌ Error loading canonical items:', canonicalError);
    }

    console.log(`   Loaded ${canonicalItems?.length || 0} canonical items`);

    // Match item to canonical item
    let canonical_item_id: string | null = null;
    let matchInfo: any = null;

    if (canonicalItems && canonicalItems.length > 0) {
      const match = findMatch(name, canonicalItems as CanonicalItem[]);

      if (match) {
        canonical_item_id = match.canonical_item_id;
        matchInfo = {
          canonical_item_id: match.canonical_item_id,
          canonical_name: match.matched_name,
          confidence: match.confidence,
          score: match.score
        };
        console.log(`   ✓ Matched "${name}" → "${match.matched_name}" (${match.confidence}, score: ${match.score})`);
      } else {
        console.log(`   ✗ No canonical match for "${name}"`);
      }
    }

    // Insert pantry item with canonical_item_id
    console.log('\n💾 Inserting to pantry_items...');
    const { data: pantryItem, error: insertError } = await supabase
      .from('pantry_items')
      .insert({
        household_id,
        name,
        quantity,
        unit,
        location,
        category: category || 'Other',
        notes,
        expiry_date,
        added_by,
        source,
        canonical_item_id, // ✅ Set canonical ID from matching
        status: 'active',
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Insert error:', insertError);
      throw insertError;
    }

    console.log(`   ✅ Created pantry item: ${pantryItem.id}`);
    if (canonical_item_id) {
      console.log(`   🔗 Linked to canonical item: ${canonical_item_id}`);
    }

    const response: AddToPantryResponse = {
      success: true,
      item: pantryItem,
      canonical_match: matchInfo,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('❌ Error in add-to-pantry:', error);

    const response: AddToPantryResponse = {
      success: false,
      error: error.message || 'Failed to add item to pantry',
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
