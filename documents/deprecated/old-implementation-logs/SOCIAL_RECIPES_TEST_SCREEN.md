# Social Recipes Test Screen - Implementation Complete

**Date:** 2025-10-08
**Purpose:** Testing interface for HTML scraping implementation
**Access:** Recipes tab → Flask icon (top-right header)

---

## 🎯 Purpose

A dedicated test screen for validating the new HTML scraping implementation with real social media URLs, providing detailed extraction diagnostics and provenance tracking.

**Why We Built This:**
- Test HTML scraping across platforms (YouTube, Instagram, TikTok)
- Visualize extraction sources (schema_org, html_description, opengraph)
- Monitor extraction confidence and quality
- Debug edge cases in production

---

## 🚀 Features

### 1. **Quick Test URLs**
Pre-configured test buttons for common scenarios:

- ✅ **YouTube (Schema.org)** - Tasty video with recipe markup
- ✅ **YouTube (Standard)** - Regular video with description only
- ✅ **Instagram Post** - Recipe post with caption
- ✅ **TikTok Video** - Recipe video with embedded JSON

**Usage:**
- Tap any test button
- Edge Function called automatically
- Results displayed with full diagnostics

---

### 2. **Custom URL Input**
Paste any YouTube/Instagram/TikTok URL for testing:

- Text input with URL validation
- "Extract Recipe" button
- Real-time extraction with loading state
- Error handling with fallback messaging

---

### 3. **Extraction Results Display**

#### Success State:
```
✅ Extraction Successful

📊 Extraction Metadata
- Time: 4.23s
- Method: llm_assisted
- Confidence: ████████░░ 85%
- Cost: $0.015

🔍 Extraction Sources
✓ schema org
✓ html description
✓ opengraph

🍳 Recipe Data
- Title: Quick Pasta Aglio e Olio
- Platform: youtube
- Creator: Chef John
- Ingredients: 8
- Prep Time: 10 min
- Cook Time: 15 min
- Servings: 4

📝 Ingredients (8)
✓ 1 lb spaghetti (95%)
✓ 6 cloves garlic, minced (90%)
✓ 1/2 cup olive oil (92%)
...
```

#### Failure State:
```
❌ Extraction Failed

Error: HTTP 404: Video not found
Time: 2.1s
```

---

## 📊 Data Displayed

### Extraction Metadata
- **Time:** Total extraction latency (ms → seconds)
- **Method:** `llm_assisted`, `metadata_only`, etc.
- **Confidence:** Visual progress bar (0-100%)
- **Cost:** Extraction cost in dollars ($0.015)

### Extraction Sources (New!)
List of sources used for extraction:
- `schema_org` - Schema.org JSON-LD markup
- `html_description` - Platform-specific embedded JSON
- `opengraph` - OpenGraph metadata
- `youtube_api` - Fallback to YouTube Data API
- `instagram_caption` - Instagram caption text
- `tiktok_embedded_json` - TikTok description

**Color-coded icons:**
- 📋 `schema_org` - Code icon (best quality)
- 📄 `html_description` - Document icon
- ☁️ `youtube_api` - Cloud icon (fallback)
- ℹ️ Other sources - Info icon

### Recipe Data
- Title, platform, creator
- Ingredient count
- Prep/cook time, servings (if available)

### Ingredients List
First 10 ingredients with:
- Name, amount, unit
- Confidence score (%)
- Canonical item link indicator (🔗)

**Expandable:** "+X more..." for recipes with >10 ingredients

---

## 🎨 UI/UX Design

### Layout
```
┌─────────────────────────────────────┐
│ Social Recipes Test                 │
│ HTML Scraping Implementation        │
├─────────────────────────────────────┤
│ ℹ️ Testing HTML Scraping            │
│ This screen tests multi-source...   │
├─────────────────────────────────────┤
│ Quick Test URLs                     │
│ ┌─────────────────────────────────┐ │
│ │ 🎥 YouTube (Schema.org)         │ │
│ │ Tasty video - likely has...     │ │
│ │ https://youtube.com/...         │ │
│ └─────────────────────────────────┘ │
│ [More test buttons...]              │
├─────────────────────────────────────┤
│ Custom URL                          │
│ ┌─────────────────────────────────┐ │
│ │ 🔗 Paste YouTube, IG, TikTok... │ │
│ └─────────────────────────────────┘ │
│ [Extract Recipe]                    │
├─────────────────────────────────────┤
│ 🔄 Extracting recipe...             │
│ Fetching HTML → Parsing → LLM      │
├─────────────────────────────────────┤
│ ✅ Extraction Successful            │
│ [Detailed results...]               │
└─────────────────────────────────────┘
```

