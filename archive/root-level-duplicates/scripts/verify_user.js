const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function verifyNewUser(email) {
  console.log(`\n=== Verifying User Setup for ${email} ===\n`);

  // 1. Check profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .single();

  if (profile) {
    console.log('✅ PROFILE CREATED');
    console.log(`   ID: ${profile.id}`);
    console.log(`   Email: ${profile.email}`);
    console.log(`   Display Name: ${profile.display_name || 'Not set'}`);
    console.log(`   Created: ${new Date(profile.created_at).toLocaleString()}`);
  } else {
    console.log('❌ NO PROFILE FOUND');
    console.log(`   Error: ${profileError?.message}`);
    return;
  }

  // 2. Check household membership
  const { data: membership } = await supabase
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
    .eq('user_id', profile.id)
    .single();

  if (membership) {
    console.log('\n✅ HOUSEHOLD CREATED');
    console.log(`   Household ID: ${membership.household_id}`);
    console.log(`   Household Name: ${membership.households.name}`);
    console.log(`   User Role: ${membership.role}`);
    console.log(`   Created: ${new Date(membership.households.created_at).toLocaleString()}`);
  } else {
    console.log('\n❌ NO HOUSEHOLD FOUND');
  }

  // 3. Check shopping list
  if (membership) {
    const { data: shoppingList } = await supabase
      .from('shopping_lists')
      .select('*')
      .eq('household_id', membership.household_id)
      .eq('is_active', true)
      .single();

    if (shoppingList) {
      console.log('\n✅ SHOPPING LIST CREATED');
      console.log(`   List ID: ${shoppingList.id}`);
      console.log(`   Title: ${shoppingList.title}`);
      console.log(`   Active: ${shoppingList.is_active}`);
    } else {
      console.log('\n❌ NO SHOPPING LIST FOUND');
    }
  }

  // 4. Check user preferences
  const { data: preferences } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', profile.id)
    .single();

  if (preferences) {
    console.log('\n✅ USER PREFERENCES CREATED');
    console.log(`   Measurement System: ${preferences.measurement_system}`);
    console.log(`   Default Location: ${preferences.default_location}`);
  } else {
    console.log('\n❌ NO USER PREFERENCES');
  }

  console.log('\n=== Summary ===');
  if (profile && membership && membership.households) {
    console.log('🎉 All required records created successfully!');
    console.log('✅ User is ready to use the app');
    console.log(`\nHousehold ID for testing: ${membership.household_id}`);
  } else {
    console.log('⚠️ Some records are missing');
    console.log('The trigger may not be working properly');
  }
}

// Get email from command line argument
const email = process.argv[2];
if (!email) {
  console.log('Usage: node verify_user.js <email>');
  console.log('Example: node verify_user.js test_1234@pantry.app');
} else {
  verifyNewUser(email).catch(console.error);
}