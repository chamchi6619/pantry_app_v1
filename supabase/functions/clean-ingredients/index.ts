import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CanonicalItem {
  id: string;
  canonical_name: string;
  aliases: string[] | null;
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
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured in Supabase');
    }

    // Get request parameters
    const { batch_size = 50, offset = 0, limit = 1000 } = await req.json();

    console.log(`Starting cleanup: offset=${offset}, limit=${limit}, batch_size=${batch_size}`);

    // Initialize Supabase client with service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Load canonical items
    const { data: canonical, error: canonicalError } = await supabaseAdmin
      .from('canonical_items')
      .select('id, canonical_name, aliases');

    if (canonicalError) throw canonicalError;

    console.log(`✅ Loaded ${canonical.length} canonical items`);

    // Build canonical lookup map
    const canonicalMap = new Map<string, CanonicalItem>();
    canonical.forEach(item => {
      canonicalMap.set(item.canonical_name.toLowerCase(), item);
      item.aliases?.forEach(alias => {
        canonicalMap.set(alias.toLowerCase(), item);
      });
    });

    // Load ingredients to clean (paginated)
    const { data: ingredients, error: ingredientsError } = await supabaseAdmin
      .from('recipe_ingredients')
      .select('id, recipe_id, notes, ingredient_name, canonical_item_id')
      .range(offset, offset + limit - 1);

    if (ingredientsError) throw ingredientsError;

    console.log(`📊 Processing ${ingredients.length} ingredients`);

    // Process in batches
    const results: IngredientMatch[] = [];
    const batches = chunkArray(ingredients, batch_size);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📦 Processing batch ${i + 1}/${batches.length}...`);

      const batchResults = await processBatch(batch, canonical, canonicalMap, GEMINI_API_KEY);
      results.push(...batchResults);

      // Rate limit
      if (i < batches.length - 1) {
        await sleep(1000);
      }
    }

    // Commit to database
    console.log('💾 Committing results to database...');
    let updated = 0;

    for (const match of results) {
      if (match.canonical_item_id) {
        const { error } = await supabaseAdmin
          .from('recipe_ingredients')
          .update({
            canonical_item_id: match.canonical_item_id,
            ingredient_name: match.extracted_name,
          })
          .eq('id', match.ingredient_id);

        if (!error) updated++;
      }
    }

    // Stats
    const matched = results.filter(r => r.canonical_item_id).length;
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

    console.log(`✅ Updated ${updated} ingredients`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          total: results.length,
          matched,
          unmatched: results.length - matched,
          updated,
          avg_confidence: avgConfidence,
        },
        next_offset: offset + limit,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function processBatch(
  ingredients: RecipeIngredient[],
  canonical: CanonicalItem[],
  canonicalMap: Map<string, CanonicalItem>,
  apiKey: string
): Promise<IngredientMatch[]> {
  const prompt = buildPrompt(ingredients, canonical);

  try {
    // Call Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates[0]?.content?.parts[0]?.text;

    if (!text) {
      throw new Error('No response from Gemini');
    }

    const parsed = JSON.parse(text);

    // Map to canonical IDs
    return parsed.matches.map((match: any) => {
      let canonical_item_id = null;

      if (match.canonical_name) {
        const canonicalItem = canonicalMap.get(match.canonical_name.toLowerCase());
        canonical_item_id = canonicalItem?.id || null;
      }

      return {
        ingredient_id: match.ingredient_id,
        original_text: ingredients.find(i => i.id === match.ingredient_id)?.notes || '',
        extracted_name: match.extracted_name,
        canonical_name: match.canonical_name,
        canonical_item_id,
        confidence: match.confidence,
      };
    });

  } catch (error) {
    console.warn('LLM failed, using fallback:', error);
    // Fallback to rule-based
    return ingredients.map(ing => ({
      ingredient_id: ing.id,
      original_text: ing.notes || ing.ingredient_name,
      extracted_name: extractWithRules(ing),
      canonical_name: null,
      canonical_item_id: null,
      confidence: 0.3,
    }));
  }
}

function buildPrompt(ingredients: RecipeIngredient[], canonical: CanonicalItem[]): string {
  return `You are an expert ingredient parser and matcher.

TASK: For each ingredient, extract the core ingredient name and match to a canonical item.

CANONICAL ITEMS (${canonical.length} available):
${canonical.slice(0, 100).map(c =>
  `- ${c.canonical_name}${c.aliases?.length ? ` (aka: ${c.aliases.join(', ')})` : ''}`
).join('\n')}
... and ${canonical.length - 100} more

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

3. Confidence scoring (0.0 to 1.0):
   - 1.0 = Perfect exact match
   - 0.9 = Clear synonym or variation
   - 0.7-0.8 = Probable match
   - <0.5 = Poor match (set canonical_name to null)

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

function extractWithRules(ing: RecipeIngredient): string {
  const text = ing.notes || ing.ingredient_name;

  let cleaned = text
    .replace(/^[\d\/\.\s]+(tablespoon|tbsp|teaspoon|tsp|cup|ounce|oz|pound|lb|can|clove|medium|large|small|piece|package)s?\s+/i, '')
    .trim();

  cleaned = cleaned.replace(/,\s*(minced|diced|chopped|sliced|cut|peeled|crushed|grated|shredded|cubed).*$/i, '').trim();

  return cleaned;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
