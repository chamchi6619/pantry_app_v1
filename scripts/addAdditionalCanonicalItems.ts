import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Additional high-frequency items identified from remaining unmatched
const additionalItems = [
  // CONDIMENTS & SAUCES
  { name: 'whipped topping', category: 'other', aliases: ['lite whipped topping', 'frozen whipped topping'] },
  { name: 'pancake mix', category: 'grains', aliases: ['biscuit mix', 'baking mix'] },
  { name: 'angel food cake mix', category: 'other', aliases: ['cake mix'] },
  { name: 'italian seasoning', category: 'spices', aliases: ['italian herbs', 'italian herb seasoning', 'italian herb blend', 'italian herb mix'] },
  { name: 'adobo seasoning', category: 'spices', aliases: [] },
  { name: 'pie crust', category: 'other', aliases: ['unbaked pie crust'] },
  { name: 'cooking spray', category: 'condiments', aliases: ['nonstick cooking spray', 'non-stick cooking spray'] },

  // PRODUCE
  { name: 'yellow squash', category: 'produce', aliases: ['yellow summer squash', 'summer squash'] },
  { name: 'fennel', category: 'produce', aliases: ['fennel bulb'] },
  { name: 'jicama', category: 'produce', aliases: [] },
  { name: 'beets', category: 'produce', aliases: ['beetroot', 'whole beets', 'cooked beets'] },
  { name: 'turnips', category: 'produce', aliases: [] },
  { name: 'parsnips', category: 'produce', aliases: [] },
  { name: 'okra', category: 'produce', aliases: ['okra pods', 'fresh okra'] },

  // DAIRY & ALTERNATIVES
  { name: 'vanilla yogurt', category: 'dairy', aliases: [] },
  { name: 'american cheese', category: 'dairy', aliases: [] },

  // GRAINS & PASTA
  { name: 'pasta shells', category: 'grains', aliases: ['large pasta shells', 'jumbo pasta shells', 'whole wheat pasta shells'] },
  { name: 'bow-tie pasta', category: 'grains', aliases: ['bowtie pasta', 'farfalle'] },
  { name: 'lasagna noodles', category: 'grains', aliases: ['lasagne sheets', 'dry lasagna noodles'] },
  { name: 'whole wheat pasta', category: 'grains', aliases: ['whole-wheat pasta', 'whole grain pasta'] },
  { name: 'bran cereal', category: 'grains', aliases: ['bran flakes', 'raisin bran', '100% bran cereal'] },
  { name: 'whole grain cereal', category: 'grains', aliases: ['whole-grain cereal', 'unsweetened whole grain cereal'] },

  // CANNED & JARRED
  { name: 'cream of mushroom soup', category: 'canned', aliases: ['condensed cream of mushroom soup'] },
  { name: 'tomato soup', category: 'canned', aliases: [] },
  { name: 'clams', category: 'protein', aliases: ['canned clams'] },
  { name: 'sardines', category: 'protein', aliases: [] },
  { name: 'grape juice', category: 'beverages', aliases: ['white grape juice'] },
  { name: 'cranberry juice', category: 'beverages', aliases: [] },
  { name: 'cranberry sauce', category: 'condiments', aliases: ['whole cranberry sauce'] },

  // OTHER
  { name: 'marshmallows', category: 'other', aliases: ['miniature marshmallows'] },
  { name: 'pudding mix', category: 'other', aliases: ['instant pudding mix', 'vanilla pudding'] },
  { name: 'gelatin', category: 'other', aliases: ['flavored gelatin', 'unflavored gelatin'] },
  { name: 'cracker crumbs', category: 'other', aliases: [] },
  { name: 'graham crackers', category: 'other', aliases: ['graham cracker rectangles'] },
  { name: 'pretzels', category: 'other', aliases: ['twist pretzels'] },
  { name: 'coffee', category: 'beverages', aliases: ['brewed coffee'] },
  { name: 'yeast', category: 'other', aliases: ['rapid rise yeast', 'active dry yeast'] },
  { name: 'marjoram', category: 'spices', aliases: ['dried marjoram'] },
  { name: 'hash browns', category: 'produce', aliases: ['frozen hash browns'] },
  { name: 'taco shells', category: 'grains', aliases: ['hard taco shells'] },
  { name: 'taco seasoning', category: 'spices', aliases: ['taco seasoning mix'] },
];

async function addAdditionalItems() {
  console.log('🎯 Adding additional canonical items...\n');

  let added = 0;
  let skipped = 0;

  for (const item of additionalItems) {
    // Check if item already exists
    const { data: existing } = await supabase
      .from('canonical_items')
      .select('id')
      .eq('canonical_name', item.name)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    // Add item
    const { error } = await supabase
      .from('canonical_items')
      .insert({
        canonical_name: item.name,
        category: item.category,
        aliases: item.aliases,
      });

    if (!error) {
      added++;
      console.log(`   ✓ Added: ${item.name} (${item.category})`);
    } else {
      console.error(`   ❌ Error adding ${item.name}:`, error.message);
    }
  }

  console.log(`\n📊 SUMMARY:`);
  console.log(`   Added: ${added}`);
  console.log(`   Skipped (already exist): ${skipped}`);
  console.log(`   Total in list: ${additionalItems.length}`);

  console.log('\n✅ Done! Now re-run intelligentIngredientMatcher.ts to link ingredients.');
}

addAdditionalItems().catch(console.error);
