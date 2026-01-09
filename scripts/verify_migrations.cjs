const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔍 Verifying migrations...\n');
console.log(`Database: ${supabaseUrl}\n`);

async function verifyMigrations() {
  try {
    // 1. Check canonical_items table
    console.log('1️⃣ Checking canonical_items table...');
    const { data: canonicalItems, error: canonicalError, count: canonicalCount } = await supabase
      .from('canonical_items')
      .select('*', { count: 'exact' })
      .limit(10);

    if (canonicalError) {
      console.error('❌ Error querying canonical_items:', canonicalError);
    } else {
      console.log(`✅ canonical_items table exists`);
      console.log(`   Total items: ${canonicalCount}`);
      if (canonicalItems && canonicalItems.length > 0) {
        console.log(`   Sample items:`);
        canonicalItems.slice(0, 5).forEach(item => {
          console.log(`      - ${item.name} (${item.category || 'no category'})`);
        });
      }
    }

    // 2. Check if recipe_database_ingredients migrated
    console.log('\n2️⃣ Checking recipe_database_ingredients migration...');
    const { data: recipeIngredients, error: recipeError, count: migratedCount } = await supabase
      .from('recipe_database_ingredients')
      .select('id, canonical_item_id, canonical_item_name', { count: 'exact' })
      .not('canonical_item_id', 'is', null);

    if (recipeError) {
      console.error('❌ Error querying recipe_database_ingredients:', recipeError);
    } else {
      console.log(`✅ Recipe ingredients migrated: ${migratedCount}`);

      // Check unmigrated
      const { count: unmigratedCount } = await supabase
        .from('recipe_database_ingredients')
        .select('*', { count: 'exact', head: true })
        .is('canonical_item_id', null)
        .not('canonical_item_name', 'is', null);

      if (unmigratedCount > 0) {
        console.log(`⚠️  Unmigrated ingredients: ${unmigratedCount}`);
      }
    }

    // 3. Check indexes
    console.log('\n3️⃣ Checking performance indexes...');
    const { data: indexes, error: indexError } = await supabase
      .from('pg_indexes')
      .select('indexname, tablename')
      .or('indexname.like.idx_pantry_%,indexname.like.idx_cook_%,indexname.like.idx_recipe_%,indexname.like.idx_canonical_%');

    if (indexError) {
      console.error('❌ Error querying indexes:', indexError);
    } else {
      console.log(`✅ Found ${indexes?.length || 0} performance indexes:`);
      if (indexes) {
        indexes.forEach(idx => {
          console.log(`   - ${idx.indexname} on ${idx.tablename}`);
        });
      }
    }

    // 4. Check pantry_items data
    console.log('\n4️⃣ Checking pantry_items...');
    const { count: pantryCount } = await supabase
      .from('pantry_items')
      .select('*', { count: 'exact', head: true });

    console.log(`   Total pantry items: ${pantryCount}`);

    const { count: pantryWithCanonical } = await supabase
      .from('pantry_items')
      .select('*', { count: 'exact', head: true })
      .not('canonical_item_id', 'is', null);

    console.log(`   With canonical_item_id: ${pantryWithCanonical}`);

    // 5. Check cook_card_ingredients
    console.log('\n5️⃣ Checking cook_card_ingredients...');
    const { count: cookCardIngredientsCount } = await supabase
      .from('cook_card_ingredients')
      .select('*', { count: 'exact', head: true });

    console.log(`   Total cook card ingredients: ${cookCardIngredientsCount}`);

    const { count: cookCardWithCanonical } = await supabase
      .from('cook_card_ingredients')
      .select('*', { count: 'exact', head: true })
      .not('canonical_item_id', 'is', null);

    console.log(`   With canonical_item_id: ${cookCardWithCanonical}`);

    console.log('\n═══════════════════════════════════════════════════');
    console.log('✅ VERIFICATION COMPLETE');
    console.log('═══════════════════════════════════════════════════');

  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  }
}

verifyMigrations()
  .then(() => {
    console.log('\n✅ Complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
