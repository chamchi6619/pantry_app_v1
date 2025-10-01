# Gemini JSON Mode + Progressive UI Implementation

**Date**: 2025-10-01
**Status**: In Progress
**Goal**: Route all receipts to Gemini 2.0 Flash with JSON mode + implement progressive UI for better UX

---

## Context

### Problem
- Heuristic parser fails on complex receipts (Safeway: 74% accuracy, $70/$94)
- Different stores have different formats → endless regex fixes
- Need strategic solution, not edge case whack-a-mole

### Strategic Decision
**Route 100% of receipts to Gemini 2.0 Flash**
- Cost: $0.00015/receipt (~$7/month @ 1000 receipts/day)
- Accuracy: 95%+ expected
- No maintenance of complex heuristics
- Skip learning/optimization (not worth $3.50/month savings)

### Model Choice: Gemini 2.0 Flash
- Input: $0.10/1M tokens
- Output: $0.40/1M tokens
- Fast + cheap + accurate for structured extraction
- Better than 2.5 Flash (5x more expensive, minimal accuracy gain for receipts)

---

## Architecture

### Backend
**File**: `backend/app/services/gemini_parser.py`

**Changes**:
1. Use JSON mode with strict schema
2. Minimal prompt (no verbose examples)
3. Full OCR input (no preprocessing/compression)
4. Direct parsing (no markdown extraction)

**Why**:
- JSON mode = guaranteed valid structure
- 2.0 Flash is smart enough without examples
- Many receipts fail on parsing, not OCR → send full text

### Frontend (iOS)
**Progressive UI States**:
1. `capturing` (0ms) - "📸 Receipt captured"
2. `uploading` (100ms) - "☁️ Uploading..."
3. `processing` (500ms) - "🔍 Reading text..."
4. `parsing` (2000ms) - "✨ Extracting items..." + skeleton loaders
5. `complete` (3-5s) - Animate items in

**Why**:
- Actual latency: 3-5s (OCR 2-3s + Gemini 1-2s)
- Perceived latency: ~2s (with good feedback)
- User feels in control, not waiting

---

## Implementation Plan

### Phase 1: Backend JSON Mode ✅ NEXT
**File**: `backend/app/services/gemini_parser.py`

1. Define strict JSON schema
2. Update prompt to minimal version
3. Use `response_mime_type: "application/json"`
4. Remove markdown/regex JSON extraction
5. Test with real Safeway receipt

**Time**: 30 min

### Phase 2: iOS Progressive UI
**Files**: iOS app (React Native or Swift)

1. Define `ReceiptScanState` enum
2. Create status bar component
3. Add skeleton loaders
4. Implement optimistic state transitions
5. Add smooth item animations

**Time**: 1-2 hours

### Phase 3: Integration & Testing
1. Test backend JSON mode
2. Test iOS state transitions
3. End-to-end test with real receipt
4. Validate timing feels good

**Time**: 30 min

---

## JSON Schema

```python
receipt_schema = {
    "type": "object",
    "properties": {
        "merchant": {"type": "string"},
        "date": {"type": "string"},
        "total": {"type": "number"},
        "subtotal": {"type": "number"},
        "tax": {"type": "number"},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "raw_text": {"type": "string"},
                    "item_name": {"type": "string"},
                    "price": {"type": "number"},
                    "quantity": {"type": "number"},
                    "unit": {"type": "string"},
                    "category": {"type": "string"}
                },
                "required": ["item_name", "price"]
            }
        }
    },
    "required": ["items"]
}
```

---

## Minimal Prompt

```python
prompt = f"""Extract all items from this receipt.

Normalize abbreviations:
ORG→Organic, MLK→Milk, WHP→Whipped, CRM→Cream, CHKN→Chicken,
BF→Beef, CHZ→Cheese, VEG→Vegetable, GRND→Ground

{ocr_text}"""
```

**Token count**: ~50 tokens (vs 500 before)
**Cost savings**: 90% on prompt

---

## iOS State Flow

```
User taps capture
    ↓
.capturing (0ms) → immediate feedback
    ↓
.uploading (100ms) → show upload icon
    ↓
.processing (500ms) → "Reading text..."
    ↓
.parsing (2000ms) → "Extracting..." + skeletons
    ↓
API returns (3-5s actual)
    ↓
.complete → animate items (30ms delay each)
```

---

## Expected Results

### Before
- Black screen 5s
- Items appear suddenly
- Feels broken/slow
- User anxiety

### After
- Instant capture feedback
- Clear progress states
- Skeleton loaders show structure
- Smooth animations
- **Feels 2x faster** (same actual time)

---

## Cost Analysis

**Per receipt**: $0.00015
**1000 receipts/day**: $0.15/day = $4.50/month
**10,000 receipts/day**: $1.50/day = $45/month

**vs. User fixing errors**:
- 1 wrong item = 10 sec to fix = $0.17 @ $60/hr
- Heuristics @ 80% accuracy = 20% need fixes = $0.034/receipt
- **Gemini is 226x cheaper than manual fixes**

**Decision**: Don't optimize costs, optimize UX

---

## Deferred/Skipped

### Learning Engine (Skipped)
- Log OCR→Gemini pairs for pattern analysis
- Build smart routing (heuristics for simple, Gemini for complex)
- Gradual transition to 80% heuristics

**Why skip**:
- Setup time: 4-8 hours
- Savings: $2.70/month (60% of $4.50)
- **Not worth it** at current scale
- Revisit at >5000 receipts/day

### OCR Compression (Skipped)
- Remove duplicate lines
- Strip whitespace
- Token savings: 20-30%

**Why skip**:
- "Many receipts successfully read text but had trouble parsing"
- Compression might lose critical context
- Savings: $0.00003/receipt = $0.90/month
- **Not worth the risk**

---

## Files Modified

### Backend
- ✅ `backend/app/services/gemini_parser.py` - Updated model to 2.0 Flash
- 🔄 `backend/app/services/gemini_parser.py` - Add JSON mode (IN PROGRESS)

### iOS (Pending)
- `[iOS app path]/ReceiptScanner.swift` - State management
- `[iOS app path]/ReceiptScanView.swift` - Progressive UI
- `[iOS app path]/Components/SkeletonLoader.swift` - Loading states

---

## Testing Checklist

### Backend
- [ ] JSON mode returns valid JSON (no markdown)
- [ ] Schema validation works
- [ ] Handles missing fields gracefully
- [ ] Test with Costco receipt (simple)
- [ ] Test with Safeway receipt (complex)
- [ ] Cost tracking logs correct

### iOS
- [ ] State transitions feel smooth
- [ ] Skeleton loaders look good
- [ ] Item animations not jarring
- [ ] Error states handled
- [ ] Timing feels natural (not too fast/slow)
- [ ] Works on slow network

### End-to-End
- [ ] Photo → Results < 5s
- [ ] Perceived latency < 2s (with feedback)
- [ ] 95%+ accuracy on test receipts
- [ ] No JSON parsing errors

---

## Next Steps

1. Update `gemini_parser.py` with JSON mode
2. Test with real Safeway receipt
3. Document iOS requirements for progressive UI
4. Implement iOS state management
5. End-to-end validation

---

## Notes

- Keep heuristic parser code for now (don't delete)
- May revisit learning engine at >5000 receipts/day
- Focus on UX over optimization at this scale
- JSON mode should eliminate parsing errors
