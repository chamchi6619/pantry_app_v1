import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('canonical-for-claude-analysis.json', 'utf-8'));

console.log('🔍 COMPREHENSIVE CANONICAL ITEMS QUALITY REPORT\n');
console.log(`Total items: ${data.length}\n`);

// Find issues
const issues: any = {
  noSpaces: [],
  redundantAliases: [],
  preparations: [],
  duplicates: new Map<string, string[]>(),
  badCategory: [],
  tooSpecific: []
};

data.forEach((item: any) => {
  const name = item.name;

  // No spaces in long words
  if (name.length > 12 && !name.includes(' ') && !name.includes('-')) {
    issues.noSpaces.push(name);
  }

  // Preparation instructions in name
  if (name.includes('finely chopped') || name.includes('halved') || name.includes('torn if')) {
    issues.preparations.push(name);
  }

  // Redundant aliases (alias same as name)
  if (item.aliases && item.aliases.includes(name)) {
    issues.redundantAliases.push(name);
  }

  // Check for duplicates (similar names)
  const baseName = name.replace(/s$/, '').toLowerCase();
  if (!issues.duplicates.has(baseName)) {
    issues.duplicates.set(baseName, []);
  }
  issues.duplicates.get(baseName)!.push(name);

  // Oddly specific items
  if (name.includes(',') || name.includes('or ')) {
    issues.tooSpecific.push(name);
  }

  // Bad categorization
  if (item.category === 'other' && (name.includes('oil') || name.includes('sugar'))) {
    issues.badCategory.push(`${name} (should not be "other")`);
  }
});

// Report
console.log('❌ CRITICAL ISSUES:\n');

console.log(`1. Items WITHOUT SPACES (${issues.noSpaces.length}):`);
issues.noSpaces.slice(0, 15).forEach((name: string) => console.log(`   - ${name}`));
if (issues.noSpaces.length > 15) console.log(`   ... and ${issues.noSpaces.length - 15} more\n`);

console.log(`\n2. PREPARATION in name (${issues.preparations.length}):`);
issues.preparations.forEach((name: string) => console.log(`   - ${name}`));

console.log(`\n3. REDUNDANT aliases (${issues.redundantAliases.length}):`);
issues.redundantAliases.slice(0, 10).forEach((name: string) => console.log(`   - ${name}`));

console.log(`\n4. TOO SPECIFIC items (${issues.tooSpecific.length}):`);
issues.tooSpecific.forEach((name: string) => console.log(`   - ${name}`));

console.log(`\n5. BAD CATEGORY (${issues.badCategory.length}):`);
issues.badCategory.forEach((item: string) => console.log(`   - ${item}`));

// Check for actual duplicates
console.log(`\n6. POTENTIAL DUPLICATES:`);
let dupCount = 0;
issues.duplicates.forEach((names: string[], base: string) => {
  if (names.length > 1) {
    console.log(`   Base "${base}": ${names.join(', ')}`);
    dupCount++;
  }
});

console.log(`\n\n📊 SUMMARY:`);
console.log(`   Total items: ${data.length}`);
console.log(`   Items without spaces: ${issues.noSpaces.length}`);
console.log(`   Items with preparations: ${issues.preparations.length}`);
console.log(`   Too specific items: ${issues.tooSpecific.length}`);
console.log(`   Potential duplicate groups: ${dupCount}`);

const cleanPercentage = (
  (data.length - issues.noSpaces.length - issues.preparations.length - issues.tooSpecific.length) /
  data.length * 100
).toFixed(1);

console.log(`\n   ✅ Clean items: ~${cleanPercentage}%`);
console.log(`   ❌ Items needing fixes: ~${(100 - parseFloat(cleanPercentage)).toFixed(1)}%`);
