const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function checkShoppingList() {
  console.log('=== Checking Shopping List for test3@pantry.app ===\n');

  // Get test3's profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', 'test3@pantry.app')
    .single();

  if (!profile) {
    console.log('No profile found for test3@pantry.app');
    return;
  }

  // Get household
  const { data: member } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', profile.id)
    .single();

  if (!member) {
    console.log('No household membership found');
    return;
  }

  console.log('Household ID:', member.household_id);

  // Get shopping lists
  const { data: lists } = await supabase
    .from('shopping_lists')
    .select('*')
    .eq('household_id', member.household_id)
    .order('created_at', { ascending: false });

  console.log('\nShopping Lists:', lists ? lists.length : 0, 'found');
  if (lists && lists[0]) {
    console.log('Active List:', {
      id: lists[0].id,
      title: lists[0].title,
      is_active: lists[0].is_active
    });

    // Get items
    const { data: items } = await supabase
      .from('shopping_list_items')
      .select('*')
      .eq('list_id', lists[0].id)
      .order('created_at', { ascending: false });

    console.log('\nShopping List Items:', items ? items.length : 0, 'found');
    if (items && items.length > 0) {
      items.forEach(item => {
        console.log(`  - ${item.name} | ${item.quantity} ${item.unit} | Status: ${item.status}`);
      });
    } else {
      console.log('  (No items in shopping list)');
    }
  }
}

checkShoppingList().catch(console.error);