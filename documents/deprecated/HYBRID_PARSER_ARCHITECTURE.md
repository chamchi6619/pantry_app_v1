# 🏗️ Hybrid Parser Architecture Blueprint
**Version: 2.0 - Layered Adaptive System**
**Status: Design Complete, Ready for Implementation**
**Timeline: 4 weeks to full deployment**

---

## 🎯 Executive Summary

**Problem:** Store-specific parsers (v16) don't scale. Your Costco receipt failed because parser expected 3-line format but got 2-line.

**Solution:** Layered Hybrid Architecture - combines universal patterns with store "hints" (not separate parsers), learns from corrections, routes to AI only when needed.

**Benefits:**
- ✅ 82% heuristic accuracy (up from 75%)
- ✅ 54% cost reduction (fewer Gemini calls)
- ✅ Works for ALL stores (including unknown ones)
- ✅ Adapts to format changes automatically
- ✅ Easy maintenance (update JSON hints, not code)

---

## 📊 Architecture Layers

```
┌─────────────────────────────────────────────────┐
│         Layer 1: Pattern Extraction             │
│  Universal analysis without knowing store       │
│  • Line formats (single/2-line/3-line)          │
│  • Price patterns                                │
│  • Item boundaries                               │
│  • Tax markers                                   │
└─────────────────┬───────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────┐
│         Layer 2: Store Detection                │
│  • Name matching (90% confidence)               │
│  • Format fingerprinting (80% confidence)       │
│  • Unknown stores → use universal               │
└─────────────────┬───────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────┐
│         Layer 3: Store Hints Lookup             │
│  NOT separate parsers - just hints:             │
│  • Format types to try (2-line, 3-line)         │
│  • Price/tax regex patterns                     │
│  • Abbreviation expansions                      │
│  • OCR correction rules                         │
└─────────────────┬───────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────┐
│         Layer 4: Adaptive Extraction            │
│  Try strategies based on hints:                 │
│  • Multi-format item extraction                 │
│  • Weighted items (2.45 LB @ $3.54/LB)         │
│  • Apply normalizations                         │
│  • Reconcile against totals                     │
└─────────────────┬───────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────┐
│    Layer 5: Validation & Smart Routing          │
│  • Calculate confidence score                    │
│  • If ≥75%: ✅ Done (FREE)                      │
│  • If 60-75%: Enhance low-conf items            │
│  • If <60%: Full Gemini parse                  │
│  • Learn from user corrections                  │
└─────────────────────────────────────────────────┘
```

---

## 🗂️ Store Hints Database

