import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

console.log('🎯 HYBRID PARSER - Production Ready - ' + new Date().toISOString());

// ============================================
// STORE HINTS DATABASE
// ============================================
const STORE_HINTS = {
  COSTCO: {
    signatures: ['COSTCO', 'WHOLESALE', 'KIRKLAND'],
    fingerprints: {
      hasItemCodes: true,
      codePattern: /^\d{4,7}/,
      taxMarkers: ['E', 'A']
    },
    formats: ['2-line', '3-line'],
    patterns: {
      itemCode2Line: /^(\d{4,7})\s+(.+)$/,
      itemCode3Line: /^\d{4,7}$/,
      price: /^(\d+\.\d{2})(?:\s*[EA])?$/
    },
    normalizations: {
      'ORG': 'ORGANIC',
      'KS': 'KIRKLAND SIGNATURE',
      'LS': 'LESS SODIUM',
      'WHT': 'WHITE',
      'YEL': 'YELLOW',
      'PNT': 'PEANUT',
      'BTR': 'BUTTER',
      'CHKN': 'CHICKEN',
      'BRST': 'BREAST',
      'GRND': 'GROUND'
    },
    corrections: {
      'SPINAC': 'SPINACH',
      'BACO': 'BACON',
      'ONIO': 'ONION',
      'PEAC': 'PEACH',
      'ITAL': 'ITALIAN',
      'PEPPE': 'PEPPER'
    }
  },
  WALMART: {
    signatures: ['WAL-MART', 'WALMART', 'WAL MART'],
    fingerprints: {
      hasItemCodes: false,
      taxMarkers: ['X', 'O', 'N', 'T']
    },
    formats: ['single-line'],
    patterns: {
      itemLine: /^(.+?)\s+(\d+\.\d{2})\s*[XONT]?$/,
      price: /\s+(\d+\.\d{2})\s*[XONT]$/
    },
    normalizations: {
      'GV': 'GREAT VALUE',
      'MM': 'MARKETSIDE'
    },
    corrections: {}
  },
  SAFEWAY: {
    signatures: ['SAFEWAY'],
    fingerprints: {
      hasItemCodes: true,
      codePattern: /^\d{4,10}/,
      taxMarkers: ['S', '$']
    },
    formats: ['2-line', '3-line'],
    patterns: {
      upcCode2Line: /^(\d{10})\s+(.+)$/,
      upcCode3Line: /^\d{10}$/,
      pluCode: /^(\d{4})$/,
      priceSingle: /^(\d+\.\d{2})$/,
      priceWithDiscount: /^\d+\.\d{2}\s+(\d+\.\d{2})\s*[S$]/,
      youPay: /(\d+\.\d{2})\s*[S$]/
    },
    normalizations: {
      'ORG': 'ORGANIC',
      'LUC': 'LUCERNE',
      'SIG': 'SIGNATURE'
    },
    corrections: {
      'CHESE': 'CHEESE'
    }
  },
  KROGER: {
    signatures: ['KROGER'],
    fingerprints: { hasItemCodes: false },
    formats: ['single-line'],
    patterns: {
      itemLine: /^(.+?)\s+(\d+\.\d{2})$/
    },
    normalizations: { 'KR': 'KROGER' },
    corrections: {}
  },
  TARGET: {
    signatures: ['TARGET'],
    fingerprints: {
      hasItemCodes: false,
      taxMarkers: ['T', 'F']
    },
    formats: ['single-line'],
    patterns: {
      itemLine: /^(.+?)\s+(\d+\.\d{2})\s*[TF]?$/
    },
    normalizations: { 'UP&UP': 'UP AND UP' },
    corrections: {}
  }
};

