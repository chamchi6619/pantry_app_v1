import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function analyzeAndExport() {
  console.log('📊 Loading all canonical items for analysis...\n');

  const { data: items } = await supabase
    .from('canonical_items')
    .select('id, canonical_name, aliases, category')
    .order('canonical_name');

  if (!items) {
    console.error('No items found');
    return;
  }

  console.log(`✓ Loaded ${items.length} canonical items\n`);

  // Export for Claude to analyze
  const dataForAnalysis = items.map(item => ({
    id: item.id,
    name: item.canonical_name,
    aliases: item.aliases || [],
    category: item.category
  }));

  fs.writeFileSync(
    'canonical-for-claude-analysis.json',
    JSON.stringify(dataForAnalysis, null, 2)
  );

  console.log('✅ Exported to: canonical-for-claude-analysis.json');
  console.log(`   Size: ${items.length} items`);
}

analyzeAndExport().catch(console.error);
