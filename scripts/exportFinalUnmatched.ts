import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function exportFinalUnmatched() {
  console.log('📤 Exporting final unmatched ingredients...\n');

  // Get unmatched ingredients
  const { data: ingredients, count } = await supabase
    .from('recipe_ingredients')
    .select('ingredient_name, notes', { count: 'exact' })
    .is('canonical_item_id', null);

  if (!ingredients) {
    console.error('❌ Failed to fetch ingredients');
    return;
  }

  console.log(`Found ${count} unmatched ingredients\n`);

  // Extract names
  const names = ingredients.map(ing => ing.ingredient_name || ing.notes || '').filter(Boolean);

  // Save to file
  fs.writeFileSync(
    'scripts/final-unmatched-662.json',
    JSON.stringify(names, null, 2)
  );

  console.log(`✅ Saved to: scripts/final-unmatched-662.json`);
  console.log(`\n📊 Current match rate: ${((11506 - count!) / 11506 * 100).toFixed(1)}%`);
  console.log(`   Matched: ${11506 - count!}`);
  console.log(`   Unmatched: ${count}`);
  console.log(`   Total canonical items: 387`);
}

exportFinalUnmatched().catch(console.error);
