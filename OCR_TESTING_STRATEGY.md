# OCR Feature Testing & Improvement Strategy

## 📱 Current Implementation Analysis

### What We Have
1. **Two OCR Approaches:**
   - `ocrService.ts` - Expo-compatible mock implementation
   - `nativeOcrService.ts` - Vision Camera with real OCR (requires custom dev build)
   - Currently using MOCK data - not real OCR!

2. **Receipt Processing Flow:**
   - Camera capture → Image preprocessing → OCR → Parse text → Fix queue → Inventory

3. **Current Issues:**
   - 🔴 **Critical:** Using mock data, not actual OCR
   - 🔴 No real receipt parsing logic
   - 🟡 No confidence scoring
   - 🟡 No ML-based item categorization

---

## 🧪 Testing Strategy

### Phase 1: OCR Service Selection & Setup (Week 1)

#### Option A: Google Cloud Vision API (Recommended)
```typescript
// Real implementation with Google Vision
const GOOGLE_VISION_API_KEY = 'your-api-key';

async performOCR(imageUri: string): Promise<OCRResult> {
  const base64 = await this.preprocessImage(imageUri);

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64 },
          features: [{ type: 'TEXT_DETECTION' }]
        }]
      })
    }
  );

  const result = await response.json();
  return this.parseGoogleVisionResponse(result);
}
```

**Pros:**
- Works in Expo Go (no custom build needed)
- 95%+ accuracy
- Free tier: 1000 requests/month
- Handles multiple languages

**Cons:**
- Requires internet connection
- API key management
- Monthly limits

#### Option B: Tesseract.js (Web-based)
```typescript
// Client-side OCR with Tesseract
import Tesseract from 'tesseract.js';

async performOCR(imageUri: string): Promise<OCRResult> {
  const worker = await Tesseract.createWorker('eng');
  const result = await worker.recognize(imageUri);
  await worker.terminate();

  return {
    text: result.data.text,
    confidence: result.data.confidence,
    blocks: result.data.blocks
  };
}
```

**Pros:**
- Offline capability
- No API limits
- Privacy-friendly

**Cons:**
- Slower (5-10 seconds)
- Larger bundle size (+15MB)
- Lower accuracy (85-90%)

#### Option C: AWS Textract
**Pros:**
- Best receipt-specific features
- Extracts tables/forms
- 98%+ accuracy

**Cons:**
- More complex setup
- AWS account required
- Higher cost

---

### Phase 2: Test Data Collection (Week 1-2)

#### Create Test Dataset
```typescript
// test-receipts.json
export const TEST_RECEIPTS = [
  {
    id: 'walmart-001',
    store: 'Walmart',
    imageUrl: '/test-receipts/walmart-001.jpg',
    expectedItems: [
      { name: 'Bananas', quantity: 2, unit: 'lb', price: 1.38 },
      { name: 'Milk', quantity: 1, unit: 'gal', price: 3.99 },
      // ... more items
    ],
    expectedTotal: 45.67
  },
  // Add 50+ test receipts from different stores
];
```

#### Receipt Sources for Testing:
1. **Common Stores:** Walmart, Target, Whole Foods, Costco, Safeway
2. **Receipt Types:** Grocery, pharmacy, restaurant, gas station
3. **Conditions:** Clear, crumpled, faded, angled, low light
4. **Languages:** English, Spanish (if supporting multilingual)

---

### Phase 3: Parser Implementation & Testing

#### Robust Receipt Parser
```typescript
class ReceiptParser {
  // Store-specific patterns
  private storePatterns = {
    walmart: {
      itemPattern: /^(\d+)\s+(.+?)\s+(\d+\.\d{2})$/,
      totalPattern: /TOTAL\s+(\d+\.\d{2})/,
      datePattern: /(\d{2}\/\d{2}\/\d{4})/
    },
    target: {
      itemPattern: /(.+?)\s+(\d+)?\s*@?\s*\$?(\d+\.\d{2})/,
      // ... different patterns
    }
  };

  parseReceipt(ocrText: string): ParsedReceipt {
    const store = this.detectStore(ocrText);
    const patterns = this.storePatterns[store] || this.genericPatterns;

    return {
      store,
      items: this.extractItems(ocrText, patterns),
      total: this.extractTotal(ocrText, patterns),
      date: this.extractDate(ocrText, patterns)
    };
  }

  // Fuzzy matching for product names
  normalizeItemName(raw: string): string {
    return raw
      .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars
      .replace(/\b(org|organic)\b/gi, 'Organic')
      .replace(/\b(whl|whole)\b/gi, 'Whole')
      .trim();
  }
}
```

---

### Phase 4: Automated Testing Suite

#### 1. Unit Tests for Parser
```typescript
// __tests__/receiptParser.test.ts
describe('Receipt Parser', () => {
  it('should parse Walmart receipt correctly', () => {
    const ocrText = loadTestReceipt('walmart-001.txt');
    const parsed = parser.parseReceipt(ocrText);

    expect(parsed.store).toBe('Walmart');
    expect(parsed.items).toHaveLength(12);
    expect(parsed.total).toBe(45.67);
  });

  it('should handle damaged text', () => {
    const ocrText = 'B4N4N4S 2LB $1.38'; // OCR errors
    const parsed = parser.parseReceipt(ocrText);

    expect(parsed.items[0].name).toBe('Bananas');
  });
});
```

