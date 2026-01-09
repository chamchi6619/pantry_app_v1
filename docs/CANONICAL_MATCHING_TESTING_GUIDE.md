# Canonical Matching Implementation - Production Testing Guide

## 🎯 Overview

This guide provides comprehensive testing procedures for the **Inventory-Only Canonical Matching** architecture implemented on 2025-11-03.

### Architecture Summary

**Data Flow:**
```
Recipe → Shopping List (raw text) → Inventory (canonical matching) → Database
```

**Key Principle:** Canonical ingredient matching happens **ONLY** when items move from shopping list to inventory, not during shopping list population.

**Benefits:**
- ✅ User edits on shopping list don't create stale canonical IDs
- ✅ Manual entry and recipe entry treated uniformly
- ✅ Simpler data flow with single matching point
- ✅ Better UX - shopping list shows exactly what user/recipe said

---

## 🔧 Critical Fixes Applied

### 1. **CRITICAL DATA LOSS BUG** (inventorySupabaseStore.ts:202-216)
- **Issue:** Client was replacing user's text with canonical name
  - User enters: "organic free-range chicken breast"
  - System stored: "Chicken Breast"
  - User loses: "organic free-range" qualifiers
- **Fix:** Preserve user's exact text in `name` field, store canonical link in `canonical_item_id`
- **Impact:**
  - ✅ No data loss
  - ✅ User sees what they entered
  - ✅ Recipe matching still works via `canonical_item_id`
  - ✅ UI has flexibility to display canonical OR original name

### 2. **Type Safety Bug** (inventorySupabaseStore.ts:163)
- **Issue:** `loadFromSupabase()` was mapping removed fields `canonical_item_id` and `normalized_name`
- **Fix:** Removed these fields from mapping
- **Impact:** Prevents TypeScript compilation errors

### 3. **Data Consistency Bug** (shoppingListService.ts)
- **Issue:** Service was writing canonical fields directly to database, bypassing store logic
- **Fix:** Removed `canonical_item_id` and `normalized_name` from `IngredientToAdd` interface and database inserts
- **Impact:** Ensures all shopping list additions follow same pattern

### 4. **Client-Side Passthrough Bug** (CookCardScreen.tsx)
- **Issue:** Screen was passing canonical fields when adding recipe ingredients to shopping list
- **Fix:** Removed canonical field mapping, only pass `name` and `is_optional`
- **Impact:** Recipe ingredients stored as raw text in shopping list

### 5. **Critical Error Handling Bug** (inventorySupabaseStore.ts:193)
- **Issue:** `matchIngredient()` could throw error on first app load with no cache + no internet, crashing entire `addItem()` operation
- **Fix:** Wrapped `matchIngredient()` in try-catch with graceful degradation
- **Impact:** Users can add items even if canonical matching service is unavailable

### 6. **CRITICAL SECURITY VULNERABILITY** (add-to-pantry Edge Function)
- **Issue:**
  - Used `SERVICE_ROLE_KEY` (bypasses RLS)
  - No user authentication validation
  - No household membership verification
  - Malicious client could add items to ANY household
- **Fix:**
  - Changed to `ANON_KEY` with user's auth token
  - Added `auth.getUser()` validation
  - RLS policies now enforce household membership automatically
  - Added input validation (required fields + location enum)
- **Impact:** Production-grade security, prevents unauthorized access

---

## 🧪 Testing Procedures

### Test Environment Setup

1. **Prerequisites:**
   - Fresh app install OR clear AsyncStorage cache
   - Active Supabase connection
   - Valid user account with household membership

2. **Test Data Required:**
   - At least 5 canonical items in `canonical_items` table
   - At least 1 recipe in database
   - Test household with RLS permissions configured

---

### Test Suite 1: Shopping List Population

#### Test 1.1: Add Recipe Ingredients to Shopping List
**Objective:** Verify recipe ingredients are stored as raw text (no canonical matching)

**Steps:**
1. Navigate to Recipe Browse screen
2. Select any recipe
3. Tap "Add to Shopping List"
4. Navigate to Shopping List screen

