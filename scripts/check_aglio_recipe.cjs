const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAglioRecipe() {
  const { data, error } = await supabase
    .from('recipe_database')
    .select('id, title, image_url, category')
    .ilike('title', '%aglio%')
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Found recipes:');
  console.log(JSON.stringify(data, null, 2));
}

checkAglioRecipe();
