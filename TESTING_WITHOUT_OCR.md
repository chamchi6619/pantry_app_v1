# 🧪 Complete Testing Guide (Without Real OCR)

## 🎯 What You CAN Test Right Now in Expo Go

### ✅ Everything Works Except Real OCR!

You can test **95% of the app** without an Apple Developer account. The mock OCR simulates the entire flow perfectly.

## 📱 Quick Start Testing

```bash
# Start the app
cd pantry-app
npm start

# Scan QR code with Expo Go on your phone
# Or press 'w' for web browser
```

## 🔥 Core Features to Test

### 1. Authentication & User Management

#### Sign Up Flow
```javascript
// Test data
Email: test_2024_12@example.com
Password: TestPass123!
Display Name: Test User
```

**Steps:**
1. Open app → Profile tab
2. Tap "Sign Up"
3. Fill in test credentials
4. Verify auto-login after signup
5. Check profile shows correct info

**Verify in Supabase Dashboard:**
- Go to Authentication → Users
- See your new user
- Check Tables → profiles → user created
- Check Tables → households → auto-created

#### Sign In/Out
- Sign out from Profile
- Sign in with same credentials
- Test "Remember me" functionality
- Verify session persists after app restart

---

### 2. Inventory Management (Full Testing)

#### Add Items
```javascript
// Test different item types
const testItems = [
  { name: "Milk", location: "fridge", quantity: 1, unit: "gal", expiry: 7 },
  { name: "Bread", location: "pantry", quantity: 2, unit: "loaf", expiry: 5 },
  { name: "Ice Cream", location: "freezer", quantity: 1, unit: "pint" }
];
```

**Test each location:**
- Fridge (Blue) ❄️
- Freezer (Cyan) 🧊
- Pantry (Amber) 🏺

**Test features:**
- ✅ Quantity +/- buttons
- ✅ Edit item details
- ✅ Move between locations
- ✅ Expiry date warnings (red if ≤7 days)
- ✅ Delete items (swipe or long-press)
- ✅ Categories (auto-suggest)
- ✅ Search/filter

#### Sync Testing
1. Add item
2. Check sync indicator (top-right)
3. See "1" pending badge
4. Wait 5 min OR tap sync icon
5. Verify in Supabase:
```sql
SELECT * FROM pantry_items
WHERE household_id = (
  SELECT household_id FROM household_members
  WHERE user_id = auth.uid()
)
ORDER BY created_at DESC;
```

---

### 3. Shopping List (Full Testing)

#### Basic Operations
- Add items to shopping list
- Mark items as done
- Clear completed items
- Reorder items (drag handle)
- Category grouping

#### Smart Sync Testing

**Solo Mode (Default):**
1. Add "Test Bread" to list
2. See "Periodic sync" indicator
3. Item syncs after 5 minutes

**Live Mode (2 Devices):**
1. Open Shopping on Phone A
2. Open Shopping on Phone B (same account)
3. See "LIVE" badge + "2 users" indicator
4. Add item on Phone A
5. Instantly appears on Phone B!
6. Close one app → Returns to periodic sync

---

### 4. Mock OCR Receipt Processing ✅

**This FULLY WORKS in Expo Go!**

#### Complete OCR Flow Test
1. **Navigate to Receipt tab** (🧾)
2. **Choose input method:**
   - "Take Photo" - Opens camera
   - "From Gallery" - Select any image

3. **Mock OCR generates realistic receipt:**
```
WALMART or TARGET or KROGER
Date: Today
---
MILK 2% GAL          $3.99
BREAD WHOLE WHT      $2.49
EGGS LARGE DOZ       $4.99
[3-7 random items]
---
SUBTOTAL            $XX.XX
TAX                  $X.XX
TOTAL              $XX.XX
```

4. **Test Fix Queue:**
   - All items appear for review
   - Edit item names
   - Adjust quantities
   - Change prices
   - Assign categories
   - Confidence indicators (color-coded)

5. **Test Actions:**
   - "Add to Inventory" - Adds item to pantry
   - "Confirm All" - Saves to purchase history
   - "Skip for Now" - Leaves in queue