**Expected Result:**
- ✅ Shopping list shows ingredient names exactly as they appear in recipe
- ✅ No canonical matching occurs
- ✅ Items show correct quantities from recipe
- ✅ Database inspection: `shopping_list_items.canonical_item_id` = `null`
- ✅ Database inspection: `shopping_list_items.name` = exact recipe text

**Database Verification:**
```sql
SELECT name, canonical_item_id, normalized_name, recipe_name
FROM shopping_list_items
WHERE recipe_id = '<test_recipe_id>';

-- Expected: canonical_item_id should be NULL
-- Expected: name should match recipe ingredient text
```

---

#### Test 1.2: Manual Shopping List Entry
**Objective:** Verify manually added items are stored as raw text

**Steps:**
1. Navigate to Shopping List screen
2. Tap "Add Item"
3. Enter item: "whole milk"
4. Save

**Expected Result:**
- ✅ Item appears in shopping list as "whole milk"
- ✅ No canonical matching occurs
- ✅ Database inspection: `canonical_item_id` = `null`

---

#### Test 1.3: Edit Shopping List Item
**Objective:** Verify editing doesn't create stale canonical IDs

**Steps:**
1. Add item "milk" to shopping list
2. Edit item name to "almond milk"
3. Save

**Expected Result:**
- ✅ Item name updates to "almond milk"
- ✅ Still no canonical matching (canonical_item_id remains null)
- ✅ Later when moved to inventory, will match "almond milk" not "milk"

---

### Test Suite 2: Inventory Addition (Canonical Matching)

#### Test 2.1: Move Shopping List Item to Inventory (Exact Match) + Data Preservation
**Objective:** Verify canonical matching happens AND user's original text is preserved

**Setup:**
- Canonical item exists: `Milk` with aliases `["milk", "whole milk", "2% milk"]`

**Steps:**
1. Add "whole milk" to shopping list
2. Check the item (mark as purchased)
3. Navigate to Inventory screen
4. Verify item appears

