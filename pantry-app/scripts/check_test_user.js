const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

(async () => {
  console.log('=== Checking test@pantry.app account ===\n');

  // Check if profile exists without auth
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', 'test@pantry.app');

  if (profiles && profiles.length > 0) {
    const profile = profiles[0];
    console.log('✓ Profile exists for test@pantry.app');
    console.log('  ID:', profile.id);
    console.log('  Display Name:', profile.display_name || 'Not set');
    console.log('  Created:', new Date(profile.created_at).toLocaleString());

    // Check household
    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id, role, households(*)')
      .eq('user_id', profile.id)
      .single();

    if (membership) {
      console.log('\n✓ Household membership found');
      console.log('  Household ID:', membership.household_id);
      console.log('  Household Name:', membership.households.name);
      console.log('  Role:', membership.role);

      // Check ALL items (active and consumed)
      const { data: allItems } = await supabase
        .from('pantry_items')
        .select('*')
        .eq('household_id', membership.household_id)
        .order('updated_at', { ascending: false });

      if (allItems && allItems.length > 0) {
        const active = allItems.filter(i => i.status === 'active' || !i.status);
        const consumed = allItems.filter(i => i.status === 'consumed');

        console.log('\n=== Pantry Items Summary ===');
        console.log('Total items in database:', allItems.length);
        console.log('  Active items:', active.length);
        console.log('  Consumed (deleted):', consumed.length);

        if (consumed.length > 0) {
          console.log('\n=== Recently Deleted Items ===');
          consumed.slice(0, 5).forEach(item => {
            const deletedTime = new Date(item.updated_at);
            const minutesAgo = Math.floor((Date.now() - deletedTime) / 60000);
            console.log(`  - "${item.name}" deleted ${minutesAgo} minutes ago`);
          });
        }

        if (active.length > 0) {
          console.log('\n=== Current Active Items ===');
          active.forEach(item => {
            console.log(`  - ${item.name} (qty: ${item.quantity} ${item.unit}, ${item.location})`);
          });
        } else {
          console.log('\nNo active items (all have been deleted/consumed)');
        }
      } else {
        console.log('\nNo items have ever been added to this household');
      }
    } else {
      console.log('\n✗ No household membership found');
    }
  } else {
    console.log('✗ No profile found for test@pantry.app');
    console.log('\nThis means the user exists in Auth but profile wasn\'t created.');
    console.log('The account may have been created before the trigger was set up.');
  }
})();