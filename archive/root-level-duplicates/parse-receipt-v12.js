"use strict";
// Enhanced Safeway Receipt Parser v12
// Fixes: Standalone PLU codes, "You Pay" prices, missing produce items
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSafewayReceipt = parseSafewayReceipt;
exports.testParser = testParser;
// Common PLU codes for validation and correction
const PLU_DATABASE = {
    '4011': 'BANANAS',
    '4053': 'LEMONS',
    '4958': 'SMALL LEMONS',
    '4033': 'LIMES',
    '4048': 'LARGE LIMES',
    '4608': 'GARLIC',
    '4067': 'ZUCCHINI SQUASH',
    '4068': 'GREEN ONIONS',
    '4612': 'GINGER ROOT',
    '4225': 'GRANNY SMITH APPLES',
    '4133': 'GALA APPLES',
    '4017': 'GRAPES GREEN',
    '4022': 'GRAPES RED',
    '4062': 'CUCUMBERS',
    '4064': 'TOMATOES',
    '4087': 'ROMA TOMATOES',
    '4664': 'VINE TOMATOES',
    '4159': 'BROCCOLI',
    '4060': 'BROCCOLI CROWNS',
    '4069': 'CABBAGE GREEN',
    '4554': 'CABBAGE RED',
    '4079': 'CAULIFLOWER',
    '4063': 'RED PEPPERS',
    '4065': 'GREEN PEPPERS',
    '4088': 'CORN',
    '4078': 'CORN ON COB',
    '4081': 'EGGPLANT',
    '4093': 'ONIONS WHITE',
    '4166': 'ONIONS RED',
    '4663': 'ONIONS SWEET',
    '4072': 'POTATOES RUSSET',
    '4073': 'POTATOES RED',
    '4074': 'POTATOES GOLD',
    '3151': 'PLANTAINS',
    '4050': 'CANTALOUPE',
    '4045': 'CHERRIES',
    '4040': 'STRAWBERRIES',
    '4030': 'KIWI',
    '4046': 'AVOCADOS SMALL',
    '4770': 'AVOCADOS LARGE',
    '4031': 'WATERMELON',
    '4032': 'WATERMELON SEEDLESS',
    '4959': 'LETTUCE ROMAINE',
    '4640': 'LETTUCE ICEBERG',
    '4061': 'LETTUCE LEAF',
    '4076': 'LETTUCE BUTTER',
    '4089': 'MUSHROOMS WHITE',
    '4650': 'MUSHROOMS PORTOBELLO',
    '4080': 'ASPARAGUS',
    '4085': 'SWEET POTATOES',
    '4091': 'YAMS',
    '4094': 'CARROTS',
    '4549': 'CARROTS BABY',
    '4082': 'CELERY',
    '4583': 'CELERY HEARTS',
};
// Skip patterns for non-items
const SKIP_PATTERNS = [
    // Section headers (with OCR errors)
    /^(GOCERY|GROCERY|GROCRY|GROC|PRODUCE|DAIRY|DELI|MEAT|BAKERY|FROZEN|GENERAL|REFRIG|REFRIS)$/i,
    // Payment methods
    /AL\s+US\s+DEBIT/i,
    /^(VISA|MASTERCARD|AMEX|DISCOVER|DEBIT|CREDIT|CASH|CHECK|EBT)/i,
    // Store info
    /^(SAFEWAY|SAFEWAYS|VONS|ALBERTSONS|PAVILIONS)$/i,
    /^STORE\s*#?\d+/i,
    /^\d{1,2}[/\\]\d{1,2}[/\\]\d{2,4}$/, // Date
    // Thank you / Points
    /^THANK/i,
    /^YOUR\s+(SAVINGS?|POINTS?|CASHIER)/i,
    /^Points?\s+Earned/i,
    // Totals and taxes
    /^(SUBTOTAL|TOTAL|TAX|BALANCE|CHANGE)$/i,
    /^\*{3,}/,
    /^={3,}/,
    /^-{3,}/,
    // Member/savings info
    /^(Member|Nember)\s+(Savings?|Savines)/i,
    /^You\s+Pa[vy]/i, // "You Pay" line by itself
    /^Price$/i,
    // Payment processing
    /^CARD\s*#/i,
    /^REF:/i,
    /^AUTH:/i,
    /^AID\s/i,
    /^TVR\s/i,
    /^TRX$/i,
    /^PAYMENT\s+AMOUNT/i,
    // Receipt metadata
    /^YOUR\s+CASHIER/i,
    /^\d{10,}$/, // Long transaction numbers
    /^(Nain|Main|Phone)/i, // OCR errors for store contact
];
/**
 * Main parser function for Safeway receipts
 */
