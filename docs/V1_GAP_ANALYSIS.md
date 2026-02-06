# Pantry Pal V1 - Gap Analysis

**Date:** 2025-02-06 (Updated)
**Status:** IN PROGRESS

---

## What's Ready (No Changes Needed)

| Tab | Status | Notes |
|-----|--------|-------|
| **Pantry** | ✅ Ready | Full CRUD, locations, expiry |
| **Shopping** | ✅ Ready | Add, check, delete |
| **Scan** | ✅ Ready | Camera → OCR → Gemini → Fix queue |
| **Profile** | ✅ Ready | Settings, history, legal |
| **Recipes** | ✅ Ready | My Recipes, manual entry, URL import |

---

## What Was Done

### Recipes Tab - Simplified

**Changes Made:**
- [x] Removed "Explore/Saved" toggle from RecipesHeroScreen
- [x] Shows only saved recipes (My Recipes)
- [x] Created ManualRecipeEntryScreen for free recipe entry
- [x] Added "+ Add Recipe" button with Manual/Import modal
- [x] Removed meal planning from navigation
- [x] Removed variant screens from navigation
- [x] Added source icons (✏️ Manual, ▶️ YouTube, 🎵 TikTok, 📷 Instagram, 📕 小红书, 🌐 Web)
- [x] Removed redundant floating + button (header button only)
- [x] Search placeholder clarified ("Search by title")

### PurchaseHistoryScreen - Simplified (2025-02-06)

**Changes Made:**
- [x] Removed Items tab, kept Receipts only
- [x] Added item search within receipts (searches store names + item names)
- [x] Added monthly navigation with swipeable arrows
- [x] Added year grid calendar modal (tap month header to open)
- [x] Shows monthly spending totals in calendar grid
- [x] Fixed notch overlap (SafeAreaView with top edge)
- [x] Stats: Items, Trips, Avg/Trip based on filtered receipts

### PasteLinkScreen - Polished (2025-02-06)

**Changes Made:**
- [x] Added SafeAreaView with top/bottom edges for notch safety
- [x] Use theme colors instead of hardcoded values
- [x] Added close X button at top right
- [x] Added paste button next to input field
- [x] Platform-specific loading messages ("Extracting from Instagram...")
- [x] Removed pricing info from help section (not user-facing)
- [x] Simplified help section with platform icons
- [x] Content positioned at 20% from top

### CookCardScreen - Redesigned

**Changes Made:**
- [x] New header layout matching ManualRecipeEntryScreen (X, title, trash)
- [x] Quick Stats Bar (Prep | Cook | Total | Servings with +/- stepper)
- [x] Serving scaler - adjusts ingredient quantities in real-time
- [x] Clean ingredient list (bullet points, quantity right-aligned)
- [x] Instruction steps as tappable cards with completion tracking
- [x] Delete recipe with confirmation
- [x] Pantry matching UI (Have X / Need Y, Add to Shopping List) - KEPT for V1

### Navigation Label Changes

- [x] "Inventory" → "Pantry"
- [x] "Receipt" → "Scan"

---

## Files Modified

```
src/features/queue/screens/RecipesHeroScreen.tsx - My Recipes list, source icons
src/features/recipes/screens/ManualRecipeEntryScreen.tsx - Free manual entry
src/screens/CookCardScreen.tsx - Complete redesign
src/screens/PasteLinkScreen.tsx - Polished UI (2025-02-06)
src/features/receipt/screens/PurchaseHistoryScreen.tsx - Receipts-only + calendar (2025-02-06)
src/features/receipt/screens/ReceiptDetailScreen.tsx - Notch fix (2025-02-06)
src/navigation/AppNavigator.tsx - Renamed tabs, removed v2 routes
```

---

## V1 Launch Checklist

### Core Features
- [x] Recipes tab shows only saved recipes
- [x] Can add recipe manually (FREE)
- [x] Can import recipe from URL (uses credits later)
- [x] Recipe detail view (CookCardScreen) polished
- [x] Delete recipes working
- [x] Serving scaler working
- [x] No "Explore" visible
- [x] No meal planning visible
- [x] Pantry matching UI visible (Have/Need + Add to Shopping)
- [x] Tab labels: Pantry, Shopping, Scan, Recipes, Profile

### Critical Bugs Fixed (2025-01-16)
- [x] Social media recipes not saved to database (PasteLinkScreen.tsx)
- [x] Deprecated file syntax error (DEPRECATED_ShoppingListScreen.tsx)

### Still TODO
- [x] **Canonical matching architecture refactor** (DONE - see below)
- [ ] Credit system implementation
- [ ] IAP integration (RevenueCat)
- [ ] Onboarding flow
- [ ] App Store assets & submission
- [ ] TypeScript errors in V1 files (@expo/vector-icons types)

