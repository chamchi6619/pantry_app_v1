import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function testRecipeSearch() {
  console.log('🧅 Testing Recipe Search with Onion\n');

  // 1. Check if onion exists in pantry with canonical_item_id
  console.log('1️⃣ Checking pantry items with "onion"...');
  const { data: pantryItems, error: pantryError } = await supabase
    .from('pantry_items')
    .select('id, name, canonical_item_id, canonical_items(canonical_name)')
    .ilike('name', '%onion%')
    .order('created_at', { ascending: false })
    .limit(5);

  if (pantryError) {
    console.error('Error:', pantryError);
    return;
  }

  console.log('Pantry items found:', pantryItems?.length);
  pantryItems?.forEach((item: any) => {
    console.log(`  - ${item.name}: canonical_item_id = ${item.canonical_item_id || 'NULL'}, canonical_name = ${item.canonical_items?.canonical_name || 'NULL'}`);
  });

  if (!pantryItems || pantryItems.length === 0) {
    console.log('\n❌ No onion items found in pantry!');
    return;
  }

  // 2. Get the canonical_item_id
  const canonicalId = pantryItems[0].canonical_item_id;
  if (!canonicalId) {
    console.log('\n❌ Onion has no canonical_item_id! The add-to-pantry Edge Function did not match it.');
    console.log('   This means the item was added via lite sync, bypassing canonical matching.');
    return;
  }

  console.log(`\n2️⃣ Using canonical_item_id: ${canonicalId}`);

  // 3. Check how many recipes have this canonical_item_id
  console.log('\n3️⃣ Checking recipes with onion as ingredient...');
  const { count, error: countError } = await supabase
    .from('recipe_ingredients')
    .select('*', { count: 'exact', head: true })
    .eq('canonical_item_id', canonicalId);

  if (countError) {
    console.error('Error:', countError);
    return;
  }

  console.log(`Found ${count} recipe ingredients with onion`);

  // 4. Test the search function directly
  console.log('\n4️⃣ Testing search_recipes_by_canonical_items function...');
  const { data: recipes, error: searchError } = await supabase
    .rpc('search_recipes_by_canonical_items', {
      p_canonical_item_ids: [canonicalId],
      p_min_match_percent: 0,  // Set to 0 to get ANY match
      p_max_missing: 100,       // Allow many missing ingredients
      p_limit: 5,
    });

  if (searchError) {
    console.error('Search error:', searchError);
    return;
  }

  console.log(`\nFound ${recipes?.length || 0} recipes!`);
  recipes?.forEach((r: any) => {
    console.log(`\n  📖 ${r.title}`);
    console.log(`     Match: ${r.matched_ingredients}/${r.total_ingredients} (${r.match_percent}%)`);
    console.log(`     Missing: ${r.missing_ingredients} items`);
    console.log(`     Matched ingredients: ${r.matched_ingredient_names?.slice(0, 3).join(', ')}`);
  });

  // 5. Test via Edge Function
  console.log('\n5️⃣ Testing via Edge Function (search-recipes-by-pantry)...');
  const { data: edgeResponse, error: edgeError } = await supabase.functions.invoke('search-recipes-by-pantry', {
    body: {
      household_id: pantryItems[0].household_id || 'aeefe34a-a1b7-494e-97cc-b7418a314aee',
      min_match_percent: 0,
      max_missing: 100,
      limit: 5,
    },
  });

  if (edgeError) {
    console.error('Edge function error:', edgeError);
    return;
  }

  console.log(`Edge function success: ${edgeResponse.success}`);
  console.log(`Pantry item count: ${edgeResponse.pantry_item_count}`);
  console.log(`Recipes found: ${edgeResponse.recipes?.length || 0}`);
  if (edgeResponse.recipes?.length > 0) {
    console.log('\nFirst recipe:');
    console.log(JSON.stringify(edgeResponse.recipes[0], null, 2));
  }
}

testRecipeSearch().catch(console.error);