function parseSafewayReceipt(ocrText) {
    const lines = ocrText.split('\n').map(l => l.trim()).filter(l => l);
    // Step 1: Pre-process to merge standalone PLUs with item names
    const enhancedLines = preprocessStandalonePLUs(lines);
    // Step 2: Parse items with enhanced lines
    const items = parseItemsFromLines(enhancedLines);
    // Step 3: Enhance with PLU database
    const validatedItems = items.map(item => enhanceWithPLU(item));
    // Step 4: Filter out invalid items
    return validatedItems.filter(item => item.name &&
        item.name.length > 2 &&
        item.price > 0 &&
        item.price < 1000);
}
/**
 * Pre-process lines to handle standalone PLU codes
 */
function preprocessStandalonePLUs(lines) {
    const enhanced = [];
    const skipNext = new Set();
    for (let i = 0; i < lines.length; i++) {
        if (skipNext.has(i))
            continue;
        const line = lines[i];
        // Check if this is a standalone PLU (4-5 digits only)
        if (/^\d{4,5}$/.test(line)) {
            const plu = line;
            const nextLine = lines[i + 1]?.trim();
            if (nextLine && !SKIP_PATTERNS.some(p => p.test(nextLine))) {
                // Next line might be "20 LEMONS" or "2@ GARLIC"
                // Extract the actual item name
                let itemName = nextLine;
                // Remove leading quantity indicators
                // "20 LEMONS" -> "LEMONS"
                // "2@ GARLIC" -> "GARLIC"
                // "28 GRAYLIC BULK" -> "GRAYLIC BULK"
                itemName = itemName.replace(/^\d+[@\s]+/, '').trim();
                // If we still have a valid name, merge the lines
                if (itemName && /^[A-Z]/i.test(itemName)) {
                    enhanced.push(`${plu} ${itemName}`);
                    skipNext.add(i + 1);
                    // Log for debugging
                    console.log(`Merged PLU: ${plu} + ${nextLine} → ${plu} ${itemName}`);
                    continue;
                }
            }
        }
        enhanced.push(line);
    }
    return enhanced;
}
/**
 * Parse items from enhanced lines
 */
function parseItemsFromLines(lines) {
    const items = [];
    const processedIndices = new Set();
    for (let i = 0; i < lines.length; i++) {
        if (processedIndices.has(i))
            continue;
        const line = lines[i];
        // Skip non-item lines
        if (SKIP_PATTERNS.some(p => p.test(line)))
            continue;
        // Try to parse as item
        const item = parseItemLine(line, lines, i);
        if (item) {
            items.push(item);
            // Mark related lines as processed
            for (let j = i; j <= i + 3 && j < lines.length; j++) {
                if (lines[j].includes(item.raw_text) ||
                    /^(You\s+Pa[vy]|\d+\.\d{2}\s*[A-Z]?)$/i.test(lines[j])) {
                    processedIndices.add(j);
                }
            }
        }
    }
    return items;
}
/**
 * Parse a single item line
 */
