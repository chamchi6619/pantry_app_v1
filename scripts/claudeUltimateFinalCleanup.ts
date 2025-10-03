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
  const aliases = item.aliases || [];

  // ========== CRITICAL FIXES ==========

  // 1. WATER CONSOLIDATION
  const waterMap: { [key: string]: string } = {
    'boiling water': 'water',
    'warm water': 'water',
    'hot water': 'water',
    'filtered water': 'water',
  };

  if (waterMap[name]) {
    actions.push({
      id, oldName: name, newName: waterMap[name], newAliases: [],
      newCategory: 'other', action: 'merge', mergeInto: waterMap[name],
      reason: 'Water temperature state - merge to base'
    });
    return;
  }

  // 2. CROSS-CATEGORY DUPLICATES
  if (name === 'pure maple syrup') {
    actions.push({
      id, oldName: name, newName: 'maple syrup', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'maple syrup',
      reason: 'Duplicate - maple syrup exists in OTHER'
    });
    return;
  }

  if (name === 'pure vanilla extract') {
    actions.push({
      id, oldName: name, newName: 'vanilla extract', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'vanilla extract',
      reason: 'Duplicate - vanilla extract exists in OTHER'
    });
    return;
  }

  // 3. SUGAR DUPLICATES
  if (name === 'confectioners sugar') {
    actions.push({
      id, oldName: name, newName: 'powdered sugar', newAliases: ['confectioners sugar'],
      newCategory: item.category, action: 'merge', mergeInto: 'powdered sugar',
      reason: 'Confectioners sugar = powdered sugar'
    });
    return;
  }

  if (name === 'sugar' && item.category === 'condiments') {
    actions.push({
      id, oldName: name, newName: 'granulated sugar', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'granulated sugar',
      reason: 'Plain sugar -> granulated sugar'
    });
    return;
  }

  // 4. FIX ALL-PURPOSE FLOUR ALIASES (remove "wheat flour")
  if (name === 'all-purpose flour') {
    const cleanedAliases = aliases.filter((a: string) => a !== 'wheat flour');
    if (cleanedAliases.length !== aliases.length) {
      actions.push({
        id, oldName: name, newName: name,
        newAliases: cleanedAliases,
        newCategory: item.category, action: 'update',
        reason: 'Remove incorrect "wheat flour" alias - wheat flour is separate item'
      });
    }
    return;
  }

  // 5. FLOUR DUPLICATE
  if (name === 'flour' && item.category === 'grains') {
    actions.push({
      id, oldName: name, newName: 'all-purpose flour', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'all-purpose flour',
      reason: 'Plain flour -> all-purpose flour'
    });
    return;
  }

  // 6. OATS DUPLICATE
  if (name === 'old-fashioned oats') {
    actions.push({
      id, oldName: name, newName: 'rolled oats', newAliases: ['old-fashioned oats'],
      newCategory: item.category, action: 'merge', mergeInto: 'rolled oats',
      reason: 'Old-fashioned oats = rolled oats'
    });
    return;
  }

  // 7. SCALLION/SCALLIONS
  if (name === 'scallion') {
    actions.push({
      id, oldName: name, newName: 'scallions', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'scallions',
      reason: 'Singular -> plural'
    });
    return;
  }

  // 8. ONION/ONIONS
  if (name === 'onion') {
    actions.push({
      id, oldName: name, newName: 'onions', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'onions',
      reason: 'Singular -> plural'
    });
    return;
  }

  // 9. PREP STATES
  const prepStates: { [key: string]: string } = {
    'drained capers': 'capers',
    'oil-packed anchovy fillets': 'anchovy fillets',
    'cooked rice': 'rice',
    'steamed rice': 'rice',
    'finely grated lemon zest': 'lemon zest',
    'grated lemon zest': 'lemon zest',
    'finely grated lemon rind': 'lemon rind',
    'finely grated lime zest': 'lime zest',
    'finely grated orange zest': 'orange zest',
    'strips orange zest': 'orange zest',
    'zest of 1 lemon': 'lemon zest',
    'finely grated parmesan': 'parmesan',
    'grated parmesan cheese': 'parmesan',
    'finely chopped sage': 'sage',
    'coarsely chopped parsley': 'parsley',
    'toasted sesame seeds': 'sesame seeds',
    'freshly grated nutmeg': 'nutmeg',
    'broccoli florets': 'broccoli',
    'thick slices country-style bread': 'bread',
    'crumbled feta': 'feta',
  };

  if (prepStates[name]) {
    actions.push({
      id, oldName: name, newName: prepStates[name], newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: prepStates[name],
      reason: 'Preparation state - merge to base'
    });
    return;
  }

  // 10. QUANTITY DESCRIPTORS
  const quantityMap: { [key: string]: string } = {
    'bunch cilantro': 'cilantro',
    'bunch parsley': 'parsley',
    'envelope active dry yeast': 'active dry yeast',
    'pinch of cayenne pepper': 'cayenne pepper',
    'lemon wedges': 'lemon',
    'lime wedges': 'lime',
    'pecan halves': 'pecans',
    'double-concentrated tomato paste': 'tomato paste',
  };

  if (quantityMap[name]) {
    actions.push({
      id, oldName: name, newName: quantityMap[name], newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: quantityMap[name],
      reason: 'Quantity descriptor - merge to base'
    });
    return;
  }

  // 11. "FRESHLY" PREFIX
  const freshlyMap: { [key: string]: string } = {
    'freshly squeezed lemon juice': 'lemon juice',
    'freshly squeezed lime juice': 'lime juice',
    'freshly ground black pepper': 'ground black pepper',
    'freshly cracked black pepper': 'black pepper',
    'freshly ground pepper': 'ground pepper',
    'freshly ground white pepper': 'white pepper',
  };

  if (freshlyMap[name]) {
    actions.push({
      id, oldName: name, newName: freshlyMap[name], newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: freshlyMap[name],
      reason: '"Freshly" prefix is meaningless - merge to base'
    });
    return;
  }

  // 12. BLACK PEPPER VARIANTS
  const pepperMap: { [key: string]: string } = {
    'coarsely ground black pepper': 'ground black pepper',
    'finely ground black pepper': 'ground black pepper',
    'black peppercorns': 'black pepper',
  };

  if (pepperMap[name]) {
    actions.push({
      id, oldName: name, newName: pepperMap[name], newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: pepperMap[name],
      reason: 'Pepper grind variation - merge to base'
    });
    return;
  }

  // 13. COCONUT MILK VARIANTS
  const coconutMilkMap: { [key: string]: string } = {
    'full-fat coconut milk': 'coconut milk',
    'unsweetened coconut milk': 'coconut milk',
  };

  if (coconutMilkMap[name]) {
    actions.push({
      id, oldName: name, newName: coconutMilkMap[name], newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: coconutMilkMap[name],
      reason: 'Coconut milk variant - merge to base'
    });
    return;
  }

  // 14. RICE VINEGAR VARIANTS
  const vinegarMap: { [key: string]: string } = {
    'seasoned rice vinegar': 'rice vinegar',
    'unseasoned rice vinegar': 'rice vinegar',
  };

  if (vinegarMap[name]) {
    actions.push({
      id, oldName: name, newName: vinegarMap[name], newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: vinegarMap[name],
      reason: 'Rice vinegar variant - merge to base'
    });
    return;
  }

  // 15. YOGURT VARIANTS
  const yogurtMap: { [key: string]: string } = {
    'plain Greek yogurt': 'greek yogurt',
    'plain whole-milk Greek yogurt': 'greek yogurt',
    'plain whole-milk yogurt': 'greek yogurt',
    'plain yogurt': 'greek yogurt',
  };

  if (yogurtMap[name]) {
    actions.push({
      id, oldName: name, newName: yogurtMap[name], newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: yogurtMap[name],
      reason: 'Yogurt variant - merge to greek yogurt'
    });
    return;
  }

  // 16. CILANTRO VARIANTS
  const cilantroMap: { [key: string]: string } = {
    'cilantro leaves': 'cilantro',
    'cilantro leaves with tender stems': 'cilantro',
    'cilantro sprigs': 'cilantro',
  };

  if (cilantroMap[name]) {
    actions.push({
      id, oldName: name, newName: cilantroMap[name], newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: cilantroMap[name],
      reason: 'Cilantro part - merge to base'
    });
    return;
  }

  // 17. PARSLEY VARIANTS
  const parsleyMap: { [key: string]: string } = {
    'flat-leaf parsley': 'parsley',
    'parsley leaves': 'parsley',
    'parsley leaves with tender stems': 'parsley',
  };

  if (parsleyMap[name]) {
    actions.push({
      id, oldName: name, newName: parsleyMap[name], newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: parsleyMap[name],
      reason: 'Parsley variant - merge to base'
    });
    return;
  }

  // 18. THYME DUPLICATE (sprigs thyme vs thyme sprigs)
  if (name === 'sprigs thyme') {
    actions.push({
      id, oldName: name, newName: 'thyme', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'thyme',
      reason: 'Thyme sprigs - merge to base'
    });
    return;
  }

  if (name === 'thyme sprigs') {
    actions.push({
      id, oldName: name, newName: 'thyme', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'thyme',
      reason: 'Thyme sprigs - merge to base'
    });
    return;
  }

  // 19. ROSEMARY SPRIGS
  if (name === 'sprig rosemary') {
    actions.push({
      id, oldName: name, newName: 'rosemary', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'rosemary',
      reason: 'Rosemary sprig - merge to base'
    });
    return;
  }

  // 20. MINT VARIANTS
  if (name === 'mint leaves' || name === 'torn mint leaves') {
    actions.push({
      id, oldName: name, newName: 'mint', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'mint',
      reason: 'Mint variant - merge to base'
    });
    return;
  }

  // 21. BASIL VARIANTS
  if (name === 'basil leaves') {
    actions.push({
      id, oldName: name, newName: 'basil', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'basil',
      reason: 'Basil leaves - merge to base'
    });
    return;
  }

  // 22. OREGANO/SAGE VARIANTS
  if (name === 'oregano leaves') {
    actions.push({
      id, oldName: name, newName: 'oregano', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'oregano',
      reason: 'Oregano leaves - merge to base'
    });
    return;
  }

  if (name === 'sage leaves') {
    actions.push({
      id, oldName: name, newName: 'sage', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'sage',
      reason: 'Sage leaves - merge to base'
    });
    return;
  }

  if (name === 'tarragon leaves') {
    actions.push({
      id, oldName: name, newName: 'tarragon', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'tarragon',
      reason: 'Tarragon leaves - merge to base'
    });
    return;
  }

  // 23. BAY LEAF SINGULAR/PLURAL
  if (name === 'bay leaves') {
    actions.push({
      id, oldName: name, newName: 'bay leaf', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'bay leaf',
      reason: 'Plural - merge to singular'
    });
    return;
  }

  // 24. CINNAMON VARIANTS
  if (name === 'cinnamon stick' || name === 'cinnamon sticks') {
    actions.push({
      id, oldName: name, newName: 'cinnamon', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'cinnamon',
      reason: 'Cinnamon form - merge to base'
    });
    return;
  }

  // 25. NUT VARIANTS
  const nutsMap: { [key: string]: string } = {
    'blanched almonds': 'almonds',
    'skin-on almonds': 'almonds',
    'raw walnuts': 'walnuts',
    'raw pistachios': 'pistachios',
    'raw pumpkin seeds': 'pumpkin seeds',
    'raw sesame seeds': 'sesame seeds',
  };

  if (nutsMap[name]) {
    actions.push({
      id, oldName: name, newName: nutsMap[name], newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: nutsMap[name],
      reason: 'Nut processing variant - merge to base'
    });
    return;
  }

  // 26. BLANCHED HAZELNUTS
  if (name === 'blanched hazelnuts') {
    actions.push({
      id, oldName: name, newName: 'hazelnuts', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'hazelnuts',
      reason: 'Blanched hazelnuts - merge to base'
    });
    return;
  }

  // 27. CHOCOLATE VARIANTS
  if (name === 'bittersweet chocolate') {
    actions.push({
      id, oldName: name, newName: 'dark chocolate', newAliases: ['bittersweet chocolate'],
      newCategory: item.category, action: 'merge', mergeInto: 'dark chocolate',
      reason: 'Bittersweet = dark chocolate'
    });
    return;
  }

  // 28. RAISINS
  if (name === 'golden raisins') {
    actions.push({
      id, oldName: name, newName: 'raisins', newAliases: ['golden raisins'],
      newCategory: item.category, action: 'merge', mergeInto: 'raisins',
      reason: 'Golden raisins - merge to base'
    });
    return;
  }

  // 29. BABY VEGETABLES
  const babyMap: { [key: string]: string } = {
    'baby arugula': 'arugula',
    'baby spinach': 'spinach',
    'baby yukon gold potatoes': 'potatoes',
  };

  if (babyMap[name]) {
    actions.push({
      id, oldName: name, newName: babyMap[name], newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: babyMap[name],
      reason: 'Baby variant - merge to base'
    });
    return;
  }

  // 30. LEMON/LEMONS, LIME/LIMES
  if (name === 'lemons') {
    actions.push({
      id, oldName: name, newName: 'lemon', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'lemon',
      reason: 'Plural - merge to singular'
    });
    return;
  }

  if (name === 'limes') {
    actions.push({
      id, oldName: name, newName: 'lime', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'lime',
      reason: 'Plural - merge to singular'
    });
    return;
  }

  // 31. SHALLOT/SHALLOTS
  if (name === 'shallot') {
    actions.push({
      id, oldName: name, newName: 'shallots', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'shallots',
      reason: 'Singular - merge to plural'
    });
    return;
  }

  // 32. RICOTTA VARIANTS
  if (name === 'whole-milk ricotta') {
    actions.push({
      id, oldName: name, newName: 'ricotta', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'ricotta',
      reason: 'Whole-milk ricotta - merge to base'
    });
    return;
  }

  // 33. KEFIR
  if (name === 'organic plain milk kefir') {
    actions.push({
      id, oldName: name, newName: 'kefir', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'kefir',
      reason: 'Specific kefir variant - merge to base'
    });
    return;
  }

  // 34. GOAT CHEESE
  if (name === 'goat cheese' && aliases.includes('fresh goat cheese')) {
    // Just update to remove redundant alias
    actions.push({
      id, oldName: name, newName: name, newAliases: [],
      newCategory: item.category, action: 'update',
      reason: 'Remove redundant "fresh goat cheese" alias'
    });
    return;
  }

  // 35. CONDENSED MILK
  if (name === 'sweetened condensed milk') {
    actions.push({
      id, oldName: name, newName: 'condensed milk', newAliases: ['sweetened condensed milk'],
      newCategory: item.category, action: 'update',
      reason: 'Condensed milk is always sweetened - simplify name'
    });
    return;
  }

  // 36. COCONUT OIL VARIANT
  if (name === 'virgin coconut oil') {
    actions.push({
      id, oldName: name, newName: 'coconut oil', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'coconut oil',
      reason: 'Virgin coconut oil - merge to base'
    });
    return;
  }

  // 37. OLIVE OIL VARIANT
  if (name === 'extra-virgin olive oil') {
    actions.push({
      id, oldName: name, newName: 'olive oil', newAliases: ['extra-virgin olive oil'],
      newCategory: item.category, action: 'merge', mergeInto: 'olive oil',
      reason: 'EVOO variant - merge to olive oil with alias'
    });
    return;
  }

  // 38. MUSTARD SEEDS VARIANTS
  if (name === 'black mustard seeds' || name === 'yellow mustard seeds') {
    actions.push({
      id, oldName: name, newName: 'mustard seeds', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'mustard seeds',
      reason: 'Mustard seed color variant - merge to base'
    });
    return;
  }

  // 39. ALLSPICE VARIANTS
  if (name === 'allspice berries') {
    actions.push({
      id, oldName: name, newName: 'allspice', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'allspice',
      reason: 'Allspice berries - merge to base'
    });
    return;
  }

  // 40. GROUND SPICES (keep these - they're different from whole)
  // These are correct as-is

  // 41. SALT VARIANTS - consolidate sea salt types
  const saltMap: { [key: string]: string } = {
    'fine sea salt': 'sea salt',
    'flaky sea salt': 'sea salt',
    'sea salt flakes': 'sea salt',
    'maldon sea salt': 'sea salt',
    'coarse salt': 'salt',
  };

  if (saltMap[name]) {
    actions.push({
      id, oldName: name, newName: saltMap[name], newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: saltMap[name],
      reason: 'Salt variant - merge to base'
    });
    return;
  }

  // 42. SALT COMBINATIONS (keep these - they're recipe shorthands)
  // 'kosher salt and freshly ground black pepper' - keep
  // 'salt and pepper' - keep

  // 43. PEPPER FLAKES VARIANTS
  if (name === 'chile flakes') {
    actions.push({
      id, oldName: name, newName: 'red pepper flakes', newAliases: ['chile flakes'],
      newCategory: item.category, action: 'merge', mergeInto: 'red pepper flakes',
      reason: 'Chile flakes = red pepper flakes'
    });
    return;
  }

  if (name === 'crushed red pepper flakes') {
    actions.push({
      id, oldName: name, newName: 'red pepper flakes', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'red pepper flakes',
      reason: 'Crushed red pepper flakes - merge to base'
    });
    return;
  }

  // 44. CHILES DE ARBOL
  if (name === 'chiles de arbol') {
    actions.push({
      id, oldName: name, newName: 'arbol chiles', newAliases: ['chiles de arbol'],
      newCategory: item.category, action: 'update',
      reason: 'Normalize name to "arbol chiles"'
    });
    return;
  }

  // 45. RED CHILE
  if (name === 'red chile') {
    actions.push({
      id, oldName: name, newName: 'dried red chile', newAliases: ['red chile'],
      newCategory: item.category, action: 'update',
      reason: 'Specify dried (since we have fresh chiles too)'
    });
    return;
  }

  // 46. PAPRIKA VARIANTS
  if (name === 'hot smoked Spanish paprika') {
    actions.push({
      id, oldName: name, newName: 'smoked paprika', newAliases: ['hot smoked paprika'],
      newCategory: item.category, action: 'merge', mergeInto: 'smoked paprika',
      reason: 'Hot smoked paprika - merge to smoked paprika'
    });
    return;
  }

  // 47. TOMATO/TOMATOES
  if (name === 'tomato') {
    actions.push({
      id, oldName: name, newName: 'tomatoes', newAliases: [],
      newCategory: item.category, action: 'merge', mergeInto: 'tomatoes',
      reason: 'Singular - merge to plural'
    });
    return;
  }

  // 48. BASMATI RICE has alias "rice" - WRONG
  // Keep basmati separate but remove "rice" alias
  if (name === 'basmati rice') {
    const cleanedAliases = aliases.filter((a: string) => a !== 'rice');
    if (cleanedAliases.length !== aliases.length) {
      actions.push({
        id, oldName: name, newName: name, newAliases: cleanedAliases,
        newCategory: item.category, action: 'update',
        reason: 'Remove "rice" alias - basmati is specific type'
      });
    }
    return;
  }

  // 49. REMOVE REDUNDANT SELF-REFERENCING ALIASES
  if (aliases.includes(name)) {
    const cleanedAliases = aliases.filter((a: string) => a !== name);
    actions.push({
      id, oldName: name, newName: name, newAliases: cleanedAliases,
      newCategory: item.category, action: 'update',
      reason: 'Remove self-referencing alias'
    });
    return;
  }
});

// Save cleanup plan
fs.writeFileSync('claude-ultimate-cleanup-plan.json', JSON.stringify(actions, null, 2));

console.log('✅ ULTIMATE cleanup plan generated!');
console.log(`   Total actions: ${actions.length}`);
console.log(`   Updates: ${actions.filter(a => a.action === 'update').length}`);
console.log(`   Merges: ${actions.filter(a => a.action === 'merge').length}`);
console.log(`   Deletes: ${actions.filter(a => a.action === 'delete').length}`);
console.log('\n📄 Saved to: claude-ultimate-cleanup-plan.json');
console.log('\nThis will make the canonical items TRULY rock solid.');
