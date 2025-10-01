# 🚀 Deploy v17 Parser - Step-by-Step Guide

## ✅ What's Ready

- ✅ v17 parser created: `backend/supabase/functions/parse-receipt-v17/index.ts`
- ✅ Your Supabase project: `dyevpemrrlmbhifhqiwx`
- ✅ Test passed: 16/16 items, $206.03 match

---

## 🎯 Option 1: Deploy via Supabase Dashboard (Easiest)

### Step 1: Open Supabase Dashboard
1. Go to: https://supabase.com/dashboard
2. Login to your account
3. Select project: `dyevpemrrlmbhifhqiwx`

### Step 2: Create Edge Function
1. Click **"Edge Functions"** in left sidebar
2. Click **"Create a new function"**
3. Name: `parse-receipt-v17`
4. Click **"Create function"**

### Step 3: Copy Code
1. Open file: `backend/supabase/functions/parse-receipt-v17/index.ts`
2. Copy ALL code (18,493 bytes)
3. Paste into Supabase editor
4. Click **"Deploy"**

### Step 4: Verify Deployment
1. Function should show "Deployed" status
2. Note the URL: `https://dyevpemrrlmbhifhqiwx.supabase.co/functions/v1/parse-receipt-v17`

---

## 🎯 Option 2: Deploy via CLI (Recommended)

### Step 1: Login to Supabase
```bash
cd /mnt/c/Users/chamc/OneDrive/Documents/GitHub/pantry_app_v1/backend
npx supabase login
```

When prompted:
1. Press Enter to open browser
2. Login to your Supabase account
3. Authorize the CLI

### Step 2: Link to Project
```bash
npx supabase link --project-ref dyevpemrrlmbhifhqiwx
```

Enter your database password when prompted.

### Step 3: Deploy v17
```bash
npx supabase functions deploy parse-receipt-v17
```

Expected output:
```
Deploying parse-receipt-v17 (project ref: dyevpemrrlmbhifhqiwx)
Bundled parse-receipt-v17 in 234ms.
Deployed parse-receipt-v17 in 1.2s
Function URL: https://dyevpemrrlmbhifhqiwx.supabase.co/functions/v1/parse-receipt-v17
```

---

## 🧪 Test Deployment

### Option A: Test via curl

```bash
curl -X POST "https://dyevpemrrlmbhifhqiwx.supabase.co/functions/v1/parse-receipt-v17" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5ZXZwZW1ycmxtYmhpZmhxaXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5NTczOTAsImV4cCI6MjA3NDUzMzM5MH0.QCCmXXSgXBPakqDFuJHD1IJOi2cbd9ogrCuvqbisnu4" \
  -H "Content-Type: application/json" \
  -d '{
    "ocr_text": "WHOLESALE\nArvada #676\n5195 Wadsworth Blvd\nArvada, CO 80002\nSELF-CHECKOUT\n96716 ORG SPINACH\n3.79 E\n9211 ORG YEL ONIO\n5.99 E\nSUBTOTAL\n9.78\nTAX\n0.38\n**** TOTAL\n10.16",
    "household_id": "aeefe34a-a1b7-494e-97cc-b7418a314aee"
  }'
```

Expected response:
```json
{
  "success": true,
  "receipt_id": "...",
  "items": [
    {
      "parsed_name": "ORGANIC SPINACH",
      "price_cents": 379,
      "confidence": 0.92
    },
    {
      "parsed_name": "ORGANIC YELLOW ONION",
      "price_cents": 599,
      "confidence": 0.92
    }
  ],
  "method": "costco-adaptive-2-line",
  "confidence": 0.89
}
```

### Option B: Test via Supabase Dashboard

1. Go to **Edge Functions** → **parse-receipt-v17**
2. Click **"Invoke"** tab
3. Paste test payload:
```json
{
  "ocr_text": "WHOLESALE\nArvada #676\n96716 ORG SPINACH\n3.79 E\nSUBTOTAL\n3.79\nTAX\n0.15\n**** TOTAL\n3.94",
  "household_id": "aeefe34a-a1b7-494e-97cc-b7418a314aee"
}
```
4. Click **"Run"**
5. Check response for items array

