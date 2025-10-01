import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

console.log('🎯 PARSER VERSION: v17 ADAPTIVE HYBRID - ' + new Date().toISOString());

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { ocr_text, household_id, options = {} } = await req.json();

    console.log('=== V17 ADAPTIVE HYBRID PARSER INVOKED ===');
    console.log('Household:', household_id);
    console.log('OCR text length:', ocr_text?.length || 0);

    if (!ocr_text || !household_id) {
      throw new Error('Missing required fields');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for duplicate
    const contentHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(ocr_text)
    );
    const hashHex = Array.from(new Uint8Array(contentHash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    console.log('Content hash:', hashHex);

    const { data: existingJob } = await supabase
      .from('receipt_jobs')
      .select('*')
      .eq('content_hash', hashHex)
      .eq('household_id', household_id)
      .single();

    if (existingJob?.receipt_id) {
      console.log('⚠️ Duplicate receipt detected:', existingJob.receipt_id);

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

    // ADAPTIVE PARSING - Detect store and use appropriate strategy
    const store = detectStore(ocr_text);
    console.log('🏪 Detected store:', store);

    let parseResult;

    // Use adaptive parser based on store
    switch(store) {
      case 'COSTCO':
        console.log('📦 Using ADAPTIVE COSTCO parser (handles 2-line & 3-line)');
        parseResult = parseCostcoAdaptive(ocr_text);
        break;
      case 'SAFEWAY':
        console.log('🛒 Using SAFEWAY parser');
        parseResult = parseSafewayReceipt(ocr_text);
        break;
      default:
        console.log('📝 Using UNIVERSAL adaptive parser');
        parseResult = parseUniversalAdaptive(ocr_text);
    }

    console.log(`✅ Parse complete: ${parseResult.items.length} items, confidence: ${parseResult.confidence}`);

    // Create receipt record
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        household_id,
        store_name: parseResult.store || 'UNKNOWN',
        receipt_date: parseResult.date || new Date().toISOString(),
        total_amount_cents: Math.round(parseResult.total * 100) || 0,
        tax_amount_cents: Math.round((parseResult.tax || 0) * 100),
        status: 'pending',
        parse_method: parseResult.method,
        confidence: parseResult.confidence,
        raw_text: ocr_text.substring(0, 10000)
      })
      .select()
      .single();

    if (receiptError) throw receiptError;

    // Create job record
    const { error: jobError } = await supabase
      .from('receipt_jobs')
      .insert({
        content_hash: hashHex,
        household_id,
        receipt_id: receipt.id,
        status: 'completed',
        completed_at: new Date().toISOString(),
        ocr_confidence: options.ocrConfidence || parseResult.confidence
      });

    if (jobError) console.error('Job creation error:', jobError);

    // Insert items into fix queue
    const queueItems = parseResult.items.map(item => ({
      household_id,
      receipt_id: receipt.id,
      raw_text: item.raw_text || `${item.name} ${item.price}`,
      parsed_name: item.name,
      quantity: item.quantity || 1,
      unit: item.unit || 'piece',
      price_cents: Math.round(item.price * 100),
      confidence: item.confidence || 0.5,
      needs_review: item.confidence < 0.8
    }));

    const { error: queueError } = await supabase
      .from('receipt_fix_queue')
      .insert(queueItems);

    if (queueError) console.error('Queue error:', queueError);

    return new Response(JSON.stringify({
      success: true,
      receipt_id: receipt.id,
      receipt,
      items: queueItems,
      method: parseResult.method,
      confidence: parseResult.confidence
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

// ============================================
// STORE DETECTION
// ============================================
function detectStore(text) {
  const firstLines = text.split('\n').slice(0, 10).join(' ').toUpperCase();

  if (firstLines.includes('COSTCO') || firstLines.includes('WHOLESALE')) return 'COSTCO';
  if (firstLines.includes('SAFEWAY')) return 'SAFEWAY';
  if (firstLines.includes('WALMART')) return 'WALMART';
  if (firstLines.includes('TARGET')) return 'TARGET';
  if (firstLines.includes('KROGER')) return 'KROGER';
  if (firstLines.includes('WHOLE FOODS')) return 'WHOLE FOODS';

  // Also check for Costco-specific patterns
  if (/^\d{6,7}$/m.test(text.substring(0, 500))) {
    console.log('Detected Costco by item code pattern');
    return 'COSTCO';
  }

  return 'UNKNOWN';
}

// ============================================
// COSTCO ADAPTIVE PARSER (Handles 2-line & 3-line)
// ============================================
function parseCostcoAdaptive(text) {
  console.log('🏬 COSTCO ADAPTIVE Parser: Auto-detecting format...');

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // Step 1: Detect format type
  const format = detectCostcoFormat(lines);
  console.log(`📋 Detected format: ${format}`);

  const items = [];

  // Find where items end (before SUBTOTAL)
  let itemEndIndex = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^SUBTOTAL/i.test(lines[i])) {
      itemEndIndex = i;
      console.log(`📍 Found SUBTOTAL at line ${i}`);
      break;
    }
  }

  console.log(`📦 Processing ${itemEndIndex} lines for items`);

  let i = 0;
  let itemCount = 0;

  while (i < itemEndIndex) {
    const line = lines[i];

    // Skip garbage
    if (isCostcoGarbageLine(line)) {
      i++;
      continue;
    }

    // Try to extract item based on detected format
    const item = extractCostcoItem(lines, i, itemEndIndex, format);

    if (item) {
      itemCount++;
      items.push(item);
      console.log(`✅ Item #${itemCount}: ${item.name} - $${item.price.toFixed(2)}`);
      i += item.linesConsumed;
    } else {
      i++;
    }
  }

  console.log(`📊 Total items parsed: ${items.length}`);

  // Extract totals
  const totals = extractTotals(lines, itemEndIndex, text);

  // Calculate confidence
  const confidence = calculateConfidence(items, totals);

  return {
    items,
    store: 'COSTCO',
    total: totals.total,
    tax: totals.tax,
    date: extractDate(text),
    confidence,
    method: `costco-adaptive-${format}`
  };
}

// ============================================
// FORMAT DETECTION
// ============================================
function detectCostcoFormat(lines) {
  let twoLineCount = 0;
  let threeLineCount = 0;

  // Sample first 20 lines (or all if less)
  const sampleSize = Math.min(20, lines.length);

  for (let i = 0; i < sampleSize - 1; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    // Pattern 1: CODE NAME on same line
    // Example: "96716 ORG SPINACH"
    if (/^\d{6,7}\s+[A-Z]/.test(line)) {
      // Check if next line is a price
      if (/^\d+\.\d{2}\s*[EA]?$/.test(nextLine)) {
        twoLineCount++;
      }
    }

    // Pattern 2: CODE alone on one line
    // Example: "96716" then "ORG SPINACH" then "3.79 E"
    if (/^\d{6,7}$/.test(line)) {
      // Check if next line is item name (letters)
      if (/^[A-Z]/.test(nextLine) && !/^\d+\.\d{2}/.test(nextLine)) {
        threeLineCount++;
      }
    }
  }

  console.log(`🔍 Format analysis: 2-line=${twoLineCount}, 3-line=${threeLineCount}`);

  // If we found more 2-line patterns, use 2-line
  // Otherwise default to 3-line (original format)
  return twoLineCount > threeLineCount ? '2-line' : '3-line';
}

// ============================================
// ADAPTIVE ITEM EXTRACTION
// ============================================
function extractCostcoItem(lines, i, endIndex, format) {
  const line = lines[i];

  if (format === '2-line') {
    // Format: CODE NAME (line 1) → PRICE [EA] (line 2)
    const match = line.match(/^(\d{6,7})\s+(.+)$/);

    if (match) {
      const [_, code, rawName] = match;

      // Get price from next line
      if (i + 1 < endIndex) {
        const priceLine = lines[i + 1];
        const priceMatch = priceLine.match(/^(\d+\.\d{2})(?:\s*[EA])?$/);

        if (priceMatch) {
          const price = parseFloat(priceMatch[1]);
          const name = normalizeCostcoItemName(rawName);

          return {
            name,
            price,
            code,
            quantity: 1,
            unit: 'piece',
            raw_text: `${code} ${rawName} ${price}`,
            confidence: 0.92,
            linesConsumed: 2
          };
        }
      }
    }
  } else {
    // Format: CODE (line 1) → NAME (line 2) → PRICE [EA] (line 3)
    if (/^\d{6,7}$/.test(line)) {
      const code = line;

      if (i + 1 < endIndex) {
        let itemName = lines[i + 1];
        let priceLineOffset = 2;

        // Handle discounts "2.00 OFF"
        if (/^\d+\.\d{2}\s+OFF$/i.test(itemName)) {
          console.log(`💰 Found discount: ${itemName}`);
          if (i + 2 < endIndex) {
            itemName = lines[i + 2];
            priceLineOffset = 3;
          }
        }

        // Skip if garbage
        if (isCostcoGarbageLine(itemName)) {
          return null;
        }

        // Get price
        if (i + priceLineOffset < endIndex) {
          const priceLine = lines[i + priceLineOffset];
          const priceMatch = priceLine.match(/^(\d+\.\d{2})(?:\s*[EA])?$/);

          if (priceMatch) {
            const price = parseFloat(priceMatch[1]);
            const name = normalizeCostcoItemName(itemName);

            return {
              name,
              price,
              code,
              quantity: 1,
              unit: 'piece',
              raw_text: `${code} ${itemName} ${price}`,
              confidence: 0.95,
              linesConsumed: priceLineOffset + 1
            };
          }
        }
      }
    }
  }

  return null;
}

// ============================================
// COSTCO ITEM NAME NORMALIZATION
// ============================================
function normalizeCostcoItemName(name) {
  // Remove trailing single letters (OCR errors)
  let normalized = name.replace(/\s+[A-Z]$/, '').trim();

  // Expand common Costco abbreviations
  const expansions = {
    'ORG': 'ORGANIC',
    'KS': 'KIRKLAND SIGNATURE',
    'LS': 'LESS SODIUM',
    'WHT': 'WHITE',
    'YEL': 'YELLOW',
    'PNT': 'PEANUT',
    'BTR': 'BUTTER',
    'CHKN': 'CHICKEN',
    'BRST': 'BREAST',
    'GRND': 'GROUND',
    'BF': 'BEEF'
  };

  // Apply expansions
  for (const [abbr, full] of Object.entries(expansions)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'g');
    normalized = normalized.replace(regex, full);
  }

  // Common OCR corrections
  const corrections = {
    'SPINAC': 'SPINACH',
    'BACO': 'BACON',
    'CAULIFLOWE': 'CAULIFLOWER',
    'PEPPE': 'PEPPER',
    'PEAC': 'PEACH',
    'ITAL': 'ITALIAN',
    'ONIO': 'ONION',
    'MAY': 'MAYO',
    'SALS': 'SALSA'
  };

  for (const [wrong, right] of Object.entries(corrections)) {
    if (normalized.includes(wrong)) {
      normalized = normalized.replace(new RegExp(wrong, 'g'), right);
    }
  }

  return normalized;
}

// ============================================
// GARBAGE LINE DETECTION
// ============================================
function isCostcoGarbageLine(line) {
  if (!line || line.length < 2) return true;

  const garbagePatterns = [
    /^WHOLESALE$/i,
    /^EWHOLESAL/i,
    /^COSTCO/i,
    /^SELF[- ]?CHECKOUT/i,
    /^ZV International/i,
    /^[EZ]+\s*$/i,  // Just E's or Z's alone
    /^\d+\s+[A-Za-z]+\s+(Blvd|Ave|St|Rd|Way|Drive)/i,
    /^[A-Za-z]+,\s+[A-Z]{2}\s+\d{5}/i,
    /^MEMBER/i,
    /^CASH$/i,
    /^CHANGE/i,
    /^CREDIT/i,
    /^DEBIT/i,
    /^Zwwww/i  // OCR garbage from your receipt
  ];

  return garbagePatterns.some(pattern => pattern.test(line));
}

// ============================================
// TOTAL EXTRACTION
// ============================================
function extractTotals(lines, startIndex, fullText) {
  let subtotal = 0;
  let tax = 0;
  let total = 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];

    if (/^SUBTOTAL/i.test(line)) {
      const match = line.match(/(\d+\.\d{2})/);
      if (match) {
        subtotal = parseFloat(match[1]);
        console.log(`💵 Subtotal: $${subtotal}`);
      }
    } else if (/^TAX/i.test(line)) {
      const match = line.match(/(\d+\.\d{2})/);
      if (match) {
        tax = parseFloat(match[1]);
        console.log(`💵 Tax: $${tax}`);
      }
    } else if (/\*{2,}\s*TOTAL/i.test(line)) {
      const match = line.match(/(\d+\.\d{2})/);
      if (match) {
        total = parseFloat(match[1]);
      } else if (i + 1 < lines.length) {
        const nextMatch = lines[i + 1].match(/(\d+\.\d{2})/);
        if (nextMatch) {
          total = parseFloat(nextMatch[1]);
        }
      }
      console.log(`💵 Total: $${total}`);
    }
  }

  // Fallback total search
  if (total === 0) {
    const totalMatch = fullText.match(/^TOTAL\s+(\d+\.\d{2})/mi);
    if (totalMatch) {
      total = parseFloat(totalMatch[1]);
      console.log(`💵 Total (fallback): $${total}`);
    }
  }

  return { subtotal, tax, total };
}

