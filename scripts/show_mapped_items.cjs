const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const householdId = 'b2f96ded-577a-47b1-9ab0-13a7fb4f99b3';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function showMappedItems() {
  // Get items WITH canonical mapping
  const { data: mapped, error } = await supabase
    .from('pantry_items')
    .select('name, canonical_item_id')
    .eq('household_id', householdId)
    .eq('status', 'active')
    .not('canonical_item_id', 'is', null);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`✅ Items WITH canonical mapping (${mapped?.length || 0}):`);
  if (mapped && mapped.length > 0) {
    mapped.forEach(item => {
      console.log(`   ${item.name} (canonical_item_id: ${item.canonical_item_id?.substring(0, 8)}...)`);
    });
  } else {
    console.log('   (none)');
  }
}

showMappedItems();
