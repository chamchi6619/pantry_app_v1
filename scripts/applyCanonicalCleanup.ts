import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface CleanedItem {
  original_id: string;
  cleaned_name: string;
  clean_aliases: string[];
  correct_category: string;
  action: 'keep' | 'merge' | 'delete';
  merge_into?: string;
  reason?: string;
}

async function applyCanonicalCleanup() {
  console.log('🚀 Applying canonical items cleanup to database...\n');

  // Load cleanup plan
  const planText = fs.readFileSync('canonical-cleanup-plan.json', 'utf-8');
  const plan: CleanedItem[] = JSON.parse(planText);

  console.log(`📊 Loaded cleanup plan with ${plan.length} items\n`);

  // Separate by action
  const toKeep = plan.filter(p => p.action === 'keep');
  const toMerge = plan.filter(p => p.action === 'merge');
  const toDelete = plan.filter(p => p.action === 'delete');

  console.log(`✓ Keep (update): ${toKeep.length}`);
  console.log(`✓ Merge: ${toMerge.length}`);
  console.log(`✓ Delete: ${toDelete.length}\n`);

  let updated = 0;
  let merged = 0;
  let deleted = 0;

  // 1. Update "keep" items
  console.log('📝 Updating items...\n');
  for (const item of toKeep) {
    const { error } = await supabase
      .from('canonical_items')
      .update({
        canonical_name: item.cleaned_name,
        aliases: item.clean_aliases,
        category: item.correct_category,
      })
      .eq('id', item.original_id);

    if (error) {
      console.error(`❌ Error updating ${item.original_id}:`, error.message);
    } else {
      updated++;
      if (updated % 50 === 0) {
        console.log(`   Updated ${updated}/${toKeep.length}...`);
      }
    }
  }

  console.log(`✅ Updated ${updated} items\n`);

  // 2. Handle merges
  console.log('🔄 Processing merges...\n');

  // Build merge map: which items to merge into which
  const mergeMap = new Map<string, string[]>();

  for (const item of toMerge) {
    const targetName = item.merge_into!;
    // Find the target canonical item by name
    const { data: targetItems } = await supabase
      .from('canonical_items')
      .select('id, canonical_name')
      .eq('canonical_name', targetName)
      .limit(1);

    if (targetItems && targetItems.length > 0) {
      const targetId = targetItems[0].id;

      // Update all recipe_ingredients that point to the old item
      const { error } = await supabase
        .from('recipe_ingredients')
        .update({ canonical_item_id: targetId })
        .eq('canonical_item_id', item.original_id);

      if (error) {
        console.error(`❌ Error merging ${item.original_id} → ${targetId}:`, error.message);
      } else {
        // Now delete the old item
        const { error: deleteError } = await supabase
          .from('canonical_items')
          .delete()
          .eq('id', item.original_id);

        if (deleteError) {
          console.error(`❌ Error deleting merged item ${item.original_id}:`, deleteError.message);
        } else {
          merged++;
          console.log(`   ✓ Merged "${item.cleaned_name}" → "${targetName}"`);
        }
      }
    } else {
      console.warn(`⚠️  Could not find merge target "${targetName}" for ${item.original_id}`);
    }
  }

  console.log(`✅ Merged ${merged} items\n`);

  // 3. Delete non-ingredient items
  console.log('🗑️  Deleting non-ingredients...\n');
  for (const item of toDelete) {
    // First, clear any references in recipe_ingredients
    await supabase
      .from('recipe_ingredients')
      .update({ canonical_item_id: null })
      .eq('canonical_item_id', item.original_id);

    // Then delete the item
    const { error } = await supabase
      .from('canonical_items')
      .delete()
      .eq('id', item.original_id);

    if (error) {
      console.error(`❌ Error deleting ${item.original_id}:`, error.message);
    } else {
      deleted++;
      console.log(`   ✓ Deleted "${item.cleaned_name}" (${item.reason})`);
    }
  }

  console.log(`✅ Deleted ${deleted} items\n`);

  // Summary
  console.log('📊 FINAL SUMMARY:');
  console.log(`   Updated: ${updated}`);
  console.log(`   Merged: ${merged}`);
  console.log(`   Deleted: ${deleted}`);
  console.log(`   Total changes: ${updated + merged + deleted}\n`);

  // Get final count
  const { count } = await supabase
    .from('canonical_items')
    .select('*', { count: 'exact', head: true });

  console.log(`✅ Cleanup complete! Final canonical items count: ${count}`);
}

applyCanonicalCleanup().catch(console.error);
