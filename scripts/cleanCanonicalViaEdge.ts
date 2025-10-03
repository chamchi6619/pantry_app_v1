import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function cleanCanonicalItems() {
  console.log('🧹 Starting canonical items cleanup via Edge Function...\n');

  // Get total count
  const { count } = await supabase
    .from('canonical_items')
    .select('*', { count: 'exact', head: true });

  console.log(`📊 Total canonical items: ${count}\n`);

  const BATCH_SIZE = 50;
  let offset = 0;
  const allResults: any[] = [];

  while (offset < count!) {
    console.log(`\n🔄 Processing batch starting at offset ${offset}...`);

    try {
      const { data, error } = await supabase.functions.invoke('clean-canonical-items', {
        body: {
          batch_size: BATCH_SIZE,
          offset: offset,
        }
      });

      if (error) {
        console.error('❌ Error:', error);
        break;
      }

      if (data.success) {
        console.log(`✅ Batch complete:`);
        console.log(`   Total: ${data.stats.total}`);
        console.log(`   Keep: ${data.stats.keep}`);
        console.log(`   Merge: ${data.stats.merge}`);
        console.log(`   Delete: ${data.stats.delete}`);

        allResults.push(...data.cleaned_items);
        offset += BATCH_SIZE;
      } else {
        console.error('❌ Batch failed:', data.error);
        break;
      }

    } catch (error) {
      console.error('❌ Error calling Edge Function:', error);
      break;
    }

    // Rate limit
    await sleep(2000);
  }

  // Save complete results
  fs.writeFileSync(
    'canonical-cleanup-plan.json',
    JSON.stringify(allResults, null, 2)
  );

  console.log('\n📊 Final Summary:');
  console.log(`   Total processed: ${allResults.length}`);
  console.log(`   Keep: ${allResults.filter(r => r.action === 'keep').length}`);
  console.log(`   Merge: ${allResults.filter(r => r.action === 'merge').length}`);
  console.log(`   Delete: ${allResults.filter(r => r.action === 'delete').length}`);
  console.log('\n💾 Results saved to: canonical-cleanup-plan.json');
  console.log('\n⚠️  Review the plan before applying changes!');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

cleanCanonicalItems().catch(console.error);
