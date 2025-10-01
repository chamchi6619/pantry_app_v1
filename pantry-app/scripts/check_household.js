const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function checkHouseholds() {
  try {
    // Get user
    const email = 'chamchi6619@gmail.com';

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .eq('email', email)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return;
    }

    console.log('=== USER PROFILE ===');
    console.log(`User ID: ${profile.id}`);
    console.log(`Email: ${profile.email}`);
    console.log(`Display Name: ${profile.display_name || 'Not set'}`);

    // Get household memberships
    const { data: memberships, error: memberError } = await supabase
      .from('household_members')
      .select(`
        household_id,
        role,
        households (
          id,
          name,
          created_at
        )
      `)
      .eq('user_id', profile.id);

    if (memberError) {
      console.error('Error fetching memberships:', memberError);
      return;
    }

    console.log('\n=== HOUSEHOLD MEMBERSHIPS ===');
    memberships.forEach(m => {
      console.log(`Household ID: ${m.household_id}`);
      console.log(`  Name: ${m.households.name}`);
      console.log(`  Role: ${m.role}`);
      console.log(`  Created: ${new Date(m.households.created_at).toLocaleString()}`);
    });

    // Check items for each household
    for (const membership of memberships) {
      const { data: items, error: itemError } = await supabase
        .from('pantry_items')
        .select('id, name, status')
        .eq('household_id', membership.household_id);

      if (!itemError) {
        console.log(`\n=== Items in ${membership.households.name} ===`);
        console.log(`Total items: ${items.length}`);
        const activeItems = items.filter(i => i.status === 'active' || !i.status);
        const consumedItems = items.filter(i => i.status === 'consumed');
        console.log(`  Active: ${activeItems.length}`);
        console.log(`  Consumed: ${consumedItems.length}`);
      }
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkHouseholds();