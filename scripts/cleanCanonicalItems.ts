import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

interface CanonicalItem {
  id: string;
  canonical_name: string;
  aliases: string[] | null;
  category: string | null;
}

interface CleanedItem {
  original_id: string;
  cleaned_name: string;
  clean_aliases: string[];
  correct_category: string;
  action: 'keep' | 'merge' | 'delete';
  merge_into?: string; // If action is 'merge', which item to merge into
  reason?: string;
}

async function cleanCanonicalItems() {
  console.log('🧹 Starting canonical items cleanup via LLM...\n');

  // Load all canonical items
  const { data: items, error } = await supabase
    .from('canonical_items')
    .select('id, canonical_name, aliases, category')
    .order('canonical_name');

  if (error) {
    console.error('Error loading items:', error);
    return;
  }

  console.log(`📊 Loaded ${items.length} canonical items\n`);

  // Process in batches of 50
  const BATCH_SIZE = 50;
  const results: CleanedItem[] = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    console.log(`\n🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(items.length / BATCH_SIZE)}...`);

    try {
      const cleaned = await processBatch(batch);
      results.push(...cleaned);

      console.log(`✅ Batch complete: ${cleaned.length} items processed`);

      // Rate limit
      if (i + BATCH_SIZE < items.length) {
        await sleep(2000);
      }
    } catch (error) {
      console.error(`❌ Batch failed:`, error);
      break;
    }
  }

  // Save results for review
  const fs = await import('fs');
  fs.writeFileSync(
    'canonical-cleanup-plan.json',
    JSON.stringify(results, null, 2)
  );

  console.log('\n📊 Cleanup Analysis:');
  console.log(`   Total items: ${results.length}`);
  console.log(`   Keep: ${results.filter(r => r.action === 'keep').length}`);
  console.log(`   Merge: ${results.filter(r => r.action === 'merge').length}`);
  console.log(`   Delete: ${results.filter(r => r.action === 'delete').length}`);
  console.log('\n💾 Results saved to: canonical-cleanup-plan.json');
  console.log('\n⚠️  Review the plan before applying changes!');
}

async function processBatch(items: CanonicalItem[]): Promise<CleanedItem[]> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const prompt = buildPrompt(items);
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const parsed = JSON.parse(text);

  return parsed.cleaned_items;
}

function buildPrompt(items: CanonicalItem[]): string {
  return `You are an expert at cleaning and normalizing food ingredient databases.

TASK: Clean and normalize this batch of canonical food items. Fix spacing, consolidate duplicates, remove non-food items, and correct categories.

CURRENT ITEMS:
${items.map(item => `
ID: ${item.id}
Name: ${item.canonical_name}
Aliases: ${item.aliases?.join(', ') || 'none'}
Category: ${item.category}
`).join('\n')}

RULES FOR CLEANING:

1. **Fix spacing**: Remove lack of spaces
   - "activedryyeast" → "active dry yeast"
   - "allpurposeflour" → "all-purpose flour"
   - "applecidervinegar" → "apple cider vinegar"

2. **Consolidate duplicates**: Merge overly specific variations
   - "allpurposeflour", "allpurposeflourdivided", "allpurposeflourplusmorefordusting" → ONE item: "all-purpose flour"
   - Mark extras with action: "merge", merge_into: "corrected name"

3. **Remove non-ingredients**: Delete equipment, utensils
   - "adeepfrythermometer", "aspicemillormortarandpestle" → action: "delete"

4. **Fix categories**: Use correct category
   - produce, protein, dairy, grains, spices, condiments, beverages, other
   - "butternutsquash" is produce, not dairy
   - "basil" is spices, not other

5. **Clean aliases**: Convert to simple synonyms (NO quantities or measurements)
   - Bad: ["1 Tbsp. active dry yeast", "1/2 teaspoon active dry yeast"]
   - Good: ["yeast", "dried yeast", "baking yeast"]
   - Remove all measurement phrases, just keep ingredient variations

6. **Remove serving instructions**: Items like "andlimewedges" are not ingredients
   - action: "delete", reason: "serving instruction, not ingredient"

Return JSON in this format:
{
  "cleaned_items": [
    {
      "original_id": "uuid-here",
      "cleaned_name": "properly spaced name",
      "clean_aliases": ["synonym1", "synonym2"],
      "correct_category": "category",
      "action": "keep",
      "reason": "explanation if deleted or merged"
    },
    {
      "original_id": "uuid-here",
      "cleaned_name": "all-purpose flour",
      "clean_aliases": ["flour", "white flour", "wheat flour"],
      "correct_category": "grains",
      "action": "merge",
      "merge_into": "all-purpose flour",
      "reason": "duplicate variation of all-purpose flour"
    }
  ]
}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

cleanCanonicalItems().catch(console.error);