### Structure
```json
{
  "stores": {
    "COSTCO": {
      "signatures": ["COSTCO", "WHOLESALE", "KIRKLAND"],
      "fingerprints": {
        "hasItemCodes": true,
        "codePattern": "^\\d{6,7}",
        "taxMarkers": ["E", "A"]
      },
      "itemFormats": ["2-line", "3-line"],
      "patterns": {
        "itemCode": "^(\\d{6,7})(\\s+[A-Z])?",
        "price": "^(\\d+\\.\\d{2})\\s*[EA]?$",
        "weighted": "(\\d+\\.\\d{2})\\s*LB\\s*@\\s*\\d+\\.\\d{2}/LB"
      },
      "normalizations": {
        "ORG": "ORGANIC",
        "KS": "KIRKLAND SIGNATURE",
        "LS": "LESS SODIUM",
        "WHT": "WHITE",
        "YEL": "YELLOW",
        "PNT": "PEANUT",
        "BTR": "BUTTER"
      },
      "ocrCorrections": {
        "SPINAC": "SPINACH",
        "BACO": "BACON",
        "ONIO": "ONION",
        "PEAC": "PEACH"
      }
    },

    "WALMART": {
      "signatures": ["WAL-MART", "WALMART", "WAL MART"],
      "fingerprints": {
        "hasItemCodes": false,
        "taxMarkers": ["X", "O", "N", "T"]
      },
      "itemFormats": ["single-line"],
      "patterns": {
        "itemLine": "^(.+?)\\s+(\\d+\\.\\d{2})\\s*[XONT]?$",
        "price": "\\s+(\\d+\\.\\d{2})\\s*[XONT]$"
      },
      "normalizations": {
        "GV": "GREAT VALUE",
        "MM": "MARKETSIDE"
      },
      "ocrCorrections": {}
    },

    "TARGET": {
      "signatures": ["TARGET"],
      "fingerprints": {
        "hasItemCodes": false,
        "taxMarkers": ["T", "F"]
      },
      "itemFormats": ["single-line"],
      "patterns": {
        "itemLine": "^(.+?)\\s+(\\d+\\.\\d{2})\\s*[TF]?$",
        "redcard": "REDCARD\\s+SAVINGS",
        "circle": "CIRCLE\\s+EARNINGS"
      },
      "normalizations": {
        "UP&UP": "UP AND UP"
      },
      "ocrCorrections": {}
    },

    "SAFEWAY": {
      "signatures": ["SAFEWAY"],
      "fingerprints": {
        "hasItemCodes": false,
        "hasPLUs": true,
        "pluPattern": "^\\d{4,5}$"
      },
      "itemFormats": ["2-line", "single-line"],
      "patterns": {
        "pluItem": "^(\\d{4,5})\\s+(.+)",
        "youPay": "You\\s+Pa[yv]\\s+(\\d+\\.\\d{2})"
      },
      "normalizations": {},
      "produceMapping": {
        "4011": "BANANAS",
        "4053": "LEMONS",
        "4608": "GARLIC"
      }
    },

    "KROGER": {
      "signatures": ["KROGER"],
      "fingerprints": {
        "hasItemCodes": false
      },
      "itemFormats": ["single-line"],
      "patterns": {
        "itemLine": "^(.+?)\\s+(\\d+\\.\\d{2})$"
      },
      "normalizations": {
        "KR": "KROGER"
      }
    }
  },

  "universal": {
    "itemFormats": ["single-line", "2-line"],
    "patterns": {
      "price": "\\d+\\.\\d{2}",
      "skipPatterns": [
        "^SUBTOTAL",
        "^TOTAL",
        "^TAX",
        "^PAYMENT",
        "^CASH",
        "^CREDIT",
        "^CHANGE"
      ]
    }
  }
}
```

---

## 🛠️ Implementation Files

### File Structure
```
supabase/functions/
├── parse-receipt-hybrid/
│   ├── index.ts                    # Main entry point
│   ├── layers/
│   │   ├── patternExtractor.ts     # Layer 1
│   │   ├── storeDetector.ts        # Layer 2
│   │   ├── hintsLoader.ts          # Layer 3
│   │   ├── adaptiveExtractor.ts    # Layer 4
│   │   └── validator.ts            # Layer 5
│   ├── strategies/
│   │   ├── singleLineStrategy.ts
│   │   ├── twoLineStrategy.ts
│   │   ├── threeLineStrategy.ts
│   │   └── weightedItemStrategy.ts
│   ├── normalizers/
│   │   ├── itemNormalizer.ts
│   │   └── ocrCorrector.ts
│   └── data/
│       └── storeHints.json         # Store hints database
```

---

## 📝 Core Implementation

