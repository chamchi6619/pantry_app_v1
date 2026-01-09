const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Found' : 'NOT FOUND');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('Exporting recipes...');

  const { data, error } = await supabase
    .from('recipe_database')
    .select('id, title, category, image_url')
    .order('category', { ascending: true });

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  fs.writeFileSync('recipe_database_backup.json', JSON.stringify(data, null, 2));
  console.log(`✅ Exported ${data.length} recipes to recipe_database_backup.json`);
})();