#### 2. Integration Tests
```typescript
// __tests__/ocrFlow.test.ts
describe('OCR Flow Integration', () => {
  it('should process receipt end-to-end', async () => {
    const imageUri = 'test-receipt.jpg';

    // 1. OCR
    const ocrResult = await ocrService.performOCR(imageUri);
    expect(ocrResult.confidence).toBeGreaterThan(0.8);

    // 2. Parse
    const parsed = parser.parseReceipt(ocrResult.text);
    expect(parsed.items.length).toBeGreaterThan(0);

    // 3. Fix Queue
    const fixItems = parsed.items.filter(i => i.confidence < 0.9);
    expect(fixItems.length).toBeLessThan(parsed.items.length * 0.3);

    // 4. Add to Inventory
    const added = await inventoryStore.addItems(parsed.items);
    expect(added).toBe(true);
  });
});
```

#### 3. Accuracy Metrics
```typescript
class OCRAccuracyTester {
  async testAccuracy(testSet: TestReceipt[]): Promise<AccuracyReport> {
    const results = [];

    for (const test of testSet) {
      const ocrResult = await ocrService.performOCR(test.imageUrl);
      const parsed = parser.parseReceipt(ocrResult.text);

      const accuracy = this.compareResults(parsed, test.expected);
      results.push(accuracy);
    }

    return {
      overall: this.calculateAverage(results),
      byStore: this.groupByStore(results),
      byCondition: this.groupByCondition(results),
      failedCases: results.filter(r => r.accuracy < 0.8)
    };
  }

  compareResults(actual: ParsedReceipt, expected: ExpectedReceipt) {
    const itemAccuracy = this.compareItems(actual.items, expected.items);
    const totalAccuracy = actual.total === expected.total ? 1 : 0;

    return {
      items: itemAccuracy,
      total: totalAccuracy,
      overall: (itemAccuracy + totalAccuracy) / 2
    };
  }
}
```

---

### Phase 5: Performance Testing

#### Load Testing
```typescript
// Test concurrent OCR requests
async function loadTest() {
  const images = loadTestImages(100); // 100 receipt images

  console.time('OCR Load Test');
  const results = await Promise.all(
    images.map(img => ocrService.performOCR(img))
  );
  console.timeEnd('OCR Load Test');

  const successRate = results.filter(r => r.confidence > 0.8).length / 100;
  console.log(`Success rate: ${successRate * 100}%`);
}
```

#### Memory Testing
```typescript
// Monitor memory usage during OCR
function memoryTest() {
  const before = process.memoryUsage();

  // Process 50 receipts sequentially
  for (let i = 0; i < 50; i++) {
    await ocrService.performOCR(testImages[i]);
  }

  const after = process.memoryUsage();
  const leak = (after.heapUsed - before.heapUsed) / 1024 / 1024;

  expect(leak).toBeLessThan(50); // Max 50MB leak
}
```

---

## 🎯 Success Metrics

### Target Performance
- **OCR Accuracy:** >90% character recognition
- **Item Extraction:** >85% correct items
- **Price Accuracy:** >95% correct prices
- **Processing Time:** <3 seconds per receipt
- **Fix Queue Rate:** <20% items need manual review

### Testing Checklist
- [ ] OCR service selected and integrated
- [ ] 50+ test receipts collected
- [ ] Parser handles 5+ major store formats
- [ ] Unit tests cover all parser functions
- [ ] Integration tests pass end-to-end
- [ ] Accuracy >85% on test set
- [ ] Performance <3s per receipt
- [ ] Memory usage stable
- [ ] Error handling for edge cases
- [ ] Fix queue properly catches low confidence items

---

## 📝 Implementation Plan

### Week 1: OCR Service
1. Set up Google Vision API
2. Create API key management
3. Implement real OCR service
4. Basic error handling

### Week 2: Parser Development
1. Analyze receipt patterns from major stores
2. Implement regex patterns for each store
3. Add fuzzy matching for product names
4. Handle edge cases (damaged text, rotated images)

### Week 3: Testing Suite
1. Collect 50+ test receipts
2. Write unit tests for parser
3. Create integration tests
4. Set up accuracy benchmarking

### Week 4: Optimization
1. Improve low-accuracy cases
2. Optimize performance
3. Add caching layer
4. Production error tracking

---

## 🔍 Manual Testing Protocol

### Test Scenarios
1. **Happy Path:** Clear Walmart receipt → All items recognized
2. **Poor Lighting:** Dark image → Enhanced preprocessing → Good results
3. **Crumpled Receipt:** Wrinkled paper → Partial recognition → Fix queue
4. **Multiple Pages:** Long receipt → Stitch images → Full parsing
5. **Non-English:** Spanish receipt → Translate → Parse correctly
6. **Wrong Image:** Photo of cat → Reject gracefully
7. **Network Failure:** API timeout → Retry logic → Success

### User Acceptance Testing
1. Beta test with 10-20 users
2. Track success rate per user
3. Collect feedback on accuracy
4. Identify common failure patterns
5. Iterate based on real usage

---

## 🚀 Next Steps

1. **Immediate:** Replace mock OCR with Google Vision API
2. **This Week:** Create test receipt dataset
3. **Next Week:** Implement robust parser
4. **Testing:** Automated test suite with 85%+ coverage
5. **Production:** Deploy with monitoring and error tracking

The key is to move from mock data to real OCR ASAP, then iteratively improve accuracy through testing and refinement.