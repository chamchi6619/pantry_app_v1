const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔍 Diagnosing migration issue...\n');

async function diagnose() {
  try {
    // Check canonical_items (fix the name display issue)
    console.log('1️⃣ Sample canonical_items:');
    const { data: canonical } = await supabase
      .from('canonical_items')
      .select('id, name, category')
      .limit(5);

    if (canonical) {
      canonical.forEach(item => {
        console.log(`   ${item.id} | ${item.name} | ${item.category || 'N/A'}`);
      });
    }

    // Check recipe_database_ingredients structure
    console.log('\n2️⃣ Sample recipe_database_ingredients:');
    const { data: recipeIngredients } = await supabase
      .from('recipe_database_ingredients')
      .select('id, recipe_id, canonical_item_name, canonical_item_id')
      .limit(5);

    if (recipeIngredients) {
      recipeIngredients.forEach(ing => {
        console.log(`   Recipe: ${ing.recipe_id.substring(0, 8)} | Name: ${ing.canonical_item_name} | ID: ${ing.canonical_item_id || 'NULL'}`);
      });
    }

    // Check for name matching issues
    console.log('\n3️⃣ Testing name matching:');
    const { data: testIngredient } = await supabase
      .from('recipe_database_ingredients')
      .select('canonical_item_name')
      .not('canonical_item_name', 'is', null)
      .limit(1)
      .single();

    if (testIngredient) {
      console.log(`   Sample ingredient name: "${testIngredient.canonical_item_name}"`);

      const { data: matchingCanonical } = await supabase
        .from('canonical_items')
        .select('id, name')
        .eq('name', testIngredient.canonical_item_name)
        .maybeSingle();

      if (matchingCanonical) {
        console.log(`   ✅ Found matching canonical: "${matchingCanonical.name}" (${matchingCanonical.id})`);
      } else {
        console.log(`   ❌ No matching canonical item found`);

        // Check if similar name exists
        const { data: similar } = await supabase
          .from('canonical_items')
          .select('name')
          .ilike('name', `%${testIngredient.canonical_item_name.substring(0, 10)}%`)
          .limit(3);

        if (similar && similar.length > 0) {
          console.log(`   Similar names found:`);
          similar.forEach(s => console.log(`      - "${s.name}"`));
        }
      }
    }

    // Count distinct canonical_item_names in recipe_database_ingredients
    console.log('\n4️⃣ Checking data sources:');
    const { data: distinctNames } = await supabase
      .from('recipe_database_ingredients')
      .select('canonical_item_name')
      .not('canonical_item_name', 'is', null)
      .limit(1000);

    if (distinctNames) {
      const uniqueNames = new Set(distinctNames.map(d => d.canonical_item_name));
      console.log(`   Unique ingredient names in recipe_database: ${uniqueNames.size}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

diagnose()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
