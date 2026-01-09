# Pantry Pal V1 - Gap Analysis

**Date:** 2025-01-09
**Scope:** Minimum viable v1 - ship fast

---

## What's Ready (No Changes Needed)

| Tab | Status | Notes |
|-----|--------|-------|
| **Pantry** | ✅ Ready | Full CRUD, locations, expiry |
| **Shopping** | ✅ Ready | Add, check, delete |
| **Scan** | ✅ Ready | Camera → OCR → Gemini → Fix queue |
| **Profile** | ✅ Ready | Settings, history, legal |

---

## What Needs Work

### Recipes Tab - Simplification Required

**Current Problem:**
- Has "Explore" mode with recipe database
- Has "Saved" mode for user recipes
- Has meal planning, variants, extra screens
- This is v2 complexity in v1

**V1 Requirement:**
- ONLY "My Recipes" (saved recipes list)
- Manual entry + URL import
- No explore, no recommendations

### Changes Required

| Task | Effort |
|------|--------|
| Remove "Explore/Saved" toggle from RecipesHeroScreen | 1 hr |
| Show only saved recipes (keep existing SavedRecipes logic) | 1 hr |
| Add Manual Recipe Entry screen | 3 hrs |
| Add "+ Add Recipe" button with Manual/Import choice | 1 hr |
| Remove meal planning from navigation | 30 min |
| Remove variant screens from navigation | 30 min |

**Total:** ~7 hours

---

## Navigation Label Changes

| Current | V1 |
|---------|-----|
| "Inventory" | "Pantry" |
| "Receipt" | "Scan" |

**Effort:** 10 minutes

---

## Deferred to Later

| Feature | Reason |
|---------|--------|
| Credit system | Not blocking launch |
| Quick-add common items | Nice-to-have |
| Onboarding flow | Can add after launch |
| Recipe recommendations | v2 |
| Pantry matching % | v2 |
| Meal planning | v2 |

---

## Implementation Order

### Step 1: Create Manual Recipe Entry (3 hrs)
New screen: `ManualRecipeEntryScreen.tsx`
- Title (required)
- Source URL (optional)
- Notes (optional)
- Ingredients (textarea, optional)
- Save button

### Step 2: Simplify Recipes Tab (3 hrs)
Modify: `RecipesHeroScreen.tsx`
- Remove mode toggle
- Remove Explore logic
- Keep saved recipes display
- Add "+ Add Recipe" button
- Show modal: "Add Manually" or "Import from URL"

### Step 3: Clean Navigation (1 hr)
Modify: `AppNavigator.tsx`
- Remove MealPlanning route
- Remove variant screen routes
- Rename labels: Inventory→Pantry, Receipt→Scan

---

## Files to Create

```
src/features/recipes/screens/ManualRecipeEntryScreen.tsx
```

## Files to Modify

```
src/features/queue/screens/RecipesHeroScreen.tsx
src/navigation/AppNavigator.tsx
```

## Files to Archive (remove from nav)

```
src/features/meal-planning/screens/MealPlanningScreen.tsx
src/features/queue/screens/RecipesTabbedScreen.tsx
src/features/queue/screens/RecipeListScreen.tsx
src/features/queue/screens/Variant*.tsx
```

---

## V1 Launch Checklist

- [ ] Recipes tab shows only saved recipes
- [ ] Can add recipe manually
- [ ] Can import recipe from URL
- [ ] No "Explore" visible
- [ ] No meal planning visible
- [ ] Tab labels: Pantry, Shopping, Scan, Recipes, Profile

**Estimated time to v1:** 1 day
