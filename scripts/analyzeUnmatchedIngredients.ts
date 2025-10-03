import * as fs from 'fs';

const unmatchedIngredients: string[] = JSON.parse(
  fs.readFileSync('unmatched-ingredients.json', 'utf-8')
);

// Categories of unmatched items
const categories = {
  junk: [] as string[],           // Section headers, parentheses, etc.
  missingCanonical: [] as string[], // Real ingredients we should add
  branded: [] as string[],        // Brand names or proprietary mixes
  tooSpecific: [] as string[],    // "low-fat", "reduced sodium" variants
};

const missingItems = new Set<string>();

unmatchedIngredients.forEach(item => {
  const lower = item.toLowerCase().trim();

  // JUNK - Section headers and formatting
  if (
    item.startsWith('For the ') ||
    item.endsWith(':') ||
    item === ')' ||
    item.startsWith(')') ||
    item.includes('Ingredient') ||
    item.includes('Topping') ||
    item.startsWith('Note:') ||
    item.startsWith('\"') ||
    lower === 'sliced' ||
    lower === 'grated' ||
    lower === 'chopped' ||
    lower === 'fresh' ||
    lower === 'en' ||
    lower === 'canned' ||
    lower.startsWith('s)') ||
    item.includes('aluminum foil') ||
    item.includes('paper') ||
    lower.includes('to reduce browning')
  ) {
    categories.junk.push(item);
    return;
  }

  // BRANDED / PROPRIETARY
  if (
    item.includes('Eating Smart Seasoning') ||
    item.includes('Better Baking Mix') ||
    item.includes('Pico de Gallo') ||
    item.includes('Chili and Spice Seasoning')
  ) {
    categories.branded.push(item);
    return;
  }

  // TOO SPECIFIC - low-fat, reduced sodium, etc.
  if (
    item.includes('low-fat') ||
    item.includes('reduced fat') ||
    item.includes('fat-free') ||
    item.includes('non-fat') ||
    item.includes('nonfat') ||
    item.includes('reduced sodium') ||
    item.includes('low-sodium') ||
    item.includes('part-skim') ||
    item.includes('Lite') ||
    item.includes('lite') ||
    item.includes('instant') ||
    item.includes('quick-cooking') ||
    item.includes('rapid rise')
  ) {
    categories.tooSpecific.push(item);

    // But extract the base item
    const base = item
      .replace(/low-fat|reduced fat|fat-free|non-fat|nonfat/gi, '')
      .replace(/reduced sodium|low-sodium/gi, '')
      .replace(/part-skim/gi, '')
      .replace(/lite|instant|quick-cooking|rapid rise/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (base) {
      missingItems.add(base);
    }
    return;
  }

  // MISSING CANONICAL - these should be added
  categories.missingCanonical.push(item);

  // Try to extract clean name
  let cleanName = item
    .replace(/^s\s+/, '')  // Remove "s " prefix
    .replace(/\(.*?\)/g, '') // Remove parentheses
    .replace(/,.*$/, '')     // Remove everything after comma
    .replace(/\d+/g, '')     // Remove numbers
    .replace(/\s+(or|and)\s+.*/gi, '') // Remove "or" alternatives
    .replace(/\b(ripe|tart|fresh|dried|canned|frozen|cooked|prepared|uncooked)\b/gi, '')
    .replace(/\b(shredded|sliced|diced|chopped|cubed|halved|whole)\b/gi, '')
    .replace(/\b(head|heads|bunch|leaves|leaf|can|cans)\s+(of\s+)?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanName && cleanName.length > 2) {
    missingItems.add(cleanName);
  }
});

// Deduplicate and categorize missing items
const missingByCategory: { [key: string]: string[] } = {
  produce: [],
  protein: [],
  dairy: [],
  grains: [],
  canned: [],
  condiments: [],
  other: [],
};

const produceKeywords = ['banana', 'apple', 'grape', 'mango', 'papaya', 'cabbage', 'lettuce', 'kale', 'collard', 'chard', 'mushroom', 'zucchini', 'eggplant', 'squash', 'asparagus', 'brussels', 'cauliflower', 'yam', 'plantain', 'cantaloupe', 'taloupe', 'cherry', 'apricot', 'fig', 'date', 'pear'];
const proteinKeywords = ['catfish', 'tilapia', 'pollock', 'haddock', 'cod', 'walleye', 'trout', 'salmon', 'tuna', 'fish', 'tofu', 'ham', 'deli', 'steak', 'skirt'];
const dairyKeywords = ['cheese', 'yogurt', 'cottage', 'mozzarella', 'cheddar', 'monterey jack', 'blue cheese'];
const grainKeywords = ['oats', 'oatmeal', 'macaroni', 'pasta', 'noodle', 'couscous', 'bulgur', 'barley', 'quinoa', 'tortilla', 'muffin', 'bun', 'bread', 'wheat', 'cereal', 'bran', 'ramen'];
const cannedKeywords = ['black beans', 'kidney beans', 'pinto beans', 'lima beans', 'lentil', 'hominy', 'corn', 'bean sprout'];
const condimentKeywords = ['dressing', 'vinaigrette', 'mustard', 'barbecue', 'salsa', 'sauce', 'seasoning', 'bouillon', 'broth'];

Array.from(missingItems).forEach(item => {
  const lower = item.toLowerCase();

  if (produceKeywords.some(k => lower.includes(k))) {
    missingByCategory.produce.push(item);
  } else if (proteinKeywords.some(k => lower.includes(k))) {
    missingByCategory.protein.push(item);
  } else if (dairyKeywords.some(k => lower.includes(k))) {
    missingByCategory.dairy.push(item);
  } else if (grainKeywords.some(k => lower.includes(k))) {
    missingByCategory.grains.push(item);
  } else if (cannedKeywords.some(k => lower.includes(k))) {
    missingByCategory.canned.push(item);
  } else if (condimentKeywords.some(k => lower.includes(k))) {
    missingByCategory.condiments.push(item);
  } else {
    missingByCategory.other.push(item);
  }
});

console.log('📊 UNMATCHED INGREDIENTS ANALYSIS\n');
console.log(`Total unmatched: ${unmatchedIngredients.length}\n`);

console.log(`🗑️  JUNK (${categories.junk.length}):`);
console.log(`   Section headers, formatting, non-ingredients\n`);

console.log(`🏷️  BRANDED (${categories.branded.length}):`);
console.log(`   Proprietary mixes, brand names\n`);

console.log(`📏 TOO SPECIFIC (${categories.tooSpecific.length}):`);
console.log(`   "low-fat", "reduced sodium" variants`);
console.log(`   Sample:`, categories.tooSpecific.slice(0, 5).join(', ') + '...\n');

console.log(`✅ MISSING CANONICAL ITEMS (${categories.missingCanonical.length}):`);
console.log(`   Real ingredients we should add to canonical items\n`);

console.log('📦 BREAKDOWN BY CATEGORY:\n');
Object.entries(missingByCategory).forEach(([cat, items]) => {
  if (items.length > 0) {
    console.log(`${cat.toUpperCase()} (${items.length}):`);
    items.slice(0, 15).forEach(item => console.log(`   - ${item}`));
    if (items.length > 15) {
      console.log(`   ... and ${items.length - 15} more`);
    }
    console.log('');
  }
});

console.log('\n💡 RECOMMENDATION:');
console.log(`   Junk: ${categories.junk.length} (skip these)`);
console.log(`   Branded: ${categories.branded.length} (skip or genericize)`);
console.log(`   Too specific: ${categories.tooSpecific.length} (use base items)`);
console.log(`   **Should add: ~${missingItems.size} new canonical items**`);

// Save the clean list of items to add
fs.writeFileSync(
  'canonical-items-to-add.json',
  JSON.stringify(Array.from(missingItems).sort(), null, 2)
);
console.log('\n📄 Saved clean list to: canonical-items-to-add.json');
