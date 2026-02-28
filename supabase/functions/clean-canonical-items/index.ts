import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  merge_into?: string;
  reason?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const { batch_size = 50, offset = 0 } = await req.json();

    console.log(`Starting cleanup: offset=${offset}, batch_size=${batch_size}`);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Load canonical items
    const { data: items, error } = await supabaseAdmin
      .from('canonical_items')
      .select('id, canonical_name, aliases, category')
      .order('canonical_name')
      .range(offset, offset + batch_size - 1);

    if (error) throw error;

    console.log(`📊 Processing ${items.length} items`);

    // Process with Gemini
    const cleaned = await processBatch(items, GEMINI_API_KEY);

    console.log(`✅ Batch complete: ${cleaned.length} items processed`);

    return new Response(
      JSON.stringify({
        success: true,
        cleaned_items: cleaned,
        stats: {
          total: cleaned.length,
          keep: cleaned.filter(c => c.action === 'keep').length,
          merge: cleaned.filter(c => c.action === 'merge').length,
          delete: cleaned.filter(c => c.action === 'delete').length,
        },
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
  items: CanonicalItem[],
  apiKey: string
): Promise<CleanedItem[]> {
  const prompt = buildPrompt(items);

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
        },
        thinkingConfig: {
          thinkingBudget: 0,
        },
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
   - Mark extras with action: "merge", merge_into: "all-purpose flour"

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
      "action": "keep"
    },
    {
      "original_id": "uuid-here",
      "cleaned_name": "all-purpose flour",
      "clean_aliases": ["flour", "white flour", "wheat flour"],
      "correct_category": "grains",
      "action": "merge",
      "merge_into": "all-purpose flour",
      "reason": "duplicate variation of all-purpose flour"
    },
    {
      "original_id": "uuid-here",
      "cleaned_name": "deep-fry thermometer",
      "clean_aliases": [],
      "correct_category": "other",
      "action": "delete",
      "reason": "kitchen equipment, not an ingredient"
    }
  ]
}`;
}