6. **View Purchase History:**
   - Navigate to Purchase History screen
   - See processed receipts
   - Search by item/store
   - View spending totals

7. **Check Analytics Dashboard:**
   - Spending trends
   - Category breakdown
   - Store comparisons
   - Frequently purchased items

---

### 5. Analytics & Insights (Full Testing)

#### Analytics Dashboard Features
1. **Period Selector:** Week/Month/Year
2. **Spending Metrics:**
   - Total spent
   - Weekly average
   - Item count
   - Receipt count

3. **Charts & Visualizations:**
   - Daily spending chart
   - Category pie chart
   - Trending items carousel
   - Store price comparisons

4. **Savings Opportunities:**
   - Identifies cheaper stores
   - Suggests bulk purchases
   - Shows price trends

**Test Data Generation:**
```javascript
// Process multiple mock receipts to populate analytics
// Each mock receipt creates 3-7 items with realistic data
// Process 5-10 receipts to see meaningful analytics
```

---

### 6. Offline Mode Testing

#### Complete Offline Flow
1. **Enable Airplane Mode** ✈️
2. **Test operations:**
   - Add inventory items
   - Create shopping list
   - Process mock receipt
3. **Check indicators:**
   - Cloud-offline icon
   - Pending count increases
   - "Offline" badge
4. **Disable Airplane Mode**
5. **Watch sync:**
   - Pending badge clears
   - Items appear in Supabase
   - Success notifications

#### Offline Queue Features
- Automatic retry on reconnect
- Queue persistence (survives app restart)
- Manual retry option
- Clear failed items

---

### 7. Household Management

#### Create Household
1. Profile → Household Settings
2. Create new household
3. Name it (e.g., "Smith Family")
4. Auto-assigned as owner

#### Invite Members
1. Household → Invite Member
2. Enter email address
3. Choose role (admin/member/viewer)
4. Send invite

#### Member Permissions
- **Owner:** Full control
- **Admin:** Can edit everything
- **Member:** Can edit inventory/shopping
- **Viewer:** Read-only access

---

### 8. Performance Testing

#### Load Testing
```javascript
// Add many items rapidly
for (let i = 0; i < 50; i++) {
  addItem({
    name: `Test Item ${i}`,
    quantity: Math.random() * 10,
    location: ['fridge', 'freezer', 'pantry'][i % 3]
  });
}
```

**Expected:**
- UI remains responsive
- No crashes
- Sync completes successfully

#### Memory Testing
- Use app for 10+ minutes
- Switch between all screens
- Process multiple receipts
- Check memory usage doesn't grow

---

### 9. UI/UX Testing

#### Navigation
- ✅ Tab switching is smooth
- ✅ Back navigation works
- ✅ Modal presentations correct
- ✅ Keyboard handling proper

#### Visual Polish
- ✅ Loading states show
- ✅ Error messages clear
- ✅ Empty states helpful
- ✅ Animations smooth

#### Accessibility
- ✅ Text readable at all sizes
- ✅ Touch targets ≥44x44
- ✅ Color contrast sufficient
- ✅ Screen reader compatible

---

## 🔍 Backend Verification

### SQL Queries to Verify Data

