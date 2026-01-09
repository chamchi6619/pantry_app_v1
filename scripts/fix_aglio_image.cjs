const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixAglioImage() {
  console.log('Fixing Aglio e Olio image_url...');

  const recipeId = '47191eab-9597-462a-b720-7d448b8af7cf';

  // Update the image_url to NULL
  const { data, error } = await supabase
    .from('recipe_database')
    .update({
      image_url: null
    })
    .eq('id', recipeId)
    .select();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('✅ Successfully updated image_url to NULL');
  console.log('Recipe:', data);
  console.log('\nThe app will now use the fallback placeholder image for this recipe.');
}

fixAglioImage();
