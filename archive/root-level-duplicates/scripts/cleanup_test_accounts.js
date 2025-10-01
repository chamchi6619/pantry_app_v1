const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Note: To delete auth users, we need admin privileges which the anon key doesn't have
// We can only clean up the profile and related data
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function cleanupTestAccounts() {
  console.log('=== Cleaning up test accounts ===\n');

  try {
    // Get all test profiles (profiles with test emails)
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .or('email.ilike.test%,email.ilike.%@example.com,email.ilike.%@pantry.app');

    if (profileError) {
      console.log('Error fetching profiles:', profileError);
      return;
    }

    if (!profiles || profiles.length === 0) {
      console.log('No test profiles found to delete.');
      return;
    }

    console.log(`Found ${profiles.length} test profiles to clean up:\n`);
    profiles.forEach(p => {
      console.log(`  - ${p.email || 'no email'} (${p.id})`);
    });

    // For each profile, we need to:
    // 1. Delete their pantry items
    // 2. Delete their shopping list items
    // 3. Delete their shopping lists
    // 4. Delete their household memberships
    // 5. Delete their households (if they're the only member)
    // 6. Delete their user preferences
    // 7. Delete their profile

    for (const profile of profiles) {
      console.log(`\nCleaning up data for: ${profile.email}`);

      // Get household memberships
      const { data: memberships } = await supabase
        .from('household_members')
        .select('household_id, role')
        .eq('user_id', profile.id);

      if (memberships && memberships.length > 0) {
        for (const membership of memberships) {
          // Check if user is the only member
          const { count } = await supabase
            .from('household_members')
            .select('*', { count: 'exact', head: true })
            .eq('household_id', membership.household_id);

          if (count === 1) {
            // User is the only member, delete the household and all related data
            console.log(`  - Deleting household ${membership.household_id} and all related data`);

            // Delete pantry items
            await supabase
              .from('pantry_items')
              .delete()
              .eq('household_id', membership.household_id);

            // Delete shopping list items through shopping lists
            const { data: lists } = await supabase
              .from('shopping_lists')
              .select('id')
              .eq('household_id', membership.household_id);

            if (lists) {
              for (const list of lists) {
                await supabase
                  .from('shopping_list_items')
                  .delete()
                  .eq('list_id', list.id);
              }
            }

            // Delete shopping lists
            await supabase
              .from('shopping_lists')
              .delete()
              .eq('household_id', membership.household_id);

            // Delete household member entry
            await supabase
              .from('household_members')
              .delete()
              .eq('household_id', membership.household_id);

            // Delete household
            await supabase
              .from('households')
              .delete()
              .eq('id', membership.household_id);
          } else {
            // Just remove this member
            console.log(`  - Removing user from household ${membership.household_id}`);
            await supabase
              .from('household_members')
              .delete()
              .eq('user_id', profile.id)
              .eq('household_id', membership.household_id);
          }
        }
      }

      // Delete user preferences
      await supabase
        .from('user_preferences')
        .delete()
        .eq('user_id', profile.id);

      // Delete profile
      const { error: deleteProfileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', profile.id);

      if (deleteProfileError) {
        console.log(`  - Error deleting profile: ${deleteProfileError.message}`);
      } else {
        console.log(`  - Profile deleted successfully`);
      }
    }

    console.log('\n=== Cleanup Complete ===');
    console.log('\nNote: Auth users cannot be deleted via the API with anon key.');
    console.log('You may need to delete them manually from the Supabase dashboard.');
    console.log('Go to Authentication > Users and delete the test users there.');

    // Verify cleanup
    console.log('\n=== Verification ===');
    const { data: remainingProfiles } = await supabase
      .from('profiles')
      .select('email', { count: 'exact', head: true });

    const { data: remainingHouseholds } = await supabase
      .from('households')
      .select('id', { count: 'exact', head: true });

    const { data: remainingItems } = await supabase
      .from('pantry_items')
      .select('id', { count: 'exact', head: true });

    console.log('Remaining profiles:', remainingProfiles || 0);
    console.log('Remaining households:', remainingHouseholds || 0);
    console.log('Remaining pantry items:', remainingItems || 0);

  } catch (error) {
    console.error('Unexpected error during cleanup:', error);
  }
}

cleanupTestAccounts();