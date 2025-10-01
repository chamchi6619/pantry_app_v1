import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

console.log('🎯 PARSER VERSION: v16 COSTCO-FOCUSED (3-line format) - ' + new Date().toISOString());

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

    console.log('=== V16 COSTCO-FOCUSED PARSER INVOKED ===');
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

    // DETECT STORE AND ROUTE TO APPROPRIATE PARSER
    const store = detectStore(ocr_text);
    console.log('🏪 Detected store:', store);

    let parseResult;

    // Use store-specific parser if available
    switch(store) {
      case 'COSTCO':
        console.log('📦 Using dedicated COSTCO 3-line parser');
        parseResult = parseCostcoReceiptV16(ocr_text);
        break;
      case 'SAFEWAY':
        console.log('🛒 Using dedicated SAFEWAY parser');
        parseResult = parseSafewayReceipt(ocr_text);
        break;
      default:
        console.log('📝 Using generic parser');
        parseResult = parseGenericReceipt(ocr_text);
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
// COSTCO-SPECIFIC PARSER V16 (3-LINE FORMAT)
// ============================================
function parseCostcoReceiptV16(text) {
  console.log('🏬 COSTCO V16 Parser: Starting 3-line format parsing');

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const items = [];

  // Find where items end (before SUBTOTAL)
  let itemEndIndex = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^SUBTOTAL/i.test(lines[i])) {
      itemEndIndex = i;
      console.log(`📍 Found SUBTOTAL at line ${i}, items end here`);
      break;
    }
  }

  console.log(`📦 Processing ${itemEndIndex} lines for items`);

  // Parse items in Costco 3-line format
  let i = 0;
  let itemCount = 0;

  while (i < itemEndIndex) {
    const line = lines[i];

    // Skip known garbage and headers
    if (isCostcoGarbageLine(line)) {
      console.log(`🗑️ Skipping garbage/header: ${line}`);
      i++;
      continue;
    }

    // Check if this looks like an item code (6-7 digits)
    if (/^\d{6,7}$/.test(line)) {
      const code = line;

      // Next line should be the item name
      if (i + 1 < itemEndIndex) {
        let itemName = lines[i + 1];
        let priceLineOffset = 2;

        // Handle special cases like "2.00 OFF"
        if (/^\d+\.\d{2}\s+OFF$/i.test(itemName)) {
          console.log(`💰 Found discount: ${itemName}`);
          // The actual item name is on the next line
          if (i + 2 < itemEndIndex) {
            itemName = lines[i + 2];
            priceLineOffset = 3;
          }
        }

        // Skip if item name looks like garbage
        if (isCostcoGarbageLine(itemName)) {
          console.log(`🗑️ Item name is garbage: ${itemName}`);
          i++;
          continue;
        }

        // Look for price
        let price = 0;
        if (i + priceLineOffset < itemEndIndex) {
          const priceLine = lines[i + priceLineOffset];

          // Match various price formats
          const priceMatch = priceLine.match(/^(\d+\.\d{2})(?:\s*[EA])?$/);
          if (priceMatch) {
            price = parseFloat(priceMatch[1]);
          }
        }

        // Only add if we have a valid price
        if (price > 0) {
          itemCount++;

          // Clean up item name
          const cleanedName = cleanCostcoItemName(itemName);

          items.push({
            name: cleanedName,
            price: price,
            code: code,
            quantity: 1,
            unit: 'piece',
            raw_text: `${code} ${itemName} ${price}`,
            confidence: 0.95
          });

          console.log(`✅ Item #${itemCount}: ${cleanedName} - $${price.toFixed(2)} (code: ${code})`);

          // Skip the lines we processed
          i += priceLineOffset + 1;
        } else {
          console.log(`⚠️ No price found for ${code} ${itemName}`);
          i++;
        }
      } else {
        i++;
      }
    } else {
      // Not an item code, skip
      i++;
    }
  }

  console.log(`📊 Total items parsed: ${items.length}`);

  // Extract totals
  let subtotal = 0;
  let tax = 0;
  let total = 0;

  // Look for SUBTOTAL, TAX, and TOTAL
  for (let i = itemEndIndex; i < lines.length; i++) {
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
      // Look for total amount on this line or next
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

  // If no total found with **, try without
  if (total === 0) {
    const totalMatch = text.match(/^TOTAL\s+(\d+\.\d{2})/mi);
    if (totalMatch) {
      total = parseFloat(totalMatch[1]);
      console.log(`💵 Total (fallback): $${total}`);
    }
  }

  // Extract date
  let date = null;
  const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dateMatch) {
    const [_, month, day, year] = dateMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    date = new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`).toISOString();
  }

  console.log('📊 Parse Summary:');
  console.log(`  Items: ${items.length}`);
  console.log(`  Subtotal: $${subtotal}`);
  console.log(`  Tax: $${tax}`);
  console.log(`  Total: $${total}`);

  return {
    items,
    store: 'COSTCO',
    total,
    tax,
    date,
    confidence: items.length > 0 ? 0.95 : 0.3,
    method: 'costco-v16-3line'
  };
}

function isCostcoGarbageLine(line) {
  // Skip empty or too short lines
  if (!line || line.length < 2) return true;

  // Skip known garbage patterns
  const garbagePatterns = [
    /^WHOLESALE$/i,
    /^EWHOLESAL/i,
    /^COSTCO/i,
    /^SELF[- ]?CHECKOUT/i,
    /^ZV International/i,
    /^(REE+|EEE+|ZEE+)\s*(EEE+)?$/i,  // REEEE EEE patterns
    /^[REZ]+\s+[EZ]+$/i,               // Similar garbage
    /^E+$/i,                            // Just E's
    /^[A-Z]\s+[A-Z]$/,                 // Single letters
    /^\d+\s+[A-Za-z]+\s+(Blvd|Ave|St|Rd|Way|Drive)/i,  // Addresses
    /^[A-Za-z]+,\s+[A-Z]{2}\s+\d{5}/i,   // City, State ZIP
    /^MEMBER/i,
    /^A MEMBER WOULD/i,
    /^CASH$/i,
    /^CHANGE DUE/i,
    /^CREDIT/i,
    /^DEBIT/i
  ];

  return garbagePatterns.some(pattern => pattern.test(line));
}

function cleanCostcoItemName(name) {
  // Remove trailing single letters that might be OCR errors
  let cleaned = name.replace(/\s+[A-Z]$/, '');

  // Common corrections
  const corrections = {
    'ORG SPINAC': 'ORG SPINACH',
    'KS LS BACO': 'KS LS BACON',
    'RIP CAULIFLOWE': 'RIP CAULIFLOWER',
    'MIXED PEPPE': 'MIXED PEPPER',
    'WHITE PEAC': 'WHITE PEACH',
    'RUSTIC ITAL': 'RUSTIC ITALIAN',
    'KS ORG PNT BT': 'KS ORG PNT BUTTER',
    'KS MAY': 'KS MAYO',
    'KS SALS': 'KS SALSA'
  };

  for (const [wrong, right] of Object.entries(corrections)) {
    if (cleaned.toUpperCase().includes(wrong)) {
      cleaned = cleaned.replace(new RegExp(wrong, 'gi'), right);
    }
  }

  return cleaned;
}

// ============================================
// SAFEWAY-SPECIFIC PARSER (keep from v15)
// ============================================
function parseSafewayReceipt(text) {
  console.log('🛒 SAFEWAY Parser: Starting dedicated Safeway parsing');

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const items = [];

  // Safeway format: Often has standalone PLUs that need merging
  const mergedLines = mergeSafewayPLUs(lines);

  // Find item boundaries
  let inItemSection = false;
  let itemEndIndex = lines.length;

  for (let i = 0; i < mergedLines.length; i++) {
    const line = mergedLines[i];

    // Start after store header
    if (!inItemSection && /SAFEWAY|Store\s*#/i.test(line)) {
      inItemSection = true;
      continue;
    }

    // Stop at payment section
    if (/^(SUBTOTAL|TAX|TOTAL|PAYMENT|CASH|CREDIT|DEBIT)/i.test(line)) {
      itemEndIndex = i;
      break;
    }

    if (!inItemSection) continue;

    // Skip department headers
    if (isSafewayDepartment(line)) continue;

    // Parse Safeway item formats
    // Format 1: PLU ITEMNAME
    const pluItemMatch = line.match(/^(\d{4,5})\s+(.+)/);
    if (pluItemMatch) {
      const [_, plu, rest] = pluItemMatch;
      const name = rest.replace(/\s+\d+\.\d{2}.*$/, '').trim();

      // Look for "You Pay" price or regular price
      let price = 0;
      for (let j = i + 1; j < Math.min(i + 4, mergedLines.length); j++) {
        if (/You\s+Pa[yv]/i.test(mergedLines[j])) {
          const priceMatch = mergedLines[j].match(/(\d+\.\d{2})/);
          if (priceMatch) {
            price = parseFloat(priceMatch[1]);
            break;
          }
        } else if (/^\d+\.\d{2}$/.test(mergedLines[j])) {
          price = parseFloat(mergedLines[j]);
        }
      }

      if (price > 0) {
        items.push({
          name: correctProduceName(name, plu),
          price: price,
          code: plu,
          quantity: 1,
          unit: 'piece',
          raw_text: line,
          confidence: 0.9
        });
      }
    }

    // Format 2: Regular item NAME PRICE
    const regularMatch = line.match(/^([A-Z][A-Z\s]+?)\s+(\d+\.\d{2})/);
    if (regularMatch && !isSafewayDepartment(line)) {
      items.push({
        name: regularMatch[1].trim(),
        price: parseFloat(regularMatch[2]),
        quantity: 1,
        unit: 'piece',
        raw_text: line,
        confidence: 0.85
      });
    }
  }

  // Extract total
  let total = 0;
  const totalMatch = text.match(/TOTAL\s+\$?(\d+\.\d{2})/i);
  if (totalMatch) {
    total = parseFloat(totalMatch[1]);
  }

  return {
    items,
    store: 'SAFEWAY',
    total,
    tax: 0,
    date: extractDate(text),
    confidence: items.length > 0 ? 0.9 : 0.3,
    method: 'safeway-specific'
  };
}

function mergeSafewayPLUs(lines) {
  const merged = [];
  const skipNext = new Set();

  for (let i = 0; i < lines.length; i++) {
    if (skipNext.has(i)) continue;

    // Check for standalone PLU
    if (/^\d{4,5}$/.test(lines[i])) {
      const plu = lines[i];
      const nextLine = lines[i + 1];

      // Merge with next line if it's the item name
      if (nextLine && /^\d+\s+[A-Z]/i.test(nextLine)) {
        const itemName = nextLine.replace(/^\d+\s+/, '').trim();
        merged.push(`${plu} ${itemName}`);
        skipNext.add(i + 1);
        console.log(`🔗 Merged: ${plu} + ${nextLine} → ${plu} ${itemName}`);
      } else {
        merged.push(lines[i]);
      }
    } else {
      merged.push(lines[i]);
    }
  }

  return merged;
}

function isSafewayDepartment(line) {
  return /^(PRODUCE|GROCERY|DAIRY|DELI|MEAT|BAKERY|FROZEN)/i.test(line);
}

function correctProduceName(name, plu) {
  const PLU_NAMES = {
    '4053': 'LEMONS',
    '4608': 'GARLIC',
    '4011': 'BANANAS',
    '4067': 'ZUCCHINI',
    '4068': 'GREEN ONIONS'
  };

  if (PLU_NAMES[plu]) {
    // If name is garbled, use PLU database
    if (name.length < 3 || /^[A-Z]{1,3}$/.test(name)) {
      return PLU_NAMES[plu];
    }

    // If name is similar, correct it
    const correctName = PLU_NAMES[plu];
    if (calculateSimilarity(name.toUpperCase(), correctName) > 0.3) {
      return correctName;
    }
  }

  return name;
}

// ============================================
// GENERIC FALLBACK PARSER
// ============================================
function parseGenericReceipt(text) {
  console.log('📝 GENERIC Parser: Using fallback parser');

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const items = [];

  for (const line of lines) {
    // Skip obvious non-items
    if (isGenericSkipLine(line)) continue;

    // Try to extract item and price
    const itemMatch = line.match(/^(.+?)\s+(\d+\.\d{2})$/);
    if (itemMatch) {
      const name = itemMatch[1].trim();
      const price = parseFloat(itemMatch[2]);

      if (name.length > 2 && price > 0 && price < 1000) {
        items.push({
          name: name,
          price: price,
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

  return {
    items,
    store: detectStore(text),
    total,
    tax: 0,
    date: extractDate(text),
    confidence: items.length > 0 ? 0.6 : 0.2,
    method: 'generic'
  };
}

function isGenericSkipLine(line) {
  return /^(SUBTOTAL|TOTAL|TAX|PAYMENT|CASH|CREDIT|DEBIT|CHANGE|THANK|STORE\s*#)/i.test(line);
}

// ============================================
// UTILITY FUNCTIONS
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

function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}