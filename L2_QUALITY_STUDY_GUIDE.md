# L2 Quality Study Execution Guide

**Purpose:** Test YouTube description ingredient extraction quality to decide on Rich Paste UX rollout

**Time Required:** 1-2 hours (setup + execution + analysis)

**Prerequisites:**
- YouTube Data API v3 key (create at [Google Cloud Console](https://console.cloud.google.com/))
- Deno installed (`brew install deno` or see [deno.land](https://deno.land/))

---

## Step 1: Get YouTube API Key (15 min)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing
3. Enable **YouTube Data API v3**:
   - APIs & Services → Library
   - Search "YouTube Data API v3"
   - Click "Enable"
4. Create API key:
   - APIs & Services → Credentials
   - Create Credentials → API Key
   - Copy key (starts with `AIza...`)
5. Restrict key (recommended):
   - Edit API key
   - API restrictions → Restrict key → YouTube Data API v3
   - Save

---

## Step 2: Set Environment Variable

```bash
# macOS/Linux
export YOUTUBE_API_KEY="AIzaSy..."

# Windows (PowerShell)
$env:YOUTUBE_API_KEY="AIzaSy..."

# Windows (CMD)
set YOUTUBE_API_KEY=AIzaSy...
```

**Verify:**
```bash
echo $YOUTUBE_API_KEY
```

---

## Step 3: Run Quality Study

```bash
cd /path/to/pantry_app_v1

# Run study script
deno run --allow-env --allow-net --allow-write scripts/l2_quality_study.ts
```

**What happens:**
1. Script fetches descriptions for 20 YouTube videos (baking, cooking, quick meals, meal prep, healthy)
2. Parses ingredients using L2 regex patterns
3. Calculates metrics per video:
   - Ingredients found
   - Average confidence
   - High/medium/low confidence distribution
4. Applies decision gate thresholds
5. Outputs recommendation
6. Saves results to `L2_QUALITY_STUDY_RESULTS.json`

**Expected output:**
```
🔬 L2 Quality Study - Starting...
📊 Testing 20 YouTube videos

📹 Testing: Perfect Chocolate Chip Cookies (baking)
   URL: https://www.youtube.com/watch?v=s_SqpPbRx8s
   Description length: 1247 chars
   ✅ Found 8 ingredients (avg conf: 0.88)
      High (≥0.90): 6, Medium (0.70-0.89): 2, Low (<0.70): 0
      Meets threshold: YES

... (19 more videos)

================================================================================
📊 L2 QUALITY STUDY RESULTS
================================================================================

Total videos tested: 20
Videos with ≥5 ingredients: 16 (80.0%)
Videos with avg conf ≥0.70: 18 (90.0%)
Videos meeting threshold (≥5 ing + ≥0.70 conf): 14 (70.0%)

📈 OVERALL PASS RATE: 70.0%

💡 RECOMMENDATION:
   🚀 Ship Rich Paste UX immediately - Quality threshold exceeded!

================================================================================
DETAILED RESULTS
================================================================================

✅ Perfect Chocolate Chip Cookies
   Ingredients: 8, Avg Conf: 0.88
   Reason: 8 ingredients, 0.88 avg conf

... (detailed breakdown for all 20 videos)

💾 Results saved to: ./L2_QUALITY_STUDY_RESULTS.json
```

---

## Step 4: Analyze Results

### Decision Gate Thresholds

| Pass Rate | Action |
|-----------|--------|
| **≥60%** | 🚀 Ship Rich Paste UX immediately |
| **50-59%** | ⚠️  Ship Rich Paste with "ingredients may need confirmation" banner |
| **40-49%** | 🔄 Keep Lite; prioritize L3 LLM fallback behind confirm + cost gates |
| **<40%** | ❌ Reassess YT description viability; focus L3 + creator kit |

### Key Metrics to Review

1. **Overall Pass Rate**: % of videos with ≥5 ingredients AND ≥0.70 avg confidence
2. **Category Breakdown**: Which categories perform best?
   - Baking (structured recipes) → Usually highest quality
   - Cooking (varied formats) → Medium quality
   - Quick meals (minimal descriptions) → Often lowest quality
3. **Confidence Distribution**: How many high vs low confidence ingredients?
4. **Common Failure Modes**:
   - No ingredient list in description (creator just talks)
   - Unstructured paragraph format (no bullets/dashes)
   - Too many promotional links/noise
   - Instructions mixed with ingredients

---

## Step 5: Document Findings

Create `L2_QUALITY_STUDY_RESULTS.md` with:

```markdown
# L2 Quality Study Results

**Date:** 2025-10-08
**Videos Tested:** 20
**Pass Rate:** X.X%
**Recommendation:** [Action from decision gate]

## Summary

[1-2 paragraph summary of findings]

## Metrics

- Videos with ≥5 ingredients: X/20 (XX%)
- Videos with ≥0.70 avg confidence: X/20 (XX%)
- Videos meeting threshold: X/20 (XX%)

## Breakdown by Category

| Category | Videos | Pass Rate | Notes |
|----------|--------|-----------|-------|
| Baking | 4 | 75% | Well-structured ingredient lists |
| Cooking | 6 | 67% | Mixed quality, some verbose |
| Quick | 4 | 50% | Often missing descriptions |
| Meal Prep | 3 | 67% | Long lists, good structure |
| Healthy | 3 | 67% | Moderate quality |

## Common Patterns

### What Works ✅
- Bullet-point ingredient lists
- "X cups Y" structured format
- Dedicated "Ingredients:" section in description

### What Fails ❌
- Paragraph-only descriptions
- No ingredient list (instructions only)
- Heavy promotional content
- Non-English descriptions

## Decision

[Based on pass rate, state which action to take from decision gate]

## Next Steps

[List immediate actions based on recommendation]
```

---

## Step 6: Take Action Based on Results

### If Pass Rate ≥60% (Ship Rich Paste)

**Immediate:**
1. Update PasteLinkScreen to show "✨ Rich Paste" badge when L2 succeeds
2. Add clipboard detection chip: "Detected recipe link - Paste?"
3. Remove amber "couldn't extract ingredients" banner for L2 extractions
4. Enable "Add to Shopping List" button when ≥5 ingredients + ≥0.70 conf

**Next Sprint:**
1. Build iOS widget for paste flow
2. Add Siri shortcuts integration
3. Implement browser extension (Chrome/Firefox)

### If Pass Rate 50-59% (Ship with Warning)

**Immediate:**
1. Ship Rich Paste with modified banner: "⚠️  Ingredients detected - please confirm before use"
2. Keep "Add to Shopping List" disabled until user confirms
3. Add 1-tap batch confirm UI

**Next Sprint:**
1. Implement L3 LLM fallback for low-confidence ingredients
2. A/B test banner copy for conversion impact

### If Pass Rate 40-49% (Keep Lite)

**Immediate:**
1. Keep current Lite flow (L1 only)
2. Add "+ Add Ingredients" manual entry CTA
3. Focus on L3 LLM fallback implementation

**Next Sprint:**
1. Build L3 Gemini 2.0 Flash integration
2. Add cost gates (≤$0.015/save)
3. Test L3 quality on failed L2 samples

### If Pass Rate <40% (Reassess)

**Immediate:**
1. Document why YouTube descriptions fail
2. Pivot to creator kit (Google Sheets → CookCard JSON)
3. Seed 10-20 creators with kit

**Next Sprint:**
1. Build creator submission portal
2. Add "Verified Creator" badge system
3. Deprioritize L2/L3 for now

---

## Troubleshooting

### "YOUTUBE_API_KEY not set" error
- Check environment variable: `echo $YOUTUBE_API_KEY`
- Re-export in current shell session
- Make sure no extra spaces around `=`

### "YouTube API error: 403 Forbidden"
- API key not enabled for YouTube Data API v3
- Go to Google Cloud Console → APIs & Services → Library → Enable

### "No video found for ID"
- Video may be deleted or private
- Replace URL in `TEST_VIDEOS` array with active video

### "Rate limit exceeded"
- Script respects 100ms delay between requests
- Default quota: 10,000 units/day (50 requests/sec)
- Each video fetch = 1 unit (well under limit for 20 videos)

---

## Sample Test Videos (Backup)

If any videos in the default sample are deleted/unavailable, replace with these:

**Baking:**
- https://www.youtube.com/watch?v=v6yRNIYGIhw (Sourdough)
- https://www.youtube.com/watch?v=YjQqJbC4XNk (Banana Bread)

**Cooking:**
- https://www.youtube.com/watch?v=qH__o17xHls (Mac & Cheese)
- https://www.youtube.com/watch?v=o7jf6d3FW-o (Scrambled Eggs)

**Quick:**
- https://www.youtube.com/watch?v=wg8vdvBTA4A (15-min Pasta)
- https://www.youtube.com/watch?v=rPQV7kcEU9I (5-ing Tacos)

---

## Expected Time Breakdown

| Task | Time |
|------|------|
| Get YouTube API key | 10-15 min |
| Set environment variable | 2 min |
| Run quality study script | 5-10 min |
| Analyze results | 20-30 min |
| Document findings | 30-45 min |
| **Total** | **67-102 min** |

---

**Status:** Ready to execute (all code complete)

**Blocker:** YouTube API key provisioning (user action required)

**Next Action:** Get API key → Run script → Analyze → Document → Execute decision
