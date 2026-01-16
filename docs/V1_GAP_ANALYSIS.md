# Pantry Pal V1 - Gap Analysis

**Date:** 2025-01-16 (Updated)
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
- [ ] **Canonical matching architecture refactor** (see below)
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

## Canonical Matching Architecture (V1 Critical)

### Problem Statement

Pantry matching ("Have 5 / Need 3") is a key "wow moment" that connects Recipes ↔ Pantry ↔ Shopping. However, canonical matching (assigning `canonical_item_id` to ingredients) is **fragmented across paths**:

| Import Path | Canonical Matching | Pantry Match Works |
|-------------|:------------------:|:------------------:|
| Social media (L3/L4) | ✅ Yes | ✅ Yes |
| Schema.org (traditional) | ❌ No | ❌ No |
| Manual entry | ❌ No | ❌ No |

**Result:** Pantry matching only works for social media imports. Traditional recipe imports (NYT, AllRecipes) and manually entered recipes show "Have 0 / Need X" even when user has all ingredients.

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

### Implementation Plan

#### Phase 1: Create unified save function
```
1. Create src/services/recipeService.ts
2. Implement saveRecipe() with canonical matching
3. Implement matchIngredientsToCanonical() (simple: exact + alias match)
```

#### Phase 2: Migrate Manual Entry
```
4. Update ManualRecipeEntryScreen to use saveRecipe()
5. Test: Manual entry → pantry matching works
```

#### Phase 3: Migrate Social Media
```
6. Update PasteLinkScreen (social path) to use saveRecipe()
7. Remove old saveCookCard() call
8. Test: Social import → pantry matching works
```

#### Phase 4: Migrate Traditional/Schema.org
```
9. Modify extract-cook-card Edge Function:
   - Schema.org path: Remove database save, just return data
10. Update PasteLinkScreen to use saveRecipe() for traditional too
11. Test: Traditional import → pantry matching works
```

#### Phase 5: Cleanup
```
12. Remove old saveCookCard() if no longer used
13. Remove matchCanonicalItems() from Edge Function (moved to frontend)
14. Update types/interfaces for consistency
```

### Effort Estimate

| Phase | Effort | Risk |
|-------|--------|------|
| Phase 1: Create unified save | 30 min | Low |
| Phase 2: Migrate manual | 15 min | Low |
| Phase 3: Migrate social | 15 min | Low |
| Phase 4: Migrate traditional | 30 min | Medium |
| Phase 5: Cleanup | 15 min | Low |
| **Total** | **~2 hours** | |

### Key Files to Modify

```
NEW:    src/services/recipeService.ts (unified save + matching)

MODIFY: src/screens/PasteLinkScreen.tsx (use saveRecipe for all paths)
MODIFY: src/features/recipes/screens/ManualRecipeEntryScreen.tsx (use saveRecipe)
MODIFY: supabase/functions/extract-cook-card/index.ts (schema.org: don't save)

DELETE: Parts of src/services/cookCardService.ts (saveCookCard if replaced)
```

---

## Summary

Recipes feature is functionally complete for V1 with one critical gap:
- ✅ My Recipes list with source icons
- ✅ Manual recipe entry (free)
- ✅ URL import flow (social + traditional)
- ✅ Recipe detail view with serving scaler
- ✅ Pantry matching UI (Have/Need + Add to Shopping)
- ❌ **Pantry matching only works for social media imports**

**Next up:** Canonical matching architecture refactor to enable pantry matching for ALL recipe sources.
