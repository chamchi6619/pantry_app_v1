// Analyze Safeway receipt format
const ocrText = `SAFEWAYS
Store 1248 Dir Reyes Sandoval
Main: (303) 477-5091 Rx: (303) 477-1470
2660 N. Federal Blvd.
DENVER CO 80210
00124805302802509101921
YOUR CASHIER TODAY WAS SELF
GROCERY
Price
2840058986 CHEETOS CRUNCHY
5.89
You Pay
5.79 S
Member Savings -0.10
4400002827 BELVITA BREAKFAST
5.49 4.99 S
Member Savings -0.50
REFRIG/FROZEN
2113004726 LUC CHESE 4 BLEND
2.69
2.69 S
2500013665
SIMPLY ORANGE
8.49
8.49 S
PRODUCE
2113053079
SIG GOLD POTATOES
5.99
5.99 $
3338365020
ICEBERG LETTUCE
2.99
2.99 S
4053
2@ LEMONS
1.58
1.38 S
Member Savings -0.20
4067
ZUCCHINI SQUASH
1.84 1.84 S
WT
1.09 lb @ $1.69 /lb
4608
2@ GARLIC BULK
1.18
1.18 S
4612
GINGER ROOT
2.07
2.07 S
WT
0.52 lb @ $3.99 /lb
94068
ONIONS GREEN ORG
1.79 1.79 S
TAX
0.00
**** BALANCE
39.20`;

const lines = ocrText.split('\n').map(l => l.trim()).filter(l => l);

console.log('=== SAFEWAY RECEIPT ANALYSIS ===\n');

// Find item boundary
let itemEnd = lines.length;
for (let i = 0; i < lines.length; i++) {
  if (/^TAX/i.test(lines[i]) || /BALANCE/i.test(lines[i])) {
    itemEnd = i;
    break;
  }
}

console.log(`Item boundary: 0 to ${itemEnd}\n`);

// Analyze patterns
console.log('Item patterns found:\n');
for (let i = 0; i < itemEnd; i++) {
  const line = lines[i];
  const nextLine = lines[i + 1] || '';
  const nextNextLine = lines[i + 2] || '';

  // Pattern 1: 10-digit code on own line, then name, then price
  if (/^\d{10}$/.test(line)) {
    console.log(`Pattern 1 (3-line): Code on line ${i}`);
    console.log(`  Line ${i}: "${line}" (10-digit code)`);
    console.log(`  Line ${i+1}: "${nextLine}" (name?)`);
    console.log(`  Line ${i+2}: "${nextNextLine}" (price?)`);
    console.log();
  }

  // Pattern 2: 10-digit code + name on same line
  if (/^\d{10}\s+[A-Z]/.test(line)) {
    console.log(`Pattern 2 (2-line): Code+Name on line ${i}`);
    console.log(`  Line ${i}: "${line}"`);
    console.log(`  Line ${i+1}: "${nextLine}"`);
    console.log();
  }

  // Pattern 3: 4-digit PLU code (produce)
  if (/^\d{4}$/.test(line) && !/^\d{4}\.\d{2}/.test(line)) {
    console.log(`Pattern 3 (PLU): 4-digit on line ${i}`);
    console.log(`  Line ${i}: "${line}" (PLU code)`);
    console.log(`  Line ${i+1}: "${nextLine}" (name?)`);
    console.log(`  Line ${i+2}: "${nextNextLine}" (price?)`);
    console.log();
  }

  // Pattern 4: "You Pay" format
  if (/You Pay/i.test(line)) {
    console.log(`Pattern 4 (You Pay): Line ${i}`);
    console.log(`  Line ${i}: "${line}"`);
    console.log();
  }

  // Pattern 5: Price with S marker
  if (/^\d+\.\d{2}\s+\d+\.\d{2}\s*[S$]/.test(line)) {
    console.log(`Pattern 5 (Price Price S): Line ${i}`);
    console.log(`  Line ${i}: "${line}"`);
    console.log();
  }
}

console.log('\n=== EXPECTED ITEMS (Manual) ===');
const expectedItems = [
  'CHEETOS CRUNCHY - $5.79',
  'BELVITA BREAKFAST - $4.99',
  'LUC CHESE 4 BLEND - $2.69',
  'SIMPLY ORANGE - $8.49',
  'SIG GOLD POTATOES - $5.99',
  'ICEBERG LETTUCE - $2.99',
  'LEMONS - $1.38',
  'ZUCCHINI SQUASH - $1.84',
  'GARLIC BULK - $1.18',
  'GINGER ROOT - $2.07',
  'ONIONS GREEN ORG - $1.79'
];

expectedItems.forEach((item, i) => console.log(`${i+1}. ${item}`));
console.log(`\nTotal expected: ${expectedItems.length} items`);
