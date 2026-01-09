const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const missingItems = [
  { name: 'stock', category: 'pantry', aliases: ['broth', 'bouillon'] },
  { name: 'watermelon', category: 'produce', aliases: null },
  { name: 'brownie', category: 'dessert', aliases: null },
];

async function addMissingItems() {
  console.log('📝 Adding missing canonical items...\n');

  for (const item of missingItems) {
    const { data, error } = await supabase
      .from('canonical_items')
      .insert(item)
      .select();

    if (error) {
      if (error.code === '23505') {
        console.log(`⏭️  "${item.name}" already exists`);
      } else {
        console.error(`❌ Error adding "${item.name}":`, error.message);
      }
    } else {
      console.log(`✅ Added "${item.name}"${item.aliases ? ` (aliases: ${item.aliases.join(', ')})` : ''}`);
    }
  }

  console.log('\n✅ Done!');
}

addMissingItems();
