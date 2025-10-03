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

  // 1. DELETE: Orphaned preparation instructions
  if (name === 'thinly sliced') {
    actions.push({
      id,
      oldName: name,
      newName: '',
      newAliases: [],
      newCategory: item.category,
      action: 'delete',
      reason: 'Orphaned preparation instruction'
    });
    return;
  }

  // 2. MERGE: Parser artifacts to proper items
  const parserArtifacts: { [key: string]: string } = {
    'ofsalt': 'salt',
    'seasalt': 'sea salt',
  };

  if (parserArtifacts[name]) {
    actions.push({
      id,
      oldName: name,
      newName: parserArtifacts[name],
      newAliases: [],
      newCategory: item.category,
      action: 'merge',
      mergeInto: parserArtifacts[name],
      reason: 'Parser artifact - merge into proper item'
    });
    return;
  }

  // 3. MERGE: Preparation states to base items
  const prepMergeMap: { [key: string]: string } = {
    'eggbeaten': 'egg',
    'eggsbeaten': 'eggs',
    'celery stalks': 'celery',
    'clove garlic': 'garlic',
    'cloves garlic': 'garlic',
    'garlic clove': 'garlic',
    'garlic cloves': 'garlic',
    'garlic clove crushed': 'garlic',
    'garlic clove finely grated': 'garlic',
    'garlic cloves coarsely chopped': 'garlic',
    'head of garlic': 'garlic',
    'finely grated ginger': 'ginger',
    'finely grated peeled ginger': 'ginger',
    'grated ginger': 'ginger',
    'grated peeled ginger': 'ginger',
    'peeled ginger': 'ginger',
    'finely grated lemon rind': 'lemon zest',
    'finely grated lemon zest': 'lemon zest',
    'grated lemon zest': 'lemon zest',
    'finely grated lime zest': 'lime zest',
    'finely grated orange zest': 'orange zest',
    'strips orange zest': 'orange zest',
    'juice of 1 lemon': 'lemon juice',
    'juice of 1 lime': 'lime juice',
    'zest and juice of 1 lemon': 'lemon',
    'zest of 1 lemon': 'lemon zest',
    'pint cherry tomatoes': 'cherry tomatoes',
    'red onion thinly sliced': 'red onion',
    'red onion very thinly sliced': 'red onion',
    'scallions thinly sliced': 'scallions',
    'scallions thinly sliced on a diagonal': 'scallions',
    'thinly sliced scallions': 'scallions',
    'serrano chile, thinly sliced': 'serrano chile',
    'serrano chiles': 'serrano chile',
    'radishes trimmed thinly': 'radishes',
    'green beans, trimmed': 'green beans',
    'shrimp, peeled and deveined': 'shrimp',
    'littleneck clams, scrubbed': 'littleneck clams',
    'skin-on, bone-in chicken thighs': 'chicken thighs',
    'skinless, boneless chicken breasts': 'chicken breasts',
    'skinless, boneless chicken thighs': 'chicken thighs',
    'guajillo chiles, seeds removed': 'guajillo chiles',
  };

  if (prepMergeMap[name]) {
    actions.push({
      id,
      oldName: name,
      newName: prepMergeMap[name],
      newAliases: [],
      newCategory: item.category,
      action: 'merge',
      mergeInto: prepMergeMap[name],
      reason: 'Preparation state - merge into base item'
    });
    return;
  }

  // 4. MERGE: "or" duplicates to single canonical
  const orMergeMap: { [key: string]: string } = {
    'champagne vinegar or white wine vinegar': 'champagne vinegar',
    'sherry vinegar or red wine vinegar': 'sherry vinegar',
    'soy sauce or tamari': 'soy sauce',
    'low-sodium soy sauce or tamari': 'low-sodium soy sauce',
    'grapeseed or vegetable oil': 'vegetable oil',
    'light or dark brown sugar': 'brown sugar',
    'vanilla bean paste or vanilla extract': 'vanilla extract',
    'Diamond Crystal or Morton kosher salt': 'kosher salt',
  };

  if (orMergeMap[name]) {
    actions.push({
      id,
      oldName: name,
      newName: orMergeMap[name],
      newAliases: [],
      newCategory: item.category,
      action: 'merge',
      mergeInto: orMergeMap[name],
      reason: 'Duplicate "or" variant - merge into canonical'
    });
    return;
  }

  // 5. MERGE: "divided" and "plus more" variants
  const dividedMergeMap: { [key: string]: string } = {
    'olive oil, divided': 'olive oil',
    'olive oil, plus more for drizzling': 'olive oil',
    'lemon juice, divided': 'lemon juice',
    'lime juice, divided': 'lime juice',
    'lemons, divided': 'lemons',
    'granulated sugar, divided': 'granulated sugar',
    'sugar, divided': 'sugar',
    'sugar, plus more for sprinkling': 'sugar',
    'kosher salt, divided': 'kosher salt',
    'kosher salt, divided, plus more': 'kosher salt',
    'kosher salt, plus more': 'kosher salt',
    'freshly ground black pepper divided': 'freshly ground black pepper',
    'freshly ground black pepper plus more': 'freshly ground black pepper',
    'freshly ground black pepper to taste': 'freshly ground black pepper',
    'Parmesan, finely grated, plus more for serving': 'parmesan',
  };

  if (dividedMergeMap[name]) {
    actions.push({
      id,
      oldName: name,
      newName: dividedMergeMap[name],
      newAliases: [],
      newCategory: item.category,
      action: 'merge',
      mergeInto: dividedMergeMap[name],
      reason: 'Divided/plus more variant - merge into base'
    });
    return;
  }

  // 6. MERGE: Butter granularity consolidation
  const butterMergeMap: { [key: string]: string } = {
    'chilled unsalted butter cut into pieces': 'unsalted butter',
    'cold unsalted butter': 'unsalted butter',
  };

  if (butterMergeMap[name]) {
    actions.push({
      id,
      oldName: name,
      newName: butterMergeMap[name],
      newAliases: [],
      newCategory: item.category,
      action: 'merge',
      mergeInto: butterMergeMap[name],
      reason: 'Butter preparation - merge into base'
    });
    return;
  }

  // 7. MERGE: Flour granularity consolidation
  const flourMergeMap: { [key: string]: string } = {
    'sifted all-purpose flour': 'all-purpose flour',
    'unbleached all-purpose flour': 'all-purpose flour',
  };

  if (flourMergeMap[name]) {
    actions.push({
      id,
      oldName: name,
      newName: flourMergeMap[name],
      newAliases: [],
      newCategory: item.category,
      action: 'merge',
      mergeInto: flourMergeMap[name],
      reason: 'Flour variant - merge into base'
    });
    return;
  }

  // 8. MERGE: Sugar consolidation
  const sugarMergeMap: { [key: string]: string } = {
    'packed brown sugar': 'brown sugar',
    'packed light brown sugar': 'light brown sugar',
  };

  if (sugarMergeMap[name]) {
    actions.push({
      id,
      oldName: name,
      newName: sugarMergeMap[name],
      newAliases: [],
      newCategory: item.category,
      action: 'merge',
      mergeInto: sugarMergeMap[name],
      reason: 'Sugar variant - merge into base'
    });
    return;
  }

  // 9. MERGE: Vanilla consolidation
  if (name === 'vanilla') {
    actions.push({
      id,
      oldName: name,
      newName: 'vanilla extract',
      newAliases: [],
      newCategory: item.category,
      action: 'merge',
      mergeInto: 'vanilla extract',
      reason: 'Vanilla shorthand - merge into vanilla extract'
    });
    return;
  }

  // 10. MERGE: Diamond Crystal kosher salt
  if (name === 'Diamond Crystal kosher salt') {
    actions.push({
      id,
      oldName: name,
      newName: 'kosher salt',
      newAliases: [],
      newCategory: item.category,
      action: 'merge',
      mergeInto: 'kosher salt',
      reason: 'Brand-specific kosher salt - merge into base'
    });
    return;
  }

  // 11. UPDATE: Fix category for avocado oil
  if (name === 'avocado oil' && item.category === 'produce') {
    actions.push({
      id,
      oldName: name,
      newName: name,
      newAliases: item.aliases || [],
      newCategory: 'condiments',
      action: 'update',
      reason: 'Avocado oil is processed oil - moved to condiments'
    });
    return;
  }
});

// Save cleanup plan
fs.writeFileSync('claude-final-cleanup-plan.json', JSON.stringify(actions, null, 2));

console.log('✅ Final cleanup plan generated!');
console.log(`   Total actions: ${actions.length}`);
console.log(`   Updates: ${actions.filter(a => a.action === 'update').length}`);
console.log(`   Merges: ${actions.filter(a => a.action === 'merge').length}`);
console.log(`   Deletes: ${actions.filter(a => a.action === 'delete').length}`);
console.log('\n📄 Saved to: claude-final-cleanup-plan.json');
console.log('\nRun applyFinalCleanup.ts to apply these changes.');
