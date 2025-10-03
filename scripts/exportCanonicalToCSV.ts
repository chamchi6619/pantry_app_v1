import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function exportToCSV() {
  console.log('📊 Exporting canonical items to CSV...\n');

  const { data: items, count } = await supabase
    .from('canonical_items')
    .select('canonical_name, aliases, category')
    .order('category, canonical_name');

  if (!items) {
    console.error('No items found');
    return;
  }

  console.log(`✓ Loaded ${count} canonical items\n`);

  // Create CSV
  const csv: string[] = [];
  csv.push('Canonical Name,Category,Aliases');

  items.forEach(item => {
    const aliases = item.aliases?.join('; ') || '';
    const row = `"${item.canonical_name}","${item.category}","${aliases}"`;
    csv.push(row);
  });

  const csvContent = csv.join('\n');
  fs.writeFileSync('canonical_items.csv', csvContent);

  console.log('✅ Exported to: canonical_items.csv');

  // Also create a categorized view
  const categories: { [key: string]: any[] } = {};
  items.forEach(item => {
    const cat = item.category || 'uncategorized';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(item);
  });

  console.log('\n📊 Breakdown by category:');
  Object.entries(categories)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([cat, items]) => {
      console.log(`   ${cat}: ${items.length} items`);
    });

  // Create readable text file
  const textLines: string[] = [];
  textLines.push('CANONICAL ITEMS LIST');
  textLines.push('===================\n');

  Object.entries(categories)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([cat, items]) => {
      textLines.push(`\n## ${cat.toUpperCase()} (${items.length} items)\n`);
      items.forEach((item: any) => {
        textLines.push(`- ${item.canonical_name}`);
        if (item.aliases && item.aliases.length > 0) {
          textLines.push(`  Aliases: ${item.aliases.join(', ')}`);
        }
      });
    });

  fs.writeFileSync('canonical_items.txt', textLines.join('\n'));
  console.log('✅ Exported to: canonical_items.txt\n');
}

exportToCSV().catch(console.error);
