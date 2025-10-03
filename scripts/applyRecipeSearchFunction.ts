import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function applyMigration() {
  console.log('📦 Applying recipe search function migration...\n');

  const migrationPath = join(__dirname, '../backend/supabase/migrations/20251003191840_create_recipe_search_function.sql');
  const sql = readFileSync(migrationPath, 'utf-8');

  console.log('Executing SQL...');
  const { data, error } = await supabase.rpc('exec_sql', { sql });

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log('✅ Migration applied successfully!');
  console.log('\nYou can now test the function with:');
  console.log('SELECT * FROM search_recipes_by_canonical_items(ARRAY[\'your-uuid-here\']::UUID[], 70, 3, 20);');
}

applyMigration().catch(console.error);
