const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const itemsToCheck = [
  'eggs',
  'butter',
  'rice',
  'soy sauce',
  'gochujang',
  'green onion',
  'jalapeno',
  'celery',
  'bread',
  'cheese',
  'parsley',
  'stock',
  'watermelon',
];

async function checkItems() {
  console.log('🔍 Checking if common ingredients exist in canonical_items...\n');

  for (const item of itemsToCheck) {
    const { data, error } = await supabase
      .from('canonical_items')
      .select('id, name, aliases')
      .or(`name.eq.${item},aliases.cs.{${item}}`);

    if (error) {
      console.error(`❌ Error checking "${item}":`, error);
      continue;
    }

    if (data && data.length > 0) {
      console.log(`✅ "${item}" found:`, {
        name: data[0].name,
        aliases: data[0].aliases,
      });
    } else {
      console.log(`❌ "${item}" NOT FOUND`);
    }
  }
}

checkItems();
