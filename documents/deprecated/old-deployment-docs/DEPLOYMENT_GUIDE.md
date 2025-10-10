# 🚀 Deployment Guide - Stage 1-C (HTML Scraping)

**Date:** 2025-10-08
**Status:** Ready for Deployment
**Requires:** Supabase CLI authentication

---

## 📋 Pre-Deployment Checklist

### **1. Code Review** ✅
- [x] HTML scraper module created (`_shared/htmlScraper.ts`)
- [x] Integration into `extract-cook-card/index.ts`
- [x] Test screen built (`SocialRecipesTestScreen.tsx`)
- [x] Provenance UI added (`CookCardScreen.tsx`)
- [x] Database migration applied (010_add_extraction_sources)

### **2. Dependencies** ✅
- [x] No new npm packages required
- [x] All imports use relative paths
- [x] Deno-compatible code (no Node.js-specific APIs)

### **3. Environment Variables** ✅
All existing environment variables remain the same:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `YOUTUBE_API_KEY`
- `GEMINI_API_KEY`

No new secrets needed! ✅

---

## 🚀 Deployment Steps

### **Step 1: Authenticate with Supabase**

```bash
# Login to Supabase CLI (if not already logged in)
npx supabase login

# Link to your project
cd /path/to/pantry_app_v1
npx supabase link --project-ref uwmrntmepnhpezgjcwgh
```

---

### **Step 2: Deploy Edge Function**

```bash
# Deploy extract-cook-card with HTML scraping
npx supabase functions deploy extract-cook-card

# Expected output:
# Uploading asset (extract-cook-card): supabase/functions/extract-cook-card/index.ts
# Uploading asset (extract-cook-card): supabase/functions/_shared/htmlScraper.ts
# ... (all _shared files)
# Deployed Function extract-cook-card with version: v12
```

**What gets deployed:**
- `extract-cook-card/index.ts` (updated with HTML scraping)
- `_shared/htmlScraper.ts` (NEW - 600+ lines)
- All existing `_shared/` modules (llm.ts, cache.ts, etc.)

---

### **Step 3: Verify Deployment**

**Option A: Via Supabase Dashboard**
1. Go to https://supabase.com/dashboard/project/uwmrntmepnhpezgjcwgh
2. Navigate to Edge Functions
3. Click "extract-cook-card"
4. Check version number (should increment)
5. Verify last deployed timestamp

**Option B: Test API Call**
```bash
curl -X POST \
  https://uwmrntmepnhpezgjcwgh.supabase.co/functions/v1/extract-cook-card \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=qH__o17xHls",
    "user_id": "test-user-id",
    "household_id": "test-household-id"
  }'
```

**Expected response:**
```json
{
  "cook_card": {
    "title": "...",
    "ingredients": [...],
    "extraction": {
      "confidence": 0.85,
      "sources": ["schema_org", "html_description"]  // ← NEW!
    }
  }
}
```

---

### **Step 4: Test in Mobile App**

**Launch Test Screen:**
1. Open app → Recipes tab
2. Tap flask icon (🧪) in top-right
3. Tap "YouTube (Tasty - Schema.org)"
4. Wait for extraction (~4-5s)

**Verify Results:**
```
✅ Extraction Successful

🔍 Extraction Sources
✓ schema org           ← Should appear!
✓ html description     ← Should appear!

📊 Extraction Metadata
Confidence: 85-95%
Time: 4-5s
```

---

### **Step 5: Check Database**

```sql
-- Verify extraction_sources column exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'cook_cards'
AND column_name = 'extraction_sources';

-- Expected:
-- column_name        | data_type
-- extraction_sources | ARRAY

-- Query recent extractions with sources
SELECT
  title,
  extraction_sources,
  extraction_confidence,
  created_at
FROM cook_cards
WHERE extraction_sources IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🧪 Post-Deployment Testing

### **Test Case 1: YouTube with Schema.org**

**URL:** `https://www.youtube.com/watch?v=qH__o17xHls` (Tasty video)

**Expected:**
- ✅ Extraction succeeds
- ✅ Sources: `['schema_org', 'html_description']`
- ✅ Confidence: >90%
- ✅ Ingredients: 8-10 items
- ✅ Prep/cook time populated

