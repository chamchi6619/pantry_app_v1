const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔧 Fixing recipe_database_ingredients migration...\n');

async function fixMigration() {
  try {
    // Step 1: Insert missing canonical_item_name values into canonical_items
    console.log('1️⃣ Inserting missing canonical items from recipe_database...');

    // Get all unique canonical_item_name values from recipe_database_ingredients
    const { data: ingredients } = await supabase
      .from('recipe_database_ingredients')
      .select('canonical_item_name')
      .not('canonical_item_name', 'is', null);

    if (!ingredients) {
      console.log('❌ No ingredients found');
      return;
    }

    // Get unique names
    const uniqueNames = [...new Set(ingredients.map(i => i.canonical_item_name))];
    console.log(`   Found ${uniqueNames.length} unique ingredient names`);

    // Check which ones already exist in canonical_items
    const { data: existingCanonical } = await supabase
      .from('canonical_items')
      .select('name')
      .in('name', uniqueNames);

    const existingNames = new Set(existingCanonical?.map(c => c.name) || []);
    const missingNames = uniqueNames.filter(name => !existingNames.has(name));

    console.log(`   ${existingNames.size} already exist`);
    console.log(`   ${missingNames.length} need to be inserted`);

    if (missingNames.length > 0) {
      // Insert missing names in batches of 100
      const batchSize = 100;
      for (let i = 0; i < missingNames.length; i += batchSize) {
        const batch = missingNames.slice(i, i + batchSize);
        const inserts = batch.map(name => ({ name }));

        const { error } = await supabase
          .from('canonical_items')
          .insert(inserts);

        if (error) {
          console.error(`   ❌ Error inserting batch ${i / batchSize + 1}:`, error.message);
        } else {
          console.log(`   ✅ Inserted batch ${i / batchSize + 1} (${batch.length} items)`);
        }
      }
    }

    // Step 2: Update recipe_database_ingredients with canonical_item_id
    console.log('\n2️⃣ Updating recipe_database_ingredients with canonical_item_id...');

    // Get all canonical items
    const { data: allCanonical } = await supabase
      .from('canonical_items')
      .select('id, name');

    if (!allCanonical) {
      console.log('❌ No canonical items found');
      return;
    }

    // Create name -> id mapping
    const nameToIdMap = new Map();
    allCanonical.forEach(c => nameToIdMap.set(c.name, c.id));

    console.log(`   Loaded ${nameToIdMap.size} canonical items`);

    // Get all recipe ingredients that need updating
    const { data: needsUpdate } = await supabase
      .from('recipe_database_ingredients')
      .select('id, canonical_item_name')
      .is('canonical_item_id', null)
      .not('canonical_item_name', 'is', null);

    if (!needsUpdate || needsUpdate.length === 0) {
      console.log('   ✅ All ingredients already have canonical_item_id');
      return;
    }

    console.log(`   Updating ${needsUpdate.length} ingredients...`);

    // Update in batches
    const updateBatchSize = 100;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < needsUpdate.length; i += updateBatchSize) {
      const batch = needsUpdate.slice(i, i + updateBatchSize);

      for (const ingredient of batch) {
        const canonicalId = nameToIdMap.get(ingredient.canonical_item_name);

        if (canonicalId) {
          const { error } = await supabase
            .from('recipe_database_ingredients')
            .update({ canonical_item_id: canonicalId })
            .eq('id', ingredient.id);

          if (error) {
            errorCount++;
          } else {
            successCount++;
          }
        }
      }

      console.log(`   Progress: ${Math.min(i + updateBatchSize, needsUpdate.length)}/${needsUpdate.length}`);
    }

    console.log(`\n   ✅ Updated ${successCount} ingredients`);
    if (errorCount > 0) {
      console.log(`   ⚠️  ${errorCount} errors`);
    }

    // Step 3: Verify
    console.log('\n3️⃣ Verifying migration...');

    const { count: totalCount } = await supabase
      .from('recipe_database_ingredients')
      .select('*', { count: 'exact', head: true });

    const { count: migratedCount } = await supabase
      .from('recipe_database_ingredients')
      .select('*', { count: 'exact', head: true })
      .not('canonical_item_id', 'is', null);

    const { count: unmigratedCount } = await supabase
      .from('recipe_database_ingredients')
      .select('*', { count: 'exact', head: true })
      .is('canonical_item_id', null)
      .not('canonical_item_name', 'is', null);

    console.log(`   Total ingredients: ${totalCount}`);
    console.log(`   Migrated: ${migratedCount} (${Math.round(migratedCount / totalCount * 100)}%)`);
    console.log(`   Unmigrated: ${unmigratedCount}`);

    console.log('\n═══════════════════════════════════════════════════');
    console.log('✅ MIGRATION FIX COMPLETE');
    console.log('═══════════════════════════════════════════════════');

  } catch (error) {
    console.error('\n❌ Migration fix failed:', error);
    process.exit(1);
  }
}

fixMigration()
  .then(() => {
    console.log('\n✅ Complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