function parseItemLine(line, allLines, lineIndex) {
    // Pattern 1: Item with code (UPC or PLU)
    const codeMatch = line.match(/^(\d{4,12})\s+(.+)/);
    if (codeMatch) {
        const code = codeMatch[1];
        const nameAndPrice = codeMatch[2];
        // Extract name (everything that's not a price)
        const namePriceMatch = nameAndPrice.match(/^(.*?)(\d+\.\d{2})?$/);
        const name = namePriceMatch?.[1]?.trim() || nameAndPrice;
        const inlinePrice = namePriceMatch?.[2];
        // Get the best price (You Pay or regular)
        const price = inlinePrice
            ? parseFloat(inlinePrice)
            : findBestPrice(allLines, lineIndex + 1);
        return {
            name: cleanItemName(name),
            price: price || 0,
            quantity: 1,
            code: code,
            raw_text: line,
            confidence: 0.9,
            type: code.length <= 5 ? 'produce' : 'standard'
        };
    }
    // Pattern 2: Item without code
    const nameOnlyMatch = line.match(/^([A-Z][A-Z\s]+)(\d+\.\d{2})?/);
    if (nameOnlyMatch && !SKIP_PATTERNS.some(p => p.test(line))) {
        const name = nameOnlyMatch[1].trim();
        const inlinePrice = nameOnlyMatch[2];
        const price = inlinePrice
            ? parseFloat(inlinePrice)
            : findBestPrice(allLines, lineIndex + 1);
        if (price > 0) {
            return {
                name: cleanItemName(name),
                price: price,
                quantity: 1,
                raw_text: line,
                confidence: 0.85,
                type: 'standard'
            };
        }
    }
    // Pattern 3: Weighted items
    const weightMatch = line.match(/(\d+\.\d{2})\s+lb\s*@\s*\$?(\d+\.\d{2})/i);
    if (weightMatch) {
        const weight = parseFloat(weightMatch[1]);
        const pricePerLb = parseFloat(weightMatch[2]);
        const totalPrice = weight * pricePerLb;
        // Try to find item name from previous line
        let itemName = 'Weighted Item';
        if (lineIndex > 0) {
            const prevLine = allLines[lineIndex - 1];
            if (!SKIP_PATTERNS.some(p => p.test(prevLine))) {
                // Extract name from previous line, removing any codes
                itemName = prevLine.replace(/^\d{4,12}\s*/, '').trim();
            }
        }
        return {
            name: cleanItemName(itemName),
            price: Math.round(totalPrice * 100) / 100,
            quantity: weight,
            unit: 'lb',
            raw_text: line,
            confidence: 0.85,
            type: 'weighted'
        };
    }
    return null;
}
/**
 * Find the best price (You Pay takes priority)
 */
function findBestPrice(lines, startIndex) {
    let regularPrice = null;
    let memberPrice = null;
    // Look ahead up to 4 lines for prices
    for (let i = startIndex; i < Math.min(startIndex + 4, lines.length); i++) {
        const line = lines[i].trim();
        // Skip savings lines
        if (/savings?|discount|coupon/i.test(line))
            continue;
        // Check for "You Pay" price (highest priority)
        const youPayMatch = line.match(/You\s+Pa[vy]\s+(\d+\.\d{2})/i);
        if (youPayMatch) {
            memberPrice = parseFloat(youPayMatch[1]);
            break; // Found member price, stop looking
        }
        // Check for regular price
        const priceMatch = line.match(/^(\d+\.\d{2})\s*[A-Z]?$/);
        if (priceMatch && !regularPrice) {
            regularPrice = parseFloat(priceMatch[1]);
            // Check if next line is "You Pay"
            const nextLine = lines[i + 1]?.trim();
            if (nextLine && /You\s+Pa[vy]/i.test(nextLine)) {
                const nextPriceMatch = nextLine.match(/(\d+\.\d{2})/);
                if (nextPriceMatch) {
                    memberPrice = parseFloat(nextPriceMatch[1]);
                    break;
                }
            }
        }
    }
    // Return member price if available, otherwise regular price
    return memberPrice || regularPrice || 0;
}
/**
 * Clean item name
 */