**Expected Result:**
- ✅ Console log: `🔍 Matched "whole milk" → "Milk" (uuid)`
- ✅ Console log: `Storing as: name="whole milk" (preserves user text), canonical_item_id="<uuid>"`
- ✅ Inventory shows item as "whole milk" (USER'S ORIGINAL TEXT - not "Milk")
- ✅ Database inspection: `pantry_items.canonical_item_id` = Milk's UUID
- ✅ Database inspection: `pantry_items.name` = **"whole milk"** (NOT "Milk")

**CRITICAL:** The system must preserve "whole milk" (user's text), not replace it with "Milk" (canonical name)

**Database Verification:**
```sql
SELECT name, canonical_item_id
FROM pantry_items
WHERE name = 'whole milk'  -- Note: exact user text, not canonical name
ORDER BY created_at DESC
LIMIT 1;

-- Expected: name = "whole milk" (preserves user input)
-- Expected: canonical_item_id should match canonical_items.id for "Milk"
```

---

#### Test 2.2: Manual Inventory Addition (Fuzzy Match)
**Objective:** Verify client-side fuzzy matching works while preserving user text

**Setup:**
- Canonical item: `Chicken Breast`

**Steps:**
1. Navigate to Inventory screen
2. Tap "Add Item"
3. Enter name: "chiken breast" (misspelled)
4. Fill other required fields (quantity, unit, location)
5. Save

**Expected Result:**
- ✅ Console log shows fuzzy match: `Matched "chiken breast" → "Chicken Breast"`
- ✅ Item saved as "chiken breast" (PRESERVES user's misspelling)
- ✅ Database inspection: `canonical_item_id` correctly linked to "Chicken Breast"
- ✅ Database inspection: `name` = "chiken breast" (original text, not corrected)

**IMPORTANT:** System does NOT autocorrect spelling - it preserves what user typed

---

#### Test 2.2b: Data Preservation with Descriptive Qualifiers (CRITICAL)
**Objective:** Verify descriptive qualifiers are NOT lost

**Setup:**
- Canonical item: `Chicken Breast`

**Steps:**
1. Navigate to Inventory screen
2. Tap "Add Item"
3. Enter name: "organic free-range chicken breast"
4. Fill other required fields
5. Save
6. Check database and UI

**Expected Result:**
- ✅ Console log: `Matched "organic free-range chicken breast" → "Chicken Breast" (uuid)`
- ✅ Inventory shows: "organic free-range chicken breast" (NOT "Chicken Breast")
- ✅ Database: `name` = "organic free-range chicken breast"
- ✅ Database: `canonical_item_id` = Chicken Breast UUID
- ✅ **User's qualifiers "organic free-range" are PRESERVED**

**Why This Matters:**
- User wants to remember it's organic (important dietary/cost info)
- Losing qualifiers = data loss
- canonical_item_id enables recipe matching WITHOUT losing user's notes

---

#### Test 2.3: Inventory Addition (No Match)
**Objective:** Verify graceful handling when no canonical match exists

**Steps:**
1. Add item to inventory: "exotic dragon fruit from Mars"
2. Save

**Expected Result:**
- ✅ Console log: No match message
- ✅ Item saved with user's exact text
- ✅ Database inspection: `canonical_item_id` = `null`
- ✅ Database inspection: `name` = "exotic dragon fruit from Mars"

---

### Test Suite 3: Error Handling & Edge Cases

#### Test 3.1: First App Load - No Internet (Critical Fix Verification)
**Objective:** Verify app doesn't crash when canonical service unavailable

**Steps:**
1. Clear app cache (uninstall/reinstall OR clear AsyncStorage)
2. Disable device internet
3. Launch app
4. Navigate to Inventory
5. Try to add an item manually

**Expected Result:**
- ✅ Console log: `⚠️ Canonical matching failed, proceeding without match`
- ✅ Item successfully added to inventory (with null canonical_item_id)
- ✅ App does NOT crash
- ✅ User can continue using app

---

#### Test 3.2: Canonical Service Initialization Failure
**Objective:** Verify background initialization doesn't block app startup

**Steps:**
1. Monitor console on app launch
2. Look for canonical service initialization logs

**Expected Result:**
- ✅ App starts successfully even if service initialization fails
- ✅ Error logged: `[Auth] Failed to initialize canonical items: <error>`
- ✅ App remains functional

---

#### Test 3.3: Offline Mode - Add Multiple Items
**Objective:** Verify offline queueing works with canonical matching

**Steps:**
1. Enable offline mode (disconnect internet)
2. Add 3 items to inventory
3. Reconnect internet
4. Wait for sync

**Expected Result:**
- ✅ Items show "pending" sync status while offline
- ✅ On reconnect, items sync to Supabase
- ✅ Canonical matching results are preserved
- ✅ Items update to "synced" status

---

### Test Suite 4: Security Verification (CRITICAL)

#### Test 4.1: Authentication Enforcement
**Objective:** Verify Edge Function requires authentication

**Steps:**
1. Use API testing tool (e.g., curl, Postman)
2. Call `add-to-pantry` Edge Function WITHOUT auth token:
```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/add-to-pantry \
  -H "Content-Type: application/json" \
  -d '{
    "household_id": "<some-household-id>",
    "name": "Test Item",
    "quantity": 1,
    "unit": "item",
    "location": "pantry"
  }'
```

**Expected Result:**
- ✅ Response: `401 Unauthorized`
- ✅ Response body: `{"error": "Unauthorized"}`
- ✅ Item NOT added to database

---

#### Test 4.2: Household Membership Enforcement (RLS)
**Objective:** Verify users can't add items to other households

**Setup:**
- User A in Household X
- User B in Household Y

**Steps:**
1. Login as User A
2. Call add-to-pantry with Household Y's ID
```javascript
await supabase.functions.invoke('add-to-pantry', {
  body: {
    household_id: '<household-y-id>',  // User A is NOT a member
    name: 'Malicious Item',
    quantity: 1,
    unit: 'item',
    location: 'pantry'
  }
});
```

**Expected Result:**
- ✅ Edge Function returns error (RLS policy rejection)
- ✅ Item NOT added to Household Y
- ✅ Console log shows RLS violation error

---

#### Test 4.3: Input Validation
**Objective:** Verify Edge Function validates required fields

**Steps:**
1. Call Edge Function with missing required field:
```javascript
await supabase.functions.invoke('add-to-pantry', {
  body: {
    household_id: '<household-id>',
    // Missing: name, quantity, unit, location
  }
});
```

**Expected Result:**
- ✅ Response: `400 Bad Request`
- ✅ Error message: `Missing required fields: household_id, name, quantity, unit, location`

---

#### Test 4.4: Location Enum Validation
**Objective:** Verify invalid location values are rejected

**Steps:**
1. Call Edge Function with invalid location:
```javascript
await supabase.functions.invoke('add-to-pantry', {
  body: {
    household_id: '<household-id>',
    name: 'Test',
    quantity: 1,
    unit: 'item',
    location: 'garage'  // Invalid!
  }
});
```

**Expected Result:**
- ✅ Response: `400 Bad Request`
- ✅ Error message: `Invalid location. Must be: fridge, freezer, or pantry`

---

### Test Suite 5: Data Integrity

#### Test 5.1: Recipe to Inventory Flow
**Objective:** Verify complete flow from recipe to inventory preserves data

**Steps:**
1. Select recipe with ingredient "2 cups whole milk"
2. Add to shopping list
3. Check shopping list item
4. Verify in inventory

**Expected Result at Each Stage:**

**Shopping List:**
- ✅ Name: "whole milk (2 cups)" or similar
- ✅ `canonical_item_id`: null
- ✅ `recipe_id`: linked to recipe
- ✅ `recipe_name`: recipe title

**Inventory (after checking):**
- ✅ Name: "Milk" (canonical)
- ✅ `canonical_item_id`: Milk's UUID
- ✅ Quantity: 2
- ✅ Unit: cups
- ✅ `source`: 'shopping_list'

---

#### Test 5.2: Database Consistency Check
**Objective:** Verify no orphaned or inconsistent data

**SQL Checks:**
```sql
-- 1. Shopping list items should have NULL canonical_item_id
SELECT COUNT(*)
FROM shopping_list_items
WHERE canonical_item_id IS NOT NULL;
-- Expected: 0

-- 2. Pantry items should have valid canonical_item_ids (or null)
SELECT COUNT(*)
FROM pantry_items p
LEFT JOIN canonical_items c ON p.canonical_item_id = c.id
WHERE p.canonical_item_id IS NOT NULL
  AND c.id IS NULL;
-- Expected: 0 (no orphaned references)

-- 3. Verify RLS policies exist on pantry_items
SELECT * FROM pg_policies
WHERE tablename = 'pantry_items';
-- Expected: "Members can manage pantry items" policy exists
```

---

## 📊 Testing Checklist

### Pre-Deployment Checklist

- [ ] All 5 critical bugs verified as fixed
- [ ] Security tests pass (4.1 - 4.4)
- [ ] Error handling tests pass (3.1 - 3.3)
- [ ] Data flow tests pass (5.1 - 5.2)
- [ ] Edge Function deployed with updated code
- [ ] Database migrations applied
- [ ] RLS policies verified

### User Acceptance Testing

- [ ] Add recipe ingredients to shopping list
- [ ] Edit shopping list items
- [ ] Check off shopping list items → verify in inventory
- [ ] Manually add items to inventory
- [ ] Test with no internet (offline mode)
- [ ] Test with slow internet (verify loading states)

### Performance Testing

- [ ] Large shopping list (50+ items) → move all to inventory
- [ ] Canonical matching with 500+ canonical items
- [ ] App startup time with no cache
- [ ] App startup time with cached canonical items

---

## 🐛 Known Issues & Limitations

### Current Limitations
1. **Canonical matching is best-effort**: If matching service fails, items are still added (with null canonical_item_id)
2. **24-hour cache**: Canonical items cache refreshes every 24 hours; new canonical items may not be available immediately
3. **Client-side matching only**: No server-side fuzzy matching fallback if client-side fails

### Future Enhancements
1. User confirmation for fuzzy matches (low confidence scores)
2. Manual canonical mapping UI (for unmatched items)
3. Analytics dashboard for matching accuracy
4. Bulk canonical reassignment tool

---

## 🔍 Debugging Tips

### Console Logs to Monitor

**On Shopping List Add:**
```
✅ Added X items to shopping list (Y duplicates skipped)
```

**On Inventory Add (with match):**
```
🔍 Matched "whole milk" → "Milk" (abc-123-uuid)
✅ Created pantry item: xyz-456-uuid
🔗 Linked to canonical item: abc-123-uuid
```

**On Inventory Add (no match):**
```
✗ No canonical match for "exotic dragon fruit"
✅ Created pantry item: xyz-789-uuid
```

**On Matching Service Failure:**
```
⚠️ Canonical matching failed, proceeding without match: [Error details]
```

**On Edge Function Authentication:**
```
📦 Add to Pantry - v3 (with auth & validation)
   User: user-uuid-here
   Item: "Milk"
   Household: household-uuid-here
   Location: fridge
```

### Common Issues & Solutions

**Issue:** Items not matching when they should
- **Check:** Is canonical items service initialized? (check console for init logs)
- **Check:** Is canonical item in database with correct aliases?
- **Solution:** Refresh canonical items cache, verify aliases in database

**Issue:** App crashes on inventory add
- **Check:** Is try-catch around `matchIngredient()` in place? (Line 194-200 of inventorySupabaseStore.ts)
- **Solution:** Verify fix #4 was applied

**Issue:** Unauthorized errors on inventory add
- **Check:** Is user authenticated? Is RLS policy configured?
- **Solution:** Verify fix #5 was applied to Edge Function

**Issue:** Items added to wrong household
- **Check:** Edge Function using ANON_KEY (not SERVICE_ROLE_KEY)?
- **Check:** RLS policies enabled on pantry_items table?
- **Solution:** Verify security fix applied

---

## 📝 Test Report Template

Use this template to document test results:

```markdown
### Test Session Report
**Date:** YYYY-MM-DD
**Tester:** [Name]
**Environment:** [Production/Staging/Local]
**App Version:** [Version]

#### Tests Passed ✅
- [ ] Test 1.1: Recipe ingredients to shopping list
- [ ] Test 2.1: Shopping list to inventory with matching
- [ ] Test 3.1: Offline resilience
- [ ] Test 4.1-4.4: Security tests
- [ ] Test 5.1-5.2: Data integrity

#### Tests Failed ❌
- [ ] [Test name]: [Failure description]

#### Issues Found
1. [Issue description]
   - **Severity:** Critical/High/Medium/Low
   - **Steps to reproduce:** ...
   - **Expected:** ...
   - **Actual:** ...

#### Notes
[Any additional observations]
```

---

## 🚀 Deployment Checklist

Before deploying to production:

1. **Code Changes Committed:**
   - [ ] inventorySupabaseStore.ts (error handling fix)
   - [ ] shoppingListSupabaseStore.ts (removed canonical fields)
   - [ ] shoppingListService.ts (removed canonical fields)
   - [ ] CookCardScreen.tsx (removed canonical passthrough)
   - [ ] add-to-pantry Edge Function (security + validation)

2. **Edge Function Deployed:**
   ```bash
   supabase functions deploy add-to-pantry
   ```

3. **Database Verified:**
   - [ ] RLS policies active on pantry_items
   - [ ] canonical_items table populated
   - [ ] All migrations applied

4. **Testing Complete:**
   - [ ] All test suites passed
   - [ ] Security verification passed
   - [ ] UAT signed off

5. **Monitoring Setup:**
   - [ ] Error tracking configured
   - [ ] Performance monitoring active
   - [ ] Logging reviewed

---

## 📞 Support

For issues or questions:
- Review console logs (follow debugging tips above)
- Check database state with SQL queries provided
- Verify all 5 critical fixes were applied
- Test in isolated environment before production rollout

**Critical Support Contacts:**
- Database Issues: Check Supabase dashboard logs
- Edge Function Issues: Check Supabase Functions logs
- Client Issues: Check React Native debugger console

---

*Last Updated: 2025-11-03*
*Version: 1.0 (Inventory-Only Canonical Matching)*
