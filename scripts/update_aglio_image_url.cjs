const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateAglioImageUrl() {
  console.log('Updating Aglio e Olio image_url...');

  const recipeId = '47191eab-9597-462a-b720-7d448b8af7cf';
  const imageUrl = 'https://replicate.delivery/xezq/ozpLeugc6x3ieEWssGJnAODuuUDsR3WB4MkMcwkOTSGyjakVA/tmpf7my1eoi.webp';

  // Update the image_url
  const { data, error } = await supabase
    .from('recipe_database')
    .update({
      image_url: imageUrl
    })
    .eq('id', recipeId)
    .select('id, title, image_url, image_source, image_photographer');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('✅ Successfully updated image_url');
  console.log('Recipe:');
  console.log(JSON.stringify(data, null, 2));
}

updateAglioImageUrl();
