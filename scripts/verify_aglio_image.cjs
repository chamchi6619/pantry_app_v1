const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyAglioImage() {
  const recipeId = '47191eab-9597-462a-b720-7d448b8af7cf';

  const { data, error } = await supabase
    .from('recipe_database')
    .select('id, title, image_url, image_source, image_photographer, category')
    .eq('id', recipeId)
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Aglio e Olio Recipe:');
  console.log(JSON.stringify(data, null, 2));

  if (data.image_url) {
    console.log('\nImage URL type:', typeof data.image_url);
    console.log('Image URL length:', data.image_url.length);
  }
}

verifyAglioImage();
