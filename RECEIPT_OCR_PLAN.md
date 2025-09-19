# Receipt OCR Implementation Plan - FINAL
*Version: 1.0 - Production-Ready MVP*
*Date: December 2024*
*Status: APPROVED FOR IMPLEMENTATION*

## Executive Summary
On-device OCR receipt scanning using vision-camera-text-recognition, with Edge Function parsing and Fix Queue for accuracy. No paid OCR services, privacy-first, optimized for stability.

## Core Principles
- **Privacy First**: On-device OCR, no image uploads
- **Stability Over Features**: Simple preprocessing, no frame processors
- **International Day 1**: Currency symbols, decimal formats
- **Clear User Flow**: Location → Inventory, No Location → Shopping List

---

## 📦 Dependencies & Versions (LOCKED)
```json
{
  "react-native-vision-camera": "4.5.1",
  "@ismaelmoreiraa/vision-camera-text-recognition": "3.1.1",
  "react-native-reanimated": "3.6.1",
  "react-native-image-resizer": "3.0.10",
  "zustand": "4.5.2"
}
```

## 📱 Device Test Matrix (MANDATORY)
### iOS
- iPhone 11 - iOS 15
- iPhone 13 - iOS 16
- iPhone 15 - iOS 17

### Android
- Pixel 5 - Android 11
- Pixel 7 - Android 13
- Samsung A53 - Android 12 (Mid-range critical!)
- Samsung S22 - Android 14

---

## 🏗️ Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Camera    │────▶│  Still Image │────▶│  On-Device  │
│   Capture   │     │  Preprocess  │     │     OCR     │
└─────────────┘     └──────────────┘     └─────────────┘
                                                 │
                                                 ▼
                                         ┌─────────────┐
                                         │Edge Function│
                                         │   Parser    │
                                         └─────────────┘
                                                 │
                                                 ▼
                                         ┌─────────────┐
                                         │  Fix Queue  │
                                         │   Review    │
                                         └─────────────┘
                                                 │
                                    ┌────────────┴────────────┐
                                    ▼                         ▼
                            ┌──────────────┐         ┌──────────────┐
                            │   Inventory  │         │Shopping List │
                            │  (w/location)│         │(no location) │
                            └──────────────┘         └──────────────┘
```

---

## 📸 Phase 1: Camera Capture (NO Frame Processors)

### Simple Still Capture
```typescript
// Use device motion API for stability (not frame processing)
const useStabilityCheck = () => {
  const [isStable, setIsStable] = useState(false);

  useDeviceMotion((motion) => {
    const movement = Math.abs(motion.x) + Math.abs(motion.y) + Math.abs(motion.z);
    setIsStable(movement < 0.1);
  });

  return isStable;
};

