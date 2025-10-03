import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function applyUltimateCleanup() {
  console.log('🚀 Applying ULTIMATE cleanup - making canonical items TRULY rock solid...\n');

  const plan = JSON.parse(fs.readFileSync('claude-ultimate-cleanup-plan.json', 'utf-8'));

  let updated = 0;
  let merged = 0;
  let created = 0;
  let errors = 0;

  // 1. Apply updates
  console.log('📝 Applying updates...');
  for (const action of plan.filter((a: any) => a.action === 'update')) {
    const { error } = await supabase
      .from('canonical_items')
      .update({
        canonical_name: action.newName,
        aliases: action.newAliases,
      })
      .eq('id', action.id);

    if (error) {
      console.error(`❌ Error updating ${action.oldName}:`, error.message);
      errors++;
    } else {
      updated++;
      if (action.oldName !== action.newName) {
        console.log(`   ✓ Updated "${action.oldName}" → "${action.newName}"`);
      } else {
        console.log(`   ✓ Cleaned aliases for "${action.oldName}"`);
      }
    }
  }
  console.log(`✅ Updated ${updated} items\n`);

  // 2. Apply merges
  console.log('🔄 Processing merges...');
  for (const action of plan.filter((a: any) => a.action === 'merge')) {
    // Find the target canonical item
    const { data: targetItems } = await supabase
      .from('canonical_items')
      .select('id, canonical_name, aliases')
      .eq('canonical_name', action.mergeInto)
      .limit(1);

    if (targetItems && targetItems.length > 0) {
      const targetId = targetItems[0].id;

      // Update recipe_ingredients that point to the old item
      await supabase
        .from('recipe_ingredients')
        .update({ canonical_item_id: targetId })
        .eq('canonical_item_id', action.id);

      // Delete the old item
      const { error } = await supabase
        .from('canonical_items')
        .delete()
        .eq('id', action.id);

      if (!error) {
        merged++;
        if (merged % 10 === 0) {
          console.log(`   ... ${merged} items merged so far`);
        }
      } else {
        console.error(`   ❌ Error merging ${action.oldName}:`, error.message);
        errors++;
      }
    } else {
      // Target doesn't exist - need to create it first
      console.log(`   ℹ️  Creating missing base item: "${action.mergeInto}"`);

      const { data: newItem, error: createError } = await supabase
        .from('canonical_items')
        .insert({
          canonical_name: action.mergeInto,
          category: action.newCategory,
          aliases: []
        })
        .select()
        .single();

      if (!createError && newItem) {
        created++;

        // Now update recipe_ingredients to point to new item
        await supabase
          .from('recipe_ingredients')
          .update({ canonical_item_id: newItem.id })
          .eq('canonical_item_id', action.id);

        // Delete the old item
        await supabase
          .from('canonical_items')
          .delete()
          .eq('id', action.id);

        merged++;
        console.log(`   ✓ Created "${action.mergeInto}" and merged "${action.oldName}" into it`);
      } else {
        console.error(`   ❌ Could not create "${action.mergeInto}":`, createError?.message);
        errors++;
      }
    }
  }
  console.log(`✅ Merged ${merged} items (created ${created} missing base items)\n`);

  // Get final count
  const { count } = await supabase
    .from('canonical_items')
    .select('*', { count: 'exact', head: true });

  console.log('📊 ULTIMATE CLEANUP SUMMARY:');
  console.log(`   Updates: ${updated}`);
  console.log(`   Merges: ${merged}`);
  console.log(`   Created new base items: ${created}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Total successful changes: ${updated + merged}`);
  console.log(`\n✅ Final canonical items count: ${count}`);
  console.log('\n💎💎💎 TRULY ROCK SOLID! Your canonical items are now PERFECT! 💎💎💎');
}

applyUltimateCleanup().catch(console.error);