```sql
-- Check your user and household
SELECT
  u.email,
  p.display_name,
  h.name as household_name,
  hm.role
FROM auth.users u
JOIN profiles p ON u.id = p.id
JOIN household_members hm ON p.id = hm.user_id
JOIN households h ON hm.household_id = h.id
WHERE u.email = 'your@email.com';

-- Check inventory items
SELECT name, quantity, location, expiry_date, status
FROM pantry_items
WHERE household_id = (
  SELECT household_id FROM household_members
  WHERE user_id = auth.uid()
)
ORDER BY created_at DESC;

-- Check shopping list
SELECT si.name, si.checked, si.quantity
FROM shopping_list_items si
JOIN shopping_lists sl ON si.list_id = sl.id
WHERE sl.household_id = (
  SELECT household_id FROM household_members
  WHERE user_id = auth.uid()
);

-- Check receipt processing (mock)
SELECT
  r.store_name,
  r.receipt_date,
  r.total_amount_cents / 100.0 as total,
  COUNT(ri.id) as item_count
FROM receipts r
LEFT JOIN receipt_items ri ON r.id = ri.receipt_id
WHERE r.household_id = (
  SELECT household_id FROM household_members
  WHERE user_id = auth.uid()
)
GROUP BY r.id
ORDER BY r.created_at DESC;

-- System health check
WITH stats AS (
  SELECT
    (SELECT COUNT(*) FROM pantry_items WHERE status = 'active') as items,
    (SELECT COUNT(*) FROM shopping_list_items WHERE NOT checked) as shopping,
    (SELECT COUNT(*) FROM receipts) as receipts,
    (SELECT COUNT(*) FROM receipt_fix_queue WHERE NOT resolved) as fix_queue
)
SELECT * FROM stats;
```

---

## ✅ Complete Testing Checklist

### Core Features (Test Now)
- [ ] **Auth:** Sign up, sign in, sign out
- [ ] **Profile:** Update display name, avatar
- [ ] **Household:** Create, view members
- [ ] **Inventory:** Add/edit/delete items
- [ ] **Locations:** Fridge, freezer, pantry
- [ ] **Shopping:** Create list, mark done
- [ ] **Sync:** Periodic (5 min) and live modes
- [ ] **Mock OCR:** Process receipt flow
- [ ] **Fix Queue:** Review and edit items
- [ ] **Purchase History:** View past receipts
- [ ] **Analytics:** View spending dashboard
- [ ] **Offline:** Queue and sync
- [ ] **Search:** Filter items
- [ ] **Categories:** Auto-suggest

### Edge Cases
- [ ] Network failure handling
- [ ] Large data sets (50+ items)
- [ ] Rapid navigation
- [ ] Background/foreground
- [ ] Multiple users
- [ ] Empty states
- [ ] Error recovery

### Platform Specific
- [ ] iOS: Keyboard, safe areas
- [ ] Android: Back button, permissions
- [ ] Web: Responsive layout
- [ ] Tablet: Larger screens

---

## 🚀 15-Minute Quick Test

```bash
# Rapid smoke test - Everything except real OCR

1. Sign up (1 min)
   - Create account
   - Verify profile created

2. Inventory (3 min)
   - Add 3 items (fridge/freezer/pantry)
   - Edit quantity
   - Delete one item

3. Shopping (2 min)
   - Add 3 items
   - Mark one done
   - Clear completed

4. Mock Receipt (3 min)
   - Take/select photo
   - Review Fix Queue
   - Confirm items

5. Analytics (2 min)
   - View dashboard
   - Check spending
   - See categories

6. Offline (2 min)
   - Enable airplane mode
   - Add item
   - Re-enable network
   - Verify sync

7. Backend Check (2 min)
   - Open Supabase dashboard
   - Run verification queries
   - Confirm data synced
```

---

## 📊 Expected Results

### What's Working
- ✅ Complete authentication flow
- ✅ Full inventory management
- ✅ Shopping list with smart sync
- ✅ Mock OCR receipt processing
- ✅ Fix Queue editing
- ✅ Purchase History tracking
- ✅ Analytics Dashboard
- ✅ Offline queue & sync
- ✅ Household management

### Known Limitations (Expo Go)
- ⏳ Real OCR (needs ML Kit build or Google Vision API)
- ⏳ Push notifications (needs dev build)
- ⏳ Background sync (needs dev build)
- ⏳ Haptic feedback (needs dev build)

---

## 🎯 Next Steps

1. **Test everything above** - 95% of app functionality
2. **Get Google Vision API key** - Enable real OCR in Expo Go
3. **When ready for production** - Get Apple Developer account
4. **Build with EAS** - Full native features

The app is **fully functional for testing** without real OCR. Mock OCR perfectly simulates the complete flow!

---

*Testing Guide - December 2024*
*Works in Expo Go - No Apple Developer Required*