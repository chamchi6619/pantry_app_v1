/**
 * Mock OCR Service for testing in Expo Go
 * Returns realistic receipt text for different store types
 */

export interface OCRResult {
  text: string;
  confidence: number;
}

const mockReceipts = {
  grocery: `KROGER
4123 PEACHTREE RD
ATLANTA, GA 30301
(404) 555-0123

Date: 01/15/25  14:32

GROCERY
ORGANIC MILK GAL     5.99
BREAD WHEAT         2.49
EGGS LARGE DOZ      4.99
CHICKEN BREAST      8.67
  2.45 LB @ 3.54/LB
BANANAS             1.87
  3.12 LB @ 0.59/LB
CHEESE CHEDDAR      5.99
YOGURT GREEK 4PK    4.49

SUBTOTAL           32.49
TAX                 2.28
TOTAL              34.77

CASH               40.00
CHANGE              5.23

Thank you for shopping!`,

  wholefoods: `WHOLE FOODS MARKET
365 Main Street
San Francisco, CA 94102
(415) 555-0123

09/25/2025 14:32

GROCERY
ORGANIC MILK GAL     5.99
BANANAS 2.5 @ 0.69   1.73
WHOLE WHEAT BREAD    3.99
CHICKEN BREAST      12.50
PASTA BARILLA 2X     5.98
GREEK YOGURT         4.99
LETTUCE HEAD         2.49
TOMATOES 3LB @ 1.99  5.97
OLIVE OIL EVOO       8.99
EGGS DOZEN ORGANIC   5.99

SUBTOTAL            58.61
TAX 8.75%            5.13
TOTAL              $63.74

CASH                70.00
CHANGE               6.26

TOTAL POINTS EARNED  127
REWARDS BALANCE    $5.00

Thank you for shopping!`,

  target: `TARGET
STORE #2345
123 MAIN ST
ANYTOWN, USA 12345

REG#003 TRN#1234 CSH#567890
01/15/2025 15:23:45

GROCERY
212345678901 MILK 2%         3.99
234567890123 BREAD SARA LEE  2.49
345678901234 EGGS LG BROWN   4.99

HOME
456789012345 TOWELS BATH 2PK 12.99
567890123456 SOAP DISH       8.99

SUBTOTAL                     33.45
TAX                           2.67
TOTAL                        36.12

VISA ENDING 1234             36.12

THANK YOU FOR SHOPPING AT TARGET`,

  costco: `COSTCO WHOLESALE
WAREHOUSE #123
456 COSTCO WAY
SEATTLE, WA 98101

MEMBER: 123456789
01/15/25 10:15 AM

1234567 MILK 2GAL PACK       7.99
2345678 BREAD DAVE KILLER    6.49
3456789 EGGS 5DZ             12.99
4567890 ROTISSERIE CHKN       4.99
5678901 BANANAS 3LB           1.49
6789012 CHEESE TILLAMOOK      9.99
7890123 PAPER TOWELS 12PK    19.99

SUBTOTAL                     63.93
TAX                           5.11
TOTAL                        69.04

AMEX ****1234                69.04

THANK YOU!`
};

export async function performOCR(imageUri: string): Promise<OCRResult> {
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 800));

  // Randomly select a receipt type for variety in testing
  const types = Object.keys(mockReceipts) as (keyof typeof mockReceipts)[];
  const randomType = types[Math.floor(Math.random() * types.length)];

  // Add some randomness to simulate OCR errors
  let text = mockReceipts[randomType];

  // Occasionally introduce OCR errors for testing
  if (Math.random() < 0.2) {
    // Replace some characters with similar looking ones
    text = text
      .replace(/O/g, Math.random() > 0.5 ? '0' : 'O')
      .replace(/l/g, Math.random() > 0.5 ? '1' : 'l');
  }

  return {
    text,
    confidence: 0.85 + Math.random() * 0.14
  };
}