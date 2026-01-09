const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const householdId = 'b2f96ded-577a-47b1-9ab0-13a7fb4f99b3';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixWrongMatches() {
  console.log('🔧 Fixing wrong canonical matches...\n');

  // Get the ID for "water" (wrong match)
  const { data: waterItem } = await supabase
    .from('canonical_items')
    .select('id')
    .eq('name', 'water')
    .single();

  if (waterItem) {
    // Clear watermelon that was matched to "water"
    const { data: fixed, error } = await supabase
      .from('pantry_items')
      .update({ canonical_item_id: null })
      .eq('household_id', householdId)
      .eq('name', 'Seedless Watermelon')
      .eq('canonical_item_id', waterItem.id)
      .select();

    if (error) {
      console.error('Error:', error);
    } else {
      console.log(`✅ Reset "Seedless Watermelon" (was wrongly matched to "water")`);
    }
  }

  console.log('\n✅ Done!');
}

fixWrongMatches();
