// Analyze where STRAWBERR went
const ocrText = `WHOLESALE
Arvada #676
96716 ORG SPINACH
3.79 E
9211 ORG YEL ONIO
5.99 E
6111 ORG FUJI APPL
7.59 E
38499 KS PURE OLIVE
19.99 A
9617 ORG ROMA TOMA
6.99 E
91319 ORG RED BELL
7.99 E
96253 ORG BROCCOLI
4.99 E
96716 ORG BABY CARR
5.49 E
93677 ORG CUCUMBERS
5.99 E
93486 ORG CELERY HE
4.99 E
94011 ORG BANANA
3.99 E
94553 ORG GALA APPL
7.99 E
96619 ORG GRAPE TOM
5.99 E
92739 ORG STRAWBERR
8.99 E
96253 ORG CAULIFLOW
5.99 E
93166 ORG MINI PEPP
6.99 E
SUBTOTAL 206.03`;

const lines = ocrText.split('\n').map(l => l.trim()).filter(l => l);

console.log('=== LOOKING FOR STRAWBERR ===\n');

// Find STRAWBERR
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('STRAWBERR')) {
    console.log(`Found at line ${i}: "${lines[i]}"`);
    console.log(`Previous line ${i-1}: "${lines[i-1]}"`);
    console.log(`Next line ${i+1}: "${lines[i+1] || 'N/A'}"`);
    console.log();

    // Check if it matches coded-2line pattern
    const prevLine = lines[i-1];
    const thisLine = lines[i];
    const nextLine = lines[i+1] || '';

    const code2LinePattern = /^\d{4,13}\s+[A-Z]/;
    const pricePattern = /^\d+\.\d{2}/;

    console.log('Pattern checks:');
    console.log(`  Previous line matches code+name: ${code2LinePattern.test(prevLine)}`);
    console.log(`  This line matches code+name: ${code2LinePattern.test(thisLine)}`);
    console.log(`  This line matches price: ${pricePattern.test(thisLine)}`);
    console.log(`  Next line matches price: ${pricePattern.test(nextLine)}`);
  }
}

console.log('\n=== ALL ITEMS WITH PRICES ===\n');
let itemCount = 0;
for (let i = 0; i < lines.length; i++) {
  if (/^\d{4,7}\s+[A-Z]/.test(lines[i]) && /^\d+\.\d{2}/.test(lines[i+1] || '')) {
    itemCount++;
    console.log(`${itemCount}. ${lines[i]} -> ${lines[i+1]}`);
  }
}
console.log(`\nTotal items found: ${itemCount}/16`);
