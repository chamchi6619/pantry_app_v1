/**
 * Delete User Account Edge Function
 *
 * GDPR-compliant user account deletion
 * Permanently deletes all user data across all tables
 *
 * This is called from ProfileScreen when user requests account deletion
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeleteAccountRequest {
  user_id: string;
  household_id: string;
}

interface DeleteAccountResponse {
  success: boolean;
  message?: string;
  error?: string;
  deleted_counts?: {
    cook_cards: number;
    meal_plans: number;
    shopping_lists: number;
    pantry_items: number;
    receipts: number;
    total_records: number;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create client with user's auth token for RLS enforcement
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestData = await req.json() as DeleteAccountRequest;
    const { user_id, household_id } = requestData;

    // Security check: user can only delete their own account
    if (user_id !== user.id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'You can only delete your own account',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`\n🗑️  Delete User Account Request`);
    console.log(`   User ID: ${user_id}`);
    console.log(`   Household ID: ${household_id}`);

    // Track deletion counts for logging
    const deletedCounts = {
      cook_cards: 0,
      meal_plans: 0,
      shopping_lists: 0,
      pantry_items: 0,
      receipts: 0,
      total_records: 0,
    };

    /**
     * Delete user data in correct order (child -> parent)
     *
     * Order matters due to foreign key constraints:
     * 1. Child records that reference cook_cards, meal_plans, shopping_lists, receipts
     * 2. Parent records (cook_cards, meal_plans, shopping_lists, pantry_items, receipts)
     * 3. User profile and preferences
     * 4. Auth user (via admin API)
     */

    // 1. Delete cook card related data
    console.log('\n📋 Deleting cook cards data...');

    // Get cook card IDs first
    const { data: cookCards } = await supabaseClient
      .from('cook_cards')
      .select('id')
      .eq('household_id', household_id);

    if (cookCards && cookCards.length > 0) {
      const cookCardIds = cookCards.map(cc => cc.id);

      // Delete cook_card_events
      const { error: eventsError, count: eventsCount } = await supabaseClient
        .from('cook_card_events')
        .delete({ count: 'exact' })
        .in('cook_card_id', cookCardIds);

      if (eventsError) console.error('Error deleting cook_card_events:', eventsError);
      deletedCounts.total_records += eventsCount || 0;

      // Delete cook_card_ingredients
      const { error: ingredientsError, count: ingredientsCount } = await supabaseClient
        .from('cook_card_ingredients')
        .delete({ count: 'exact' })
        .in('cook_card_id', cookCardIds);

      if (ingredientsError) console.error('Error deleting cook_card_ingredients:', ingredientsError);
      deletedCounts.total_records += ingredientsCount || 0;

      // Delete cook_cards
      const { error: cookCardsError, count: cookCardsCount } = await supabaseClient
        .from('cook_cards')
        .delete({ count: 'exact' })
        .eq('household_id', household_id);

      if (cookCardsError) console.error('Error deleting cook_cards:', cookCardsError);
      deletedCounts.cook_cards = cookCardsCount || 0;
      deletedCounts.total_records += cookCardsCount || 0;

      console.log(`   ✓ Deleted ${deletedCounts.cook_cards} cook cards`);
    }

    // 2. Delete meal planning data
    console.log('\n🗓️  Deleting meal planning data...');

    // Get meal plan IDs first
    const { data: mealPlans } = await supabaseClient
      .from('meal_plans')
      .select('id')
      .eq('household_id', household_id);

    if (mealPlans && mealPlans.length > 0) {
      const mealPlanIds = mealPlans.map(mp => mp.id);

      // Delete meal_history
      const { error: historyError, count: historyCount } = await supabaseClient
        .from('meal_history')
        .delete({ count: 'exact' })
        .in('meal_plan_id', mealPlanIds);

      if (historyError) console.error('Error deleting meal_history:', historyError);
      deletedCounts.total_records += historyCount || 0;

      // Delete meal_plans
      const { error: mealPlansError, count: mealPlansCount } = await supabaseClient
        .from('meal_plans')
        .delete({ count: 'exact' })
        .eq('household_id', household_id);

      if (mealPlansError) console.error('Error deleting meal_plans:', mealPlansError);
      deletedCounts.meal_plans = mealPlansCount || 0;
      deletedCounts.total_records += mealPlansCount || 0;

      console.log(`   ✓ Deleted ${deletedCounts.meal_plans} meal plans`);
    }

    // 3. Delete shopping list data
    console.log('\n🛒 Deleting shopping list data...');

    // Get shopping list IDs first
    const { data: shoppingLists } = await supabaseClient
      .from('shopping_lists')
      .select('id')
      .eq('household_id', household_id);

    if (shoppingLists && shoppingLists.length > 0) {
      const shoppingListIds = shoppingLists.map(sl => sl.id);

      // Delete shopping_list_items
      const { error: itemsError, count: itemsCount } = await supabaseClient
        .from('shopping_list_items')
        .delete({ count: 'exact' })
        .in('list_id', shoppingListIds);

      if (itemsError) console.error('Error deleting shopping_list_items:', itemsError);
      deletedCounts.total_records += itemsCount || 0;

      // Delete shopping_lists
      const { error: listsError, count: listsCount } = await supabaseClient
        .from('shopping_lists')
        .delete({ count: 'exact' })
        .eq('household_id', household_id);

      if (listsError) console.error('Error deleting shopping_lists:', listsError);
      deletedCounts.shopping_lists = listsCount || 0;
      deletedCounts.total_records += listsCount || 0;

      console.log(`   ✓ Deleted ${deletedCounts.shopping_lists} shopping lists`);
    }

    // 4. Delete pantry/inventory data
    console.log('\n🥫 Deleting pantry data...');

    // Delete pantry_items
    const { error: pantryError, count: pantryCount } = await supabaseClient
      .from('pantry_items')
      .delete({ count: 'exact' })
      .eq('household_id', household_id);

    if (pantryError) console.error('Error deleting pantry_items:', pantryError);
    deletedCounts.pantry_items = pantryCount || 0;
    deletedCounts.total_records += pantryCount || 0;

    // Delete inventory_transactions
    const { error: transactionsError, count: transactionsCount } = await supabaseClient
      .from('inventory_transactions')
      .delete({ count: 'exact' })
      .eq('household_id', household_id);

    if (transactionsError) console.error('Error deleting inventory_transactions:', transactionsError);
    deletedCounts.total_records += transactionsCount || 0;

    console.log(`   ✓ Deleted ${deletedCounts.pantry_items} pantry items`);

    // 5. Delete receipt data
    console.log('\n🧾 Deleting receipt data...');

    // Get receipt IDs first
    const { data: receipts } = await supabaseClient
      .from('receipts')
      .select('id')
      .eq('household_id', household_id);

    if (receipts && receipts.length > 0) {
      const receiptIds = receipts.map(r => r.id);

      // Delete receipt_items
      const { error: receiptItemsError, count: receiptItemsCount } = await supabaseClient
        .from('receipt_items')
        .delete({ count: 'exact' })
        .in('receipt_id', receiptIds);

      if (receiptItemsError) console.error('Error deleting receipt_items:', receiptItemsError);
      deletedCounts.total_records += receiptItemsCount || 0;

      // Delete receipt_fix_queue
      const { error: fixQueueError, count: fixQueueCount } = await supabaseClient
        .from('receipt_fix_queue')
        .delete({ count: 'exact' })
        .in('receipt_id', receiptIds);

      if (fixQueueError) console.error('Error deleting receipt_fix_queue:', fixQueueError);
      deletedCounts.total_records += fixQueueCount || 0;

      // Delete receipts
      const { error: receiptsError, count: receiptsCount } = await supabaseClient
        .from('receipts')
        .delete({ count: 'exact' })
        .eq('household_id', household_id);

      if (receiptsError) console.error('Error deleting receipts:', receiptsError);
      deletedCounts.receipts = receiptsCount || 0;
      deletedCounts.total_records += receiptsCount || 0;

      console.log(`   ✓ Deleted ${deletedCounts.receipts} receipts`);
    }

    // 6. Delete purchase history
    console.log('\n💰 Deleting purchase history...');
    const { error: purchaseHistoryError, count: purchaseHistoryCount } = await supabaseClient
      .from('purchase_history')
      .delete({ count: 'exact' })
      .eq('household_id', household_id);

    if (purchaseHistoryError) console.error('Error deleting purchase_history:', purchaseHistoryError);
    deletedCounts.total_records += purchaseHistoryCount || 0;

    // 7. Delete user preferences
    console.log('\n⚙️  Deleting user preferences...');
    const { error: preferencesError, count: preferencesCount } = await supabaseClient
      .from('user_preferences')
      .delete({ count: 'exact' })
      .eq('user_id', user_id);

    if (preferencesError) console.error('Error deleting user_preferences:', preferencesError);
    deletedCounts.total_records += preferencesCount || 0;

    // 8. Delete profile
    console.log('\n👤 Deleting user profile...');
    const { error: profileError, count: profileCount } = await supabaseClient
      .from('profiles')
      .delete({ count: 'exact' })
      .eq('id', user_id);

    if (profileError) console.error('Error deleting profile:', profileError);
    deletedCounts.total_records += profileCount || 0;

    // 9. Delete auth user (requires admin client)
    console.log('\n🔐 Deleting auth user...');

    // Create admin client for deleting auth user
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(user_id);

    if (deleteAuthError) {
      console.error('❌ Error deleting auth user:', deleteAuthError);
      throw new Error(`Failed to delete auth user: ${deleteAuthError.message}`);
    }

    console.log(`\n✅ Account deletion complete`);
    console.log(`   Total records deleted: ${deletedCounts.total_records}`);
    console.log(`   - Cook cards: ${deletedCounts.cook_cards}`);
    console.log(`   - Meal plans: ${deletedCounts.meal_plans}`);
    console.log(`   - Shopping lists: ${deletedCounts.shopping_lists}`);
    console.log(`   - Pantry items: ${deletedCounts.pantry_items}`);
    console.log(`   - Receipts: ${deletedCounts.receipts}`);

    const response: DeleteAccountResponse = {
      success: true,
      message: 'Account and all associated data have been permanently deleted',
      deleted_counts: deletedCounts,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('❌ Error in delete-user-account:', error);

    const response: DeleteAccountResponse = {
      success: false,
      error: error.message || 'Failed to delete account',
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
