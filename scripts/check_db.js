const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function checkDatabase() {
  try {
    // Get all pantry items
    const { data: allItems, error: allError } = await supabase
      .from('pantry_items')
      .select('id, name, quantity, location, status, household_id, updated_at')
      .order('updated_at', { ascending: false });

    if (allError) {
      console.error('Error fetching all items:', allError);
      return;
    }

    console.log('=== ALL PANTRY ITEMS ===');
    console.log(`Total items in database: ${allItems.length}`);

    // Group by status
    const statusGroups = {};
    allItems.forEach(item => {
      const status = item.status || 'active';
      if (!statusGroups[status]) statusGroups[status] = [];
      statusGroups[status].push(item);
    });

    console.log('\n=== Items by Status ===');
    Object.entries(statusGroups).forEach(([status, items]) => {
      console.log(`${status}: ${items.length} items`);
      items.forEach(item => {
        console.log(`  - ${item.name} (${item.location}) - Updated: ${new Date(item.updated_at).toLocaleString()}`);
      });
    });

    // Check for recently deleted (consumed) items
    const recentlyConsumed = allItems.filter(item =>
      item.status === 'consumed' &&
      new Date(item.updated_at) > new Date(Date.now() - 10 * 60 * 1000) // Last 10 minutes
    );

    if (recentlyConsumed.length > 0) {
      console.log('\n=== Recently Deleted Items (last 10 min) ===');
      recentlyConsumed.forEach(item => {
        console.log(`- ${item.name} was deleted at ${new Date(item.updated_at).toLocaleString()}`);
      });
    }

    // Active items only
    const activeItems = allItems.filter(item => item.status === 'active' || !item.status);
    console.log(`\n=== Active Items: ${activeItems.length} ===`);
    activeItems.forEach(item => {
      console.log(`- ${item.name} (qty: ${item.quantity}, location: ${item.location})`);
    });

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkDatabase();