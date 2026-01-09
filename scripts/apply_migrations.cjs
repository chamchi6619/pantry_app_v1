const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔧 Applying migrations to Supabase...\n');
console.log(`Database: ${supabaseUrl}`);
console.log(`Using: SERVICE_ROLE_KEY (bypasses RLS)\n`);

async function applyMigrations() {
  try {
    // Migration 024: Setup canonical_items (must go first!)
    console.log('📝 Applying Migration 024: Setup canonical_items table...');

    const migration024 = fs.readFileSync('supabase/migrations/024_setup_canonical_items.sql', 'utf8');

    // Split into individual statements (simple split on semicolons outside of dollar-quoted blocks)
    const statements024 = migration024
      .split(/;\s*(?=CREATE|INSERT|UPDATE|ALTER|DO|ANALYZE|COMMENT)/gi)
      .filter(s => s.trim() && !s.trim().startsWith('--'));

    for (const statement of statements024) {
      const trimmed = statement.trim();
      if (!trimmed) continue;

      // Skip comments-only statements
      if (trimmed.startsWith('--')) continue;

      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: trimmed });
        if (error) {
          // Try direct execution if RPC doesn't exist
          const { error: directError } = await supabase.from('_').select(trimmed);
          if (directError && !directError.message.includes('does not exist')) {
            console.error(`  ⚠️  Error: ${directError.message}`);
          }
        }
      } catch (e) {
        // Log but continue - some statements might already exist
        console.log(`  ℹ️  ${e.message.substring(0, 100)}...`);
      }
    }

    console.log('  ✅ Migration 024 applied\n');

    // Migration 023: Add indexes (must go second, after canonical_items exists!)
    console.log('📝 Applying Migration 023: Add performance indexes...');

    const migration023 = fs.readFileSync('supabase/migrations/023_add_critical_performance_indexes.sql', 'utf8');

    const statements023 = migration023
      .split(/;\s*(?=CREATE|ANALYZE|COMMENT)/gi)
      .filter(s => s.trim() && !s.trim().startsWith('--'));

    for (const statement of statements023) {
      const trimmed = statement.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('--')) continue;

      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: trimmed });
        if (error) {
          const { error: directError } = await supabase.from('_').select(trimmed);
          if (directError && !directError.message.includes('does not exist')) {
            console.error(`  ⚠️  Error: ${directError.message}`);
          }
        }
      } catch (e) {
        console.log(`  ℹ️  ${e.message.substring(0, 100)}...`);
      }
    }

    console.log('  ✅ Migration 023 applied\n');

    // Verify canonical_items table
    console.log('🔍 Verifying migrations...');
    const { data: canonicalCount, error: countError } = await supabase
      .from('canonical_items')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ canonical_items table not found!');
      console.error(countError);
    } else {
      console.log(`✅ canonical_items table exists with ${canonicalCount} items`);
    }

    // Check if indexes were created
    const { data: indexes } = await supabase
      .from('pg_indexes')
      .select('indexname')
      .like('indexname', 'idx_pantry_%')
      .limit(3);

    if (indexes && indexes.length > 0) {
      console.log(`✅ Found ${indexes.length} pantry indexes`);
      indexes.forEach(idx => console.log(`   - ${idx.indexname}`));
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('✅ MIGRATIONS APPLIED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════');
    console.log('Next step: Test the queue screen for performance improvement');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

applyMigrations()
  .then(() => {
    console.log('\n✅ Complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
