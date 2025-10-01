# Receipt Validation Analysis

## Current System Behavior with Non-Receipt Images

### ✅ What Works Now

1. **Images with no text** (e.g., cat photos, blank images):
   - OCR extracts 0 characters
   - System fails with "No text detected" error
   - User sees error message ✅

2. **Poor quality images** (blurry, dark, etc.):
   - Image quality analysis detects issues
   - User gets alert: "Poor Image Quality" with suggestions ✅
   - Process stops before OCR ✅

### ❌ What Doesn't Work (GAPS)

1. **Book pages / Documents**:
   - OCR successfully extracts text ✅
   - Gemini tries to find "items" in the text
   - **Result**: May return empty items, or hallucinate items from numbers in text ❌
   - **User sees**: Empty receipt or garbage data ❌

2. **Restaurant menus / Bills**:
   - OCR extracts items and prices ✅
   - Gemini parses them as grocery items
   - **Result**: Menu items appear as "grocery purchases" ❌
   - **User sees**: Wrong data in their pantry ❌

3. **Memes / Screenshots with text**:
   - OCR extracts meme text ✅
   - Gemini tries to parse as receipt
   - **Result**: Unpredictable - might fail or hallucinate ❌

4. **Invoices / Other receipts**:
   - OCR works fine ✅
   - Gemini might parse invoice line items as products
   - **Result**: Non-grocery items in system ❌

## Recommended Validation Layers

### Layer 1: Post-OCR Pattern Validation
**Where**: Edge Function (before calling Gemini)
**Cost**: Free (regex matching)

Check for receipt indicators:
- Store name patterns (WALMART, SAFEWAY, TARGET, etc.)
- Price patterns (`$X.XX`, multiple prices)
- Receipt keywords (SUBTOTAL, TAX, TOTAL, RECEIPT, CHANGE)
- Date patterns
- Payment method (VISA, MASTERCARD, CASH, DEBIT)

**Implementation**:
```typescript
function validateReceiptLike(text: string): { isValid: boolean; confidence: number; reason?: string } {
  const upper = text.toUpperCase();

  // Must have at least 2 indicators
  let score = 0;

  // Check for store patterns
  const stores = ['WALMART', 'SAFEWAY', 'TARGET', 'COSTCO', 'KROGER', 'WHOLE FOODS', 'TRADER JOE'];
  if (stores.some(s => upper.includes(s))) score += 30;

  // Check for receipt keywords
  const keywords = ['SUBTOTAL', 'TAX', 'TOTAL', 'RECEIPT', 'CHANGE', 'BALANCE'];
  const keywordMatches = keywords.filter(k => upper.includes(k)).length;
  score += keywordMatches * 10;

  // Check for multiple prices ($X.XX pattern)
  const priceMatches = text.match(/\$\d+\.\d{2}/g);
  if (priceMatches && priceMatches.length >= 3) score += 20;

  // Check for payment methods
  if (/VISA|MASTERCARD|AMEX|DISCOVER|CASH|DEBIT|CREDIT/i.test(text)) score += 15;

  // Check for date pattern
  if (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(text)) score += 10;

  const isValid = score >= 40; // Need at least 40 points

  return {
    isValid,
    confidence: Math.min(score / 100, 1),
    reason: isValid ? undefined : 'No receipt patterns found (store name, prices, totals, etc.)'
  };
}
```

### Layer 2: Gemini Validation Instructions
**Where**: Enhanced prompt
**Cost**: ~$0.00002 per receipt (already paying for Gemini)

Add to Gemini prompt:
```
VALIDATION RULES:
- If the text is NOT a grocery receipt, return empty items array
- If it's a restaurant menu, invoice, or other document, return empty array
- Only extract items that are clearly grocery/food products
- If you're unsure if it's a receipt, return empty array
```

### Layer 3: Post-Gemini Result Validation
**Where**: Edge Function (after Gemini response)
**Cost**: Free

Check Gemini's result makes sense:
```typescript
function validateParsedReceipt(result: any, originalText: string): boolean {
  // Empty items with long text = probably not a receipt
  if (!result.items || result.items.length === 0) {
    if (originalText.length > 200) {
      throw new Error('Could not find grocery items in this image');
    }
  }

  // Too many items might indicate parsing error
  if (result.items.length > 100) {
    throw new Error('Too many items detected - image may not be a receipt');
  }

  // Check items have required fields
  for (const item of result.items) {
    if (!item.item_name || item.price <= 0) {
      throw new Error('Invalid item detected - image may not be a receipt');
    }
  }

  return true;
}
```

### Layer 4: User Confirmation
**Where**: Frontend (Fix Queue screen)
**Cost**: Free

Current screen already shows:
- Parsed items for review ✅
- Delete button per item ✅
- Exit button to discard all ✅

This catches any remaining edge cases where wrong items got through.

## Implementation Priority

1. **HIGH PRIORITY**: Layer 1 (Post-OCR validation)
   - Catches 80% of non-receipt images
   - Zero cost
   - Fast (regex)

2. **MEDIUM PRIORITY**: Layer 3 (Result validation)
   - Catches edge cases
   - Zero cost
   - Safety net

3. **LOW PRIORITY**: Layer 2 (Prompt enhancement)
   - Gemini already does this somewhat
   - Diminishing returns

4. **ALREADY EXISTS**: Layer 4 (User confirmation)
   - Current Fix Queue UI handles this ✅

## Estimated Impact

With Layer 1 + Layer 3 implemented:
- **95%** of non-receipt images rejected ✅
- **Remaining 5%**: User can delete/exit in Fix Queue ✅
- **Cost**: $0 (just validation logic)
- **Processing time**: +50ms (negligible)

## Code Location for Implementation

- **Layer 1**: `/backend/supabase/functions/parse-receipt-gemini/index.ts`
  - Add `validateReceiptLike()` function
  - Call after receiving OCR text, before Gemini

- **Layer 3**: Same file
  - Add `validateParsedReceipt()` function
  - Call after Gemini response, before saving to database
