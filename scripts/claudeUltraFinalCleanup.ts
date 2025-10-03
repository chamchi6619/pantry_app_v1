import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const data = JSON.parse(fs.readFileSync('canonical-for-claude-analysis.json', 'utf-8'));

interface CleanupAction {
  id: string;
  oldName: string;
  newName: string;
  newAliases: string[];
  newCategory: string;
  action: 'update' | 'delete' | 'merge';
  mergeInto?: string;
  reason: string;
}

const actions: CleanupAction[] = [];

// Process each item
data.forEach((item: any) => {
  const name = item.name;
  const id = item.id;

  // 1. MERGE: Chickpeas preparation
  if (name === 'chickpeas drained and rinsed') {
    actions.push({
      id,
      oldName: name,
      newName: 'chickpeas',
      newAliases: [],
      newCategory: item.category,
      action: 'update',
      mergeInto: 'chickpeas',
      reason: 'Remove preparation instruction - just use base item'
    });
    return;
  }

  // 2. MERGE: Dairy temperature/state variations
  const dairyMergeMap: { [key: string]: string } = {
    'chilled heavy cream': 'heavy cream',
  };

  if (dairyMergeMap[name]) {
    actions.push({
      id,
      oldName: name,
      newName: dairyMergeMap[name],
      newAliases: [],
      newCategory: item.category,
      action: 'merge',
      mergeInto: dairyMergeMap[name],
      reason: 'Temperature state - merge into base item'
    });
    return;
  }

  // 3. MERGE: Protein preparation states
  const proteinMergeMap: { [key: string]: string } = {
    'littleneck clams, scrubbed': 'littleneck clams',
    'shrimp, peeled and deveined': 'shrimp',
    'skin-on, bone-in chicken thighs': 'chicken thighs',
    'skinless, boneless chicken breasts': 'chicken breasts',
    'skinless, boneless chicken thighs': 'chicken thighs',
  };

  if (proteinMergeMap[name]) {
    actions.push({
      id,
      oldName: name,
      newName: proteinMergeMap[name],
      newAliases: [],
      newCategory: item.category,
      action: 'merge',
      mergeInto: proteinMergeMap[name],
      reason: 'Preparation state - merge into base protein'
    });
    return;
  }

  // 4. MERGE: Produce preparation states that still remain
  const produceCleanup: { [key: string]: string } = {
    'green beans, trimmed': 'green beans',
    'radishes trimmed thinly': 'radishes',
    'serrano chile, thinly sliced': 'serrano chile',
    'serrano chiles': 'serrano chile',
  };

  if (produceCleanup[name]) {
    actions.push({
      id,
      oldName: name,
      newName: produceCleanup[name],
      newAliases: [],
      newCategory: item.category,
      action: 'merge',
      mergeInto: produceCleanup[name],
      reason: 'Preparation state - merge into base produce'
    });
    return;
  }

  // 5. MERGE: Spices preparation states
  const spiceCleanup: { [key: string]: string } = {
    'guajillo chiles, seeds removed': 'guajillo chiles',
  };

  if (spiceCleanup[name]) {
    actions.push({
      id,
      oldName: name,
      newName: spiceCleanup[name],
      newAliases: [],
      newCategory: item.category,
      action: 'merge',
      mergeInto: spiceCleanup[name],
      reason: 'Preparation state - merge into base spice'
    });
    return;
  }

  // 6. CREATE: Add base items if they don't exist
  // We'll check for these after merge attempts fail
});

// Save cleanup plan
fs.writeFileSync('claude-ultra-final-cleanup-plan.json', JSON.stringify(actions, null, 2));

console.log('✅ Ultra-final cleanup plan generated!');
console.log(`   Total actions: ${actions.length}`);
console.log(`   Updates: ${actions.filter(a => a.action === 'update').length}`);
console.log(`   Merges: ${actions.filter(a => a.action === 'merge').length}`);
console.log(`   Deletes: ${actions.filter(a => a.action === 'delete').length}`);
console.log('\n📄 Saved to: claude-ultra-final-cleanup-plan.json');
console.log('\nRun applyUltraFinalCleanup.ts to apply these changes.');
