const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_USER_ID = 'e7827a3f-b979-4718-9483-8c5786fc448f';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyPantryMatching() {
  console.log(`🔍 Verifying pantry matching setup for user: ${TARGET_USER_ID}\n`);

  try {
    // 1. Get user's household
    const { data: households, error: hhError } = await supabase
      .from('household_members')
      .select('household_id, households(name)')
      .eq('user_id', TARGET_USER_ID);

    if (hhError) throw hhError;
    if (!households || households.length === 0) {
      console.error('❌ User has no household');
      return;
    }

    const householdId = households[0].household_id;
    const householdName = households[0].households?.name;
    console.log(`✅ Household: ${householdName} (${householdId})\n`);

    // 2. Get pantry items
    const { data: pantryItems, error: pantryError } = await supabase
      .from('pantry_items')
      .select('id, name, canonical_item_id, quantity, status')
      .eq('household_id', householdId)
      .eq('status', 'active')
      .order('name');

    if (pantryError) throw pantryError;

    console.log(`📦 Active Pantry Items: ${pantryItems?.length || 0}`);

    const itemsWithCanonical = pantryItems?.filter(p => p.canonical_item_id) || [];
    const itemsWithoutCanonical = pantryItems?.filter(p => !p.canonical_item_id) || [];

    console.log(`   ✅ With canonical_item_id: ${itemsWithCanonical.length}`);
    console.log(`   ❌ Without canonical_item_id: ${itemsWithoutCanonical.length}\n`);

    if (itemsWithoutCanonical.length > 0) {
      console.log('⚠️  Items without canonical mapping (won\'t match):');
      itemsWithoutCanonical.forEach(item => {
        console.log(`   - ${item.name} (qty: ${item.quantity})`);
      });
      console.log('');
    }

    // 3. Test the batch pantry match function
    console.log('🧪 Testing batch pantry match function...\n');

    // Get a few sample recipes
    const { data: sampleRecipes, error: recipeError } = await supabase
      .from('recipe_database')
      .select('id, title, category')
      .eq('is_published', true)
      .limit(5);

    if (recipeError) throw recipeError;

    if (!sampleRecipes || sampleRecipes.length === 0) {
      console.error('❌ No published recipes found in recipe_database');
      return;
    }

    const recipeIds = sampleRecipes.map(r => r.id);

    // Call the batch match function
    const { data: matchResults, error: matchError } = await supabase.rpc(
      'calculate_pantry_matches_batch',
      {
        p_household_id: householdId,
        p_recipe_ids: recipeIds,
      }
    );

    if (matchError) {
      console.error('❌ Error calling pantry match function:', matchError);
      return;
    }

    console.log('Sample Recipe Matches:');
    console.log('═══════════════════════════════════════════════');

    sampleRecipes.forEach(recipe => {
      const match = matchResults?.find(m => m.recipe_id === recipe.id);
      if (match) {
        console.log(`\n${recipe.title} (${recipe.category})`);
        console.log(`  Match: ${match.match_percent}%`);
        console.log(`  ${match.exact_matches}/${match.total_ingredients} ingredients`);
      } else {
        console.log(`\n${recipe.title} (${recipe.category})`);
        console.log(`  ❌ No match data returned`);
      }
    });

    console.log('\n═══════════════════════════════════════════════');
    console.log('\n✅ Pantry matching verification complete!');

  } catch (error) {
    console.error('❌ Error during verification:', error);
  }
}

verifyPantryMatching();
