import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkItems() {
  const terms = ['yogurt', 'apple', 'whipped', 'pancake', 'squash'];

  for (const term of terms) {
    const { data } = await supabase
      .from('canonical_items')
      .select('canonical_name, aliases')
      .or(`canonical_name.ilike.%${term}%,aliases.cs.{${term}}`);

    console.log(`\n${term.toUpperCase()}:`);
    if (data && data.length > 0) {
      data.forEach(item => {
        const aliases = item.aliases?.join(', ') || 'none';
        console.log(`  - ${item.canonical_name} (aliases: ${aliases})`);
      });
    } else {
      console.log('  (no matches)');
    }
  }
}

checkItems().catch(console.error);
