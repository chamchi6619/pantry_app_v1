import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

console.log('🤖 Gemini 2.0 Flash with AI Normalization - ' + new Date().toISOString());

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Receipt JSON Schema with normalization
const receiptSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raw_text: { type: "string" },
          item_name: { type: "string" },
          category: { type: "string" },
          price: { type: "number" },
          quantity: { type: "number" },
          unit: { type: "string" }
        },
        required: ["raw_text", "item_name", "price", "quantity", "unit"]
      }
    }
  },
  required: ["items"]
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { ocr_text, household_id } = await req.json();

    console.log('=== GEMINI 2.0 FLASH PARSER ===');
    console.log('Household:', household_id);
    console.log('OCR length:', ocr_text?.length || 0);
    console.log('📝 RAW OCR TEXT:');
    console.log('─────────────────────────────────────────────');
    console.log(ocr_text);
    console.log('─────────────────────────────────────────────');

    if (!ocr_text || !household_id) {
      throw new Error('Missing required fields: ocr_text, household_id');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    // Check for duplicate
    const encoder = new TextEncoder();
    const data = encoder.encode(ocr_text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const { data: existingJob } = await supabase
      .from('receipt_jobs')
      .select('*')
      .eq('content_hash', hashHex)
      .eq('household_id', household_id)
      .single();

    if (existingJob?.receipt_id) {
      console.log('⚠️ Duplicate receipt detected');

      const { data: items } = await supabase
        .from('receipt_fix_queue')
        .select('*')
        .eq('receipt_id', existingJob.receipt_id);

      const { data: receipt } = await supabase
        .from('receipts')
        .select('*')
        .eq('id', existingJob.receipt_id)
        .single();

      return new Response(JSON.stringify({
        success: true,
        duplicate: true,
        receipt_id: existingJob.receipt_id,
        receipt,
        items: items || [],
        method: 'cached'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Detect store first
    const storeName = detectStore(ocr_text);
    console.log('🏪 Detected store:', storeName);

    // Call Gemini 2.0 Flash with JSON mode
    console.log('🤖 Calling Gemini 2.0 Flash with normalization...');

    const prompt = `Extract and normalize items from this receipt to JSON.

For each item provide:
- raw_text: Item name EXACTLY as it appears on receipt (abbreviations and all)
- item_name: Normalized, readable product name
- category: One of: dairy, produce, meat, seafood, pantry, frozen, beverages, bakery, deli, household, other
- price: ACTUAL PRICE PAID (use rightmost price, "You Pay" column, or price after discounts)
- quantity: Number of units (extract from weight lines like "1.09 lb @" or from "2@" prefix, default 1)
- unit: Unit of measure - "lb" for pounds, "oz" for ounces, "g" for grams, "piece" for count items, "pack", "bunch", "gallon", "liter"

CRITICAL PRICE RULES:
- If receipt has "Price" and "You Pay" columns, use "You Pay" amount
- If item has "Member Savings" or discount, use discounted price NOT original price
- Use the rightmost dollar amount on each item line
- Ignore original/crossed-out prices

QUANTITY & UNIT RULES:
- Look for weight lines: "WT 1.09 lb @ $X.XX /lb" means quantity=1.09, unit="lb"
- Look for count prefix: "2@ LEMONS" means quantity=2, unit="piece"
- If no quantity specified, use quantity=1
- Weight units: lb, oz, g, kg
- Volume units: gallon, liter, ml, fl oz
- Count units: piece, pack, bunch, dozen
- Match the unit from the receipt (if it says "lb", use "lb" not "piece")

NORMALIZATION RULES:
1. Expand abbreviations: ORG→Organic, WHP→Whipped, CHZ→Cheese, MLK→Milk, CHKN→Chicken, GRND→Ground, BNLS→Boneless, LG→Large, SM→Small, CRM→Cream, VEG→Vegetable, BTR→Butter, BRD→Bread
2. Infer specific product names using brand, context, and price
3. PRESERVE important attributes: Organic, size, grade, flavor, brand
4. Use concise names (2-5 words)
5. DO NOT hallucinate details not on receipt

Store: ${storeName}

${ocr_text}`;

    console.log('🤖 GEMINI REQUEST:');
    console.log('─────────────────────────────────────────────');
    console.log('Prompt length:', prompt.length);
    console.log('First 500 chars of prompt:');
    console.log(prompt.substring(0, 500));
    console.log('─────────────────────────────────────────────');

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: receiptSchema
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API failed: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    console.log('Gemini response received');

    console.log('🤖 GEMINI RAW RESPONSE:');
    console.log('─────────────────────────────────────────────');
    console.log(JSON.stringify(geminiData, null, 2));
    console.log('─────────────────────────────────────────────');

    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error('No response from Gemini');
    }

    console.log('🤖 GEMINI PARSED JSON:');
    console.log('─────────────────────────────────────────────');
    console.log(responseText);
    console.log('─────────────────────────────────────────────');

    const result = JSON.parse(responseText);
    console.log(`✅ Parsed ${result.items?.length || 0} items`);

    // Calculate totals from items
    const itemsTotal = result.items?.reduce((sum: number, item: any) => sum + (item.price || 0), 0) || 0;
    const confidence = itemsTotal > 0 ? 0.9 : 0.85;

    console.log(`Items total: $${itemsTotal.toFixed(2)}, Confidence: ${(confidence * 100).toFixed(0)}%`);

    // Log each parsed item
    console.log('📦 ITEMS BREAKDOWN:');
    result.items?.forEach((item: any, idx: number) => {
      console.log(`  ${idx + 1}. ${item.item_name}`);
      console.log(`     Raw: "${item.raw_text}"`);
      console.log(`     Price: $${item.price}`);
      console.log(`     Qty: ${item.quantity || 1} ${item.unit || 'piece'}`);
      console.log(`     Category: ${item.category || 'other'}`);
    });

    // Create receipt record
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        household_id,
        store_name: storeName,
        receipt_date: new Date().toISOString(),
        total_amount_cents: Math.round(itemsTotal * 100),
        tax_amount_cents: 0,
        subtotal_cents: Math.round(itemsTotal * 100),
        status: 'pending',
        parse_method: 'gemini-2.0-flash-normalized',
        confidence: confidence,
        raw_text: ocr_text.substring(0, 10000)
      })
      .select()
      .single();

    if (receiptError) throw receiptError;

    // Create job record
    await supabase
      .from('receipt_jobs')
      .insert({
        content_hash: hashHex,
        household_id,
        receipt_id: receipt.id,
        status: 'completed',
        completed_at: new Date().toISOString(),
        ocr_confidence: confidence
      });

    // Insert items into fix queue
    const queueItems = result.items?.map((item: any) => ({
      household_id,
      receipt_id: receipt.id,
      raw_text: item.raw_text || item.item_name,  // Original from receipt
      parsed_name: item.item_name,  // Normalized name
      categories: item.category || 'other',  // AI-inferred category
      quantity: item.quantity || 1,
      unit: item.unit || 'piece',  // Use extracted unit, default to piece
      price_cents: Math.round(item.price * 100),
      confidence: confidence,
      needs_review: confidence < 0.8
    })) || [];

    if (queueItems.length > 0) {
      await supabase
        .from('receipt_fix_queue')
        .insert(queueItems);
    }

    // Calculate cost (rough estimate)
    const inputTokens = (ocr_text.length + prompt.length) / 4;
    const outputTokens = JSON.stringify(result).length / 4;
    const cost = (inputTokens / 1_000_000 * 0.10) + (outputTokens / 1_000_000 * 0.40);

    return new Response(JSON.stringify({
      success: true,
      receipt_id: receipt.id,
      receipt,
      items: queueItems,
      method: 'gemini-2.0-flash-normalized',
      confidence: confidence,
      store: storeName,
      gemini_cost: cost
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function detectStore(text: string): string {
  const firstLines = text.split('\n').slice(0, 10).join(' ').toUpperCase();

  const stores = {
    COSTCO: ['COSTCO', 'WHOLESALE', 'KIRKLAND'],
    SAFEWAY: ['SAFEWAY'],
    WALMART: ['WAL-MART', 'WALMART'],
    TARGET: ['TARGET'],
    KROGER: ['KROGER'],
    'WHOLE FOODS': ['WHOLE FOODS', 'WFM'],
    TRADER_JOES: ['TRADER JOE'],
    ALBERTSONS: ['ALBERTSONS'],
    PUBLIX: ['PUBLIX']
  };

  for (const [storeName, signatures] of Object.entries(stores)) {
    for (const signature of signatures) {
      if (firstLines.includes(signature)) {
        return storeName;
      }
    }
  }

  return 'UNKNOWN';
}
