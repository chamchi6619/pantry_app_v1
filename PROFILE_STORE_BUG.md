# Profile Page Bug - Fresh Accounts See Old Data

## Problem Report

**User Issue**: Test account (fresh, no activity) sees "Total Spent" data on profile page

## Root Cause

### Architecture Issue: Persisted Stores Not Cleared on Sign Out

The app uses **Zustand stores** with `persist` middleware that saves data to AsyncStorage:

```typescript
// receiptStore.ts
export const useReceiptStore = create<ReceiptState>()(
  persist(
    (set, get) => ({
      receipts: [],
      // ... actions
    }),
    {
      name: 'pantry-receipt-storage',  // ← Persisted to AsyncStorage
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
```

### The Bug Flow

1. **User A** signs in and scans receipts → Data saved to AsyncStorage
2. **User A** signs out → AuthContext clears auth state
3. **BUT**: AsyncStorage still contains User A's receipts!
4. **User B** signs in on same device → ProfileScreen loads from AsyncStorage
5. **User B sees User A's data** ❌

### Current signOut() Implementation

```typescript
// AuthContext.tsx line 290
const signOut = async () => {
  try {
    setLoading(true);

    syncService.cleanup();

    await supabase.auth.signOut();

    // Only clears auth state
    setSession(null);
    setUser(null);
    setHasProfile(false);
    setHouseholdId(null);

    // ❌ MISSING: Clear persisted stores!
  } catch (error: any) {
    Alert.alert('Error', error.message);
  } finally {
    setLoading(false);
  }
};
```

## Affected Stores (with persist)

Based on the codebase, these stores use `persist` middleware:

1. **receiptStore.ts** → Shows in ProfileScreen (THE BUG)
2. **inventoryStore.ts** → Would show in Inventory screen
3. **shoppingListStore.ts** → Would show in Shopping list
4. **recipeStore.ts** → Would show in Recipes
5. **syncedInventoryStore.ts** → Synced data
6. **syncedShoppingStore.ts** → Synced data

## Impact

### Security Issue ❌
- **Data Leakage**: User B can see User A's purchase history, spending, inventory
- **Privacy Violation**: Personal grocery data exposed across accounts

### User Experience Issue ❌
- Fresh accounts show incorrect data
- Confusing for users testing the app
- Breaks multi-user on same device scenario

## Solution

### Option 1: Clear Stores on Sign Out (Recommended ✅)

Add a `clearAll()` or `reset()` function to each store, then call them in `signOut()`:

```typescript
// receiptStore.ts
export const useReceiptStore = create<ReceiptState>()(
  persist(
    (set, get) => ({
      receipts: [],
      // ... existing actions ...

      // NEW: Clear all data
      clearAll: () => set({ receipts: [] })
    }),
    {
      name: 'pantry-receipt-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
```

```typescript
// AuthContext.tsx signOut()
const signOut = async () => {
  try {
    setLoading(true);

    // NEW: Clear all persisted stores
    useReceiptStore.getState().clearAll();
    useInventoryStore.getState().clearAll();
    useShoppingListStore.getState().clearAll();
    useRecipeStore.getState().clearAll();

    syncService.cleanup();
    await supabase.auth.signOut();

    setSession(null);
    setUser(null);
    setHasProfile(false);
    setHouseholdId(null);
  } catch (error: any) {
    Alert.alert('Error', error.message);
  } finally {
    setLoading(false);
  }
};
```

### Option 2: User-Scoped Storage Keys

Change storage key to include user ID:

```typescript
// receiptStore.ts - REQUIRES userId parameter
{
  name: `pantry-receipt-storage-${userId}`,
  storage: createJSONStorage(() => AsyncStorage),
}
```

**Problem**: Stores are created at module load time, before we know the userId. Would require major refactor.

### Option 3: ProfileScreen Fetch from Supabase

Instead of reading from local store, fetch from Supabase:

```typescript
// ProfileScreen.tsx
const [receipts, setReceipts] = useState([]);

useEffect(() => {
  if (householdId) {
    fetchReceipts(householdId).then(setReceipts);
  }
}, [householdId]);
```

**Problem**: This is the correct long-term solution, but requires adding receipt fetching to Supabase.

## Recommendation

**Implement Option 1 immediately** (quick fix for security issue)
**Plan Option 3 for future** (proper multi-tenant architecture)

## Implementation Steps

1. ✅ Add `clearAll()` method to:
   - receiptStore.ts
   - inventoryStore.ts
   - shoppingListStore.ts
   - recipeStore.ts

2. ✅ Update AuthContext.signOut() to call all clearAll() methods

3. ✅ Test:
   - Sign in as User A, scan receipt
   - Sign out
   - Sign in as User B
   - Verify profile shows $0.00 total spent ✅

## Alternative: ProfileScreen Should Use Supabase

**Long-term fix**: ProfileScreen should NOT use local stores at all. It should:

1. Fetch purchase_history from Supabase
2. Calculate total_spent from Supabase data
3. Show real server-side data, not client-side cache

This would make the profile page multi-device compatible and more reliable.

## Current ProfileScreen Data Sources

```typescript
// ProfileScreen.tsx line 19-23
const receipts = useReceiptStore((state) => state.receipts);  // ❌ Local store
const inventoryCount = useInventoryStore((state) => state.items.length);  // ❌ Local store
const shoppingCount = useShoppingListStore((state) => state.items.length);  // ❌ Local store

// Should be:
const receipts = usePurchaseHistory(householdId);  // ✅ Fetch from Supabase
const inventoryCount = useInventoryCount(householdId);  // ✅ Fetch from Supabase
const shoppingCount = useShoppingCount(householdId);  // ✅ Fetch from Supabase
```

## Priority

**CRITICAL** - This is a security/privacy bug that allows data leakage between users
