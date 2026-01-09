# Code Deprecation Plan - Pantry App V1

**Created:** 2025-11-04
**Purpose:** Safely archive old version files and debug code without breaking the app

---

## 🎯 Objective

Remove debug version-switcher code from production while preserving all experiments in an organized archive for future reference.

---

## 📊 Current Situation Analysis

### Issue: Debug Version Switchers in Production

**Problem Files:**
1. `ExploreRecipesScreenSupabase.tsx` - Shows tabs to switch between v1-v5 (debug code)
2. ~~`ProfileScreen.tsx` - Showed tabs to switch between v1-v6~~ ✅ FIXED

**Impact:**
- Users can see internal UI experiments
- Confusing navigation with version tabs
- Unprofessional appearance
- Code clutter makes maintenance difficult

---

## 🔍 Detailed File Analysis

### **Recipes Feature - ExploreRecipesScreen**

#### Active Files (Currently Used)
```
AppNavigator.tsx:12
└── imports: ExploreRecipesScreenSupabase

ExploreRecipesScreenSupabase.tsx (CURRENT - DEBUG CODE)
├── Line 20: imports ExploreRecipesScreenV1
├── Line 21: imports ExploreRecipesScreenV2
├── Line 22: imports ExploreRecipesScreenV3
├── Line 23: imports ExploreRecipesScreenV4  ⭐ RECOMMENDED
├── Line 24: imports ExploreRecipesScreenV5
├── Line 36: Default version = 4
└── Lines 57-90: Version switcher UI (tabs visible to users)
```

#### Version Descriptions (from code comments)
- **v1** - Hero Visual Feed (large images, personalized greeting, modern cards)
- **v2** - Bento Grid Modern (asymmetric layout, 2025 trend, warm colors)
- **v3** - Minimalist Elegant (cookbook-style, serif typography, clean)
- **v4** - Smart Sections (organized categories, horizontal scrolling) ⭐ **RECOMMENDED**
- **v5** - Full-Screen Immersive (TikTok-style vertical feed, swipeable)

#### Files to Archive
```
src/features/recipes/screens/
├── ExploreRecipesScreen.v1.tsx → ARCHIVE
├── ExploreRecipesScreen.v2.tsx → ARCHIVE
├── ExploreRecipesScreen.v3.tsx → ARCHIVE
├── ExploreRecipesScreen.v4.tsx → ARCHIVE (but copy content to main first)
├── ExploreRecipesScreen.v5.tsx → ARCHIVE
├── ExploreRecipesScreenSupabase.original.tsx → ARCHIVE
└── ExploreRecipesScreenSupabase.wrapper.tsx → ARCHIVE
```

---

### **Profile Feature**

#### Active Files (Currently Used)
```
AppNavigator.tsx:15
└── imports: ProfileScreen  ✅ ALREADY PRODUCTION-READY
```

#### Files to Archive
```
src/features/profiles/screens/
└── ProfileScreen.old.tsx → ARCHIVE
```

**Status:** ✅ ProfileScreen already fixed (no version switcher)

---

### **Already Archived Files** (Good Examples)

These files are already properly archived:
```
src/features/recipes/screens/archived/
├── DEPRECATED_EnhancedRecipesScreen.tsx
├── DEPRECATED_ExploreRecipesScreen.tsx
├── DEPRECATED_ExploreRecipesScreenBackend.tsx
├── DEPRECATED_ExploreRecipesScreenFixed.tsx
├── DEPRECATED_RecipeDetailScreen.tsx
├── DEPRECATED_RecipeFormScreen.tsx
├── DEPRECATED_RecipesScreen.tsx
└── DEPRECATED_SimpleRecipesScreen.tsx

src/features/shopping/screens/archived/
├── DEPRECATED_InlineShoppingListScreen.tsx
├── DEPRECATED_ShoppingListScreen.tsx
└── DEPRECATED_ShoppingListScreen_BACKUP.tsx

src/services/
├── DEPRECATED_recipeServiceSupabase.ts
└── DEPRECATED_recipeServiceSupabase.ts.bak
```

**Pattern to Follow:**
- Create `archived/` subfolder
- Prefix with `DEPRECATED_`
- Add descriptive suffix if needed (e.g., `_SWITCHER`, `_v4`)

---

## ✅ Safe Deprecation Steps

### Phase 1: Archive Recipe Screen Versions

**Step 1.1:** Read v4 content (recommended version)
```bash
# Already done - v4 is "Smart Sections" layout
```

**Step 1.2:** Replace version switcher with v4 implementation
```bash
# Backup current switcher
cp ExploreRecipesScreenSupabase.tsx → archived/DEPRECATED_ExploreRecipesScreenSupabase_SWITCHER.tsx

# Replace with v4 content
cp ExploreRecipesScreen.v4.tsx → ExploreRecipesScreenSupabase.tsx
```

