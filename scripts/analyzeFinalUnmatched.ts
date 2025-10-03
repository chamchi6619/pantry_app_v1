import * as fs from 'fs';

const unmatched: string[] = JSON.parse(
  fs.readFileSync('remaining-unmatched.json', 'utf-8')
);

const categories = {
  junk: [] as string[],
  dietModifiers: [] as string[],
  sPrefix: [] as string[],
  appleVariants: [] as string[],
  yogurtVariants: [] as string[],
  missingCanonical: [] as string[],
};

const missingItems = new Set<string>();

unmatched.forEach(item => {
  const lower = item.toLowerCase().trim();

  // JUNK - Section headers
  if (
    item.startsWith('For the ') ||
    item.startsWith('For ') ||
    item.endsWith(':') ||
    item === ')' ||
    item.startsWith(')') ||
    item.startsWith('s)') ||
    lower === 'fresh' ||
    lower === 'grated' ||
    lower === 'chopped' ||
    lower === 'en' ||
    lower === 'sliced' ||
    lower.includes('aluminum foil') ||
    lower.includes('paper') ||
    lower.includes('popsicle sticks') ||
    lower.includes('"logs"') ||
    lower.includes('"bugs"') ||
    lower === 'to medium' ||
    item.includes('Topping Ingredients') ||
    item.includes('Apple Slices:')
  ) {
    categories.junk.push(item);
    return;
  }

  // S PREFIX BUG
  if (item.startsWith('s ')) {
    categories.sPrefix.push(item);
    const fixed = item.substring(2);
    if (fixed) missingItems.add(fixed);
    return;
  }

  // APPLE VARIANTS
  if (
    lower.includes('granny smith apple') ||
    lower.includes('gala') && lower.includes('apple') ||
    lower.includes('fuji') && lower.includes('apple') ||
    lower.includes('tart apple')
  ) {
    categories.appleVariants.push(item);
    return;
  }

  // YOGURT VARIANTS
  if (
    (lower.includes('low-fat') || lower.includes('fat-free') || lower.includes('plain')) &&
    lower.includes('yogurt')
  ) {
    categories.yogurtVariants.push(item);
    return;
  }

  // DIET MODIFIERS
  if (
    lower.includes('low-fat') ||
    lower.includes('reduced fat') ||
    lower.includes('fat-free') ||
    lower.includes('reduced-fat') ||
    lower.includes('low-sodium') ||
    lower.includes('reduced sodium') ||
    lower.includes('quick-cooking') ||
    lower.includes('rapid rise') ||
    lower.includes('instant') ||
    lower.includes('lite ') ||
    lower.includes('ready-to-eat')
  ) {
    categories.dietModifiers.push(item);

    // Extract base item
    const base = item
      .replace(/low-fat|reduced fat|fat-free|reduced-fat/gi, '')
      .replace(/low-sodium|reduced sodium/gi, '')
      .replace(/quick-cooking|rapid rise|instant|lite|ready-to-eat/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (base && base.length > 2) {
      missingItems.add(base);
    }
    return;
  }

  // MISSING CANONICAL
  categories.missingCanonical.push(item);
  missingItems.add(item);
});

console.log('📊 FINAL 875 UNMATCHED INGREDIENTS\n');
console.log(`🗑️  Junk (${categories.junk.length}):`);
console.log(`   Section headers, formatting, non-food items`);
console.log('   Sample:', categories.junk.slice(0, 5).join(', '));

console.log(`\n🍎 Apple variants (${categories.appleVariants.length}):`);
console.log('   Should match "apples"');
console.log('   ', categories.appleVariants.join(', '));

console.log(`\n🥛 Yogurt variants (${categories.yogurtVariants.length}):`);
console.log('   Should match "yogurt"');
console.log('   Sample:', categories.yogurtVariants.slice(0, 10).join(', '));

console.log(`\n🐛 "s " prefix bug (${categories.sPrefix.length}):`);
console.log('   Parser artifacts');
console.log('   Sample:', categories.sPrefix.slice(0, 10).join(', '));

console.log(`\n📏 Diet modifiers (${categories.dietModifiers.length}):`);
console.log('   Should match base items');
console.log('   Sample:', categories.dietModifiers.slice(0, 10).join(', '));

console.log(`\n✅ Missing canonical (${categories.missingCanonical.length}):`);
console.log('   Real ingredients we need to add or better fuzzy match');
console.log('   Sample:', categories.missingCanonical.slice(0, 30).join(', '));

console.log('\n\n💡 SUMMARY:');
console.log(`   Junk: ${categories.junk.length}`);
console.log(`   Apple variants: ${categories.appleVariants.length}`);
console.log(`   Yogurt variants: ${categories.yogurtVariants.length}`);
console.log(`   "s " prefix bugs: ${categories.sPrefix.length}`);
console.log(`   Diet modifiers: ${categories.dietModifiers.length}`);
console.log(`   Real missing: ${categories.missingCanonical.length}`);
console.log(`   TOTAL: ${unmatched.length}`);

console.log('\n\n📦 UNIQUE ITEMS TO POTENTIALLY ADD:');
const sortedMissing = Array.from(missingItems).sort();
sortedMissing.forEach(item => console.log(`   - ${item}`));

// Save for review
fs.writeFileSync(
  'final-missing-items.json',
  JSON.stringify(sortedMissing, null, 2)
);
console.log(`\n📄 Saved ${sortedMissing.length} unique items to: final-missing-items.json`);
