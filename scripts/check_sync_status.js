const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

(async () => {
  console.log('=== Checking current sync status ===\n');

  // Get ALL profiles to see what's there
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, email, display_name, created_at');

  console.log('Total profiles in database:', allProfiles?.length || 0);
  if (allProfiles && allProfiles.length > 0) {
    allProfiles.forEach(p => {
      console.log(`  - ${p.email || 'no email'} (created ${new Date(p.created_at).toLocaleDateString()})`);
    });
  }

  // Get ALL pantry items
  const { data: allItems } = await supabase
    .from('pantry_items')
    .select('id, name, quantity, unit, location, status, household_id, updated_at, created_at')
    .order('updated_at', { ascending: false });

  console.log('\n=== Pantry Items Overview ===');
  console.log('Total items in database:', allItems?.length || 0);

  if (allItems && allItems.length > 0) {
    const active = allItems.filter(i => i.status === 'active' || !i.status);
    const consumed = allItems.filter(i => i.status === 'consumed');

    console.log('  Active items:', active.length);
    console.log('  Consumed (deleted):', consumed.length);

    // Show recent updates
    console.log('\n=== Recently Updated Items (last 10 min) ===');
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const recentUpdates = allItems.filter(item => {
      return new Date(item.updated_at).getTime() > tenMinutesAgo;
    });

    if (recentUpdates.length > 0) {
      recentUpdates.forEach(item => {
        const updatedTime = new Date(item.updated_at);
        const minutesAgo = Math.floor((Date.now() - updatedTime.getTime()) / 60000);
        console.log(`  - ${item.name} (${item.status || 'active'}) - ${item.location} - ${minutesAgo} min ago`);
      });
    } else {
      console.log('  No items updated in last 10 minutes');
    }

    // Show deleted items
    if (consumed.length > 0) {
      console.log('\n=== Deleted Items ===');
      consumed.forEach(item => {
        const deletedTime = new Date(item.updated_at);
        console.log(`  - "${item.name}" was deleted at ${deletedTime.toLocaleTimeString()}`);
      });
    }

    // Show active items
    if (active.length > 0) {
      console.log('\n=== Current Active Items ===');
      active.forEach(item => {
        console.log(`  - ${item.name} (qty: ${item.quantity} ${item.unit}, ${item.location})`);
      });
    }
  } else {
    console.log('\nNo items found in the database.');
    console.log('This could mean:');
    console.log('  1. Items haven\'t synced yet');
    console.log('  2. No profile/household is set up');
    console.log('  3. Sync is disabled in the app');
  }
})();