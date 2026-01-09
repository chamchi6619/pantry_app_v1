/**
 * Add common cooking ingredients to all households
 *
 * Purpose: Ensure all users can see pantry match percentages > 0%
 * Ingredients: salt, black pepper, olive oil, garlic, onion
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addCommonIngredients() {
  try {
    console.log('[CommonIngredients] Starting...');

    // Step 1: Get all unique household IDs
    const { data: householdMembers, error: householdError } = await supabase
      .from('household_members')
      .select('household_id');

    if (householdError) throw householdError;

    const uniqueHouseholds = [...new Set(householdMembers?.map(h => h.household_id) || [])];
    console.log(`[CommonIngredients] Found ${uniqueHouseholds.length} unique households`);

    // Step 2: Get common ingredient canonical IDs
    const commonIngredients = ['salt', 'black pepper', 'olive oil', 'garlic', 'onion'];
    const { data: items, error: itemsError } = await supabase
      .from('canonical_items')
      .select('id, name')
      .in('name', commonIngredients);

    if (itemsError) throw itemsError;
    console.log(`[CommonIngredients] Found ${items?.length || 0} canonical items:`, items?.map(i => i.name));

    // Step 3: Add to each household (if not already present)
    let addedCount = 0;
    let skippedCount = 0;

    for (const householdId of uniqueHouseholds) {
      for (const item of items || []) {
        // Check if already exists
        const { data: existing, error: existingError } = await supabase
          .from('pantry_items')
          .select('id')
          .eq('household_id', householdId)
          .eq('canonical_item_id', item.id)
          .maybeSingle();

        if (existingError) {
          console.error(`[CommonIngredients] Error checking ${item.name} for household ${householdId}:`, existingError);
          continue;
        }

        if (existing) {
          skippedCount++;
          continue;
        }

        // Add to pantry
        const { error: insertError } = await supabase
          .from('pantry_items')
          .insert({
            household_id: householdId,
            name: item.name,
            canonical_item_id: item.id,
            quantity: 1,
            unit: 'unit',
            status: 'active',
          });

        if (insertError) {
          console.error(`[CommonIngredients] Error adding ${item.name} to household ${householdId}:`, insertError);
        } else {
          addedCount++;
        }
      }
    }

    console.log(`[CommonIngredients] Complete!`);
    console.log(`  - Added: ${addedCount} items`);
    console.log(`  - Skipped (already exists): ${skippedCount} items`);
    console.log(`  - Expected total: ${uniqueHouseholds.length * (items?.length || 0)} items`);

    // Step 4: Verify by checking one household's pantry
    const sampleHousehold = uniqueHouseholds[0];
    const { data: samplePantry } = await supabase
      .from('pantry_items')
      .select('name, canonical_item_id')
      .eq('household_id', sampleHousehold)
      .eq('status', 'active');

    console.log(`\n[CommonIngredients] Sample pantry for household ${sampleHousehold}:`);
    console.log(`  Items: ${samplePantry?.map(p => p.name).join(', ')}`);
    console.log(`  Total: ${samplePantry?.length || 0} active items`);

  } catch (error) {
    console.error('[CommonIngredients] Fatal error:', error);
    process.exit(1);
  }
}

addCommonIngredients()
  .then(() => {
    console.log('\n[CommonIngredients] Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('[CommonIngredients] Failed:', err);
    process.exit(1);
  });