---

## Deferred to V2+

| Feature | Reason | PRD Reference |
|---------|--------|---------------|
| Credit system | Not blocking initial dev | V1 PRD |
| Quick-add common items | Nice-to-have | V1 PRD |
| Onboarding flow | Can add before launch | V1 PRD |
| Recipe recommendations | Complexity | V2 |
| "What can I cook?" | Needs matching | V2 |
| Meal planning | Out of scope | V3+ |
| Household sharing | Complexity | V2 |

---

## Canonical Matching Architecture (V1 Critical) - ✅ IMPLEMENTED

### Problem Statement (SOLVED)

Pantry matching ("Have 5 / Need 3") is a key "wow moment" that connects Recipes ↔ Pantry ↔ Shopping. Previously, canonical matching (assigning `canonical_item_id` to ingredients) was **fragmented across paths**.

**After implementation (2025-01-16):**

| Import Path | Canonical Matching | Pantry Match Works |
|-------------|:------------------:|:------------------:|
| Social media (L3/L4) | ✅ Yes | ✅ Yes |
| Schema.org (traditional) | ✅ Yes | ✅ Yes |
| Manual entry | ✅ Yes | ✅ Yes |

All recipe sources now go through unified canonical matching.

### Current Architecture (Fragmented)

```
Social Media ──→ Edge Function ──→ matchCanonicalItems() ──→ Returns (no save)
                                                                    ↓
                                                           Frontend saves

Schema.org ────→ Edge Function ──→ (no matching) ──→ Saves in Edge Function

Manual Entry ──→ Frontend ──→ (no matching) ──→ Saves directly
```

Three different paths. Matching in one. Saving in two different places.

### Target Architecture (Unified)

```
┌─────────────────────────────────────────────────────────────────┐
│                     EXTRACTION PHASE                            │
│                   (Source-specific)                             │
│                                                                 │
│  Social Media ──→ extract-cook-card ──→ Raw CookCard            │
│  Schema.org ────→ extract-cook-card ──→ Raw CookCard            │
│  Manual Entry ──→ User Input ──→ Raw CookCard                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    All paths converge
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      SAVE PHASE                                 │
│                   (Source-agnostic)                             │
│                                                                 │
│              saveRecipeWithMatching()                           │
│                        ↓                                        │
│              1. Match ingredients to canonical                  │
│              2. Save cook_card                                  │
│              3. Save cook_card_ingredients (with IDs)           │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight:** The source of a recipe (YouTube, NYT, manual) shouldn't affect how we store it. An ingredient is an ingredient.

### Implementation (COMPLETED 2025-01-16)

#### What was done:

1. **Created `src/services/recipeService.ts`** - Unified save function with canonical matching
   - `saveRecipeWithMatching()` - saves recipe with canonical matching for new recipes
   - `updateRecipeWithCanonicalMatching()` - updates existing recipes (traditional imports)
   - `loadCanonicalItemsMap()` - loads canonical items with 1-hour cache
   - `matchIngredientsToCanonical()` - matches ingredients to canonical IDs

2. **Updated `ManualRecipeEntryScreen.tsx`** - Now uses `saveRecipeWithMatching()`
   - Builds CookCard object with normalized_name for each ingredient
   - Canonical matching happens automatically on save

3. **Updated `PasteLinkScreen.tsx`** - Both paths now use unified matching
   - Social media: Uses `saveRecipeWithMatching()` (new save with matching)
   - Traditional: Uses `updateRecipeWithCanonicalMatching()` (updates existing)

#### Files Created/Modified:

```
NEW:    src/services/recipeService.ts (unified save + matching)

MODIFY: src/screens/PasteLinkScreen.tsx (uses saveRecipeWithMatching)
MODIFY: src/features/recipes/screens/ManualRecipeEntryScreen.tsx (uses saveRecipeWithMatching)
```

#### Note on Edge Function:
The traditional path still saves in the Edge Function, but we now run canonical matching
after the recipe is loaded. This avoids risky Edge Function changes while achieving
the same result. Edge Function cleanup is deferred to later optimization phase.

---

## Summary

Recipes feature is **COMPLETE** for V1:
- ✅ My Recipes list with source icons
- ✅ Manual recipe entry (free)
- ✅ URL import flow (social + traditional)
- ✅ Recipe detail view with serving scaler
- ✅ Pantry matching UI (Have/Need + Add to Shopping)
- ✅ **Pantry matching works for ALL recipe sources** (implemented 2025-01-16)

**V1 Recipes: READY FOR LAUNCH**
