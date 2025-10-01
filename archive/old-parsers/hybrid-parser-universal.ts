import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

console.log('🌍 UNIVERSAL PARSER - v4.3.7 - STRAWBERRIES FIX (ADDRESS PATTERN) - ' + new Date().toISOString());

// ============================================
// UNIVERSAL FORMAT PATTERNS
// ============================================
const RECEIPT_FORMATS = {
  'coded-2line': {
    name: 'Two-line with code',
    detect: (lines, i) => {
      const line = lines[i];

      // Code + Name on same line (with optional leading tax marker like "E 96716 ORG SPINACH")
      if (!/^(?:[A-Z]\s+)?\d{4,13}\s/.test(line) || !/[A-Z]/.test(line)) return false;

      // Skip category headers to find actual price line (just like extract does!)
      let priceLineIndex = i + 1;
      while (priceLineIndex < lines.length && isGarbageLine(lines[priceLineIndex])) {
        priceLineIndex++;
      }

      const nextLine = lines[priceLineIndex] || '';
      // Price on next non-garbage line
      return /^\d+\.\d{2}/.test(nextLine);
    },
    extract: (lines, i, hints) => {
      // Handle optional leading tax marker (E, A, etc.) and special prefixes like "2#"
      // Pattern: "E 96716 ORG SPINACH" or "96716 ORG SPINACH" or "7989312513 0 ORG JALAPENO"
      const match = lines[i].match(/^(?:[A-Z]\s+)?(\d{4,13})(?:\s+\d+)?\s+(?:\d+#\s+)?(.+)$/);
      if (!match) return null;

      const [_, code, rawName] = match;

      // Skip category headers to find actual price lines
      let priceLineIndex = i + 1;
      while (priceLineIndex < lines.length && isGarbageLine(lines[priceLineIndex])) {
        priceLineIndex++;
      }

      const nextLine = lines[priceLineIndex] || '';
      const line3 = lines[priceLineIndex + 1] || '';
      const line4 = lines[priceLineIndex + 2] || '';

      // Check for "You Pay" format (Safeway) - multiple variations
      // Variation 1: Line i+1: "Price", Line i+2: "You Pay", Line i+3: price, Line i+4: actual price
      if (/^Price/i.test(nextLine) && /^You Pay/i.test(line3)) {
        const line5 = lines[priceLineIndex + 3] || '';
        const line6 = lines[priceLineIndex + 4] || '';
        // Always prefer second price on discount lines
        const youPayMatch = line6.match(/^(?:\d+\.\d{2}\s+)?(\d+\.\d{2})\s*[A-Z$]?/);
        if (youPayMatch) {
          return {
            name: rawName,
            price: parseFloat(youPayMatch[1]),
            code,
            raw_text: `${code} ${rawName} ${youPayMatch[1]}`,
            linesConsumed: priceLineIndex - i + 5
          };
        }
      }

      // Variation 2: Line i+1: price, Line i+2: "You Pay", Line i+3: actual price
      if (/^You Pay/i.test(line3)) {
        const youPayMatch = line4.match(/^(?:\d+\.\d{2}\s+)?(\d+\.\d{2})\s*[A-Z$]?/);
        if (youPayMatch) {
          return {
            name: rawName,
            price: parseFloat(youPayMatch[1]),
            code,
            raw_text: `${code} ${rawName} ${youPayMatch[1]}`,
            linesConsumed: priceLineIndex - i + 3
          };
        }
      }

      // CRITICAL: Always prefer second price when two prices exist (discount format)
      // Pattern 1: Two prices on SAME line: "5.49 4.99 S" - take second price
      let priceMatch = nextLine.match(/^\d+\.\d{2}\s+(\d+\.\d{2})\s*[A-Z$]?/);
      if (priceMatch) {
        return {
          name: rawName,
          price: parseFloat(priceMatch[1]),
          code,
          raw_text: `${code} ${rawName} ${priceMatch[1]}`,
          linesConsumed: priceLineIndex - i + 1
        };
      }

      // Pattern 2: Single price on nextLine, check if line3 has discount price on SEPARATE line
      // Example: Line i+1: "4.79", Line i+2: "3.99 S" - take 3.99
      priceMatch = nextLine.match(/^(\d+\.\d{2})\s*[A-Z$]?/);
      if (priceMatch) {
        const firstPrice = parseFloat(priceMatch[1]);

        // Check if line3 has a discount price (different from first price)
        const line3DiscountMatch = line3.match(/^(\d+\.\d{2})\s*[A-Z$]/);
        if (line3DiscountMatch) {
          const secondPrice = parseFloat(line3DiscountMatch[1]);
          // If prices are different, take the second one (discount)
          // If same, also take it (confirming price)
          return {
            name: rawName,
            price: secondPrice,
            code,
            raw_text: `${code} ${rawName} ${secondPrice}`,
            linesConsumed: priceLineIndex - i + 2
          };
        }

        // No discount line, use the single price
        return {
          name: rawName,
          price: firstPrice,
          code,
          raw_text: `${code} ${rawName} ${firstPrice}`,
          linesConsumed: priceLineIndex - i + 1
        };
      }

      return null;
    }
  },

  'coded-3line': {
    name: 'Three-line with code',
    detect: (lines, i) => {
      const line = lines[i];
      const nextLine = lines[i + 1] || '';
      const nextNextLine = lines[i + 2] || '';
      // Code alone, Name, Price
      return /^\d{4,13}$/.test(line) &&
             /^[A-Z]/.test(nextLine) &&
             !/^\d+\.\d{2}/.test(nextLine) &&
             /^\d+\.\d{2}/.test(nextNextLine);
    },
    extract: (lines, i, hints) => {
      const code = lines[i];
      const name = lines[i + 1];

      if (isGarbageLine(name)) return null;

      // Skip category headers to find actual price lines
      let priceLineIndex = i + 2;
      while (priceLineIndex < lines.length && isGarbageLine(lines[priceLineIndex])) {
        priceLineIndex++;
      }

      const priceLine = lines[priceLineIndex] || '';
      const line4 = lines[priceLineIndex + 1] || '';

      // Check for discount format: "8.49 8.49 S" or "5.49 4.99 S" - ALWAYS take second price
      const discountMatch = priceLine.match(/^\d+\.\d{2}\s+(\d+\.\d{2})\s*[A-Z$]?/);
      if (discountMatch) {
        return {
          name,
          price: parseFloat(discountMatch[1]),
          code,
          raw_text: `${code} ${name} ${discountMatch[1]}`,
          linesConsumed: priceLineIndex - i + 1
        };
      }

      // Check if line4 has discount price
      const line4Discount = line4.match(/^\d+\.\d{2}\s+(\d+\.\d{2})\s*[A-Z$]?/);
      if (line4Discount) {
        return {
          name,
          price: parseFloat(line4Discount[1]),
          code,
          raw_text: `${code} ${name} ${line4Discount[1]}`,
          linesConsumed: priceLineIndex - i + 2
        };
      }

      // Regular single price on priceLine
      const priceMatch = priceLine.match(/^(\d+\.\d{2})\s*[A-Z$]?/);
      if (priceMatch) {
        return {
          name,
          price: parseFloat(priceMatch[1]),
          code,
          raw_text: `${code} ${name} ${priceMatch[1]}`,
          linesConsumed: priceLineIndex - i + 1
        };
      }

      return null;
    }
  },

  'plu-coded': {
    name: 'PLU code (produce)',
    detect: (lines, i) => {
      const line = lines[i];
      const nextLine = lines[i + 1] || '';
      // 4-5 digit PLU, name starts with letter or @
      return /^\d{4,5}$/.test(line) && /^[@A-Z\d]/.test(nextLine);
    },
    extract: (lines, i, hints) => {
      const plu = lines[i];
      const name = lines[i + 1];

      if (isGarbageLine(name)) return null;

      // Clean quantity prefix like "2@ " or "2# "
      const cleanName = name.replace(/^\d+[@#]\s*/, '');

      // Skip category headers to find actual price lines
      let priceLineIndex = i + 2;
      while (priceLineIndex < lines.length && isGarbageLine(lines[priceLineIndex])) {
        priceLineIndex++;
      }

      let actualPrice = null;
      let linesConsumed = priceLineIndex - i + 1;

      const line2 = lines[priceLineIndex] || '';
      const line3 = lines[priceLineIndex + 1] || '';
      const line4 = lines[priceLineIndex + 2] || '';

      // Check for discount format: "1.58 1.38 S" - ALWAYS take second price
      const discountMatch = line2.match(/^\d+\.\d{2}\s+(\d+\.\d{2})\s*[A-Z$]?/);
      if (discountMatch) {
        actualPrice = parseFloat(discountMatch[1]);
        linesConsumed = priceLineIndex - i + 1;
      } else if (/^WT/i.test(line2)) {
        // Weight info on line2, check line3 for discount or single price
        const line3Discount = line3.match(/^\d+\.\d{2}\s+(\d+\.\d{2})\s*[A-Z$]?/);
        if (line3Discount) {
          actualPrice = parseFloat(line3Discount[1]);
          linesConsumed = priceLineIndex - i + 2;
        } else {
          const priceMatch = line3.match(/^(\d+\.\d{2})\s*[A-Z$]?/);
          if (priceMatch) {
            actualPrice = parseFloat(priceMatch[1]);
            linesConsumed = priceLineIndex - i + 2;
          }
        }
      } else if (/^WT/i.test(line3)) {
        // Price on line2, weight info on line3, check line4 for any additional price
        const priceMatch = line2.match(/^(\d+\.\d{2})\s*[A-Z$]?/);
        if (priceMatch) {
          actualPrice = parseFloat(priceMatch[1]);
          linesConsumed = priceLineIndex - i + 2;
        }
      } else {
        // Regular single price on line2, but check line3 for separate discount (like coded-2line!)
        const priceMatch = line2.match(/^(\d+\.\d{2})\s*[A-Z$]?/);
        if (priceMatch) {
          const firstPrice = parseFloat(priceMatch[1]);

          // CRITICAL: Check if line3 has a discount price on SEPARATE line
          // Example: line2="1.58", line3="1.38 S" - take 1.38 (discount)
          const line3DiscountMatch = line3.match(/^(\d+\.\d{2})\s*[A-Z$]/);
          if (line3DiscountMatch) {
            const secondPrice = parseFloat(line3DiscountMatch[1]);
            actualPrice = secondPrice;
            linesConsumed = priceLineIndex - i + 2;
          } else {
            // No discount line, use the first price
            actualPrice = firstPrice;
            linesConsumed = priceLineIndex - i + 1;
          }
        }
      }

      if (actualPrice !== null) {
        return {
          name: cleanName,
          price: actualPrice,
          code: plu,
          raw_text: `${plu} ${cleanName} ${actualPrice}`,
          linesConsumed
        };
      }

      return null;
    }
  },

  'single-line': {
    name: 'Single line (name + price)',
    detect: (lines, i) => {
      const line = lines[i];
      // Name and price on same line - but NOT orphaned price lines
      // Must have at least 3 letters in the name portion
      const match = line.match(/^(.+?)\s+(\d+\.\d{2})\s*[A-Z$]?$/);
      if (!match) return false;
      const [_, name, priceStr] = match;
      // Filter out orphaned price lines like "7.99 7.99 T"
      // Require at least 3 letter characters in the name
      const letterCount = (name.match(/[A-Za-z]/g) || []).length;
      return letterCount >= 3;
    },
    extract: (lines, i, hints) => {
      const match = lines[i].match(/^(.+?)\s+(\d+\.\d{2})\s*[A-Z$]?$/);
      if (!match) return null;

      const [_, name, priceStr] = match;
      const price = parseFloat(priceStr);

      // Strict validation: require meaningful text
      const letterCount = (name.match(/[A-Za-z]/g) || []).length;
      if (letterCount < 3 || price <= 0 || price > 1000) return null;

      // Check for discount format: if name contains "price price", take second price
      const twoPrice = name.match(/^(.*?)\s+(\d+\.\d{2})$/);
      if (twoPrice) {
        // This is actually "name price1 price2" format - take price2 (already captured in price)
        const actualName = twoPrice[1];
        if (actualName.length >= 3) {
          return {
            name: actualName,
            price,
            raw_text: lines[i],
            linesConsumed: 1
          };
        }
      }

      return {
        name,
        price,
        raw_text: lines[i],
        linesConsumed: 1
      };
    }
  }
};

// ============================================
// STORE HINTS (Optional Enhancements Only)
// ============================================
const STORE_NORMALIZATIONS = {
  COSTCO: {
    'ORG': 'ORGANIC',
    'KS': 'KIRKLAND SIGNATURE',
    'YEL': 'YELLOW',
    'WHT': 'WHITE',
    'LS': 'LESS SODIUM'
  },
  SAFEWAY: {
    'ORG': 'ORGANIC',
    'LUC': 'LUCERNE',
    'SIG': 'SIGNATURE'
  },
  WALMART: {
    'GV': 'GREAT VALUE',
    'MM': 'MARKETSIDE'
  },
  TARGET: {
    'UP&UP': 'UP AND UP'
  }
};

const STORE_CORRECTIONS = {
  COSTCO: {
    'SPINAC': 'SPINACH',
    'ONIO': 'ONION',
    'BACO': 'BACON'
  },
  SAFEWAY: {
    'CHESE': 'CHEESE'
  }
};

const UNIVERSAL_HINTS = {
  normalizations: {},
  corrections: {}
};

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

    console.log('=== UNIVERSAL PARSER INVOKED ===');
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

    // UNIVERSAL PARSING

    // Step 1: Detect store (for optional polish only)
    const storeName = detectStore(ocr_text);
    console.log('🏪 Store detected:', storeName);

    // Step 2: Get hints (optional enhancements)
    const hints = {
      normalizations: STORE_NORMALIZATIONS[storeName] || {},
      corrections: STORE_CORRECTIONS[storeName] || {}
    };

    // Step 3: Universal format-based extraction
    const { items, formats } = extractItemsUniversal(ocr_text, hints);
    console.log(`✅ Extracted ${items.length} items using formats: ${formats.join(', ')}`);

    // Step 4: Extract totals & calculate confidence
    const totals = extractTotals(ocr_text);
    const confidence = calculateConfidence(items, totals);

    console.log(`📊 Confidence: ${(confidence * 100).toFixed(0)}% (${confidence >= 0.75 ? 'HIGH' : 'LOW'})`);

    // Create receipt record
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        household_id,
        store_name: storeName,
        receipt_date: extractDate(ocr_text),
        total_amount_cents: Math.round((totals.total || 0) * 100),
        tax_amount_cents: Math.round((totals.tax || 0) * 100),
        subtotal_cents: Math.round((totals.subtotal || 0) * 100),
        status: 'pending',
        parse_method: `universal-${formats.join('+')}`,
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
        ocr_confidence: options.ocrConfidence || confidence
      });

    // Insert items into fix queue
    const queueItems = items.map(item => ({
      household_id,
      receipt_id: receipt.id,
      raw_text: item.raw_text,
      parsed_name: item.name,
      quantity: item.quantity || 1,
      unit: item.unit || 'piece',
      price_cents: Math.round(item.price * 100),
      confidence: item.confidence,
      needs_review: item.confidence < 0.8
    }));

    if (queueItems.length > 0) {
      await supabase
        .from('receipt_fix_queue')
        .insert(queueItems);
    }

    return new Response(JSON.stringify({
      success: true,
      receipt_id: receipt.id,
      receipt,
      items: queueItems,
      method: `universal-${formats.join('+')}`,
      confidence: confidence,
      store: storeName
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
// UNIVERSAL EXTRACTION
// ============================================
function extractItemsUniversal(text, hints) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // Find item boundary
  let itemEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^(SUBTOTAL|TAX|BALANCE|TOTAL)/i.test(lines[i])) {
      itemEnd = i;
      break;
    }
  }

  const items = [];
  const formatsUsed = new Set();
  let i = 0;

  while (i < itemEnd) {
    if (isGarbageLine(lines[i])) {
      i++;
      continue;
    }

    // Try all formats in priority order
    let extracted = null;
    let formatUsed = null;

    for (const [formatKey, format] of Object.entries(RECEIPT_FORMATS)) {
      if (format.detect(lines, i)) {
        extracted = format.extract(lines, i, hints);
        if (extracted) {
          formatUsed = formatKey;
          formatsUsed.add(format.name);
          break;
        }
      }
    }

    if (extracted) {
      // Normalize and polish the item name
      const polishedName = normalizeItemName(extracted.name, hints);

      items.push({
        name: polishedName,
        price: extracted.price,
        code: extracted.code,
        quantity: 1,
        unit: 'piece',
        raw_text: extracted.raw_text,
        confidence: calculateItemConfidence(extracted, formatUsed)
      });

      i += extracted.linesConsumed;
    } else {
      i++;
    }
  }

  return {
    items,
    formats: Array.from(formatsUsed)
  };
}

function calculateItemConfidence(item, formatUsed) {
  let conf = 0.75; // Base confidence

  // Higher confidence for coded items
  if (item.code) conf += 0.10;

  // Format-specific adjustments
  if (formatUsed === 'coded-2line' || formatUsed === 'coded-3line') conf += 0.10;
  if (formatUsed === 'plu-coded') conf += 0.05;

  return Math.min(conf, 0.95);
}

// ============================================
// STORE DETECTION (Optional)
// ============================================
function detectStore(text) {
  const firstLines = text.split('\n').slice(0, 10).join(' ').toUpperCase();

  const storeSignatures = {
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

  for (const [storeName, signatures] of Object.entries(storeSignatures)) {
    for (const signature of signatures) {
      if (firstLines.includes(signature)) {
        return storeName;
      }
    }
  }

  return 'UNKNOWN';
}

// ============================================
// HELPERS
// ============================================
function isGarbageLine(line) {
  if (!line || line.length < 2) return true;

  const garbage = [
    /^[EZ]+\s*$/i, /^WHOLESALE$/i, /^SELF[- ]?CHECKOUT/i,
    /^\d+\s+[A-Za-z]+\s+(Blvd|Ave|St|Rd)\b/i,
    /^[A-Za-z]+,\s+[A-Z]{2}\s+\d{5}/i,
    /^MEMBER/i, /^CASH$/i, /^CHANGE/i, /^DEBIT/i, /^CREDIT/i,
    /^GROCERY$/i, /^PRODUCE$/i, /^REFRIG/i, /^FROZEN$/i, /^DAIRY$/i,
    /^SEAFOOD$/i, /^GEN MERCHANDISE$/i, /^BAKED GOODS$/i, /^DELI$/i,
    /^MISCELLANEOUS$/i, /^MEAT$/i, /^BAKERY$/i, /^PHARMACY$/i,
    /^Price$/i, /^You Pay$/i, /^Member Savings/i, /^WT$/i,
    /^\d+\.\d{2}\s+lb\s+@/i, /^YOUR CASHIER/i, /^Store \d+/i,
    /^SUBTOTAL/i, /^TOTAL/i, /^TAX$/i, /^BALANCE/i
  ];

  return garbage.some(p => p.test(line));
}

function normalizeItemName(name, hints) {
  let normalized = name.trim();

  // Apply normalizations
  if (hints.normalizations) {
    for (const [abbr, full] of Object.entries(hints.normalizations)) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'g');
      normalized = normalized.replace(regex, full);
    }
  }

  // Apply corrections
  if (hints.corrections) {
    for (const [wrong, right] of Object.entries(hints.corrections)) {
      if (normalized.includes(wrong)) {
        normalized = normalized.replace(new RegExp(wrong, 'g'), right);
      }
    }
  }

  // Remove trailing single letter tax markers
  return normalized.replace(/\s+[A-Z]$/, '').trim();
}

function extractTotals(text) {
  const lines = text.split('\n').map(l => l.trim());
  let subtotal = 0, tax = 0, total = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^SUBTOTAL/i.test(line)) {
      const match = line.match(/(\d+\.\d{2})/);
      if (match) subtotal = parseFloat(match[1]);
    } else if (/^TAX/i.test(line)) {
      const match = line.match(/(\d+\.\d{2})/);
      if (match) tax = parseFloat(match[1]);
    } else if (/TOTAL|BALANCE/i.test(line)) {
      const match = line.match(/(\d+\.\d{2})/);
      if (match) {
        total = parseFloat(match[1]);
      } else if (i + 1 < lines.length) {
        const nextMatch = lines[i + 1].match(/(\d+\.\d{2})/);
        if (nextMatch) total = parseFloat(nextMatch[1]);
      }
    }
  }

  return { subtotal, tax, total };
}

function calculateConfidence(items, totals) {
  if (items.length === 0) return 0.3;

  let score = 0.5;
  if (items.length >= 5) score += 0.1;
  if (items.length >= 10) score += 0.1;

  const itemsTotal = items.reduce((sum, item) => sum + item.price, 0);
  const expectedTotal = totals.subtotal || totals.total;

  if (expectedTotal > 0) {
    const diff = Math.abs(itemsTotal - expectedTotal);
    const percentDiff = diff / expectedTotal;

    if (percentDiff < 0.01) score += 0.2;
    else if (percentDiff < 0.05) score += 0.15;
    else if (percentDiff < 0.10) score += 0.05;
  }

  const validNames = items.filter(i =>
    i.name.length >= 3 && !/^\d+$/.test(i.name)
  ).length;
  score += (validNames / items.length) * 0.1;

  return Math.min(score, 0.99);
}

function extractDate(text) {
  const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dateMatch) {
    const [_, month, day, year] = dateMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`).toISOString();
  }
  return new Date().toISOString();
}
