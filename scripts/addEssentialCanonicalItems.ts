import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Curated list of essential missing canonical items
const essentialItems = [
  // PRODUCE
  { name: 'apples', category: 'produce', aliases: ['apple'] },
  { name: 'bananas', category: 'produce', aliases: ['banana'] },
  { name: 'grapes', category: 'produce', aliases: [] },
  { name: 'mushrooms', category: 'produce', aliases: [] },
  { name: 'lettuce', category: 'produce', aliases: [] },
  { name: 'cabbage', category: 'produce', aliases: [] },
  { name: 'zucchini', category: 'produce', aliases: [] },
  { name: 'eggplant', category: 'produce', aliases: [] },
  { name: 'cauliflower', category: 'produce', aliases: [] },
  { name: 'asparagus', category: 'produce', aliases: [] },
  { name: 'brussels sprouts', category: 'produce', aliases: [] },
  { name: 'kale', category: 'produce', aliases: [] },
  { name: 'collard greens', category: 'produce', aliases: ['collards'] },
  { name: 'chard', category: 'produce', aliases: ['swiss chard'] },
  { name: 'romaine lettuce', category: 'produce', aliases: ['romaine'] },
  { name: 'iceberg lettuce', category: 'produce', aliases: [] },
  { name: 'acorn squash', category: 'produce', aliases: [] },
  { name: 'yams', category: 'produce', aliases: [] },
  { name: 'cantaloupe', category: 'produce', aliases: [] },
  { name: 'mangos', category: 'produce', aliases: ['mango'] },
  { name: 'pineapple', category: 'produce', aliases: [] },
  { name: 'apricots', category: 'produce', aliases: [] },
  { name: 'figs', category: 'produce', aliases: [] },
  { name: 'dates', category: 'produce', aliases: [] },
  { name: 'cherries', category: 'produce', aliases: [] },
  { name: 'cucumber', category: 'produce', aliases: [] },
  { name: 'jalapeño', category: 'produce', aliases: ['jalapeno'] },
  { name: 'plantains', category: 'produce', aliases: ['plantain'] },
  { name: 'tomatillos', category: 'produce', aliases: [] },
  { name: 'bean sprouts', category: 'produce', aliases: [] },
  { name: 'pumpkin puree', category: 'produce', aliases: ['pumpkin'] },

  // PROTEIN
  { name: 'catfish', category: 'protein', aliases: ['catfish fillets'] },
  { name: 'tilapia', category: 'protein', aliases: ['tilapia fillets'] },
  { name: 'cod', category: 'protein', aliases: ['cod fillets'] },
  { name: 'haddock', category: 'protein', aliases: ['haddock fillets'] },
  { name: 'pollock', category: 'protein', aliases: [] },
  { name: 'salmon', category: 'protein', aliases: ['salmon fillets'] },
  { name: 'tuna', category: 'protein', aliases: [] },
  { name: 'trout', category: 'protein', aliases: ['trout fillets'] },
  { name: 'walleye', category: 'protein', aliases: ['walleye fillets'] },
  { name: 'ham', category: 'protein', aliases: ['deli ham', 'ham slices'] },
  { name: 'tofu', category: 'protein', aliases: [] },
  { name: 'skirt steak', category: 'protein', aliases: [] },

  // CANNED
  { name: 'black beans', category: 'canned', aliases: [] },
  { name: 'kidney beans', category: 'canned', aliases: [] },
  { name: 'pinto beans', category: 'canned', aliases: [] },
  { name: 'lima beans', category: 'canned', aliases: [] },
  { name: 'white beans', category: 'canned', aliases: ['cannellini beans', 'great northern beans'] },
  { name: 'refried beans', category: 'canned', aliases: [] },
  { name: 'lentils', category: 'canned', aliases: ['dried lentils', 'red lentils'] },
  { name: 'hominy', category: 'canned', aliases: [] },
  { name: 'corn', category: 'canned', aliases: ['whole kernel corn', 'cream-style corn'] },
  { name: 'green chiles', category: 'canned', aliases: ['diced green chiles'] },

  // DAIRY
  { name: 'cheddar cheese', category: 'dairy', aliases: [] },
  { name: 'monterey jack cheese', category: 'dairy', aliases: [] },
  { name: 'mozzarella cheese', category: 'dairy', aliases: [] },
  { name: 'cottage cheese', category: 'dairy', aliases: [] },
  { name: 'blue cheese', category: 'dairy', aliases: [] },

  // GRAINS
  { name: 'macaroni', category: 'grains', aliases: ['elbow macaroni'] },
  { name: 'egg noodles', category: 'grains', aliases: [] },
  { name: 'spaghetti', category: 'grains', aliases: [] },
  { name: 'fettuccine', category: 'grains', aliases: [] },
  { name: 'penne', category: 'grains', aliases: [] },
  { name: 'rotini', category: 'grains', aliases: [] },
  { name: 'orzo', category: 'grains', aliases: [] },
  { name: 'couscous', category: 'grains', aliases: [] },
  { name: 'bulgur', category: 'grains', aliases: [] },
  { name: 'quinoa', category: 'grains', aliases: [] },
  { name: 'barley', category: 'grains', aliases: ['pearl barley'] },
  { name: 'oats', category: 'grains', aliases: ['oatmeal', 'quick oats', 'old-fashioned oats'] },
  { name: 'ramen noodles', category: 'grains', aliases: [] },
  { name: 'tortillas', category: 'grains', aliases: ['wheat tortillas', 'whole wheat tortillas'] },
  { name: 'english muffins', category: 'grains', aliases: [] },
  { name: 'buns', category: 'grains', aliases: [] },

  // CONDIMENTS
  { name: 'barbecue sauce', category: 'condiments', aliases: ['bbq sauce'] },
  { name: 'ranch dressing', category: 'condiments', aliases: [] },
  { name: 'italian dressing', category: 'condiments', aliases: [] },
  { name: 'vinaigrette', category: 'condiments', aliases: [] },
  { name: 'salsa', category: 'condiments', aliases: ['chunky salsa'] },
  { name: 'mustard', category: 'condiments', aliases: ['prepared mustard'] },

  // OTHER
  { name: 'marshmallows', category: 'other', aliases: ['miniature marshmallows'] },
  { name: 'chocolate chips', category: 'other', aliases: [] },
  { name: 'chocolate syrup', category: 'other', aliases: [] },
  { name: 'margarine', category: 'other', aliases: [] },
  { name: 'shortening', category: 'other', aliases: [] },
  { name: 'molasses', category: 'other', aliases: [] },
  { name: 'coconut', category: 'other', aliases: ['flaked coconut', 'coconut flakes'] },
  { name: 'peanuts', category: 'other', aliases: ['dry roasted peanuts'] },
  { name: 'sunflower seeds', category: 'other', aliases: [] },
  { name: 'pumpkin pie spice', category: 'other', aliases: [] },
  { name: 'apple pie spice', category: 'other', aliases: [] },
  { name: 'ice cubes', category: 'other', aliases: [] },
];

async function addEssentialCanonicalItems() {
  console.log('🎯 Adding essential missing canonical items...\n');

  let added = 0;
  let skipped = 0;

  for (const item of essentialItems) {
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
  console.log(`   Total canonical items now: ${256 + added}`);

  console.log('\n✅ Done! Now re-run intelligentIngredientMatcher.ts to link ingredients.');
}

addEssentialCanonicalItems().catch(console.error);