### Colors
- **Success:** Green (#10B981)
- **Error:** Red (#EF4444)
- **Info:** Blue (#3B82F6)
- **Neutral:** Gray (#6B7280)

### Typography
- **Header:** 28px bold (#111827)
- **Section:** 18px bold
- **Body:** 14px regular
- **Metadata:** 12px monospace (for technical data)

---

## 🔗 Navigation

### Access Points

**1. From ExploreRecipesScreen (Main):**
```
Recipes tab → Top-right header → Flask icon (🧪)
```

**2. Direct Navigation (Dev):**
```typescript
navigation.navigate('SocialRecipesTest');
```

### Integration
- Added to `RecipeStack` in `AppNavigator.tsx`
- Import: `import { SocialRecipesTestScreen } from '../screens/SocialRecipesTestScreen';`
- Route: `<Stack.Screen name="SocialRecipesTest" component={SocialRecipesTestScreen} />`

---

## 🧪 Testing Workflow

### Quick Test Flow

**Step 1:** Navigate to Test Screen
- Open app → Recipes tab
- Tap flask icon (🧪) in header

**Step 2:** Select Test URL
- Tap "YouTube (Schema.org)" button
- Wait for extraction (~4-5s)

**Step 3:** Review Results
- Check extraction sources (should include `schema_org`)
- Verify confidence >85%
- Review ingredient count
- Check "View Full JSON in Console" for raw data

**Expected Result:**
```
✅ Extraction Successful
Sources: schema_org, html_description
Confidence: 95%
Ingredients: 8
```

---

### Custom URL Testing

**Step 1:** Paste URL
- Enter YouTube/Instagram/TikTok URL
- Tap "Extract Recipe"

**Step 2:** Monitor Extraction
- Loading state: "Extracting recipe..."
- Sub-text: "Fetching HTML → Parsing sources → LLM extraction"

**Step 3:** Analyze Results
- Compare extraction sources between different URLs
- Benchmark extraction time (should be 3-6s)
- Identify patterns (e.g., cooking channels = Schema.org)

---

## 📁 Files Created/Modified

### New Files
1. **`pantry-app/src/screens/SocialRecipesTestScreen.tsx`** (600+ lines)
   - Full-featured test interface
   - Quick test URLs
   - Custom URL input
   - Extraction results with provenance
   - Ingredient list with confidence scores

### Modified Files
1. **`pantry-app/src/navigation/AppNavigator.tsx`**
   - Added import for SocialRecipesTestScreen
   - Added route to RecipeStack

2. **`pantry-app/src/features/recipes/screens/ExploreRecipesScreenSupabase.tsx`**
   - Added flask icon button in header
   - Added testButton style
   - Updated headerRight layout (gap: 8)

---

## 🎯 Use Cases

### 1. **Validate HTML Scraping Quality**
**Goal:** Confirm Schema.org detection works

**Test:**
1. Paste Tasty/Bon Appétit video URL
2. Check extraction sources
3. Expected: `['schema_org', 'html_description']`
4. Confidence should be >90%

**Success Criteria:** Schema.org detected, high confidence

---

### 2. **Test Platform Coverage**
**Goal:** Ensure Instagram/TikTok extraction works

**Test:**
1. Use Instagram test button
2. Check sources: `['instagram_caption']` or `['opengraph']`
3. Verify caption text extracted

**Success Criteria:** Non-zero ingredients, confidence >60%

---

### 3. **Benchmark Extraction Speed**
**Goal:** Confirm latency is acceptable (3-6s)

**Test:**
1. Extract 5 different URLs
2. Record extraction time for each
3. Calculate average

**Success Criteria:** Average time <6s, no timeouts

---

### 4. **Debug Edge Cases**
**Goal:** Identify extraction failures

**Test:**
1. Private video (should fail gracefully)
2. Invalid URL (should show error)
3. Video with no description (should use fallback)

**Success Criteria:** Clear error messages, no crashes

---

### 5. **Compare Before/After**
**Goal:** Measure quality improvement from HTML scraping

**Test:**
1. Find video that previously failed (old API-only method)
2. Extract with new HTML scraping
3. Compare ingredient count and confidence

**Success Criteria:** Improvement in quality metrics

---

## 🔍 Diagnostic Features

### 1. **Extraction Source Breakdown**
Shows exactly which text sources were used:
- `schema_org` → Found structured recipe data
- `html_description` → Extracted YouTube description from HTML
- `opengraph` → Fallback to OpenGraph metadata
- `youtube_api` → Old method (HTML scraping failed)

**Why Important:**
- Debug why certain extractions fail
- Identify which platforms/creators use Schema.org
- Optimize scraper for common patterns

---

### 2. **Confidence Visualization**
Progress bar showing extraction confidence:
```
████████░░ 85%  ← High confidence (good)
████░░░░░░ 45%  ← Low confidence (review needed)
```

**Why Important:**
- Quick visual indicator of quality
- Helps identify unreliable extractions
- Guides where to add OCR/ASR (future)

---

### 3. **Per-Ingredient Confidence**
Each ingredient shows its own confidence score:
```
✓ 1 lb spaghetti (95%) 🔗
✓ garlic (72%)
✓ olive oil (88%) 🔗
```

**Why Important:**
- Identify weak extractions (low confidence items)
- Track canonical matching success (🔗 icon)
- Debug false positives

---

### 4. **Full JSON Export**
"View Full JSON in Console" button logs complete CookCard:
```typescript
console.log('Full CookCard:', {
  id: '...',
  title: '...',
  ingredients: [...],
  extraction: {
    method: 'llm_assisted',
    confidence: 0.85,
    sources: ['schema_org', 'html_description'],
    cost_cents: 1.5,
  },
  // ... full object
});
```

**Why Important:**
- Deep debugging
- Export data for analysis
- Share examples with team

---

## 📈 Success Metrics

### Track Over Time

**Week 1:**
- [ ] Test 20+ diverse URLs (YouTube, IG, TikTok)
- [ ] Document extraction sources distribution
- [ ] Measure average confidence score
- [ ] Identify failure patterns

**Expected Baseline:**
- YouTube (Schema.org): 90%+ confidence, 2-3 sources
- YouTube (Standard): 75%+ confidence, 1-2 sources
- Instagram: 60%+ confidence, 1-2 sources
- TikTok: 50%+ confidence, 1 source

---

### Quality Benchmarks

| Metric | Target | Why |
|--------|--------|-----|
| **Extraction Success Rate** | >80% | Most URLs should extract something |
| **Schema.org Detection** | >30% | Cooking channels use markup |
| **Average Confidence** | >75% | Most extractions are reliable |
| **Latency** | <6s avg | User experience remains smooth |
| **Fallback Rate** | <10% | HTML scraping should rarely fail |

---

## 🐛 Known Issues & Limitations

### Platform Limitations

**Instagram:**
- ⚠️ May be rate-limited (too many requests)
- ⚠️ Caption extraction fragile (page format changes)
- ✅ Workaround: Use test URLs sparingly

**TikTok:**
- ⚠️ Aggressive bot detection
- ⚠️ Embedded JSON format changes frequently
- ✅ Workaround: Retry on failure, update parser if needed

**YouTube:**
- ✅ Most reliable (public API + HTML scraping)
- ⚠️ Shorts often have sparse descriptions (OCR needed)

---

### Edge Cases

**1. Private/Deleted Videos:**
- Current: Shows "HTTP 404" error
- Future: Better error messaging ("Video not accessible")

**2. Live Streams:**
- Current: May extract but no recipe data
- Future: Detect and skip live content

**3. Non-Recipe Videos:**
- Current: LLM may hallucinate ingredients
- Future: Pre-filter by video category/tags

---

## 💡 Future Enhancements

### Short-Term (Month 2)

**1. Save Test Results**
- Store test extractions in database
- Compare before/after for regression testing
- Track quality over time

**2. Batch Testing**
- Test multiple URLs at once
- Generate quality report
- Export CSV for analysis

**3. Error Categorization**
- Group failures by type (network, parsing, LLM)
- Show retry suggestions
- Link to documentation

---

### Long-Term (Month 3+)

**4. A/B Testing**
- Compare HTML scraping vs API-only
- Measure quality delta
- Cost/benefit analysis

**5. Platform-Specific Insights**
- "YouTube videos with Schema.org: 87%"
- "Instagram caption success rate: 62%"
- Recommend optimizations

**6. Integration with Pro Tier**
- Test ASR/OCR on this screen
- Toggle Speed vs Deep mode
- Visualize cost difference

---

## ✅ Conclusion

**Status:** Social Recipes Test Screen is complete and ready for use.

**What We Built:**
- Full-featured test interface for HTML scraping
- Quick test URLs for common scenarios
- Custom URL input for ad-hoc testing
- Detailed extraction diagnostics
- Provenance tracking visualization
- Navigation integrated into app

**How to Use:**
1. Open app → Recipes tab
2. Tap flask icon (🧪) in top-right
3. Select test URL or paste custom URL
4. Review extraction results
5. Check console for full JSON

**Next Steps:**
1. Test with 10-20 diverse URLs
2. Document quality metrics
3. Identify edge cases
4. Optimize parsers based on findings
5. Add to regression test suite

---

**Implementation Completed By:** Claude Code
**Date:** 2025-10-08
**Time Investment:** ~1 hour
**Sign-Off:** ✅ Ready for testing