---

## 📱 Update Frontend

### File: `pantry-app/src/services/receiptService.ts`

Find this line (around line 65):
```typescript
const response = await supabase.functions.invoke('parse-receipt', {
```

**Option A: Route Costco to v17 (Safer)**
```typescript
// Detect if Costco receipt
const isCostco = /COSTCO|WHOLESALE|KIRKLAND/i.test(ocrText);
const functionName = isCostco ? 'parse-receipt-v17' : 'parse-receipt';

const response = await supabase.functions.invoke(functionName, {
  body: {
    ocr_text: ocrText,
    household_id: householdId,
    options
  }
});
```

**Option B: Use v17 for All (After Testing)**
```typescript
const response = await supabase.functions.invoke('parse-receipt-v17', {
  body: {
    ocr_text: ocrText,
    household_id: householdId,
    options
  }
});
```

---

## 📊 Monitor Performance

### View Logs
```bash
npx supabase functions logs parse-receipt-v17 --tail
```

Or in Supabase Dashboard:
1. Edge Functions → parse-receipt-v17
2. Click **"Logs"** tab
3. Watch for:
   - ✅ "Detected format: 2-LINE"
   - ✅ "Total items parsed: 16"
   - ✅ "Confidence: 0.89"

### Check Metrics
Monitor in dashboard:
- **Invocations**: Should increase when app scans receipts
- **Success rate**: Should be >95%
- **Avg duration**: Should be <2 seconds
- **Error rate**: Should be <5%

---

## ✅ Verification Checklist

- [ ] Function deployed successfully
- [ ] Test curl command returns items
- [ ] Dashboard test returns items
- [ ] Logs show "costco-adaptive-2-line"
- [ ] Frontend updated to call v17
- [ ] Real receipt scan extracts 16 items
- [ ] Items have readable names (ORGANIC vs ORG)
- [ ] Confidence score >0.80

---

## 🐛 Troubleshooting

### Error: "Missing required fields"
**Fix:** Ensure payload includes both `ocr_text` and `household_id`

### Error: "Function not found"
**Fix:**
1. Check function name is exactly `parse-receipt-v17`
2. Verify deployment completed
3. Check project ref matches: `dyevpemrrlmbhifhqiwx`

### Response: `items: []`
**Fix:**
1. Check logs for "Format Detection"
2. Verify OCR text has item codes (6-7 digits)
3. Look for "Garbage filtering" messages

### Low confidence (<0.70)
**Fix:**
1. Check reconciliation in logs
2. Verify subtotal matches item total
3. Review item name quality

---

## 🎯 Next Steps After Deployment

1. **Test with your phone**
   - Scan your Costco receipt
   - Should extract 16 items
   - Names should be readable

2. **Test other stores**
   - Try Walmart, Target, Safeway
   - Collect any failing receipts
   - Note which stores need hints

3. **Monitor for 1 week**
   - Track success rate
   - Note any patterns in failures
   - Collect user feedback

4. **Plan Hybrid migration**
   - Review architecture doc
   - Prioritize store hints
   - Schedule 4-week implementation

---

## 📞 Support

**If deployment fails:**
1. Check Supabase dashboard for errors
2. Verify you're logged in: `npx supabase login`
3. Check project link: `npx supabase link --project-ref dyevpemrrlmbhifhqiwx`

**If tests fail:**
1. View logs: `npx supabase functions logs parse-receipt-v17`
2. Check payload format matches examples
3. Verify household_id exists in database

**For other issues:**
1. Review `V17_DEPLOYMENT_GUIDE.md`
2. Check `OCR_PARSER_SUMMARY.md`
3. Review Edge Function code comments

---

*Deployment Guide v1.0*
*Ready to deploy your v17 parser!* 🚀
