/**
 * ANALYSIS OF 662 REMAINING UNMATCHED INGREDIENTS
 *
 * BREAKDOWN BY CATEGORY:
 *
 * 1. JUNK - Section Headers & Formatting (~200 items, 30%)
 *    - "For the Dressing", "For the Salad:", "Topping:", "Filling:", "Crust:"
 *    - ")", "s)", "each)", "per serving)", ". packages"
 *    - "fresh", "grated", "chopped", "sliced", "diced", "boneless", "quartered"
 *    - "aluminum foil", "craft sticks", "bamboo skewers", "toothpicks", "wooden sticks"
 *    - "Note: ...", "Optional toppings", "Other Necessary Tools/Equipment"
 *
 * 2. "S " PREFIX PARSER BUG (~150 items, 23%)
 *    - "s apricot spread", "s navy", "s mixed vegetables", "s hot chocolate mix"
 *    - "s halved", "s chopped", "s diced", "s cubed"
 *    - "s Chili and Spice Seasoning", "s Southwest chipotle seasoning"
 *    - "s frozen mixed vegetables", "s) instant pudding mix"
 *
 * 3. EUROPEAN/INTERNATIONAL RECIPES (~120 items, 18%)
 *    British/European measurements and ingredients from TheMealDB:
 *    - "g Puff Pastry", "g Linguine Pasta", "g Black Olives", "g Prawns"
 *    - "tbs Tomato Puree", "tbls Sunflower Oil", "tblsp Harissa Spice"
 *    - UK-specific: "Courgettes" (zucchini), "Aubergine" (eggplant), "Swede" (rutabaga)
 *    - "Rocket" (arugula), "Digestive Biscuits", "Black Treacle", "Creme Fraiche"
 *    - Exotic: "Doubanjiang", "Massaman curry paste", "Khus khus", "Toor dal"
 *
 * 4. BRAND/PROPRIETARY (~10 items, 2%)
 *    - "Eating Smart Seasoning Mix" (x4)
 *    - "Better Baking Mix" (x4)
 *    - "Basic Soup and Sauce Mix"
 *    - "Pico de Gallo"
 *
 * 5. LEGITIMATE MISSING ITEMS (~100 items, 15%)
 *    Worth adding to canonical items:
 *
 *    PRODUCE:
 *    - papaya chunks
 *    - kiwi/kiwifruit
 *    - clementines
 *    - bamboo shoots
 *    - anaheim chili
 *    - spanish onion
 *    - savoy cabbage
 *    - ham hocks
 *
 *    CONDIMENTS & SAUCES:
 *    - marinara sauce
 *    - teriyaki sauce
 *    - enchilada sauce
 *    - sweet pickle relish
 *    - apricot jam/spread
 *    - strawberry preserves
 *    - guacamole
 *
 *    CHEESE:
 *    - gorgonzola cheese
 *
 *    GRAINS/PASTA:
 *    - tortellini
 *    - semolina
 *    - fusilli pasta
 *
 *    PROTEIN:
 *    - perch fillets
 *    - egg substitute
 *
 *    OTHER:
 *    - matzo meal
 *    - masa harina
 *    - fruit cocktail
 *    - rhubarb
 *    - granola
 *    - prunes
 *    - wheat berries
 *
 * 6. DIET MODIFIERS NOT CAUGHT (~20 items, 3%)
 *    - "nonfat or low-fat plain yogurt"
 *    - "low-fat strawberry yogurt"
 *    - "fat-free fruit-flavored yogurt"
 *    - "plain fat free yogurt"
 *    - "reduced-fat Italian blend cheese"
 *
 * 7. COMPLEX DESCRIPTIONS (~60 items, 9%)
 *    - "1 carrot, large, sliced"
 *    - "1 banana, medium, very ripe, (peeled)"
 *    - "100% apple juice or white grape juice"
 *    - "slider-sized bun or whole wheat English muffin"
 *    - "reserved juice from tropical fruit salad"
 *
 * RECOMMENDATION:
 * - Add ~30-40 high-frequency legitimate items (category 5)
 * - The rest (junk, s prefix, European, complex) can be handled by Gemini or left unmatched
 * - This would push match rate from 94.2% to ~96-97%
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// High-frequency legitimate items worth adding
const worthwhileItems = [
  // PRODUCE
  { name: 'papaya', category: 'produce', aliases: ['papaya chunks'] },
  { name: 'kiwi', category: 'produce', aliases: ['kiwifruit', 'kiwifruits'] },
  { name: 'clementines', category: 'produce', aliases: ['clementine sections'] },
  { name: 'bamboo shoots', category: 'produce', aliases: [] },
  { name: 'anaheim chili', category: 'produce', aliases: ['anaheim chile'] },
  { name: 'rhubarb', category: 'produce', aliases: ['rhubarb pieces', 'chopped rhubarb'] },
  { name: 'savoy cabbage', category: 'produce', aliases: ['savoy'] },

  // PROTEIN
  { name: 'ham hocks', category: 'protein', aliases: ['smoked ham hocks'] },
  { name: 'perch', category: 'protein', aliases: ['perch fillets'] },
  { name: 'stew meat', category: 'protein', aliases: [] },
  { name: 'chuck steak', category: 'protein', aliases: ['boneless chuck steak'] },
  { name: 'round steak', category: 'protein', aliases: [] },
  { name: 'egg substitute', category: 'dairy', aliases: [] },

  // CONDIMENTS & SAUCES
  { name: 'marinara sauce', category: 'condiments', aliases: [] },
  { name: 'teriyaki sauce', category: 'condiments', aliases: [] },
  { name: 'enchilada sauce', category: 'condiments', aliases: ['green enchilada sauce', 'red enchilada sauce'] },
  { name: 'sweet pickle relish', category: 'condiments', aliases: ['pickle relish'] },
  { name: 'apricot jam', category: 'condiments', aliases: ['apricot spread'] },
  { name: 'strawberry preserves', category: 'condiments', aliases: [] },
  { name: 'raspberry jam', category: 'condiments', aliases: [] },
  { name: 'guacamole', category: 'condiments', aliases: [] },

  // CHEESE
  { name: 'gorgonzola', category: 'dairy', aliases: ['gorgonzola cheese', 'crumbled gorgonzola'] },

  // GRAINS/PASTA
  { name: 'tortellini', category: 'grains', aliases: [] },
  { name: 'semolina', category: 'grains', aliases: [] },
  { name: 'fusilli', category: 'grains', aliases: ['fusilli pasta'] },

  // OTHER
  { name: 'matzo meal', category: 'other', aliases: [] },
  { name: 'masa harina', category: 'other', aliases: [] },
  { name: 'fruit cocktail', category: 'other', aliases: ['tropical fruit salad'] },
  { name: 'granola', category: 'other', aliases: ['granola cereal'] },
  { name: 'prunes', category: 'other', aliases: [] },
  { name: 'wheat berries', category: 'other', aliases: [] },
  { name: 'edamame', category: 'other', aliases: ['shelled edamame'] },
  { name: 'artichoke hearts', category: 'canned', aliases: ['canned artichoke hearts', 'quartered artichoke hearts'] },
  { name: 'kalamata olives', category: 'canned', aliases: ['pitted kalamata olives'] },
];

async function addWorthwhileItems() {
  console.log('🎯 Adding worthwhile items from 662 analysis...\n');

  let added = 0;
  let skipped = 0;

  for (const item of worthwhileItems) {
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
  console.log(`   Total in list: ${worthwhileItems.length}`);

  console.log('\n✅ Done! Re-run intelligentIngredientMatcher.ts to link ingredients.');
}

addWorthwhileItems().catch(console.error);
