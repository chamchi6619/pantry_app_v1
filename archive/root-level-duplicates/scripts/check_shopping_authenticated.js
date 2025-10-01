const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function checkShoppingListAuthenticated() {
  console.log('=== Authenticating as test3@pantry.app ===\n');

  // Sign in as test3
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'test3@pantry.app',
    password: 'test1234'
  });

  if (authError) {
    console.log('Authentication failed:', authError.message);
    return;
  }

  console.log('✅ Authenticated successfully');
  console.log('User ID:', authData.user.id);
  console.log('Email:', authData.user.email);

  // Get profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  console.log('\n📋 Profile:', {
    id: profile?.id,
    email: profile?.email,
    display_name: profile?.display_name || 'Not set'
  });

  // Get household membership
  const { data: member } = await supabase
    .from('household_members')
    .select(`
      household_id,
      role,
      households (
        id,
        name
      )
    `)
    .eq('user_id', authData.user.id)
    .single();

  if (!member) {
    console.log('No household membership found');
    return;
  }

  console.log('\n🏠 Household:', {
    id: member.household_id,
    name: member.households.name,
    role: member.role
  });

  // Get shopping lists
  const { data: lists } = await supabase
    .from('shopping_lists')
    .select('*')
    .eq('household_id', member.household_id)
    .order('created_at', { ascending: false });

  console.log('\n🛒 Shopping Lists:', lists ? lists.length : 0, 'found');

  if (lists && lists.length > 0) {
    for (const list of lists) {
      console.log('\nList:', {
        id: list.id,
        title: list.title,
        is_active: list.is_active,
        created: new Date(list.created_at).toLocaleString()
      });

      // Get items for this list
      const { data: items } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('list_id', list.id)
        .order('created_at', { ascending: false });

      console.log('  Items in list:', items ? items.length : 0);
      if (items && items.length > 0) {
        items.forEach(item => {
          console.log(`    - ${item.name} | ${item.quantity} ${item.unit} | Status: ${item.status} | Category: ${item.category || 'none'}`);
        });
      }
    }
  }

  // Check inventory items for comparison
  console.log('\n📦 Checking Inventory Items:');
  const { data: inventoryItems } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('household_id', member.household_id)
    .neq('status', 'consumed')
    .order('created_at', { ascending: false });

  console.log('Active inventory items:', inventoryItems ? inventoryItems.length : 0);
  if (inventoryItems && inventoryItems.length > 0) {
    inventoryItems.forEach(item => {
      console.log(`  - ${item.name} | ${item.quantity} ${item.unit} | Location: ${item.location} | Status: ${item.status}`);
    });
  }

  // Sign out
  await supabase.auth.signOut();
  console.log('\n✅ Signed out');
}

checkShoppingListAuthenticated().catch(console.error);