import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function inspectCanonical() {
  const { data, error, count } = await supabase
    .from('canonical_items')
    .select('canonical_name, aliases, category', { count: 'exact' })
    .order('canonical_name');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`\n📊 Total canonical items: ${count}\n`);
  console.log('First 50 items:\n');

  data?.slice(0, 50).forEach((item, i) => {
    const aliases = item.aliases?.join(', ') || 'none';
    console.log(`${i + 1}. ${item.canonical_name}`);
    console.log(`   Category: ${item.category || 'uncategorized'}`);
    console.log(`   Aliases: ${aliases}\n`);
  });

  // Check for potential quality issues
  console.log('\n🔍 Quality check:');
  const noCategory = data?.filter(i => !i.category).length || 0;
  const noAliases = data?.filter(i => !i.aliases || i.aliases.length === 0).length || 0;
  console.log(`   Items without category: ${noCategory}`);
  console.log(`   Items without aliases: ${noAliases}`);
}

inspectCanonical().catch(console.error);
