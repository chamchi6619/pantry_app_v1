import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

// Pricing: Input $0.075/1M tokens, Output $0.30/1M tokens
const COST_PER_INPUT_TOKEN = 0.075 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 0.30 / 1_000_000;
const BATCH_SIZE = 50; // Smaller batches for safety
const CHECKPOINT_FILE = './cleanup-checkpoint.json';
const RESULTS_FILE = './cleanup-results.json';

interface CanonicalItem {
  id: string;
  canonical_name: string;
  aliases: string[] | null;
  category: string | null;
}

interface RecipeIngredient {
  id: string;
  recipe_id: string;
  notes: string | null;
  ingredient_name: string;
  canonical_item_id: string | null;
}

interface IngredientMatch {
  ingredient_id: string;
  original_text: string;
  extracted_name: string;
  canonical_name: string | null;
  canonical_item_id: string | null;
  confidence: number;
  extraction_method: 'llm' | 'fallback';
  llm_response?: string;
  timestamp: string;
}

interface CleanupCheckpoint {
  batch_index: number;
  processed: number;
  total: number;
  results: IngredientMatch[];
}

interface ValidationResult {
  safe: boolean;
  errors: Array<{
    type: string;
    count: number;
    details?: any;
  }>;
  stats: {
    total: number;
    matched: number;
    unmatched: number;
    high_confidence: number;
    medium_confidence: number;
    low_confidence: number;
  };
}

class IngredientCleaner {
  private canonicalItems: CanonicalItem[] = [];
  private canonicalMap: Map<string, CanonicalItem> = new Map();

  async initialize() {
    console.log('🔧 Initializing ingredient cleaner...\n');

    // Load canonical items
    const { data: canonical, error } = await supabase
      .from('canonical_items')
      .select('id, canonical_name, aliases, category');

    if (error) throw error;
    if (!canonical || canonical.length === 0) {
      throw new Error('No canonical items found in database!');
    }

    this.canonicalItems = canonical;

    // Build lookup map for validation
    this.canonicalItems.forEach(item => {
      this.canonicalMap.set(item.canonical_name.toLowerCase(), item);
      item.aliases?.forEach(alias => {
        this.canonicalMap.set(alias.toLowerCase(), item);
      });
    });

    console.log(`✅ Loaded ${this.canonicalItems.length} canonical items`);
    console.log(`✅ Built index with ${this.canonicalMap.size} searchable terms\n`);
  }