// Simple brightness via camera API
const useBrightnessCheck = (camera: Camera) => {
  const [brightness, setBrightness] = useState<'ok' | 'low' | 'high'>('ok');

  useEffect(() => {
    const interval = setInterval(async () => {
      const exposure = await camera.getExposure();
      if (exposure < -2) setBrightness('low');
      else if (exposure > 2) setBrightness('high');
      else setBrightness('ok');
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return brightness;
};
```

### Minimal Preprocessing Pipeline
```typescript
// SIMPLE preprocessing only
const preprocessImage = async (uri: string): Promise<string> => {
  // 1. Immediate downscale (memory safety)
  const resized = await ImageResizer.createResizedImage(
    uri,
    1280, // max width
    1280, // max height
    'JPEG',
    85,
    0,
    null,
    false
  );

  // 2. Simple enhancement (native)
  const enhanced = await NativeImageProcessor.process(resized.uri, {
    grayscale: true,
    autoContrast: true,
    // NO deskew, NO denoise, NO bilateral filter
  });

  // 3. Clean up immediately
  await FileSystem.deleteAsync(uri);

  return enhanced;
};

// Retry ONLY if confidence < 0.5
const preprocessRetry = async (uri: string): Promise<string> => {
  return await NativeImageProcessor.process(uri, {
    grayscale: true,
    autoContrast: true,
    gammaCorrection: 1.2, // Additional step on retry only
  });
};
```

---

## 💾 Memory Management

### Strict Limits
```typescript
const MEMORY_LIMITS = {
  MAX_IMAGE_SIZE: 4 * 1024 * 1024, // 4MB
  MAX_DIMENSION: 1280,
  MAX_PAGES_IN_MEMORY: 1, // One at a time
};

// Emergency downscale for large images
if (imageSize > MEMORY_LIMITS.MAX_IMAGE_SIZE) {
  image = await emergencyDownscale(image, 800); // Aggressive
}

// Immediate cleanup
const cleanup = (uri: string) => {
  FileSystem.deleteAsync(uri, { idempotent: true });
};
```

---

## 🌍 International Support (Day 1)

### Currency & Decimal Parsing
```typescript
// Handle both decimal formats
const parsePrice = (text: string): { amount: number, currency: string } => {
  // European: 1.234,56 or 1 234,56
  const european = /(\d{1,3}(?:[.\s]\d{3})*),(\d{2})/;
  // US: 1,234.56
  const us = /(\d{1,3}(?:,\d{3})*)\.(\d{2})/;

  let amount;
  if (european.test(text)) {
    amount = parseFloat(text.replace(/[.\s]/g, '').replace(',', '.'));
  } else if (us.test(text)) {
    amount = parseFloat(text.replace(/,/g, ''));
  }

  // Currency symbols
  const symbols = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };
  const match = text.match(/[$€£¥]/);
  const currency = match ? symbols[match[0]] : 'USD';

  return { amount, currency };
};
```

---

## 🔤 OCR Configuration

### Text Recognition Settings
```typescript
const OCR_CONFIG = {
  ios: {
    recognitionLevel: 'accurate',
    recognitionLanguages: ['en-US'],
    usesLanguageCorrection: false, // Keep raw for prices
    minimumTextHeight: 0.01,
  },
  android: {
    modelType: 'latin',
    confidenceThreshold: 0.3,
    script: 'latin',
  }
};

// Single recognition call (no streaming)
const recognizeText = async (imageUri: string): Promise<OCRResult> => {
  const result = await TextRecognition.recognize(imageUri, OCR_CONFIG);

  if (result.blocks.length === 0) {
    throw new Error('No text detected');
  }

  return result;
};
```

---

## 🧮 Parsing Engine

### Pattern Library
```typescript
const PATTERNS = {
  // Prices
  PRICE: /(?:^\$?|\$)\s*(\d{1,4}\.?\d{0,2})\s*(?:[-\s]|$)/,
  PRICE_EACH: /(\d{1,3}\.\d{2})\s*(?:ea|each|\/)/i,

  // Weighted items
  WEIGHTED: /(\d+\.?\d*)\s*(lb|lbs|kg|oz)\s*@\s*\$?(\d+\.\d{2})/i,

  // Quantities
  QUANTITY: /^(\d+)\s*[xX×]\s*/,
  MULTI_PACK: /(\d+)\s*(?:pk|pack|ct|count)/i,

  // Remove these
  PLU_CODE: /PLU\s*#?\s*\d{4,5}/i,
  STORE_CODE: /^[A-Z]{2,4}\d{4,8}\s*/,

  // Discounts
  DISCOUNT: /(?:save|off|-)\s*\$?\d+\.\d{2}|%\s*off/i,
};

// Stopwords to ignore
const STOPWORDS = [
  'subtotal', 'total', 'tax', 'cash', 'credit', 'debit',
  'visa', 'mastercard', 'change', 'auth', 'terminal',
  'loyalty', 'savings', 'thank', 'you'
];
```

### Confidence Thresholds (Conservative)
```typescript
const THRESHOLDS = {
  AUTO_DISCARD: 0.50,  // Below this = auto remove
  NEEDS_REVIEW: 0.80,  // Below this = Fix Queue
  AUTO_OK: 0.80,       // Above this = auto approve
};

// Confidence calculation
const calculateConfidence = (components): number => {
  let score = 0.4; // Base

  if (components.price) score += 0.25;
  if (components.name?.length > 2) score += 0.2;
  if (components.quantity) score += 0.1;
  if (components.unit) score += 0.1;

  if (!components.price) score -= 0.2;
  if (!components.name) score -= 0.3;

  return Math.max(0, Math.min(1, score));
};
```

---

## 🔧 Fix Queue

### Smart Sorting
```typescript
// Priority order for review
const sortByAttention = (lines: ParsedLine[]): ParsedLine[] => {
  return lines.sort((a, b) => {
    // 1. Missing critical data
    if (!a.name && b.name) return -1;
    if (a.name && !b.name) return 1;

    // 2. Missing unit
    if (!a.unit && b.unit) return -1;
    if (a.unit && !b.unit) return 1;

    // 3. Missing location
    if (!a.location && b.location) return -1;
    if (a.location && !b.location) return 1;

    // 4. Confidence score
    return a.confidence - b.confidence;
  });
};
```

### Location Rule Banner
```tsx
// Clear explanation at top of Fix Queue
<Banner>
  📍 Add location → Saves to Inventory
  ❓ No location → Adds to Shopping List
</Banner>

// Visual indicator on each line
{item.location ? (
  <Badge color="green">→ Inventory</Badge>
) : (
  <Badge color="blue">→ Shopping List</Badge>
)}
```

---

## 🗄️ Database Schema

```sql
CREATE TABLE receipts (
  id UUID PRIMARY KEY,
  household_id UUID REFERENCES households(id),
  store_name TEXT,
  purchase_date DATE,
  raw_blocks_json JSONB, -- Store for reprocessing
  parser_version VARCHAR(10), -- Track parser version
  total DECIMAL(10,2),
  currency VARCHAR(3),
  created_at TIMESTAMP
);

CREATE TABLE receipt_lines (
  id UUID PRIMARY KEY,
  receipt_id UUID REFERENCES receipts(id),
  page INTEGER, -- Multi-page support
  line_index INTEGER,
  raw_text TEXT,
  parsed_name TEXT,
  quantity DECIMAL(10,3),
  unit VARCHAR(20),
  price DECIMAL(10,2),
  currency VARCHAR(3),
  category VARCHAR(50),
  confidence FLOAT,
  status VARCHAR(20), -- pending|edited|discarded|confirmed
  location VARCHAR(20), -- fridge|freezer|pantry|null
  created_at TIMESTAMP
);

-- Index for Fix Queue sorting
CREATE INDEX idx_receipt_lines_attention
ON receipt_lines(confidence ASC, unit NULLS FIRST);
```

---

## ⚡ Edge Function

```typescript
// Supabase Edge Function with warmup
Deno.serve(async (req) => {
  // Warmup endpoint
  if (req.url.includes('/warmup')) {
    return new Response('warm');
  }

  // Idempotency
  const idempotencyKey = req.headers.get('Idempotency-Key');
  if (idempotencyKey) {
    const cached = cache.get(idempotencyKey);
    if (cached) return cached;
  }

  const { blocks } = await req.json();

  // Parse with timeout
  const parsed = await Promise.race([
    parseReceipt(blocks),
    timeout(400) // 400ms max
  ]);

  // Cache result
  if (idempotencyKey) {
    cache.set(idempotencyKey, parsed);
  }

  return new Response(JSON.stringify(parsed));
});
```

---

## ♿ Accessibility

### Requirements
- **Touch targets**: Minimum 44x44pt
- **VoiceOver labels**: "Quantity stepper, current value 2"
- **High contrast**: WCAG AAA for badges
- **Haptic feedback**: On successful capture

```tsx
<Pressable
  style={styles.stepper} // min 44x44
  onPress={() => onChange(value - 1)}
  accessibilityLabel={`Decrease ${label}`}
  accessibilityRole="button"
  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
>
  <Text>−</Text>
</Pressable>
```

---

## 📊 Telemetry

### Essential Metrics Only
```typescript
{
  // Performance
  'receipt.capture_ms': number,
  'receipt.ocr_ms': number,
  'receipt.parse_ms': number,

  // Quality
  'receipt.lines_detected': number,
  'receipt.avg_confidence': number,
  'receipt.edits_made': number,

  // Outcomes
  'receipt.to_inventory': number,
  'receipt.to_shopping': number,
}
```

---

## 🧪 Golden Test Set

### Test Cases (15 receipts)
1. `weighted_meat.jpg` - 1.25 LB @ $3.99/LB
2. `thermal_faded.jpg` - Low contrast
3. `european.jpg` - €12,50 format
4. `two_page.jpg` - Multi-page
5. `crumpled.jpg` - Physical distortion
6. `mixed_case.jpg` - MILK, MiLk, milk
7. `produce.jpg` - No explicit units
8. `coupons.jpg` - Discount lines
9. `foreign.jpg` - ¥, £ currencies
10. `decimal_comma.jpg` - 1.234,56
11. `costco.jpg` - Bulk items
12. `cvs_long.jpg` - Very long
13. `walmart.jpg` - Standard US
14. `trader_joes.jpg` - Unique format
15. `handwritten.jpg` - Edge case

---

## ✅ Launch Criteria

### GO if:
- Crash-free rate ≥ 99.5%
- p95 parse ≤ 400ms
- Median edits ≤ 5
- Multi-page works
- Location rule works
- Memory < 150MB peak

### NO-GO if:
- Samsung mid-range crashes
- Parse > 400ms p95
- Memory > 200MB
- OCR fails > 15%

---

## 🚫 NOT in MVP
- ❌ Frame processor prechecks
- ❌ Complex preprocessing (deskew/denoise)
- ❌ Worker threads
- ❌ Adaptive quality
- ❌ Receipt stitching
- ❌ Cloud OCR fallback

---

## 📅 Implementation Timeline

### Week 1: Foundation
- Day 1-2: Camera setup, permissions
- Day 3: Simple capture flow
- Day 4: Preprocessing pipeline
- Day 5: OCR integration

### Week 2: Processing
- Day 6-7: Parse patterns
- Day 8: Edge function
- Day 9: Database setup
- Day 10: Multi-page support

### Week 3: Fix Queue
- Day 11-12: Fix Queue UI
- Day 13: Smart sorting
- Day 14: Bulk operations
- Day 15: Commit flow

### Week 4: Polish
- Day 16: Error states
- Day 17: Performance optimization
- Day 18-19: Device testing
- Day 20: Launch prep

---

## 🔄 Version History
- v1.0 - Initial plan with frame processors
- v2.0 - Simplified for stability (current)

## 📝 Notes
- Focus on stability over features
- Test Samsung mid-range extensively
- Keep Edge Function warm
- Default location = Pantry
- Monitor memory on Android

---

*Last Updated: December 2024*
*Next Review: Post-launch telemetry analysis*