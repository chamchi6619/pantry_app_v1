const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function debugSync() {
  console.log('=== DEBUGGING SYNC ISSUE ===\n');

  // 1. Check environment
  console.log('1. Environment:');
  console.log(`   Supabase URL: ${process.env.EXPO_PUBLIC_SUPABASE_URL}`);
  console.log(`   Has Anon Key: ${!!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`);

  // 2. Try different passwords
  const passwords = ['Test123456!', 'test123456', 'Test123456'];
  let authSuccess = false;
  let userId = null;

  console.log('\n2. Trying authentication:');
  for (const pwd of passwords) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'chamchi6619@gmail.com',
      password: pwd
    });

    if (!error) {
      console.log(`   ✓ Success with password: ${pwd}`);
      userId = data.user.id;
      authSuccess = true;
      break;
    } else {
      console.log(`   ✗ Failed with ${pwd}: ${error.message}`);
    }
  }

  if (!authSuccess) {
    console.log('\n   Could not authenticate. The user might be using mock auth.');
    console.log('   This would explain why no data syncs to Supabase.');
    return;
  }

  // 3. Check profile
  console.log('\n3. Checking profile:');
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) {
    console.log('   ✗ No profile exists - creating one...');

    const { data: newProfile, error: createProfileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        email: 'chamchi6619@gmail.com',
        display_name: 'Test User'
      })
      .select()
      .single();

    if (createProfileError) {
      console.log(`   Error creating profile: ${createProfileError.message}`);
    } else {
      console.log('   ✓ Profile created successfully');
    }
  } else {
    console.log('   ✓ Profile exists');
  }

  // 4. Check household
  console.log('\n4. Checking household:');
  const { data: membership, error: memberError } = await supabase
    .from('household_members')
    .select('household_id, households(*)')
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership) {
    console.log('   ✗ No household membership - creating household...');

    // Create household
    const { data: household, error: householdError } = await supabase
      .from('households')
      .insert({
        name: 'Test Household',
        created_by: userId
      })
      .select()
      .single();

    if (!householdError && household) {
      // Add member
      const { error: memberAddError } = await supabase
        .from('household_members')
        .insert({
          household_id: household.id,
          user_id: userId,
          role: 'owner'
        });

      if (!memberAddError) {
        console.log(`   ✓ Household created: ${household.id}`);
      }
    }
  } else {
    console.log(`   ✓ Household exists: ${membership.household_id}`);

    // 5. Check items in this household
    console.log('\n5. Checking items:');
    const { data: items, count } = await supabase
      .from('pantry_items')
      .select('*', { count: 'exact' })
      .eq('household_id', membership.household_id);

    console.log(`   Total items: ${count}`);
    if (items && items.length > 0) {
      console.log('   Recent items:');
      items.slice(0, 3).forEach(item => {
        console.log(`     - ${item.name} (${item.status || 'active'})`);
      });
    }
  }
}

debugSync().catch(console.error);