function cleanItemName(name) {
    return name
        .replace(/^\d+\s+/, '') // Remove leading numbers
        .replace(/\s+[A-Z]$/, '') // Remove trailing tax codes
        .replace(/\s+\d+\.\d{2}$/, '') // Remove trailing prices
        .trim();
}
/**
 * Enhance item with PLU database
 */
function enhanceWithPLU(item) {
    if (!item.code || item.code.length > 5)
        return item;
    const pluName = PLU_DATABASE[item.code];
    if (pluName) {
        // Check if names are similar (handle OCR errors)
        const similarity = calculateSimilarity(item.name.toUpperCase(), pluName);
        if (similarity > 0.5) {
            // Fix OCR errors like "GRAYLIC" -> "GARLIC"
            console.log(`PLU correction: ${item.name} → ${pluName} (PLU ${item.code})`);
            item.name = pluName;
            item.confidence = Math.min(1, item.confidence * 1.1);
        }
    }
    return item;
}
/**
 * Calculate string similarity (simple Levenshtein-based)
 */
function calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0)
        return 1.0;
    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
}
/**
 * Levenshtein distance for fuzzy matching
 */
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
            }
            else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
            }
        }
    }
    return matrix[str2.length][str1.length];
}
// Test function
function testParser() {
    const testOCR = `SAFEWAYS
Stare 1249 bir Seves Sandoval
Nain (303) 477-8091 Rv (303) 477-1470
2640 N. Federal Blvd.
DENVER CO 80210
00124806302802502101921
YOUR CASHIER TODAY WAS SELF
GOCERY
Price
You Pav
2040058986 CH2TOS CRUNCHY
8.88
6.70 8
Member Savings -0.10
4400003827 BELVITA BREAKFAST
6.49 4.99 $
Nember Savings -0.50
REFRIS/FROZEN
2115004726 LUC CHESE 4 SLEND
2.69
2.69 S
2500013685
SIMPLY ORANGE
8.49
8.49 $
PRODUCE
2113053079 STG GOLD POTATOES
5.99
6.99 $
3338366020
ICEBERG LETTUCE
2.89
2.89 $
4053
20 LEMONS
1.58
1.38 S
Number Savines -0.20
4067
ZUCCHINI SQUASH
1.84 1.84 S
WT
1.09 lb @ $1.69/lb
4608
28 GRAYLIC BULK
1.16
1.18 S
4612
GINGER ROOT
2.07
2.07 S
WT
0.52 lb @ $3.99 /lb
$4068
ONIONS GREEN ORG
1.79 1.79 S
TRX
0.00
39.20
**** BALANCE
Credit Purchase 09/10/25 19:21
CARD # ************8799
REF: 542153487990 AUTH: 00026039
PAYMENT AMOUNT
AL US DEBIT
AID A0000000980840
TVR 0000000000
39.20
Visa
39.20
CHANGE
0.00
YOUR SAVINGS
Member Savings
0.80
Total
0.80
YOUR POINTS
Points Earned Today 39
Poi`;
    console.log('=== TESTING PARSER V12 ===');
    const items = parseSafewayReceipt(testOCR);
    console.log(`\nFound ${items.length} items:`);
    items.forEach((item, i) => {
        console.log(`${i + 1}. ${item.name} - $${item.price.toFixed(2)} ${item.code ? `(${item.code})` : ''}`);
    });
    const total = items.reduce((sum, item) => sum + item.price, 0);
    console.log(`\nTotal: $${total.toFixed(2)}`);
    console.log('Receipt Total: $39.20');
    console.log(`Difference: $${Math.abs(total - 39.20).toFixed(2)}`);
}
// Export for use in Edge Function
exports.default = parseSafewayReceipt;
