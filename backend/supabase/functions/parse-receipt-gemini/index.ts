import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

console.log('🤖 Gemini 2.0 Flash JSON Mode - ' + new Date().toISOString());

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Receipt JSON Schema
const receiptSchema = {
  type: "object",
  properties: {
    merchant: { type: "string" },
    date: { type: "string" },
    total: { type: "number" },
    subtotal: { type: "number" },
    tax: { type: "number" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raw_text: { type: "string" },
          item_name: { type: "string" },
          price: { type: "number" },
          quantity: { type: "number" },
          unit: { type: "string" },
          category: { type: "string" }
        },
        required: ["item_name", "price"]
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

    // Call Gemini 2.0 Flash with JSON mode
    console.log('🤖 Calling Gemini 2.0 Flash...');

    const prompt = `Extract all items from this receipt.

Normalize abbreviations:
ORG→Organic, MLK→Milk, WHP→Whipped, WHD→Whipped, CRM→Cream, HVY→Heavy
CHKN→Chicken, BF→Beef, CHZ→Cheese, CHED→Cheddar, VEG→Vegetable
GRND→Ground, BRST→Breast, BNLS→Boneless, SKLS→Skinless
WHL→Whole, SM/SML→Small, LG/LRG→Large

Receipt text:
${ocr_text}`;

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

    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error('No response from Gemini');
    }

    const result = JSON.parse(responseText);
    console.log(`✅ Parsed ${result.items?.length || 0} items`);

    // Extract totals
    const itemsTotal = result.items?.reduce((sum: number, item: any) => sum + (item.price || 0), 0) || 0;
    const receiptTotal = result.total || itemsTotal;
    const confidence = receiptTotal > 0 ? Math.min(itemsTotal / receiptTotal, 0.99) : 0.85;

    console.log(`Total: $${receiptTotal.toFixed(2)}, Confidence: ${(confidence * 100).toFixed(0)}%`);

    // Detect store
    const storeName = detectStore(ocr_text);

    // Create receipt record
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        household_id,
        store_name: storeName,
        receipt_date: result.date || new Date().toISOString(),
        total_amount_cents: Math.round(receiptTotal * 100),
        tax_amount_cents: Math.round((result.tax || 0) * 100),
        subtotal_cents: Math.round((result.subtotal || itemsTotal) * 100),
        status: 'pending',
        parse_method: 'gemini-2.0-flash',
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
      raw_text: item.raw_text || item.item_name,
      parsed_name: item.item_name,
      quantity: item.quantity || 1,
      unit: item.unit || 'piece',
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
      method: 'gemini-2.0-flash',
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