**Step 1.3:** Move all versions to archived
```bash
mv ExploreRecipesScreen.v1.tsx → archived/DEPRECATED_ExploreRecipesScreen_v1_HeroFeed.tsx
mv ExploreRecipesScreen.v2.tsx → archived/DEPRECATED_ExploreRecipesScreen_v2_BentoGrid.tsx
mv ExploreRecipesScreen.v3.tsx → archived/DEPRECATED_ExploreRecipesScreen_v3_Elegant.tsx
mv ExploreRecipesScreen.v4.tsx → archived/DEPRECATED_ExploreRecipesScreen_v4_SmartSections.tsx
mv ExploreRecipesScreen.v5.tsx → archived/DEPRECATED_ExploreRecipesScreen_v5_Immersive.tsx
mv ExploreRecipesScreenSupabase.original.tsx → archived/DEPRECATED_ExploreRecipesScreenSupabase_ORIGINAL.tsx
mv ExploreRecipesScreenSupabase.wrapper.tsx → archived/DEPRECATED_ExploreRecipesScreenSupabase_WRAPPER.tsx
```

---

### Phase 2: Archive Profile Screen Old Version

**Step 2.1:** Move old profile to archived
```bash
mv ProfileScreen.old.tsx → archived/DEPRECATED_ProfileScreen_OLD.tsx
```

---

### Phase 3: Verification

**Step 3.1:** Check for broken imports
```bash
# Search for any imports of archived files
grep -r "from.*ExploreRecipesScreen.v[0-9]" src/
grep -r "from.*ProfileScreen.old" src/
```

**Expected Result:** No matches (only ExploreRecipesScreenSupabase should be imported)

**Step 3.2:** TypeScript check
```bash
npx tsc --noEmit
```

**Expected Result:** No new errors related to missing imports

**Step 3.3:** Test app launch
```bash
# Start app and verify:
# 1. Recipe tab loads without version switcher
# 2. Profile tab loads correctly
# 3. No console errors
```

---

## 📝 Archive Directory Structure (After Completion)

```
src/features/recipes/screens/
├── archived/
│   ├── DEPRECATED_ExploreRecipesScreen_v1_HeroFeed.tsx
│   ├── DEPRECATED_ExploreRecipesScreen_v2_BentoGrid.tsx
│   ├── DEPRECATED_ExploreRecipesScreen_v3_Elegant.tsx
│   ├── DEPRECATED_ExploreRecipesScreen_v4_SmartSections.tsx  (source for main)
│   ├── DEPRECATED_ExploreRecipesScreen_v5_Immersive.tsx
│   ├── DEPRECATED_ExploreRecipesScreenSupabase_SWITCHER.tsx  (old debug version)
│   ├── DEPRECATED_ExploreRecipesScreenSupabase_ORIGINAL.tsx
│   ├── DEPRECATED_ExploreRecipesScreenSupabase_WRAPPER.tsx
│   ├── DEPRECATED_EnhancedRecipesScreen.tsx  (already there)
│   └── ... (other deprecated files)
└── ExploreRecipesScreenSupabase.tsx  ✅ PRODUCTION (v4 implementation)

src/features/profile/screens/
├── archived/
│   └── DEPRECATED_ProfileScreen_OLD.tsx
├── ProfileScreen.tsx  ✅ PRODUCTION
├── PrivacyPolicyScreen.tsx  ✅ PRODUCTION
└── TermsOfServiceScreen.tsx  ✅ PRODUCTION
```

---

## 🎯 Expected Outcome

### Before
```typescript
// ExploreRecipesScreenSupabase.tsx
const [selectedVersion, setSelectedVersion] = useState<1 | 2 | 3 | 4 | 5>(4);

// UI shows version tabs: v1 | v2 | v3 | v4 | v5
// Users can switch between different UIs ❌ DEBUG CODE
```

### After
```typescript
// ExploreRecipesScreenSupabase.tsx
// Clean v4 "Smart Sections" implementation
// No version switcher ✅
// Professional, single UI experience ✅
```

---

## ⚠️ Rollback Plan

If anything breaks:

**Quick Rollback:**
```bash
# Restore switcher version
cp archived/DEPRECATED_ExploreRecipesScreenSupabase_SWITCHER.tsx → ExploreRecipesScreenSupabase.tsx

# Restore version files (if imports fail)
cp archived/DEPRECATED_ExploreRecipesScreen_v4_SmartSections.tsx → ExploreRecipesScreen.v4.tsx
```

---

## 📌 Notes

**Why Not Delete?**
- Design experiments may be valuable for future reference
- Easy to restore if a design decision needs to be reconsidered
- Git history alone may not preserve all context (comments, structure)
- Archived files serve as documentation of design iterations

**Naming Convention:**
- `DEPRECATED_` prefix makes it impossible to accidentally import
- Descriptive suffixes help identify what each version was for
- TypeScript will error if someone tries to import a DEPRECATED_ file

---

## ✅ Completion Checklist

- [ ] Phase 1: Archive recipe screen versions (7 files)
- [ ] Phase 2: Archive profile screen old version (1 file)
- [ ] Phase 3: Verify no broken imports
- [ ] Phase 4: TypeScript compilation passes
- [ ] Phase 5: Manual app testing (recipe tab, profile tab)
- [ ] Phase 6: Commit changes with clear message

**Estimated Time:** 30-45 minutes
**Risk Level:** Low (easy rollback, no deletions)
**Impact:** Cleaner codebase, professional UI, easier maintenance

---

## 🚀 Ready to Execute

All analysis complete. Proceed with Phase 1 when ready.
