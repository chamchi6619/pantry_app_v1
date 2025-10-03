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

  // 1. DELETE: Items that are just preparation instructions or junk
  if (name === 'basilleavestornif' ||
      name === 'eggbeatentoblend' ||
      name === 'eggsbeatentoblend' ||
      name === 'eggslightlybeaten' ||
      name === 'heavycreamdivided' ||
      name === 'ofcrushedredpepperflakes' ||
      name === 'ofkoshersalt' ||
      name === 'ofsugar') {
    actions.push({
      id,
      oldName: name,
      newName: '',
      newAliases: [],
      newCategory: item.category,
      action: 'delete',
      reason: 'Parser artifact or preparation instruction'
    });
    return;
  }

  // 2. MERGE: Items with preparations that should map to base item
  const mergeMap: { [key: string]: string } = {
    'celery stalks finely chopped': 'celery',
    'cherry tomatoes halved': 'cherry tomatoes',
    'finely chopped chives': 'chives',
    'finely chopped cilantro': 'cilantro',
    'finely chopped dill': 'dill',
    'finely chopped mint': 'mint',
    'finely chopped onion': 'onion',
    'finely chopped oregano': 'oregano',
    'finely chopped parsley': 'parsley',
    'finely chopped rosemary': 'rosemary',
    'finely chopped sage': 'sage',
    'finely chopped tender herbs': 'tender herbs',
    'finely chopped thyme': 'thyme',
    'garlic clove finely chopped': 'garlic',
    'garlic cloves, finely chopped': 'garlic',
    'garlic cloves, crushed': 'garlic',
    'garlic cloves, divided': 'garlic',
    'garlic cloves, finely grated': 'garlic',
    'garlic cloves, lightly crushed': 'garlic',
    'garlic cloves, peeled': 'garlic',
    'garlic cloves, smashed': 'garlic',
    'garlic cloves, thinly sliced': 'garlic',
    'head of garlic, halved crosswise': 'garlic',
    'heads of garlic, halved crosswise': 'garlic',
    'lemon, halved': 'lemon',
    'mint leaves, torn if large': 'mint',
    'onion, finely chopped': 'onion',
    'onion, coarsely chopped': 'onion',
    'onion, thinly sliced': 'onion',
    'onions, finely diced': 'onion',
    'piece ginger, peeled, finely chopped': 'ginger',
    'piece ginger, peeled': 'ginger',
    'piece ginger, peeled, finely grated': 'ginger',
    'piece ginger, peeled, thinly sliced': 'ginger',
    'pint cherry tomatoes, halved': 'cherry tomatoes',
    'red onion finely chopped': 'red onion',
    'shallot, finely chopped': 'shallot',
    'Persian cucumbers, thinly sliced': 'Persian cucumbers',
    'serrano chile, thinly sliced': 'serrano chile',
    'shallots, thinly sliced': 'shallot',
    'shallots, thinly sliced into rings': 'shallot',
    'cloves garlic finely chopped': 'garlic',
    'guajillo chiles, seeds removed': 'guajillo chiles',
    'green beans, trimmed': 'green beans',
    'shrimp, peeled and deveined': 'shrimp',
    'littleneck clams, scrubbed': 'littleneck clams',
    'skin-on, bone-in chicken thighs': 'chicken thighs',
    'skinless, boneless chicken breasts': 'chicken breasts',
    'skinless, boneless chicken thighs': 'chicken thighs',
  };

  if (mergeMap[name]) {
    actions.push({
      id,
      oldName: name,
      newName: mergeMap[name],
      newAliases: [],
      newCategory: item.category,
      action: 'merge',
      mergeInto: mergeMap[name],
      reason: 'Preparation instruction - merge into base item'
    });
    return;
  }

  // 3. UPDATE: Fix "or" items to pick one
  const orFixMap: { [key: string]: { name: string, aliases: string[] } } = {
    'champagne vinegar or white wine vinegar': { name: 'champagne vinegar', aliases: ['white wine vinegar'] },
    'Diamond Crystal or Morton kosher salt': { name: 'kosher salt', aliases: ['Diamond Crystal', 'Morton kosher salt'] },
    'grapeseed or vegetable oil': { name: 'vegetable oil', aliases: ['grapeseed oil'] },
    'light or dark brown sugar': { name: 'brown sugar', aliases: ['light brown sugar', 'dark brown sugar'] },
    'low-sodium soy sauce or tamari': { name: 'soy sauce', aliases: ['tamari', 'low-sodium soy sauce'] },
    'sherry vinegar or red wine vinegar': { name: 'sherry vinegar', aliases: ['red wine vinegar'] },
    'soy sauce or tamari': { name: 'soy sauce', aliases: ['tamari'] },
    'vanilla bean paste or vanilla extract': { name: 'vanilla extract', aliases: ['vanilla bean paste'] },
  };

  if (orFixMap[name]) {
    const fix = orFixMap[name];
    actions.push({
      id,
      oldName: name,
      newName: fix.name,
      newAliases: fix.aliases,
      newCategory: item.category,
      action: 'update',
      reason: 'Simplified "or" choice to primary option'
    });
    return;
  }

  // 4. UPDATE: Fix "divided" items
  const dividedFixMap: { [key: string]: string } = {
    'kosher salt, divided': 'kosher salt',
    'kosher salt, divided, plus more': 'kosher salt',
    'olive oil, divided': 'olive oil',
    'granulated sugar, divided': 'granulated sugar',
    'sugar, divided': 'sugar',
    'lemon juice, divided': 'lemon juice',
    'lime juice, divided': 'lime juice',
    'lemons, divided': 'lemon',
    'kosher salt, freshly ground pepper': 'kosher salt',
    'kosher salt, plus more': 'kosher salt',
    'olive oil, plus more for drizzling': 'olive oil',
    'Parmesan, finely grated': 'parmesan',
    'Parmesan, finely grated, plus more for serving': 'parmesan',
    'sugar, plus more for sprinkling': 'sugar',
  };

  if (dividedFixMap[name]) {
    actions.push({
      id,
      oldName: name,
      newName: dividedFixMap[name],
      newAliases: item.aliases || [],
      newCategory: item.category,
      action: 'update',
      reason: 'Removed "divided" or preparation suffix'
    });
    return;
  }

  // 5. UPDATE: Fix category for sugars
  if ((name.includes('sugar') || name === 'confectioners sugar') && item.category === 'other') {
    actions.push({
      id,
      oldName: name,
      newName: name,
      newAliases: item.aliases || [],
      newCategory: 'condiments',
      action: 'update',
      reason: 'Fixed category from "other" to "condiments"'
    });
    return;
  }

  // 6. UPDATE: Remove redundant aliases (alias same as name)
  if (item.aliases && item.aliases.includes(name)) {
    const cleanAliases = item.aliases.filter((a: string) => a !== name);
    actions.push({
      id,
      oldName: name,
      newName: name,
      newAliases: cleanAliases,
      newCategory: item.category,
      action: 'update',
      reason: 'Removed redundant alias'
    });
  }
});

// Save cleanup plan
fs.writeFileSync('claude-cleanup-plan.json', JSON.stringify(actions, null, 2));

console.log('✅ Cleanup plan generated!');
console.log(`   Total actions: ${actions.length}`);
console.log(`   Updates: ${actions.filter(a => a.action === 'update').length}`);
console.log(`   Merges: ${actions.filter(a => a.action === 'merge').length}`);
console.log(`   Deletes: ${actions.filter(a => a.action === 'delete').length}`);
console.log('\n📄 Saved to: claude-cleanup-plan.json');
console.log('\nRun applyClaudeCleanup.ts to apply these changes.');
