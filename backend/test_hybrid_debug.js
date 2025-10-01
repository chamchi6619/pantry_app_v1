// Quick debug script for hybrid parser
const ocrText = `WHOLESALE
Arvada #676
96716 ORG SPINACH
3.79 E
9211 ORG YEL ONIO
5.99 E`;

const lines = ocrText.split('\n').map(l => l.trim()).filter(l => l);
console.log('Lines:', lines);

// Test pattern matching
const itemCode2Line = /^(\d{6,7})\s+(.+)$/;
const price = /^(\d+\.\d{2})(?:\s*[EA])?$/;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const nextLine = lines[i + 1] || '';

  console.log(`\nLine ${i}: "${line}"`);
  console.log(`  itemCode2Line match:`, itemCode2Line.test(line), itemCode2Line.exec(line));
  console.log(`  Next line: "${nextLine}"`);
  console.log(`  price match:`, price.test(nextLine), price.exec(nextLine));
}
