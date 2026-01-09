const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const householdId = 'b2f96ded-577a-47b1-9ab0-13a7fb4f99b3';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugUnmapped() {
  console.log('🔍 Debugging unmapped receipt items...\n');

  // 1. Get the unmapped items from pantry
  const { data: unmappedPantry } = await supabase
    .from('pantry_items')
    .select('name')
    .eq('household_id', householdId)
    .eq('status', 'active')
    .is('canonical_item_id', null);

  console.log('❌ Unmapped pantry items:');
  unmappedPantry?.forEach(item => console.log(`   - ${item.name}`));
  console.log('');

  // 2. Get the receipt_fix_queue items for this household
  const { data: receiptItems } = await supabase
    .from('receipt_fix_queue')
    .select('raw_text, parsed_name, canonical_item_id')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(30);

  console.log('📋 Recent receipt items from fix queue:');
  console.log('═══════════════════════════════════════════════');
  receiptItems?.forEach(item => {
    const status = item.canonical_item_id ? '✅' : '❌';
    console.log(`${status} ${item.raw_text || item.parsed_name}`);
    if (item.parsed_name !== item.raw_text) {
      console.log(`   → parsed: "${item.parsed_name}"`);
    }
    if (item.canonical_item_id) {
      console.log(`   → canonical_item_id: ${item.canonical_item_id.substring(0, 8)}...`);
    }
  });

  // 3. Check if "egg" exists in canonical items
  console.log('\n🔍 Checking egg/eggs variants in canonical_items:');
  const { data: eggVariants } = await supabase
    .from('canonical_items')
    .select('name, aliases')
    .or('name.ilike.%egg%,aliases.cs.{egg,eggs}');

  eggVariants?.forEach(item => {
    console.log(`   - ${item.name} (aliases: ${JSON.stringify(item.aliases)})`);
  });
}

debugUnmapped();
