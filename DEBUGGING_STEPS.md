# 🔧 Debugging: Infinite Loading Spinner

## Issue
Calendar button → Loading spinner spins forever, no console logs appear

## Root Cause Analysis
The component file exists, but either:
1. Metro bundler has stale cache
2. Component isn't being imported/mounted
3. JavaScript error preventing mount

## CRITICAL FIX STEPS

### Step 1: Complete Metro Cache Clear
```bash
# Stop Metro bundler (Ctrl+C in terminal)

# Clear ALL caches
cd pantry-app
rm -rf node_modules/.cache
rm -rf $TMPDIR/react-*
rm -rf $TMPDIR/metro-*
rm -rf $TMPDIR/haste-*
watchman watch-del-all  # If you have watchman

# Restart with completely fresh cache
npx react-native start --reset-cache
```

### Step 2: Force Rebuild
In a NEW terminal (while Metro is running):
```bash
# For iOS
npx react-native run-ios

# For Android
npx react-native run-android
```

### Step 3: Check Console Logs
After tapping calendar button, you MUST see these logs:
```
LOG  [MealPlanning] 🎬 Component mounting...
LOG  [MealPlanning] Auth state: {hasUser: true, ...}
LOG  [MealPlanning] ⚡ useEffect triggered
LOG  [MealPlanning] ✅ Both user and household present
LOG  [MealPlanning] Loading meal plan...
```

### If Still No Logs → Check Metro Terminal

Look for RED ERRORS in Metro terminal like:
- "Error: Unable to resolve module..."
- "SyntaxError: ..."
- "TypeError: ..."

Copy the FULL error and share it.

### If Still Hangs → Try Direct Console Check

In your app while spinner is showing:
1. Open React Native Debug Menu (shake device or Cmd+D / Ctrl+M)
2. Select "Debug"
3. Open Chrome DevTools Console
4. Look for any red errors

## Additional Debugging

### Check if screen is even reachable:
Add to ExploreRecipesScreenSupabase.tsx before navigation call:
```typescript
console.log('[Navigation] About to navigate to MealPlanning');
navigation.navigate('MealPlanning' as never);
console.log('[Navigation] Navigation called');
```

### Check Metro bundler is serving the file:
In Metro terminal, look for lines like:
```
 BUNDLE  ./index.js
```

If you see any errors about MealPlanningScreen.tsx, that's the problem.

## Expected Behavior After Fix

1. Tap calendar button
2. See console log: `[Navigation] About to navigate to MealPlanning`
3. See console log: `[MealPlanning] 🎬 Component mounting...`
4. See loading spinner for 1-2 seconds
5. See meal planning screen with empty calendar
6. See console log: `[MealPlanning] ✅ Load complete`

## Files Modified
- `pantry-app/src/features/meal-planning/screens/MealPlanningScreen.tsx`
  - Added logging at component mount
  - Added logging in useEffect
  - Added detailed error logging

- `pantry-app/src/services/mealPlanningService.ts`
  - Fixed error handling for PGRST116 (not found) error
  - Added logging when creating new plans

## Last Resort

If NOTHING works, there might be a React Native build issue:

```bash
# iOS
cd ios && pod deintegrate && pod install && cd ..
npx react-native run-ios

# Android
cd android && ./gradlew clean && cd ..
npx react-native run-android
```
