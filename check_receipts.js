const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function checkReceiptTables() {
  console.log('=== Checking Receipt Tables for test3 ===\n');

  // Sign in as test3
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'test3@pantry.app',
    password: 'test1234'
  });

  if (authError) {
    console.log('Authentication failed:', authError.message);
    return;
  }

  const userId = authData.user.id;
  console.log('Authenticated as:', authData.user.email);

  // Get household
  const { data: member } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .single();

  if (!member) {
    console.log('No household membership found');
    return;
  }

  const householdId = member.household_id;
  console.log('Household ID:', householdId);

  // Check receipts
  console.log('\n📋 Receipts:');
  const { data: receipts } = await supabase
    .from('receipts')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });

  console.log('Total receipts:', receipts ? receipts.length : 0);
  if (receipts && receipts.length > 0) {
    receipts.forEach(r => {
      console.log(`  - Receipt ID: ${r.id}`);
      console.log(`    Store: ${r.store_name || 'Unknown'}`);
      console.log(`    Total: $${r.total_amount || 0}`);
      console.log(`    Date: ${r.receipt_date || r.created_at}`);
      console.log(`    Item count: ${r.item_count || 0}`);
    });
  }

  // Check fix queue
  console.log('\n🔧 Fix Queue Items:');
  const { data: fixQueue } = await supabase
    .from('receipt_fix_queue')
    .select('*')
    .eq('household_id', householdId)
    .eq('resolved', false)
    .order('created_at', { ascending: false });

  console.log('Unresolved items:', fixQueue ? fixQueue.length : 0);
  if (fixQueue && fixQueue.length > 0) {
    fixQueue.forEach(item => {
      console.log(`  - Raw: "${item.raw_text}"`);
      console.log(`    Parsed: ${item.parsed_name}`);
      console.log(`    Quantity: ${item.quantity} ${item.unit}`);
      console.log(`    Price: ${item.price ? '$' + item.price : 'N/A'}`);
      console.log(`    Categories: ${item.categories || 'none'}`);
    });
  }

  await supabase.auth.signOut();
  console.log('\n✅ Done');
}

checkReceiptTables().catch(console.error);