// ============================================
// CONFIDENCE CALCULATION
// ============================================
function calculateConfidence(items, totals) {
  if (items.length === 0) return 0.3;

  let confidence = 0.5;

  // Item count check
  if (items.length >= 5) confidence += 0.1;
  if (items.length >= 10) confidence += 0.1;

  // Price reconciliation
  const itemsTotal = items.reduce((sum, item) => sum + item.price, 0);
  const expectedTotal = totals.subtotal || totals.total;

  if (expectedTotal > 0) {
    const diff = Math.abs(itemsTotal - expectedTotal);
    const percentDiff = diff / expectedTotal;

    if (percentDiff < 0.01) {
      confidence += 0.2; // Perfect match
    } else if (percentDiff < 0.05) {
      confidence += 0.15; // Close match
    } else if (percentDiff < 0.10) {
      confidence += 0.05; // Reasonable
    }

    console.log(`💰 Reconciliation: items=$${itemsTotal.toFixed(2)}, expected=$${expectedTotal.toFixed(2)}, diff=${(percentDiff * 100).toFixed(1)}%`);
  }

  // Name quality check
  const validNames = items.filter(item =>
    item.name.length >= 3 &&
    !/^\d+$/.test(item.name) &&
    item.name !== 'E' &&
    item.name !== 'A'
  ).length;

  const nameQuality = validNames / items.length;
  confidence += nameQuality * 0.1;

  console.log(`📊 Confidence breakdown: items=${items.length}, reconciliation=${percentDiff ? (percentDiff * 100).toFixed(1) + '%' : 'N/A'}, nameQuality=${(nameQuality * 100).toFixed(0)}%`);

  return Math.min(confidence, 0.99);
}