  async cleanAll() {
    console.log('🧹 Starting ingredient cleanup process...\n');

    // 1. Load ingredients to clean
    const { data: ingredients, error } = await supabase
      .from('recipe_ingredients')
      .select('id, recipe_id, notes, ingredient_name, canonical_item_id');

    if (error) throw error;

    console.log(`📊 Found ${ingredients.length} ingredients to process\n`);

    // 2. Check for already cleaned ingredients
    const alreadyCleaned = ingredients.filter(i => i.canonical_item_id);
    if (alreadyCleaned.length > 0) {
      console.log(`⚠️  ${alreadyCleaned.length} ingredients already have canonical_item_id`);
      console.log(`   This will overwrite existing mappings.\n`);

      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise<string>(resolve => {
        readline.question('Continue? (yes/no): ', resolve);
      });
      readline.close();

      if (answer.toLowerCase() !== 'yes') {
        console.log('❌ Cleanup cancelled');
        return;
      }
      console.log('');
    }

    // 3. Estimate cost
    const estimatedCost = this.estimateCost(ingredients.length);
    console.log(`💰 Estimated cost: $${estimatedCost.toFixed(3)}`);
    console.log(`   Input tokens: ~${Math.round(estimatedCost / COST_PER_INPUT_TOKEN * 0.8)} @ $0.075/1M`);
    console.log(`   Output tokens: ~${Math.round(estimatedCost / COST_PER_OUTPUT_TOKEN * 0.2)} @ $0.30/1M\n`);

    // 4. Check for checkpoint (resumable)
    let startBatch = 0;
    let previousResults: IngredientMatch[] = [];

    if (existsSync(CHECKPOINT_FILE)) {
      const checkpoint: CleanupCheckpoint = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8'));
      console.log(`📍 Found checkpoint: ${checkpoint.processed}/${checkpoint.total} processed`);

      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const resume = await new Promise<string>(resolve => {
        readline.question('Resume from checkpoint? (yes/no): ', resolve);
      });
      readline.close();

      if (resume.toLowerCase() === 'yes') {
        startBatch = checkpoint.batch_index + 1;
        previousResults = checkpoint.results;
        console.log(`✅ Resuming from batch ${startBatch}\n`);
      } else {
        console.log('✅ Starting fresh\n');
      }
    }

    // 5. Process in batches
    const batches = this.chunkArray(ingredients, BATCH_SIZE);
    const allResults: IngredientMatch[] = [...previousResults];

    console.log(`🔄 Processing ${batches.length} batches (${BATCH_SIZE} ingredients each)...\n`);

    for (let i = startBatch; i < batches.length; i++) {
      const batch = batches[i];
      const batchNum = i + 1;

      console.log(`📦 Batch ${batchNum}/${batches.length}...`);

      try {
        const batchResults = await this.processBatch(batch);
        allResults.push(...batchResults);

        // Save checkpoint after each batch
        this.saveCheckpoint({
          batch_index: i,
          processed: allResults.length,
          total: ingredients.length,
          results: allResults
        });

        // Log batch stats
        const matched = batchResults.filter(r => r.canonical_item_id).length;
        const avgConfidence = batchResults.reduce((sum, r) => sum + r.confidence, 0) / batchResults.length;
        console.log(`   ✓ Matched: ${matched}/${batchResults.length}, Avg confidence: ${avgConfidence.toFixed(2)}`);
        console.log(`   Progress: ${allResults.length}/${ingredients.length} (${Math.round(allResults.length/ingredients.length*100)}%)\n`);

        // Rate limit (1 req/sec)
        if (i < batches.length - 1) {
          await this.sleep(1000);
        }
      } catch (error) {
        console.error(`❌ Error in batch ${batchNum}:`, error);
        console.log(`   Checkpoint saved, you can resume from here.\n`);
        throw error;
      }
    }

    // 6. Save all results
    writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));
    console.log(`💾 Results saved to ${RESULTS_FILE}\n`);

    // 7. Validate results
    console.log('🔍 Validating results...\n');
    const validation = await this.validateResults(allResults);

    if (!validation.safe) {
      console.log('⚠️  Validation warnings:\n');
      validation.errors.forEach(err => {
        console.log(`   - ${err.type}: ${err.count} items`);
      });
      console.log('');
    }

    // 8. Show stats
    console.log('📊 Cleanup Statistics:');
    console.log(`   Total processed: ${validation.stats.total}`);
    console.log(`   Matched: ${validation.stats.matched} (${Math.round(validation.stats.matched/validation.stats.total*100)}%)`);
    console.log(`   Unmatched: ${validation.stats.unmatched} (${Math.round(validation.stats.unmatched/validation.stats.total*100)}%)`);
    console.log(`   High confidence (≥0.8): ${validation.stats.high_confidence}`);
    console.log(`   Medium confidence (0.5-0.8): ${validation.stats.medium_confidence}`);
    console.log(`   Low confidence (<0.5): ${validation.stats.low_confidence}\n`);

    // 9. Generate reports
    this.generateReports(allResults);

    // 10. Commit to database
    if (validation.safe || validation.errors.length === 0) {
      console.log('💾 Committing to database...\n');
      await this.commitToDatabase(allResults);
      console.log('✅ Database updated successfully!\n');

      // Clean up checkpoint
      if (existsSync(CHECKPOINT_FILE)) {
        require('fs').unlinkSync(CHECKPOINT_FILE);
      }
    } else {
      console.log('⚠️  Results saved but NOT committed to database due to validation issues.');
      console.log('   Review the reports and run again if needed.\n');
    }

    console.log('🎉 Cleanup complete!\n');
  }

  async processBatch(ingredients: RecipeIngredient[]): Promise<IngredientMatch[]> {
    const prompt = this.buildPrompt(ingredients);

    try {
      // Call LLM
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1, // Low temperature for consistency
        }
      });

      const responseText = result.response.text();
      const parsed = JSON.parse(responseText);

      // Map to canonical IDs
      const matches: IngredientMatch[] = parsed.matches.map((match: any) => {
        let canonical_item_id = null;

        if (match.canonical_name) {
          const canonicalItem = this.canonicalMap.get(match.canonical_name.toLowerCase());
          canonical_item_id = canonicalItem?.id || null;

          if (!canonical_item_id) {
            console.warn(`   ⚠️  LLM returned "${match.canonical_name}" but it's not in canonical items`);
          }
        }

        return {
          ingredient_id: match.ingredient_id,
          original_text: ingredients.find(i => i.id === match.ingredient_id)?.notes || '',
          extracted_name: match.extracted_name,
          canonical_name: match.canonical_name,
          canonical_item_id,
          confidence: match.confidence,
          extraction_method: 'llm',
          llm_response: responseText,
          timestamp: new Date().toISOString()
        };
      });

      return matches;

    } catch (error) {
      console.warn('   ⚠️  LLM failed, using fallback rule-based matching');

      // Fallback to simple rule-based matching
      return ingredients.map(ing => ({
        ingredient_id: ing.id,
        original_text: ing.notes || ing.ingredient_name,
        extracted_name: this.extractWithRules(ing),
        canonical_name: null,
        canonical_item_id: null,
        confidence: 0.3,
        extraction_method: 'fallback' as const,
        timestamp: new Date().toISOString()
      }));
    }
  }

  buildPrompt(ingredients: RecipeIngredient[]): string {
    return `You are an expert ingredient parser and matcher.

TASK: For each ingredient, extract the core ingredient name and match to a canonical item.

CANONICAL ITEMS (${this.canonicalItems.length} available):
${this.canonicalItems.slice(0, 100).map(c =>
  `- ${c.canonical_name}${c.aliases?.length ? ` (aka: ${c.aliases.join(', ')})` : ''}`
).join('\n')}
... and ${this.canonicalItems.length - 100} more

INGREDIENTS TO PROCESS:
${ingredients.map(ing => `${ing.id}: "${ing.notes || ing.ingredient_name}"`).join('\n')}

RULES FOR EXTRACTION:
1. Extract the CORE ingredient name (remove quantities, units, preparations)
   Examples:
   - "1 pound boneless, skinless chicken breast" → "chicken breast"
   - "2 tablespoons olive oil" → "olive oil"
   - "1 can (14.5 oz) diced tomatoes" → "diced tomatoes"

2. Match to the BEST canonical item by MEANING (not just text):
   - "chicken breast" → "chicken"
   - "scallions" → "green onion"
   - "cilantro" → "coriander"
   - "peanut butter" → "peanut butter" (compound ingredient)

3. Understand context:
   - "coconut milk" vs "coconut" are DIFFERENT
   - "tomato sauce" vs "tomato" are DIFFERENT
   - "chicken stock" vs "chicken" are DIFFERENT

4. Confidence scoring (0.0 to 1.0):
   - 1.0 = Perfect exact match
   - 0.9 = Clear synonym or variation
   - 0.7-0.8 = Probable match
   - 0.5-0.6 = Uncertain, but likely
   - <0.5 = Poor match (set canonical_name to null)

5. If NO good match exists, return canonical_name: null

Return JSON in this EXACT format:
{
  "matches": [
    {
      "ingredient_id": "uuid-here",
      "extracted_name": "cleaned ingredient name",
      "canonical_name": "canonical item name or null",
      "confidence": 0.95
    }
  ]
}`;
  }

  extractWithRules(ing: RecipeIngredient): string {
    const text = ing.notes || ing.ingredient_name;

    // Remove leading quantity and units
    let cleaned = text
      .replace(/^[\d\/\.\s]+(tablespoon|tbsp|teaspoon|tsp|cup|ounce|oz|pound|lb|can|clove|medium|large|small|piece|package)s?\s+/i, '')
      .trim();

    // Remove preparation instructions after comma
    cleaned = cleaned.replace(/,\s*(minced|diced|chopped|sliced|cut|peeled|crushed|grated|shredded|cubed).*$/i, '').trim();

    return cleaned;
  }

  async validateResults(results: IngredientMatch[]): Promise<ValidationResult> {
    const errors: Array<{ type: string; count: number; details?: any }> = [];

    // Check 1: Validate all canonical_item_ids exist
    const invalidIds = results
      .filter(r => r.canonical_item_id)
      .filter(r => !this.canonicalItems.find(c => c.id === r.canonical_item_id));

    if (invalidIds.length > 0) {
      errors.push({
        type: 'invalid_canonical_id',
        count: invalidIds.length,
        details: invalidIds.slice(0, 5) // Show first 5
      });
    }

    // Check 2: Unmatched rate
    const unmatchedCount = results.filter(r => !r.canonical_item_id).length;
    const unmatchedPct = unmatchedCount / results.length;

    if (unmatchedPct > 0.4) {
      errors.push({
        type: 'high_unmatched_rate',
        count: unmatchedCount,
        details: `${Math.round(unmatchedPct * 100)}% unmatched`
      });
    }

    // Check 3: Low confidence rate
    const lowConfidence = results.filter(r => r.confidence < 0.5);
    const lowConfidencePct = lowConfidence.length / results.length;

    if (lowConfidencePct > 0.3) {
      errors.push({
        type: 'high_low_confidence_rate',
        count: lowConfidence.length,
        details: `${Math.round(lowConfidencePct * 100)}% low confidence`
      });
    }

    return {
      safe: errors.length === 0,
      errors,
      stats: {
        total: results.length,
        matched: results.filter(r => r.canonical_item_id).length,
        unmatched: unmatchedCount,
        high_confidence: results.filter(r => r.confidence >= 0.8).length,
        medium_confidence: results.filter(r => r.confidence >= 0.5 && r.confidence < 0.8).length,
        low_confidence: lowConfidence.length
      }
    };
  }

  async commitToDatabase(results: IngredientMatch[]) {
    console.log('   Updating recipe_ingredients table...');

    // Update in batches to avoid timeout
    const updateBatches = this.chunkArray(results, 100);

    for (let i = 0; i < updateBatches.length; i++) {
      const batch = updateBatches[i];

      for (const match of batch) {
        await supabase
          .from('recipe_ingredients')
          .update({
            canonical_item_id: match.canonical_item_id,
            ingredient_name: match.extracted_name, // Fix the broken names too!
          })
          .eq('id', match.ingredient_id);
      }

      console.log(`   Updated ${(i + 1) * 100}/${results.length}...`);
    }
  }

  generateReports(results: IngredientMatch[]) {
    // Report 1: Unmatched ingredients
    const unmatched = results.filter(r => !r.canonical_item_id);
    if (unmatched.length > 0) {
      writeFileSync(
        './cleanup-unmatched.json',
        JSON.stringify(unmatched, null, 2)
      );
      console.log(`📄 Unmatched ingredients saved to cleanup-unmatched.json`);
    }

    // Report 2: Low confidence matches
    const lowConfidence = results.filter(r => r.confidence < 0.7 && r.canonical_item_id);
    if (lowConfidence.length > 0) {
      writeFileSync(
        './cleanup-low-confidence.json',
        JSON.stringify(lowConfidence, null, 2)
      );
      console.log(`📄 Low confidence matches saved to cleanup-low-confidence.json`);
    }

    // Report 3: Summary by canonical item
    const byCanonicall: Record<string, number> = {};
    results.filter(r => r.canonical_name).forEach(r => {
      byCanonicall[r.canonical_name!] = (byCanonicall[r.canonical_name!] || 0) + 1;
    });

    const summary = Object.entries(byCanonicall)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([name, count]) => ({ canonical_name: name, count }));

    writeFileSync(
      './cleanup-summary.json',
      JSON.stringify(summary, null, 2)
    );
    console.log(`📄 Top 50 canonical items saved to cleanup-summary.json\n`);
  }

  estimateCost(ingredientCount: number): number {
    const batchCount = Math.ceil(ingredientCount / BATCH_SIZE);
    const canonicalListTokens = this.canonicalItems.length * 10; // ~10 tokens per item
    const ingredientsPerBatchTokens = BATCH_SIZE * 20; // ~20 tokens per ingredient
    const outputPerBatchTokens = BATCH_SIZE * 15; // ~15 tokens per match

    const inputTokensPerBatch = canonicalListTokens + ingredientsPerBatchTokens + 500; // +500 for prompt
    const outputTokensPerBatch = outputPerBatchTokens;

    const totalInputTokens = inputTokensPerBatch * batchCount;
    const totalOutputTokens = outputTokensPerBatch * batchCount;

    return (totalInputTokens * COST_PER_INPUT_TOKEN) + (totalOutputTokens * COST_PER_OUTPUT_TOKEN);
  }

  saveCheckpoint(checkpoint: CleanupCheckpoint) {
    writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
  }

  chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run cleanup
async function main() {
  try {
    const cleaner = new IngredientCleaner();
    await cleaner.initialize();
    await cleaner.cleanAll();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