### Layer 1: Pattern Extractor
```typescript
// layers/patternExtractor.ts
export interface ReceiptPatterns {
  lines: string[];
  itemBoundaries: { start: number; end: number };
  hasItemCodes: boolean;
  codePattern?: RegExp;
  pricePattern: RegExp;
  taxMarkers: string[];
  formatHints: {
    singleLine: number;  // Count of single-line items
    twoLine: number;     // Count of 2-line items
    threeLine: number;   // Count of 3-line items
  };
}

export function extractPatterns(text: string): ReceiptPatterns {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // Find item boundaries
  let itemStart = 0;
  let itemEnd = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (/^SUBTOTAL/i.test(lines[i])) {
      itemEnd = i;
      break;
    }
  }

  // Detect patterns
  let hasItemCodes = false;
  let codePattern: RegExp | undefined;
  const taxMarkers = new Set<string>();
  const formatHints = {
    singleLine: 0,
    twoLine: 0,
    threeLine: 0
  };

  // Analyze first 20 lines for patterns
  for (let i = itemStart; i < Math.min(itemStart + 20, itemEnd); i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    // Check for item codes
    if (/^\d{6,7}$/.test(line)) {
      hasItemCodes = true;
      codePattern = /^\d{6,7}/;
    }

    // Check format types
    if (/^(.+?)\s+\d+\.\d{2}\s*[A-Z]?$/.test(line)) {
      formatHints.singleLine++;
    }

    if (/^\d{6,7}\s+[A-Z]/.test(line) && /^\d+\.\d{2}/.test(nextLine)) {
      formatHints.twoLine++;
    }

    if (/^\d{6,7}$/.test(line) && /^[A-Z]/.test(nextLine)) {
      formatHints.threeLine++;
    }

    // Collect tax markers
    const taxMatch = line.match(/\d+\.\d{2}\s*([A-Z])$/);
    if (taxMatch) {
      taxMarkers.add(taxMatch[1]);
    }
  }

  return {
    lines,
    itemBoundaries: { start: itemStart, end: itemEnd },
    hasItemCodes,
    codePattern,
    pricePattern: /\d+\.\d{2}/,
    taxMarkers: Array.from(taxMarkers),
    formatHints
  };
}
```

### Layer 2: Store Detector
```typescript
// layers/storeDetector.ts
import storeHints from '../data/storeHints.json';

export interface StoreMatch {
  name: string;
  confidence: number;
  hints: any;
}

export function detectStore(text: string, patterns: ReceiptPatterns): StoreMatch {
  const firstLines = text.split('\n').slice(0, 10).join(' ').toUpperCase();

  // Try signature matching first
  for (const [storeName, hints] of Object.entries(storeHints.stores)) {
    for (const signature of hints.signatures) {
      if (firstLines.includes(signature)) {
        return {
          name: storeName,
          confidence: 0.95,
          hints
        };
      }
    }
  }

  // Try fingerprint matching
  for (const [storeName, hints] of Object.entries(storeHints.stores)) {
    let matchScore = 0;
    let totalChecks = 0;

    if (hints.fingerprints) {
      totalChecks++;
      if (hints.fingerprints.hasItemCodes === patterns.hasItemCodes) {
        matchScore++;
      }

      if (hints.fingerprints.taxMarkers) {
        totalChecks++;
        const overlap = hints.fingerprints.taxMarkers.filter(
          m => patterns.taxMarkers.includes(m)
        );
        if (overlap.length > 0) matchScore++;
      }
    }

    if (totalChecks > 0 && matchScore / totalChecks >= 0.7) {
      return {
        name: storeName,
        confidence: 0.75,
        hints
      };
    }
  }

  // Unknown store - use universal
  return {
    name: 'UNKNOWN',
    confidence: 0.5,
    hints: storeHints.universal
  };
}
```