**Verify:**
```sql
SELECT extraction_sources
FROM cook_cards
WHERE source_url LIKE '%qH__o17xHls%'
ORDER BY created_at DESC
LIMIT 1;

-- Expected: {"schema_org","html_description"}
```

---

### **Test Case 2: YouTube without Schema.org**

**URL:** Any cooking tutorial without structured data

**Expected:**
- ✅ Extraction succeeds
- ✅ Sources: `['html_description']` or `['opengraph']`
- ✅ Confidence: 70-85%
- ✅ Ingredients: 5-8 items

**Verify:**
- No `schema_org` in sources array
- Still better than old API-only method

---

### **Test Case 3: Fallback (HTML Scraping Fails)**

**URL:** Private video or invalid link

**Expected:**
- ✅ Extraction attempts HTML scraping
- ✅ Falls back to YouTube API
- ✅ Sources: `['youtube_api']`
- ✅ OR error returned

**Verify:**
- Graceful degradation (no crashes)
- Error messaging is clear

---

### **Test Case 4: Provenance Badge UI**

**Steps:**
1. Extract any recipe
2. Save to database
3. Open saved Cook Card
4. Scroll to metadata section

**Expected:**
```
✓ Extracted from: schema org, html description
```

**Verify:**
- Badge displays below prep/cook time
- Light green background (#F0FDF4)
- Text properly capitalized
- Icon shows green checkmark

---

## 📊 Monitoring

### **Metrics to Track (Week 1)**

**1. Extraction Source Distribution**
```sql
SELECT
  unnest(extraction_sources) as source,
  COUNT(*) as count,
  ROUND(AVG(extraction_confidence) * 100, 2) as avg_confidence_pct
FROM cook_cards
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY source
ORDER BY count DESC;
```

**Expected Output:**
```
source              | count | avg_confidence_pct
--------------------+-------+-------------------
html_description    | 85    | 75.2
schema_org          | 35    | 92.5
opengraph           | 15    | 68.3
youtube_api         | 5     | 62.1
```

**Target:**
- Schema.org detection: >30% of YouTube videos
- Average confidence: >75%
- Fallback rate (youtube_api): <10%

---

**2. Quality Improvement**
```sql
-- Compare before/after deployment
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_extractions,
  ROUND(AVG(extraction_confidence) * 100, 2) as avg_confidence,
  COUNT(*) FILTER (WHERE 'schema_org' = ANY(extraction_sources)) as schema_org_count
FROM cook_cards
WHERE created_at > NOW() - INTERVAL '14 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

**Expected:**
- Post-deployment: Avg confidence increases by 5-10%
- Schema.org count: 30-40% of total

---

**3. Error Rate**
```sql
-- Check Edge Function logs for errors
-- Via Supabase Dashboard → Edge Functions → extract-cook-card → Logs

-- Look for:
-- ❌ "HTML scraping failed" → Should be rare (<10%)
-- ✅ "Falling back to API" → Acceptable fallback
-- ✅ "Schema.org found" → High quality extraction
```

---

## 🔧 Rollback Plan

If issues arise, you can quickly rollback:

### **Option 1: Redeploy Previous Version**
```bash
# List previous versions
npx supabase functions list --project-ref uwmrntmepnhpezgjcwgh

# Rollback to specific version (replace v11 with previous version)
npx supabase functions deploy extract-cook-card --version v11
```

---

### **Option 2: Disable HTML Scraping**

**Quick fix without redeployment:**

Edit `extract-cook-card/index.ts` and add feature flag:

```typescript
const USE_HTML_SCRAPING = false; // ← Set to false to disable

// In extraction logic:
if (USE_HTML_SCRAPING) {
  const htmlResult = await extractFromHTML(url, platform);
  // ... HTML scraping logic
} else {
  // Use old method (YouTube API only)
  const description = await fetchYouTubeDescription(url);
}
```

Then redeploy:
```bash
npx supabase functions deploy extract-cook-card
```

---

## 🐛 Troubleshooting

### **Issue 1: "extraction_sources is null"**

**Symptom:** Cook Cards saved without extraction_sources

**Cause:** Migration not applied or code not populating field

**Fix:**
```sql
-- Verify migration applied
SELECT * FROM supabase_migrations.schema_migrations
WHERE version = '010_add_extraction_sources';

-- If missing, reapply:
-- (Use Supabase Dashboard → SQL Editor)
ALTER TABLE cook_cards
ADD COLUMN IF NOT EXISTS extraction_sources TEXT[];
```

---

### **Issue 2: "HTML scraping timeout"**

**Symptom:** Extraction fails with timeout error

**Cause:** HTML fetch takes >60s (Edge Function limit)

**Fix:**
- Increase timeout (not recommended)
- OR improve caching
- OR add retry logic

**Temporary workaround:**
```typescript
// In htmlScraper.ts, add timeout to fetch
const html = await fetch(url, {
  headers: {...},
  signal: AbortSignal.timeout(10000) // 10s timeout
});
```

---

### **Issue 3: "Schema.org not detected"**

**Symptom:** Videos with Schema.org show `html_description` only

**Cause:** Scraper regex not matching Schema.org format

**Fix:**
Check logs for "Found Schema.org Recipe markup" message. If missing, update regex in `htmlScraper.ts`:

```typescript
// Debug: Log raw HTML structure
console.log('HTML snippet:', html.substring(0, 1000));

// Check if Schema.org exists but in different format
const jsonLdRegex = /<script\s+type="application\/ld\+json"[^>]*>(.*?)<\/script>/gis;
```

---

### **Issue 4: "Provenance badge not showing"**

**Symptom:** Badge doesn't appear in CookCardScreen

**Cause:** extraction.sources is undefined or empty

**Fix:**
```typescript
// In CookCardScreen.tsx, add debug log
console.log('Extraction sources:', cookCard.extraction?.sources);

// Verify data structure matches:
// cookCard.extraction.sources = ['schema_org', 'html_description']
```

---

## 📝 Deployment Checklist

### **Pre-Deployment**
- [x] Code reviewed and tested locally
- [x] Database migration applied (010)
- [x] No new environment variables needed
- [x] Documentation complete

### **Deployment**
- [ ] Supabase CLI authenticated
- [ ] Project linked (`npx supabase link`)
- [ ] Edge Function deployed (`npx supabase functions deploy`)
- [ ] Deployment verified (check version in dashboard)

### **Post-Deployment**
- [ ] Test screen extraction (use flask icon)
- [ ] Verify extraction_sources in database
- [ ] Check provenance badge displays
- [ ] Monitor error logs for 24 hours
- [ ] Track quality metrics (Schema.org detection, avg confidence)

---

## 🎯 Success Criteria

### **Week 1 Goals**

**Quality:**
- ✅ Schema.org detection: >30% of YouTube extractions
- ✅ Average confidence: >75% (up from 65%)
- ✅ Fallback rate: <10%

**Reliability:**
- ✅ Error rate: <5%
- ✅ Extraction success rate: >80%
- ✅ No production outages

**User Experience:**
- ✅ Latency: <6s average
- ✅ Provenance badge displays correctly
- ✅ No UI bugs reported

---

## 🚨 Emergency Contacts

**If deployment fails:**
1. Check Supabase Dashboard → Edge Functions → Logs
2. Review error messages in console
3. Rollback to previous version if needed
4. Consult documentation: `HTML_SCRAPING_IMPLEMENTATION_COMPLETE.md`

**Key Files:**
- Implementation: `supabase/functions/_shared/htmlScraper.ts`
- Integration: `supabase/functions/extract-cook-card/index.ts`
- Migration: `supabase/migrations/010_add_extraction_sources.sql`
- UI: `pantry-app/src/screens/CookCardScreen.tsx`

---

## ✅ Final Pre-Flight Check

Before deploying, confirm:

1. ✅ **Code is committed to git**
   ```bash
   git status  # Should show clean working directory
   ```

2. ✅ **Migration applied to database**
   ```sql
   SELECT * FROM cook_cards LIMIT 1;
   -- Should have extraction_sources column
   ```

3. ✅ **Test screen accessible in app**
   - Recipes tab → Flask icon visible
   - Screen loads without errors

4. ✅ **Deployment command ready**
   ```bash
   npx supabase functions deploy extract-cook-card --project-ref uwmrntmepnhpezgjcwgh
   ```

---

**Ready to deploy!** 🚀

Run the deployment command and monitor the results. Good luck!