const UNIVERSAL_HINTS = {
  formats: ['single-line', '2-line'],
  patterns: {
    price: /\d+\.\d{2}/,
    itemWithPrice: /^(.+?)\s+(\d+\.\d{2})$/
  },
  skipPatterns: [
    /^SUBTOTAL/i, /^TOTAL/i, /^TAX/i, /^PAYMENT/i,
    /^CASH$/i, /^CREDIT/i, /^CHANGE/i, /^DEBIT/i
  ]
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

    console.log('=== HYBRID PARSER INVOKED ===');
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

    // HYBRID PARSING - 5 LAYERS

    // Layer 1: Extract Patterns
    const patterns = extractPatterns(ocr_text);
    console.log('📊 Patterns extracted:', {
      itemBoundaries: patterns.itemBoundaries,
      formatHints: patterns.formatHints
    });

    // Layer 2: Detect Store
    const storeMatch = detectStore(ocr_text, patterns);
    console.log('🏪 Store detected:', storeMatch.name, `(${(storeMatch.confidence * 100).toFixed(0)}%)`);

    // Layer 3: Get Hints
    const hints = storeMatch.name !== 'UNKNOWN'
      ? STORE_HINTS[storeMatch.name]
      : UNIVERSAL_HINTS;

    // Layer 4: Adaptive Extraction
    const extractionResult = extractItems(patterns, hints, ocr_text, storeMatch.name);
    console.log(`✅ Extracted ${extractionResult.items.length} items using ${extractionResult.strategy}`);

    // Layer 5: Validation & Confidence
    const totals = extractTotals(patterns.lines, patterns.itemBoundaries.end, ocr_text);
    const confidence = calculateConfidence(extractionResult.items, totals);

    console.log(`📊 Confidence: ${(confidence * 100).toFixed(0)}% (${confidence >= 0.75 ? 'HIGH' : 'LOW'})`);

    // Create receipt record
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        household_id,
        store_name: storeMatch.name,
        receipt_date: extractDate(ocr_text),
        total_amount_cents: Math.round((totals.total || 0) * 100),
        tax_amount_cents: Math.round((totals.tax || 0) * 100),
        subtotal_cents: Math.round((totals.subtotal || 0) * 100),
        status: 'pending',
        parse_method: `hybrid-${extractionResult.strategy}`,
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
    const queueItems = extractionResult.items.map(item => ({
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

    await supabase
      .from('receipt_fix_queue')
      .insert(queueItems);

    return new Response(JSON.stringify({
      success: true,
      receipt_id: receipt.id,
      receipt,
      items: queueItems,
      method: `hybrid-${extractionResult.strategy}`,
      confidence: confidence,
      store: storeMatch.name
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
// LAYER 1: PATTERN EXTRACTION
// ============================================
function extractPatterns(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  let itemEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^SUBTOTAL/i.test(lines[i]) || /^TAX/i.test(lines[i]) || /BALANCE/i.test(lines[i])) {
      itemEnd = i;
      break;
    }
  }

  const formatHints = { singleLine: 0, twoLine: 0, threeLine: 0 };
  const taxMarkers = new Set();
  let hasItemCodes = false;

  for (let i = 0; i < Math.min(20, itemEnd); i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] || '';

    if (/^\d{4,10}$/.test(line)) hasItemCodes = true;
    if (/^\d{4,10}\s+[A-Z]/.test(line) && /^\d+\.\d{2}/.test(nextLine)) formatHints.twoLine++;
    if (/^\d{4,10}$/.test(line) && /^[A-Z]/.test(nextLine) && !/^\d+\.\d{2}/.test(nextLine)) formatHints.threeLine++;
    if (/^(.+?)\s+\d+\.\d{2}\s*[A-Z]?$/.test(line)) formatHints.singleLine++;

    const taxMatch = line.match(/\d+\.\d{2}\s*([A-Z$])$/);
    if (taxMatch) taxMarkers.add(taxMatch[1]);
  }

  return {
    lines,
    itemBoundaries: { start: 0, end: itemEnd },
    hasItemCodes,
    taxMarkers: Array.from(taxMarkers),
    formatHints
  };
}

// ============================================
// LAYER 2: STORE DETECTION
// ============================================
function detectStore(text, patterns) {
  const firstLines = text.split('\n').slice(0, 10).join(' ').toUpperCase();

  // Try signature matching
  for (const [storeName, hints] of Object.entries(STORE_HINTS)) {
    for (const signature of hints.signatures) {
      if (firstLines.includes(signature)) {
        return { name: storeName, confidence: 0.95, hints };
      }
    }
  }

  // Try fingerprint matching
  for (const [storeName, hints] of Object.entries(STORE_HINTS)) {
    if (!hints.fingerprints) continue;

    let matches = 0;
    let checks = 0;

    if ('hasItemCodes' in hints.fingerprints) {
      checks++;
      if (hints.fingerprints.hasItemCodes === patterns.hasItemCodes) matches++;
    }

    if (hints.fingerprints.taxMarkers) {
      checks++;
      const overlap = hints.fingerprints.taxMarkers.filter(m => patterns.taxMarkers.includes(m));
      if (overlap.length > 0) matches++;
    }

    if (checks > 0 && matches / checks >= 0.7) {
      return { name: storeName, confidence: 0.75, hints };
    }
  }

  return { name: 'UNKNOWN', confidence: 0.5, hints: UNIVERSAL_HINTS };
}

// ============================================
// LAYER 4: ADAPTIVE EXTRACTION
// ============================================
function extractItems(patterns, hints, fullText, storeName) {
  const strategies = selectStrategies(patterns.formatHints, hints.formats, storeName);

  let bestResult = { items: [], confidence: 0, strategy: 'none' };

  for (const strategyName of strategies) {
    let result;

    if (strategyName === '2-line-costco') {
      result = extractTwoLineCostco(patterns, hints);
    } else if (strategyName === '3-line-costco') {
      result = extractThreeLineCostco(patterns, hints);
    } else if (strategyName === 'safeway') {
      result = extractSafeway(patterns, hints);
    } else if (strategyName === 'single-line') {
      result = extractSingleLine(patterns, hints);
    } else {
      continue;
    }

    if (result.items.length > bestResult.items.length) {
      bestResult = { ...result, strategy: strategyName };
    }

    if (result.items.length >= 5 && result.items.length * 0.8 <= patterns.itemBoundaries.end) {
      break;
    }
  }

  return bestResult;
}

function selectStrategies(formatHints, allowedFormats, storeName) {
  const strategies = [];

  // Store-specific strategies
  if (storeName === 'SAFEWAY') {
    strategies.push('safeway');
  } else if (storeName === 'COSTCO') {
    if (allowedFormats.includes('2-line') && formatHints.twoLine > 0) {
      strategies.push('2-line-costco');
    }
    if (allowedFormats.includes('3-line') && formatHints.threeLine > 0) {
      strategies.push('3-line-costco');
    }
  }

  // Universal fallback
  if (allowedFormats.includes('single-line')) {
    strategies.push('single-line');
  }

  // Always have single-line as fallback
  if (strategies.length === 0) {
    strategies.push('single-line');
  }

  return strategies;
}

function extractTwoLineCostco(patterns, hints) {
  const items = [];
  const lines = patterns.lines;
  const endIndex = patterns.itemBoundaries.end;

  for (let i = 0; i < endIndex; i++) {
    if (isGarbageLine(lines[i], hints)) continue;

    const match = lines[i].match(hints.patterns.itemCode2Line);
    if (match && i + 1 < endIndex) {
      const [_, code, rawName] = match;
      const priceMatch = lines[i + 1].match(hints.patterns.price);

      if (priceMatch) {
        items.push({
          name: normalizeItemName(rawName, hints),
          price: parseFloat(priceMatch[1]),
          code,
          quantity: 1,
          unit: 'piece',
          raw_text: `${code} ${rawName} ${priceMatch[1]}`,
          confidence: 0.92
        });
        i++;
      }
    }
  }

  return { items, confidence: 0.9 };
}

function extractThreeLineCostco(patterns, hints) {
  const items = [];
  const lines = patterns.lines;
  const endIndex = patterns.itemBoundaries.end;

  for (let i = 0; i < endIndex; i++) {
    if (isGarbageLine(lines[i], hints)) continue;

    if (hints.patterns.itemCode3Line.test(lines[i]) && i + 2 < endIndex) {
      const code = lines[i];
      let itemName = lines[i + 1];
      let priceOffset = 2;

      if (/^\d+\.\d{2}\s+OFF$/i.test(itemName) && i + 3 < endIndex) {
        itemName = lines[i + 2];
        priceOffset = 3;
      }

      if (!isGarbageLine(itemName, hints) && i + priceOffset < endIndex) {
        const priceMatch = lines[i + priceOffset].match(hints.patterns.price);
        if (priceMatch) {
          items.push({
            name: normalizeItemName(itemName, hints),
            price: parseFloat(priceMatch[1]),
            code,
            quantity: 1,
            unit: 'piece',
            raw_text: `${code} ${itemName} ${priceMatch[1]}`,
            confidence: 0.95
          });
          i += priceOffset;
        }
      }
    }
  }

  return { items, confidence: 0.9 };
}

function extractSafeway(patterns, hints) {
  const items = [];
  const lines = patterns.lines;
  const endIndex = patterns.itemBoundaries.end;

  for (let i = 0; i < endIndex; i++) {
    if (isGarbageLine(lines[i], hints)) continue;

    const line = lines[i];
    const nextLine = lines[i + 1] || '';
    const nextNextLine = lines[i + 2] || '';

    // Pattern 1: 10-digit UPC + name on same line, price on next
    const upc2LineMatch = line.match(hints.patterns.upcCode2Line);
    if (upc2LineMatch && i + 1 < endIndex) {
      const [_, code, name] = upc2LineMatch;

      // Skip if next line is "You Pay" - wait for actual price
      if (/You Pay/i.test(nextLine)) {
        const youPayMatch = (lines[i + 2] || '').match(hints.patterns.youPay);
        if (youPayMatch) {
          items.push({
            name: normalizeItemName(name, hints),
            price: parseFloat(youPayMatch[1]),
            code,
            quantity: 1,
            unit: 'piece',
            raw_text: `${code} ${name} ${youPayMatch[1]}`,
            confidence: 0.90
          });
          i += 2;
          continue;
        }
      }

      // Check for discount format: "5.49 4.99 S"
      const discountMatch = nextLine.match(hints.patterns.priceWithDiscount);
      if (discountMatch) {
        items.push({
          name: normalizeItemName(name, hints),
          price: parseFloat(discountMatch[1]),
          code,
          quantity: 1,
          unit: 'piece',
          raw_text: `${code} ${name} ${discountMatch[1]}`,
          confidence: 0.90
        });
        i++;
        continue;
      }

      // Regular price on next line
      const priceMatch = nextLine.match(hints.patterns.priceSingle);
      if (priceMatch) {
        items.push({
          name: normalizeItemName(name, hints),
          price: parseFloat(priceMatch[1]),
          code,
          quantity: 1,
          unit: 'piece',
          raw_text: `${code} ${name} ${priceMatch[1]}`,
          confidence: 0.92
        });
        i++;
        continue;
      }
    }

    // Pattern 2: 10-digit UPC on own line (3-line format)
    if (hints.patterns.upcCode3Line.test(line) && i + 2 < endIndex) {
      const code = line;
      const name = nextLine;

      if (!isGarbageLine(name, hints)) {
        const priceMatch = nextNextLine.match(hints.patterns.youPay);
        if (priceMatch) {
          items.push({
            name: normalizeItemName(name, hints),
            price: parseFloat(priceMatch[1]),
            code,
            quantity: 1,
            unit: 'piece',
            raw_text: `${code} ${name} ${priceMatch[1]}`,
            confidence: 0.92
          });
          i += 2;
          continue;
        }
      }
    }

    // Pattern 3: 4-digit PLU (produce items)
    if (hints.patterns.pluCode.test(line) && i + 2 < endIndex) {
      const plu = line;
      const name = nextLine;

      if (!isGarbageLine(name, hints) && /^[A-Z@]/.test(name)) {
        // Skip weight info lines
        let priceLineOffset = 2;
        let priceLine = nextNextLine;

        if (/^WT/i.test(priceLine) && i + 3 < endIndex) {
          priceLineOffset = 3;
          priceLine = lines[i + 3];
        }

        const priceMatch = priceLine.match(hints.patterns.youPay);
        if (priceMatch) {
          // Remove quantity prefix like "2@ "
          const cleanName = name.replace(/^\d+@\s*/, '');
          items.push({
            name: normalizeItemName(cleanName, hints),
            price: parseFloat(priceMatch[1]),
            code: plu,
            quantity: 1,
            unit: 'piece',
            raw_text: `${plu} ${cleanName} ${priceMatch[1]}`,
            confidence: 0.88
          });
          i += priceLineOffset;
          continue;
        }
      }
    }
  }

  return { items, confidence: 0.85 };
}

function extractSingleLine(patterns, hints) {
  const items = [];
  const lines = patterns.lines;
  const endIndex = patterns.itemBoundaries.end;

  for (let i = 0; i < endIndex; i++) {
    const line = lines[i];

    if (isGarbageLine(line, hints) || UNIVERSAL_HINTS.skipPatterns.some(p => p.test(line))) {
      continue;
    }

    const match = line.match(UNIVERSAL_HINTS.patterns.itemWithPrice);
    if (match) {
      const [_, name, priceStr] = match;
      const price = parseFloat(priceStr);

      if (name.length > 2 && price > 0 && price < 1000) {
        items.push({
          name: normalizeItemName(name, hints),
          price,
          quantity: 1,
          unit: 'piece',
          raw_text: line,
          confidence: 0.75
        });
      }
    }
  }

  return { items, confidence: 0.7 };
}

// ============================================
// HELPERS
// ============================================
function isGarbageLine(line, hints) {
  if (!line || line.length < 2) return true;

  const commonGarbage = [
    /^[EZ]+\s*$/i, /^WHOLESALE$/i, /^SELF[- ]?CHECKOUT/i,
    /^\d+\s+[A-Za-z]+\s+(Blvd|Ave|St|Rd)/i,
    /^[A-Za-z]+,\s+[A-Z]{2}\s+\d{5}/i,
    /^MEMBER/i, /^CASH$/i, /^CHANGE/i, /^Zwwww/i,
    /^GROCERY$/i, /^PRODUCE$/i, /^REFRIG/i, /^FROZEN$/i,
    /^Price$/i, /^You Pay$/i, /^Member Savings/i, /^WT$/i,
    /^\d+\.\d{2}\s+lb\s+@/i
  ];

  return commonGarbage.some(p => p.test(line));
}

function normalizeItemName(name, hints) {
  let normalized = name.trim();

  if (hints.normalizations) {
    for (const [abbr, full] of Object.entries(hints.normalizations)) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'g');
      normalized = normalized.replace(regex, full);
    }
  }

  if (hints.corrections) {
    for (const [wrong, right] of Object.entries(hints.corrections)) {
      if (normalized.includes(wrong)) {
        normalized = normalized.replace(new RegExp(wrong, 'g'), right);
      }
    }
  }

  return normalized.replace(/\s+[A-Z]$/, '').trim();
}

function extractTotals(lines, startIndex, fullText) {
  let subtotal = 0, tax = 0, total = 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];

    if (/^SUBTOTAL/i.test(line)) {
      const match = line.match(/(\d+\.\d{2})/);
      if (match) subtotal = parseFloat(match[1]);
    } else if (/^TAX/i.test(line)) {
      const match = line.match(/(\d+\.\d{2})/);
      if (match) tax = parseFloat(match[1]);
    } else if (/\*{2,}\s*TOTAL/i.test(line) || /^TOTAL/i.test(line) || /BALANCE/i.test(line)) {
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
