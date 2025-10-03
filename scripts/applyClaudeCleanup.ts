import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function applyClaudeCleanup() {
  console.log('🚀 Applying Claude\'s cleanup plan...\n');

  const plan = JSON.parse(fs.readFileSync('claude-cleanup-plan.json', 'utf-8'));

  let updated = 0;
  let merged = 0;
  let deleted = 0;

  // 1. Apply updates
  console.log('📝 Applying updates...');
  for (const action of plan.filter((a: any) => a.action === 'update')) {
    const { error } = await supabase
      .from('canonical_items')
      .update({
        canonical_name: action.newName,
        aliases: action.newAliases,
        category: action.newCategory,
      })
      .eq('id', action.id);

    if (error) {
      console.error(`❌ Error updating ${action.oldName}:`, error.message);
    } else {
      updated++;
      if (updated % 20 === 0) {
        console.log(`   Updated ${updated}...`);
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
      .select('id')
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
        console.log(`   ✓ Merged "${action.oldName}" → "${action.mergeInto}"`);
      }
    } else {
      console.warn(`⚠️  Could not find merge target "${action.mergeInto}"`);
    }
  }
  console.log(`✅ Merged ${merged} items\n`);

  // 3. Apply deletes
  console.log('🗑️  Deleting junk items...');
  for (const action of plan.filter((a: any) => a.action === 'delete')) {
    // Clear references first
    await supabase
      .from('recipe_ingredients')
      .update({ canonical_item_id: null })
      .eq('canonical_item_id', action.id);

    // Delete the item
    const { error } = await supabase
      .from('canonical_items')
      .delete()
      .eq('id', action.id);

    if (!error) {
      deleted++;
      console.log(`   ✓ Deleted "${action.oldName}"`);
    }
  }
  console.log(`✅ Deleted ${deleted} items\n`);

  // Get final count
  const { count } = await supabase
    .from('canonical_items')
    .select('*', { count: 'exact', head: true });

  console.log('📊 FINAL SUMMARY:');
  console.log(`   Updated: ${updated}`);
  console.log(`   Merged: ${merged}`);
  console.log(`   Deleted: ${deleted}`);
  console.log(`   Total changes: ${updated + merged + deleted}`);
  console.log(`\n✅ Final canonical items count: ${count}`);
  console.log('\n🎉 Your canonical items are now ROCK SOLID!');
}

applyClaudeCleanup().catch(console.error);
