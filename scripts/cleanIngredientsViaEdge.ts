import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function cleanAllIngredients() {
  console.log('🧹 Starting ingredient cleanup via Edge Function...\n');

  // Get total count
  const { count } = await supabase
    .from('recipe_ingredients')
    .select('*', { count: 'exact', head: true });

  console.log(`📊 Total ingredients to clean: ${count}\n`);

  const BATCH_SIZE = 50; // Ingredients per Gemini API call
  const LIMIT_PER_CALL = 100; // Process 100 at a time (2 batches), then repeat
  let offset = 0;
  let totalProcessed = 0;
  let totalMatched = 0;

  while (offset < count!) {
    console.log(`\n🔄 Processing batch starting at offset ${offset}...`);

    try {
      const { data, error } = await supabase.functions.invoke('clean-ingredients', {
        body: {
          batch_size: BATCH_SIZE,
          offset: offset,
          limit: Math.min(LIMIT_PER_CALL, count! - offset)
        }
      });

      if (error) {
        console.error('❌ Error:', error);
        break;
      }

      if (data.success) {
        console.log(`✅ Batch complete:`);
        console.log(`   Total: ${data.stats.total}`);
        console.log(`   Matched: ${data.stats.matched} (${Math.round(data.stats.matched/data.stats.total*100)}%)`);
        console.log(`   Unmatched: ${data.stats.unmatched}`);
        console.log(`   Updated: ${data.stats.updated}`);
        console.log(`   Avg confidence: ${data.stats.avg_confidence.toFixed(2)}`);

        totalProcessed += data.stats.total;
        totalMatched += data.stats.matched;
        offset = data.next_offset;
      } else {
        console.error('❌ Batch failed:', data.error);
        break;
      }

    } catch (error) {
      console.error('❌ Error calling Edge Function:', error);
      break;
    }
  }

  console.log('\n📊 Final Summary:');
  console.log(`   Total processed: ${totalProcessed}/${count}`);
  console.log(`   Total matched: ${totalMatched} (${Math.round(totalMatched/totalProcessed*100)}%)`);
  console.log('\n✅ Cleanup complete!');
}

cleanAllIngredients().catch(console.error);
