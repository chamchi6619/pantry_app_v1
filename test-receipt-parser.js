// Test receipt parser locally
const sampleWalmartReceipt = `Walmart
Save money. Live better.
(330) 339 - 3991
MANAGER DIANA EARNEST
231 BLUEBELL DR SW
NEW PHILADELPHIA OH 44663
ST# 02115 OP#23 009044 TE# 44 TR# 01301
PET TOY
004747571658
FLOPPY PUPPY 004747514846      1.97 X
SSSUPREME S 070060332153        4.97 X
2.5 SQUEAK 084699803238         5.92 X
007119013654
MUNCHY DMBEL 068113108796       3.77 X
DOG TREAT                        2.92 X
PED PCH 1                        0.50 X
PED PCH 1                        0.50 X
002310011802
002310011802
COUPON 23100 052310037000       1.00-
HNYMD SMORES 088491226837 F     3.98 O
FRENCH DRSNG 004132100655 F     1.98 O
3 ORANGES        001466835001 F 5.47 N
BABY CARROTS     003338366602 I 1.48 N
COLLARDS         000000004614KI 1.24 N
CALZONE          005208362080 F 2.50 O
MM RVW MNT 003399105848         19.77 X
STKOBRLPLABL 001558679414       1.97 X
STKOBRLPLABL 001558679414       1.97 X
STKO SUNFLWR 001558679410       0.97 X
STKO SUNFLWR 001558679410       0.97 X
STKO SUNFLWR 001558679410       0.97 X
STKO SUNFLWR 001558679410       0.97 X
BLING BEADS 076594060699        0.97 X
GREAT VALUE      007874203191 F 9.97 O
LIPTON           001200011224 F 4.48 X
DRY DOG          002310011035   12.44 X
SUBTOTAL                        93.27
TAX 1   8.250%                   5.48
TOTAL                           98.75
CASH TEND                      100.00
CHANGE DUE                       1.25

# ITEMS SOLD 28

TC# 7334 8877 2340 5522 1139

Thank you for shopping at Walmart
07/28/17  11:34:43`;

// Simple test parser based on our Edge Function logic
function parseWalmartReceipt(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // Skip patterns
  const skipPatterns = [
    /^(ST#|OP#?|TE#|TR#)/i,
    /^\d{10,}$/,
    /^(SUBTOTAL|TOTAL|TAX|CASH|CHANGE)/i,
    /^#\s*ITEMS?\s+SOLD/i,
    /^THANK/i,
    /^Save\s+money/i,
    /^\(\d{3}\)/,
    /^MANAGER/i,
    /^\d+\s+[A-Z]+\s+(DR|ST|AVE|RD|BLVD)/i,
    /^COUPON/i,
    /^TC#/i,
  ];

  const items = [];

  // Walmart patterns - fixed regex escaping
  const walmartPattern = /^(.+?)\s+(\d+\.\d{2})\s+([XONFTI])$/;
  const walmartPattern2 = /^(.+?)\s+(\d+\.\d{2})$/;

  for (const line of lines) {
    if (skipPatterns.some(p => p.test(line))) {
      console.log(`Skipping: ${line}`);
      continue;
    }

    // Try Walmart format with tax code
    let match = line.match(walmartPattern);
    if (match) {
      const name = match[1].trim()
        .replace(/^\d{12,}\s*/, '')
        .replace(/\s+\d{12,}$/, '');

      if (name.length > 2 && !name.includes('COUPON')) {
        console.log(`Found with tax code: ${name} - $${match[2]} (${match[3]})`);
        items.push({
          name,
          price: parseFloat(match[2]),
          tax_code: match[3]
        });
        continue;
      }
    }

    // Try without tax code
    match = line.match(walmartPattern2);
    if (match) {
      const name = match[1].trim();
      if (name.length > 2 && !skipPatterns.some(p => p.test(name))) {
        console.log(`Found without tax code: ${name} - $${match[2]}`);
        items.push({
          name,
          price: parseFloat(match[2])
        });
      }
    } else {
      console.log(`No match for: ${line}`);
    }
  }

  return items;
}

// Test the parser
console.log('Testing Walmart Receipt Parser\\n');
console.log('=' .repeat(50));

const items = parseWalmartReceipt(sampleWalmartReceipt);

console.log(`\\nFound ${items.length} items:\\n`);
items.forEach((item, i) => {
  console.log(`${i+1}. ${item.name.padEnd(25)} $${item.price.toFixed(2)}${item.tax_code ? ' (' + item.tax_code + ')' : ''}`);
});

const total = items.reduce((sum, item) => sum + item.price, 0);
console.log(`\\nCalculated Total: $${total.toFixed(2)}`);
console.log('Receipt Total: $93.27');
console.log(`Difference: $${Math.abs(total - 93.27).toFixed(2)}`);

// Expected items that should be found:
const expectedItems = [
  'FLOPPY PUPPY', 'SSSUPREME S', '2.5 SQUEAK', 'MUNCHY DMBEL',
  'DOG TREAT', 'PED PCH', 'HNYMD SMORES', 'FRENCH DRSNG',
  '3 ORANGES', 'BABY CARROTS', 'COLLARDS', 'CALZONE',
  'MM RVW MNT', 'STKOBRLPLABL', 'STKO SUNFLWR', 'BLING BEADS',
  'GREAT VALUE', 'LIPTON', 'DRY DOG'
];

console.log(`\\nExpected ${expectedItems.length} unique items`);
console.log(`Parser accuracy: ${Math.round(items.length / 28 * 100)}%`);