// ============================================
// DATE EXTRACTION
// ============================================
function extractDate(text) {
  const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dateMatch) {
    const [_, month, day, year] = dateMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`).toISOString();
  }
  return new Date().toISOString();
}

// ============================================
// UNIVERSAL ADAPTIVE PARSER (for unknown stores)
// ============================================
function parseUniversalAdaptive(text) {
  console.log('🌍 UNIVERSAL Adaptive Parser: Starting...');

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const items = [];

  for (const line of lines) {
    // Skip obvious non-items
    if (isUniversalSkipLine(line)) continue;

    // Try to extract item and price
    const itemMatch = line.match(/^(.+?)\s+(\d+\.\d{2})$/);
    if (itemMatch) {
      const name = itemMatch[1].trim();
      const price = parseFloat(itemMatch[2]);

      if (name.length > 2 && price > 0 && price < 1000) {
        items.push({
          name,
          price,
          quantity: 1,
          unit: 'piece',
          raw_text: line,
          confidence: 0.7
        });
      }
    }
  }

  // Extract total
  let total = 0;
  const totalMatch = text.match(/TOTAL\s+\$?(\d+\.\d{2})/i);
  if (totalMatch) {
    total = parseFloat(totalMatch[1]);
  }

  const confidence = items.length > 0 ? 0.65 : 0.2;

  return {
    items,
    store: detectStore(text),
    total,
    tax: 0,
    date: extractDate(text),
    confidence,
    method: 'universal-adaptive'
  };
}

function isUniversalSkipLine(line) {
  return /^(SUBTOTAL|TOTAL|TAX|PAYMENT|CASH|CREDIT|DEBIT|CHANGE|THANK|STORE\s*#)/i.test(line);
}

// ============================================
// SAFEWAY PARSER (Keep existing from v16)
// ============================================
function parseSafewayReceipt(text) {
  // Your existing Safeway logic here
  return {
    items: [],
    store: 'SAFEWAY',
    total: 0,
    tax: 0,
    date: extractDate(text),
    confidence: 0.3,
    method: 'safeway-specific'
  };
}
