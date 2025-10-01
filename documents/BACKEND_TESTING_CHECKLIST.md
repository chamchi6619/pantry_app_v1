# 🧪 Backend Testing Checklist

## 📱 Test Each Feature Step-by-Step

### 1️⃣ **Authentication & Setup** ✅

**In App:**
1. Open app in Expo Go
2. Tap "Password" tab
3. Sign up with new email/password
4. Should auto-login after signup

**Verify in Supabase:**
```sql
-- Check your user exists
SELECT id, email, created_at FROM auth.users
WHERE email = 'your@email.com';

-- Check profile was created
SELECT * FROM profiles
WHERE email = 'your@email.com';

-- Check household was auto-created
SELECT h.* FROM households h
JOIN household_members hm ON h.id = hm.household_id
JOIN profiles p ON hm.user_id = p.id
WHERE p.email = 'your@email.com';
```

**Expected:** ✅ User, Profile, Household all created

---

### 2️⃣ **Inventory with Lite Sync** 📦

**In App:**
1. Go to Inventory tab
2. Add item: "Test Apple" to Fridge, Quantity: 5
3. Look at sync indicator (top of screen)
4. Should show "Periodic sync" and "1" pending badge
5. Wait 5 minutes OR tap sync icon to force

**Verify in Supabase:**
```sql
-- Check item was synced
SELECT name, quantity, location, created_at
FROM pantry_items
WHERE household_id = (
  SELECT household_id FROM household_members
  WHERE user_id = (SELECT id FROM profiles WHERE email = 'your@email.com')
)
ORDER BY created_at DESC;
```

**Expected:** ✅ Item appears after 5 min or force sync

**Test Update:**
1. Change quantity to 3
2. See pending badge again
3. Wait/force sync
4. Check database updated

---

### 3️⃣ **Shopping List with Smart Sync** 🛒

**Solo Mode Test:**
1. Go to Shopping tab
2. Add "Bread" to list
3. Check sync indicator: "Periodic sync"
4. Wait 5 min or tap sync

**Verify:**
```sql
-- Check shopping list item
SELECT si.name, si.checked, sl.title
FROM shopping_list_items si
JOIN shopping_lists sl ON si.list_id = sl.id
WHERE sl.household_id = (
  SELECT household_id FROM household_members
  WHERE user_id = (SELECT id FROM profiles WHERE email = 'your@email.com')
);
```

**Co-Shopping Test (Need 2 Devices):**
1. Open Shopping on Phone A
2. Open Shopping on Phone B (same account or household member)
3. See "LIVE" badge appear + "2" users badge
4. Add "Milk" on Phone A
5. Should appear instantly on Phone B
6. Close Phone B
7. "LIVE" disappears, back to "Periodic sync"

---

### 4️⃣ **Receipt OCR** 📸

**In App:**
1. Go to Scanner tab
2. Take photo of receipt (or use camera roll)
3. Wait for processing (~3-5 seconds)
4. Should see:
   - High confidence items → Added to inventory
   - Low confidence items → Fix Queue

**Verify Processing:**
```sql
-- Check receipt was processed
SELECT id, store_name, total_amount, status, processed_at
FROM receipts
WHERE household_id = (
  SELECT household_id FROM household_members
  WHERE user_id = (SELECT id FROM profiles WHERE email = 'your@email.com')
)
ORDER BY created_at DESC;

-- Check extracted items
SELECT product_name, normalized_name, quantity, confidence_score, needs_review
FROM receipt_items
WHERE receipt_id = (
  SELECT id FROM receipts
  ORDER BY created_at DESC
  LIMIT 1
);
```

**Check Edge Function Logs:**
- Supabase Dashboard → Functions → Logs
- Look for "process-receipt" function
- Should see processing details

---

### 5️⃣ **Presence Detection** 👥

**Test Active Users:**
1. Open Shopping List
2. Check for user count badge
3. Open on second device/browser
4. Should see blue "2" badge
5. Both devices show "LIVE"

**Verify Presence:**
```sql
-- This won't show in DB, it's in-memory
-- Check app console for:
-- "User joined: [id]"
-- "Realtime enabled for shopping"
```

---

### 6️⃣ **Offline Mode** ✈️

**Test Queue:**
1. Turn on Airplane Mode
2. Add items to inventory: "Offline Banana", "Offline Orange"
3. See cloud-offline icon
4. See pending count increase
5. Turn off Airplane Mode
6. Watch pending badge clear as items sync

**Verify:**
```sql
-- Check items eventually appeared
SELECT name, created_at
FROM pantry_items
WHERE name LIKE 'Offline%'
ORDER BY created_at DESC;
```

---

### 7️⃣ **Daily Backup** 💾

**Check Backup Status:**
1. Look at sync indicator
2. Tap to expand
3. Should show "Last backup: [date]"

**Force Backup Test:**
```sql
-- Check Storage bucket
-- Supabase Dashboard → Storage → backups folder
-- Should see JSON files with date stamps
```

**Manual Trigger (if needed):**
- Backups run every 24 hours
- Or change system time to test

---

## 📊 **Quick Health Check**

Run this SQL to see overall system health:

```sql
-- System health check
WITH stats AS (
  SELECT
    (SELECT COUNT(*) FROM auth.users) as total_users,
    (SELECT COUNT(*) FROM profiles) as total_profiles,
    (SELECT COUNT(*) FROM households) as total_households,
    (SELECT COUNT(*) FROM pantry_items WHERE status = 'active') as total_items,
    (SELECT COUNT(*) FROM shopping_list_items WHERE NOT checked) as pending_shopping,
    (SELECT COUNT(*) FROM receipts WHERE created_at > NOW() - INTERVAL '24 hours') as recent_receipts
)
SELECT * FROM stats;
```

---

## 🔍 **Monitor Real-Time**

**In Browser Console (Web):**
```javascript
// Open browser dev tools while app is running
// Look for console logs:
[Sync] Item synced to cloud
[Realtime] Update received
[Presence] User joined: xxx
[Backup] Completed successfully
```

**In Expo Console:**
- Watch terminal where `npm start` is running
- Look for sync status updates

---

## ✅ **Success Indicators**

| Feature | Working If... |
|---------|--------------|
| Auth | Can login, profile created |
| Inventory | Items appear in DB after 5 min |
| Shopping | Items sync, LIVE mode with 2 users |
| OCR | Receipts process, items extracted |
| Presence | User count shows, realtime activates |
| Offline | Queue works, syncs on reconnect |
| Backup | Daily snapshots in Storage |

---

## 🚨 **Common Issues & Fixes**

**"Not syncing"**
- Check you're logged in
- Look for pending badge
- Tap sync icon to force
- Check network connection

**"LIVE not showing"**
- Need 2+ active users
- Both must have app open
- Check ENABLE_PRESENCE = true

**"OCR not working"**
- Check API keys in Supabase secrets
- Look at Edge Function logs
- Verify image is clear

**"Items not appearing"**
- Wait full 5 minutes for lite sync
- Or tap sync icon to force
- Check Supabase connection

---

## 🎯 **Test Flow (15 minutes)**

1. **Sign up** → Check user created ✅
2. **Add inventory item** → Wait 5 min → Check DB ✅
3. **Add shopping item** → Open 2nd device → See LIVE ✅
4. **Scan receipt** → Check Fix Queue ✅
5. **Go offline** → Add item → Reconnect → Syncs ✅
6. **Check backup status** → See timestamp ✅

**All working? Your backend is fully connected!** 🎉