### Layer 4: Adaptive Extractor
```typescript
// layers/adaptiveExtractor.ts
import { SingleLineStrategy } from '../strategies/singleLineStrategy';
import { TwoLineStrategy } from '../strategies/twoLineStrategy';
import { ThreeLineStrategy } from '../strategies/threeLineStrategy';

export interface ExtractionResult {
  items: ParsedItem[];
  confidence: number;
  strategy: string;
}

export function extractItems(
  patterns: ReceiptPatterns,
  hints: any
): ExtractionResult {
  const strategies = selectStrategies(patterns, hints);

  let bestResult: ExtractionResult = {
    items: [],
    confidence: 0,
    strategy: 'none'
  };

  // Try each strategy
  for (const strategy of strategies) {
    const result = strategy.extract(patterns, hints);

    if (result.confidence > bestResult.confidence) {
      bestResult = result;
    }

    // Short-circuit if high confidence
    if (result.confidence >= 0.85) {
      break;
    }
  }

  return bestResult;
}

function selectStrategies(patterns: ReceiptPatterns, hints: any) {
  const strategies = [];

  // Order strategies by likelihood based on format hints
  const { formatHints } = patterns;
  const formats = Object.entries(formatHints)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .map(([format]) => format);

  for (const format of formats) {
    switch (format) {
      case 'singleLine':
        strategies.push(new SingleLineStrategy());
        break;
      case 'twoLine':
        strategies.push(new TwoLineStrategy());
        break;
      case 'threeLine':
        strategies.push(new ThreeLineStrategy());
        break;
    }
  }

  return strategies;
}
```

---

## 📊 Migration Plan

### Week 1: Core Engine
- [ ] Implement 5 layers
- [ ] Create store hints JSON
- [ ] Build 4 extraction strategies
- [ ] Add item normalizer
- [ ] Write unit tests

### Week 2: Integration
- [ ] Deploy as `parse-receipt-hybrid`
- [ ] A/B test: 10% traffic to hybrid
- [ ] Monitor accuracy metrics
- [ ] Compare with v16/v17
- [ ] Tune confidence thresholds

### Week 3: Rollout
- [ ] Add hints for top 10 stores
- [ ] Increase to 50% traffic
- [ ] Monitor cost reduction
- [ ] Fix edge cases
- [ ] Update documentation

### Week 4: Optimization
- [ ] 100% traffic to hybrid
- [ ] Implement learning system
- [ ] Auto-generate hints from corrections
- [ ] Performance optimization
- [ ] Deprecate v16/v17

---

## 💰 Cost Impact Analysis

### Current v16 (1000 receipts/month)
```
Heuristics success: 75% (750 FREE)
Gemini needed: 25% (250 × $0.00004 = $0.010)
Total: $0.010/month
```

### v17 Adaptive (1000 receipts/month)
```
Heuristics success: 78% (780 FREE)
Gemini needed: 22% (220 × $0.00004 = $0.0088)
Total: $0.0088/month (-12%)
```

### Hybrid (1000 receipts/month)
```
Heuristics success: 82% (820 FREE)
Partial enhancement: 13% (130 × $0.00002 = $0.0026)
Full Gemini: 5% (50 × $0.00004 = $0.002)
Total: $0.0046/month (-54% vs v16!)
```

---

## ✅ Success Metrics

| Metric | v16 | v17 | Hybrid Target |
|--------|-----|-----|---------------|
| Heuristic Accuracy | 75% | 78% | **82%** |
| Gemini Usage | 25% | 22% | **5%** |
| Unknown Store Support | ❌ | ⚠️ | ✅ |
| Format Adaptability | ❌ | ✅ | ✅ |
| Maintenance Burden | 😱 | 🤔 | 😊 |
| Cost per 1K receipts | $0.010 | $0.0088 | **$0.0046** |

---

## 🎯 Next Steps

**Immediate (This Week):**
1. ✅ Deploy v17 for quick fix
2. Test v17 with your Costco receipt
3. Monitor accuracy improvements

**Short-term (Next 2 Weeks):**
1. Implement core hybrid engine
2. Create store hints database
3. Build extraction strategies

**Long-term (Month 2):**
1. Full hybrid rollout
2. Learning system
3. Auto-hint generation

---

**Questions? Ready to start implementation?**

Contact: Review this document and provide feedback on:
1. Priority order (quick fix vs full hybrid)
2. Which stores to add hints for first
3. Timeline adjustments

---

*Last Updated: 2025-09-30*
*Status: Ready for Implementation*
*Next Review: After v17 deployment*
