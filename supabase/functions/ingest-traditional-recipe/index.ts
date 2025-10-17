/**
 * Ingest Traditional Recipe Edge Function
 *
 * Purpose: Extract and store recipes from traditional recipe websites
 * using schema.org JSON-LD parsing (no AI cost, $0.00 per recipe)
 *
 * POST /functions/v1/ingest-traditional-recipe
 * Body: { url: string, user_id: string, household_id: string }
 *
 * Returns: CookCard object
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

// Schema.org Recipe Parser (inline for Edge Function)
interface ParsedRecipe {
  title: string;
  description?: string;
  image_url?: string;
  ingredients: string[];
  instructions: string | string[];
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  total_time_minutes?: number;
  servings?: number;
  yield?: string;
  category?: string;
  cuisine?: string;
  author?: {
    name?: string;
    url?: string;
  };
  datePublished?: string;
  rating?: {
    value: number;
    count: number;
  };
  nutrition?: {
    calories?: string;
    protein?: string;
    carbohydrates?: string;
    fat?: string;
  };
  keywords?: string[];
  source_url: string;
}

interface SchemaOrgRecipe {
  '@type': string | string[];
  name?: string;
  description?: string;
  image?: string | string[] | { url: string }[];
  recipeIngredient?: string[];
  recipeInstructions?: any;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  recipeYield?: string | number;
  recipeCategory?: string;
  recipeCuisine?: string;
  author?: { name?: string; url?: string } | { name?: string; url?: string }[];
  datePublished?: string;
  aggregateRating?: {
    ratingValue: number;
    ratingCount?: number;
    reviewCount?: number;
  };
  nutrition?: {
    calories?: string;
    proteinContent?: string;
    carbohydrateContent?: string;
    fatContent?: string;
  };
  keywords?: string | string[];
}

function parseISO8601Duration(duration?: string): number | undefined {
  if (!duration) return undefined;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return undefined;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  return hours * 60 + minutes;
}

function extractImageUrl(image?: string | string[] | { url: string }[]): string | undefined {
  if (!image) return undefined;
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) {
    if (typeof image[0] === 'string') return image[0];
    if (typeof image[0] === 'object' && image[0].url) return image[0].url;
  }
  return undefined;
}

function extractInstructions(recipeInstructions?: any): string | string[] {
  if (!recipeInstructions) return '';
  if (typeof recipeInstructions === 'string') return recipeInstructions;

  if (Array.isArray(recipeInstructions)) {
    const steps: string[] = [];
    for (const instruction of recipeInstructions) {
      if (typeof instruction === 'string') {
        steps.push(instruction);
      } else if (instruction['@type'] === 'HowToStep' && instruction.text) {
        steps.push(instruction.text);
      } else if (instruction['@type'] === 'HowToSection' && Array.isArray(instruction.itemListElement)) {
        for (const step of instruction.itemListElement) {
          if (step.text) steps.push(step.text);
        }
      }
    }
    return steps.length > 0 ? steps : '';
  }

  return '';
}

function extractServings(recipeYield?: string | number): number | undefined {
  if (!recipeYield) return undefined;
  if (typeof recipeYield === 'number') return recipeYield;
  const match = recipeYield.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}

function extractAuthor(author?: { name?: string; url?: string } | { name?: string; url?: string }[]): {
  name?: string;
  url?: string;
} | undefined {
  if (!author) return undefined;
  if (Array.isArray(author)) return author[0];
  return author;
}

function isValidRecipe(recipe: SchemaOrgRecipe): boolean {
  const hasTitle = !!recipe.name && recipe.name.trim().length > 0;
  const hasIngredients = Array.isArray(recipe.recipeIngredient) && recipe.recipeIngredient.length > 0;
  return hasTitle && hasIngredients;
}

async function parseSchemaOrgRecipe(url: string): Promise<ParsedRecipe | null> {
  try {
    console.log('[SchemaOrgParser] Fetching URL:', url);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PantryApp/1.0)',
      },
    });

    if (!response.ok) {
      console.error('[SchemaOrgParser] HTTP error:', response.status);
      return null;
    }

    const html = await response.text();
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis);

    if (!jsonLdMatches || jsonLdMatches.length === 0) {
      console.error('[SchemaOrgParser] No JSON-LD found');
      return null;
    }

    for (const match of jsonLdMatches) {
      try {
        const jsonContent = match.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
        const data = JSON.parse(jsonContent);
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
          const isRecipe = types.some((type: string) => type === 'Recipe');
          if (!isRecipe) continue;

          const recipe: SchemaOrgRecipe = item;
          if (!isValidRecipe(recipe)) continue;

          const author = extractAuthor(recipe.author);

          return {
            title: recipe.name!,
            description: recipe.description,
            image_url: extractImageUrl(recipe.image),
            ingredients: recipe.recipeIngredient || [],
            instructions: extractInstructions(recipe.recipeInstructions),
            prep_time_minutes: parseISO8601Duration(recipe.prepTime),
            cook_time_minutes: parseISO8601Duration(recipe.cookTime),
            total_time_minutes: parseISO8601Duration(recipe.totalTime),
            servings: extractServings(recipe.recipeYield),
            yield: typeof recipe.recipeYield === 'string' ? recipe.recipeYield : undefined,
            category: recipe.recipeCategory,
            cuisine: recipe.recipeCuisine,
            author: author,
            datePublished: recipe.datePublished,
            rating: recipe.aggregateRating
              ? {
                  value: recipe.aggregateRating.ratingValue,
                  count: recipe.aggregateRating.ratingCount || recipe.aggregateRating.reviewCount || 0,
                }
              : undefined,
            nutrition: recipe.nutrition
              ? {
                  calories: recipe.nutrition.calories,
                  protein: recipe.nutrition.proteinContent,
                  carbohydrates: recipe.nutrition.carbohydrateContent,
                  fat: recipe.nutrition.fatContent,
                }
              : undefined,
            keywords: Array.isArray(recipe.keywords)
              ? recipe.keywords
              : typeof recipe.keywords === 'string'
              ? recipe.keywords.split(',').map((k) => k.trim())
              : undefined,
            source_url: url,
          };
        }
      } catch (parseError) {
        console.warn('[SchemaOrgParser] Failed to parse JSON-LD:', parseError);
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error('[SchemaOrgParser] Error:', error);
    return null;
  }
}

// Basic ingredient parser (regex-based, Phase 2 will use recipe-ingredient-parser library)
interface ParsedIngredient {
  ingredient_name: string;
  normalized_name: string;
  amount?: number;
  unit?: string;
  preparation?: string;
  confidence: number;
}

function parseIngredientString(raw: string): ParsedIngredient {
  // Basic regex patterns for amount, unit, ingredient
  // Phase 2 will use recipe-ingredient-parser-v3 library

  const normalized = raw.toLowerCase().trim();

  // Extract amount (number or fraction at start)
  const amountMatch = normalized.match(/^(\d+(?:\/\d+)?|\d+\.\d+)/);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(/\//, '.')) : undefined;

  // Extract unit (common cooking units)
  const unitMatch = normalized.match(/\b(cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|oz|ounce|ounces|lb|lbs|pound|pounds|g|gram|grams|kg|kilogram|kilograms|ml|milliliter|milliliters|l|liter|liters)\b/i);
  const unit = unitMatch ? unitMatch[1] : undefined;

  // Extract preparation notes (after comma)
  const prepMatch = raw.match(/,\s*(.+)$/);
  const preparation = prepMatch ? prepMatch[1].trim() : undefined;

  // Remove amount, unit, preparation to get ingredient name
  let ingredientName = raw;
  if (amountMatch) ingredientName = ingredientName.replace(amountMatch[0], '').trim();
  if (unitMatch) ingredientName = ingredientName.replace(unitMatch[0], '').trim();
  if (prepMatch) ingredientName = ingredientName.replace(prepMatch[0], '').trim();

  return {
    ingredient_name: raw,
    normalized_name: ingredientName.toLowerCase().trim(),
    amount,
    unit,
    preparation,
    confidence: 0.75, // Lower confidence for basic regex parsing
  };
}

// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Content-Type': 'application/json',
};

// Main handler
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('[IngestTraditional] JSON parse error:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body', details: parseError.message }),
        { status: 400, headers: corsHeaders }
      );
    }

    const { url, user_id, household_id, ignore_cache } = body;

    console.log('[IngestTraditional] Request received:', {
      url,
      user_id,
      household_id: household_id || 'none',
      ignore_cache: ignore_cache || false,
      method: req.method,
      headers: Object.fromEntries(req.headers.entries()),
    });

    // Validate required fields
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid required field: url' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!user_id || typeof user_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid required field: user_id' }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log('[IngestTraditional] Processing URL:', url);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check cache (same URL within 30 days)
    // If ignore_cache=true, we still check if record exists but delete it before re-inserting
    const { data: existingCard } = await supabase
      .from('cook_cards')
      .select('*')
      .eq('source_url', url)
      .eq('user_id', user_id)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle();

    if (existingCard && !ignore_cache) {
      // Return cached version (normal mode)
      console.log('[IngestTraditional] ✅ Cache hit! Returning cached cook_card:', existingCard.id);
      return new Response(
        JSON.stringify({
          cook_card: existingCard,
          cache_status: 'cached',
          extraction_method: 'schema_org',
          cost_cents: 0,
        }),
        { status: 200, headers: corsHeaders }
      );
    } else if (existingCard && ignore_cache) {
      // Delete old version to re-extract (testing mode)
      console.log('[IngestTraditional] 🧪 Cache bypassed - deleting old cook_card:', existingCard.id);
      await supabase.from('cook_cards').delete().eq('id', existingCard.id);
    }

    // Parse schema.org recipe
    const recipe = await parseSchemaOrgRecipe(url);

    if (!recipe) {
      console.error('[IngestTraditional] schema.org parsing failed for URL:', url);
      return new Response(
        JSON.stringify({
          error: 'Could not extract recipe from this URL',
          details: 'This website does not support schema.org Recipe markup. Try a different recipe site like NYT Cooking, Bon Appétit, or AllRecipes.',
        }),
        { status: 422, headers: corsHeaders }
      );
    }

    console.log('[IngestTraditional] Extracted recipe:', recipe.title);

    // Determine platform from URL
    const hostname = new URL(url).hostname.replace('www.', '');

    // Format instructions
    // Split into concise, sentence-level steps for better UX
    let instructionsArray: string[];

    console.log('[IngestTraditional] Raw instructions type:', typeof recipe.instructions);
    console.log('[IngestTraditional] Raw instructions (first 200 chars):',
      typeof recipe.instructions === 'string'
        ? recipe.instructions.substring(0, 200)
        : JSON.stringify(recipe.instructions).substring(0, 200)
    );

    if (Array.isArray(recipe.instructions)) {
      // Instructions are an array - split each paragraph into sentences
      instructionsArray = [];
      for (const paragraph of recipe.instructions) {
        // Split by periods, but keep parenthetical notes intact
        // Match: sentence ending with . (but not inside parentheses or numbers like "400.")
        const sentences = paragraph
          .split(/\.(?=\s+[A-Z]|\s*$)/) // Split on period followed by space+capital or end
          .map(s => s.trim())
          .filter(s => s.length > 0)
          .map(s => s.endsWith('.') ? s : s + '.'); // Ensure period at end

        instructionsArray.push(...sentences);
      }
      console.log('[IngestTraditional] Split array into', instructionsArray.length, 'sentence-level steps');
    } else if (typeof recipe.instructions === 'string') {
      // Split by double newlines (paragraph breaks), then by sentences
      const paragraphs = recipe.instructions
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0);

      instructionsArray = [];
      for (const paragraph of paragraphs) {
        const sentences = paragraph
          .split(/\.(?=\s+[A-Z]|\s*$)/)
          .map(s => s.trim())
          .filter(s => s.length > 0)
          .map(s => s.endsWith('.') ? s : s + '.');

        instructionsArray.push(...sentences);
      }
      console.log('[IngestTraditional] Split string into', instructionsArray.length, 'sentence-level steps');
    } else {
      instructionsArray = [];
      console.log('[IngestTraditional] No instructions found');
    }

    const instructionsType = instructionsArray.length > 0 ? 'structured' : 'text';
    const instructionsText = instructionsArray.join('\n\n');
    const instructionsJson = instructionsArray.length > 0
      ? instructionsArray.map((step, idx) => ({ step: idx + 1, text: step }))
      : null;

    console.log('[IngestTraditional] Final instructions:', {
      type: instructionsType,
      arrayLength: instructionsArray.length,
      jsonLength: instructionsJson?.length,
    });

    // Insert cook_card
    const { data: cookCard, error: cardError } = await supabase
      .from('cook_cards')
      .insert({
        user_id,
        household_id,
        source_url: url,
        platform: 'traditional',
        platform_identifier: hostname,
        title: recipe.title,
        description: recipe.description,
        image_url: recipe.image_url,
        creator_name: recipe.author?.name,
        creator_handle: recipe.author?.url,
        prep_time_minutes: recipe.prep_time_minutes,
        cook_time_minutes: recipe.cook_time_minutes,
        servings: recipe.servings,
        instructions_type: instructionsType,
        instructions_text: instructionsText,
        instructions_json: instructionsJson,
        extraction_method: 'schema_org',
        extraction_confidence: 0.95, // High confidence for schema.org data
        extraction_version: 'v1.0',
        extraction_cost_cents: 0, // FREE!
        is_archived: false,
      })
      .select()
      .single();

    if (cardError) {
      console.error('[IngestTraditional] Error inserting cook_card:', cardError);
      throw cardError;
    }

    console.log('[IngestTraditional] Created cook_card:', cookCard.id);

    // Parse and insert ingredients
    const ingredientInserts = recipe.ingredients.map((raw, idx) => {
      const parsed = parseIngredientString(raw);

      return {
        cook_card_id: cookCard.id,
        ingredient_name: parsed.ingredient_name,
        normalized_name: parsed.normalized_name,
        amount: parsed.amount,
        unit: parsed.unit,
        preparation: parsed.preparation,
        confidence: parsed.confidence,
        provenance: 'creator_provided' as const,
        sort_order: idx,
        is_optional: false,
      };
    });

    const { error: ingredientsError } = await supabase
      .from('cook_card_ingredients')
      .insert(ingredientInserts);

    if (ingredientsError) {
      console.error('[IngestTraditional] Error inserting ingredients:', ingredientsError);
      // Don't fail the request, ingredients can be fixed later
    }

    console.log('[IngestTraditional] Inserted', ingredientInserts.length, 'ingredients');

    // Log telemetry
    await supabase.from('cook_card_events').insert({
      event_type: 'recipe_extracted',
      cook_card_id: cookCard.id,
      user_id,
      household_id,
      platform: 'traditional',
      metadata: {
        source: hostname,
        method: 'schema_org',
        ingredient_count: recipe.ingredients.length,
        cost_cents: 0,
      },
    });

    console.log('[IngestTraditional] ✅ Success! Created cook_card:', cookCard.id);

    return new Response(
      JSON.stringify({
        cook_card: cookCard,
        ingredient_count: ingredientInserts.length,
        cache_status: 'fresh',
        extraction_method: 'schema_org',
        cost_cents: 0,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('[IngestTraditional] ❌ Fatal error:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message || 'An unexpected error occurred',
        type: error.name,
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
