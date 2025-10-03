import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CSV_PATH = '../recipe_crawler/Food Ingredients and Recipe Dataset with Image Name Mapping.csv';

interface IngredientFrequency {
  name: string;
  normalized: string;
  count: number;
  variations: Set<string>;
}

function normalizeIngredient(text: string): string {
  return text
    .toLowerCase()
    // Remove quantities
    .replace(/^[\d\s\/\.\-]+/, '')
    // Remove measurements
    .replace(/\b(cup|cups|tablespoon|tablespoons|tbsp|teaspoon|teaspoons|tsp|ounce|ounces|oz|pound|pounds|lb|lbs|gram|grams|g|kg|ml|liter|pinch|dash|can|package|pkg)\b/gi, '')
    // Remove size descriptors
    .replace(/\b(small|medium|large|extra-large|fresh|frozen|dried|canned|whole|chopped|minced|diced|sliced)\b/gi, '')
    // Remove parenthetical notes
    .replace(/\(.*?\)/g, '')
    // Remove brand names (simple approach)
    .replace(/\b[A-Z][a-z]+®\b/g, '')
    // Normalize to base form
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function categorizeIngredient(name: string): string {
  const lower = name.toLowerCase();

  // Proteins
  if (/(chicken|beef|pork|turkey|lamb|fish|salmon|tuna|shrimp|tofu|egg|bacon|sausage)/i.test(lower)) {
    return 'protein';
  }

  // Dairy
  if (/(milk|butter|cheese|cream|yogurt|sour cream)/i.test(lower)) {
    return 'dairy';
  }

  // Produce - Vegetables
  if (/(tomato|onion|garlic|pepper|carrot|celery|lettuce|spinach|broccoli|potato|mushroom|cucumber|zucchini|cabbage|kale)/i.test(lower)) {
    return 'produce';
  }

  // Produce - Fruits
  if (/(apple|banana|orange|lemon|lime|berry|berries|strawberry|grape|mango|avocado)/i.test(lower)) {
    return 'produce';
  }

  // Grains
  if (/(rice|pasta|bread|flour|oat|quinoa|couscous|barley|noodle)/i.test(lower)) {
    return 'grains';
  }

  // Spices & Herbs
  if (/(salt|pepper|paprika|cumin|oregano|basil|thyme|rosemary|cinnamon|garlic powder|onion powder|chili powder)/i.test(lower)) {
    return 'spices';
  }

  // Oils & Condiments
  if (/(oil|vinegar|soy sauce|ketchup|mustard|mayo|honey)/i.test(lower)) {
    return 'condiments';
  }

  // Canned/Packaged
  if (/(broth|stock|sauce|paste|can)/i.test(lower)) {
    return 'canned';
  }

  return 'other';
}

function inferLocation(category: string): 'fridge' | 'freezer' | 'pantry' {
  switch (category) {
    case 'protein':
    case 'dairy':
    case 'produce':
      return 'fridge';
    case 'grains':
    case 'spices':
    case 'condiments':
    case 'canned':
      return 'pantry';
    default:
      return 'pantry';
  }
}

function inferShelfLife(category: string, isPerishable: boolean): number {
  if (!isPerishable) return 365;

  switch (category) {
    case 'protein':
      return 3;
    case 'dairy':
      return 14;
    case 'produce':
      return 7;
    default:
      return 30;
  }
}

async function extractCanonicalIngredients() {
  console.log('🔍 Extracting canonical ingredients from CSV...\n');

  // Read CSV file
  const fileContent = readFileSync(CSV_PATH, 'utf-8');
  const lines = fileContent.split('\n');

  // Skip header
  const ingredientMap = new Map<string, IngredientFrequency>();

  console.log('📊 Parsing 58k recipes...\n');

  for (let i = 1; i < Math.min(lines.length, 10000); i++) {
    if (i % 1000 === 0) {
      console.log(`  Processed ${i} recipes...`);
    }

    const line = lines[i];
    if (!line.trim()) continue;

    try {
      // Extract ingredients column (column 2 or 5 depending on format)
      const match = line.match(/"?\[(.*?)\]"?/);
      if (!match) continue;

      const ingredientsText = match[1];
      const ingredients = ingredientsText
        .split(/['"],\s*['"]/)
        .map(ing => ing.replace(/['"]/g, '').trim())
        .filter(ing => ing.length > 2);

      for (const ingredient of ingredients) {
        const normalized = normalizeIngredient(ingredient);
        if (normalized.length < 3) continue;

        if (!ingredientMap.has(normalized)) {
          ingredientMap.set(normalized, {
            name: ingredient,
            normalized,
            count: 0,
            variations: new Set(),
          });
        }

        const entry = ingredientMap.get(normalized)!;
        entry.count++;
        entry.variations.add(ingredient);
      }
    } catch (error) {
      // Skip malformed lines
      continue;
    }
  }

  console.log(`\n✅ Found ${ingredientMap.size} unique ingredients\n`);

  // Sort by frequency and take top 500 (98% coverage)
  const topIngredients = Array.from(ingredientMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 500);

  console.log('📥 Top 20 ingredients by frequency:\n');
  topIngredients.slice(0, 20).forEach((ing, index) => {
    console.log(`  ${index + 1}. ${ing.normalized} (${ing.count} occurrences, ${ing.variations.size} variations)`);
  });

  console.log('\n💾 Inserting into Supabase...\n');

  // Clear existing canonical items
  const { count: existingCount } = await supabase
    .from('canonical_items')
    .select('*', { count: 'exact', head: true });

  if (existingCount && existingCount > 0) {
    console.log(`  🗑️  Clearing ${existingCount} existing items...`);
    await supabase.from('canonical_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }

  let inserted = 0;
  let failed = 0;

  for (const ing of topIngredients) {
    const category = categorizeIngredient(ing.name);
    const isPerishable = category === 'protein' || category === 'dairy' || category === 'produce';
    const location = inferLocation(category);
    const shelfLife = inferShelfLife(category, isPerishable);

    try {
      const { error } = await supabase
        .from('canonical_items')
        .insert({
          canonical_name: ing.normalized,
          aliases: Array.from(ing.variations).slice(0, 10), // Top 10 variations
          category,
          typical_unit: 'piece',
          typical_location: location,
          is_perishable: isPerishable,
          typical_shelf_life_days: shelfLife,
        });

      if (error) throw error;

      inserted++;
      console.log(`  ✅ ${inserted}/${topIngredients.length}: ${ing.normalized} (${category})`);
    } catch (error) {
      failed++;
      console.error(`  ❌ Failed: ${ing.normalized}`);
    }
  }

  console.log('\n📊 FINAL SUMMARY:');
  console.log(`  ✅ Inserted: ${inserted}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📈 Total unique ingredients in dataset: ${ingredientMap.size}`);

  // Category breakdown
  const { data: categories } = await supabase
    .from('canonical_items')
    .select('category');

  const categoryCounts = categories?.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('\n📂 Category breakdown:');
  Object.entries(categoryCounts || {}).forEach(([category, count]) => {
    console.log(`  ${category}: ${count} items`);
  });
}

extractCanonicalIngredients().catch(console.error);
