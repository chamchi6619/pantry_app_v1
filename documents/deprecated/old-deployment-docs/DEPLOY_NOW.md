# 🚀 Quick Deployment Commands

**Ready to deploy HTML scraping? Run these commands:**

---

## Step 1: Authenticate
```bash
npx supabase login
```
*(Opens browser for OAuth login)*

---

## Step 2: Link Project
```bash
cd /mnt/c/Users/chamc/OneDrive/Documents/GitHub/pantry_app_v1
npx supabase link --project-ref uwmrntmepnhpezgjcwgh
```

---

## Step 3: Deploy
```bash
npx supabase functions deploy extract-cook-card
```

**Expected Output:**
```
✓ Deployed Function extract-cook-card with version: v12
```

---

## Step 4: Test

### In Mobile App:
1. Open app → **Recipes** tab
2. Tap **🧪 flask icon** (top-right)
3. Tap **"YouTube (Tasty - Schema.org)"**
4. Wait 4-5 seconds
5. Verify: **"Extracted from: schema org, html description"**

### In Database:
```sql
SELECT title, extraction_sources, extraction_confidence
FROM cook_cards
WHERE extraction_sources IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
```

---

## 🎯 Success Criteria

✅ **Deployment version increments** (v12)
✅ **Test extraction shows sources** (schema_org, html_description)
✅ **Database stores extraction_sources** (array of strings)
✅ **Provenance badge displays** (in CookCardScreen)

---

## 🐛 Troubleshooting

**Issue:** "Cannot find project ref"
**Fix:** Run Step 2 again

**Issue:** "Account does not have privileges"
**Fix:** Run `npx supabase login` again

**Issue:** "extraction_sources is null"
**Fix:** Verify migration applied:
```sql
SELECT * FROM information_schema.columns
WHERE table_name = 'cook_cards' AND column_name = 'extraction_sources';
```

---

## 📚 Full Documentation

- **Complete Guide:** `DEPLOYMENT_GUIDE.md`
- **Status Summary:** `DEPLOYMENT_STATUS.md`
- **Pre-Deployment:** `READY_FOR_DEPLOYMENT.md`

---

**Ready? Run Step 1 now!** 🚀
