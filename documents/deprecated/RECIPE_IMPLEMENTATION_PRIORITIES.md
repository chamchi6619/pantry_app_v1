# Recipe Feature: Implementation Priorities & Roadmap

**Date**: 2025-01-02
**Status**: ✅ READY FOR EXECUTION
**Timeline**: 4 weeks to MVP

---

## 🎯 CURRENT STATE ANALYSIS

### What You Have ✅
```
✅ Matching infrastructure (matchJobStore.ts)
✅ Simple matcher (simpleMatcher.ts)
✅ Ingredient normalizer (normalizer.ts)
✅ Recipe scorer (recipeScorer.ts)
✅ Shopping list merger (shoppingListMerger.ts)
✅ Recipe UI components (ExploreRecipesScreen, RecipeDetailScreen)
✅ Database schema (recipes, recipe_ingredients tables)
```

### What's Missing ❌
```
❌ ZERO recipes in database (CRITICAL BLOCKER)
❌ Canonical ingredient list (125-item foundation)
❌ Expiration-based scoring (promised but not implemented)
❌ Performance optimizations (re-matching, memory, renders)
❌ Recipe import feature (user customization)
```

### Key Dependencies
```
Database (recipes) ──→ Matching ──→ UI Display
         ↑                ↑
    Canonical List    Scoring Algorithm
```

**Critical Path**: Can't test matching without recipes. Can't validate UX without real data.

---

## 📊 PRIORITY MATRIX

### P0 - BLOCKERS (Must Have for MVP)
**Impact**: 🔴 HIGH | **Effort**: Varies | **Timeline**: Week 1-2

1. **Recipe Database Population**
   - Without this, NOTHING works
   - Target: 500 curated recipes minimum

2. **Performance Fixes**
   - Re-matching kills battery
   - Memory leaks crash app
   - Must fix before user testing

### P1 - CORE VALUE (Killer Features)
**Impact**: 🔴 HIGH | **Effort**: Medium | **Timeline**: Week 2-3

3. **Expiration Intelligence**
   - This is your MOAT
   - What sets you apart

4. **Match Quality**
   - Canonical ingredients
   - Accurate matching
   - User trust depends on this

### P2 - ENHANCEMENT (Nice to Have)
**Impact**: 🟡 MEDIUM | **Effort**: Low-Medium | **Timeline**: Week 3-4

5. **Recipe Import**
   - User customization
   - Infinite variety

6. **UI Polish**
   - Animations
   - Visual refinements

---

## 🚀 IMPLEMENTATION ROADMAP

---

## **WEEK 1: FOUNDATION - Make It Work**

**Goal**: Get recipes in database, fix critical performance issues

### Day 1-2: Recipe Data (P0 - BLOCKER)

**Priority**: 🔴 CRITICAL - Nothing works without this

#### Task 1.1: Choose Recipe Source
```bash
# Option A: Edamam API (fastest for MVP)
# - 10k free calls/month
# - Structured data
# - Good for 500 recipes

# Option B: RecipeNLG Dataset
# - 2M CC0 recipes
# - Pre-parsed ingredients
# - Requires filtering/cleaning

# DECISION: Start with Edamam (faster), add RecipeNLG later
```

**Deliverable**: Script to fetch 500 recipes
```typescript
// scripts/ingestRecipes.ts
async function ingestFromEdamam() {
  // Fetch top 500 recipes covering:
  // - 100 chicken dishes
  // - 100 pasta/rice
  // - 100 quick meals (<30 min)
  // - 100 vegetarian
  // - 100 common pantry items

  // Insert into Supabase
  for (const recipe of recipes) {
    await supabase.from('recipes').insert({
      title: recipe.label,
      prep_time_minutes: extractPrepTime(recipe),
      cook_time_minutes: extractCookTime(recipe),
      ingredients: recipe.ingredients,
      // ... etc
    });
  }
}
```

**Success Metric**: 500 recipes in `recipes` table

---

#### Task 1.2: Canonical Ingredient List (P1)

**Priority**: 🔴 HIGH - Match quality depends on this

**Deliverable**: Create canonical mapping
```typescript
// data/canonicalIngredients.ts
export const CANONICAL_INGREDIENTS = {
  // Proteins (15)
  "chicken_breast": {
    id: "chicken_breast",
    aliases: ["boneless chicken", "chicken cutlet", "chicken fillet"],
    category: "poultry",
    prep: "raw"
  },
  "rotisserie_chicken": {
    id: "rotisserie_chicken",
    aliases: ["cooked chicken", "roasted chicken"],
    category: "poultry",
    prep: "cooked"
  },

  // Vegetables (30)
  "bell_pepper": {
    id: "bell_pepper",
    aliases: ["green pepper", "red pepper", "sweet pepper"],
    category: "produce"
  },

  // ... 125 total items
};

// Insert into Supabase
async function seedCanonical() {
  for (const [key, value] of Object.entries(CANONICAL_INGREDIENTS)) {
    await supabase.from('canonical_items').insert({
      canonical_name: key,
      aliases: value.aliases,
      category: value.category
    });
  }
}
```

**Success Metric**: 125 canonical items in database

---

### Day 3-4: Performance Fixes (P0 - BLOCKER)

**Priority**: 🔴 CRITICAL - App unusable without these

#### Task 1.3: Fix Re-matching Performance

**Problem**: Triggers on every pantry change (90% unnecessary)

```typescript
// BEFORE (current - BAD)
useEffect(() => {
  startJob(recipes, items, invVersion);
}, [items]); // Triggers even on quantity changes

// AFTER (optimized - GOOD)
const pantryFingerprint = useMemo(() =>
  items
    .map(i => i.normalized_name)
    .sort()
    .join('|'),
  [items]
);

useEffect(() => {
  if (pantryFingerprint === prevFingerprint) return;

  const debounced = setTimeout(() => {
    startJob(recipes, items, invVersion);
  }, 500);

  return () => clearTimeout(debounced);
}, [pantryFingerprint]);
```

**Impact**: 90% reduction in match operations

---

#### Task 1.4: Fix N+1 Query Problem

**Problem**: Separate query for each recipe's ingredients

```typescript
// BEFORE (BAD - N+1 queries)
const recipes = await supabase.from('recipes').select('*');
for (const recipe of recipes) {
  const ingredients = await supabase
    .from('recipe_ingredients')
    .select('*')
    .eq('recipe_id', recipe.id);
}

// AFTER (GOOD - Single query with join)
const { data } = await supabase
  .from('recipes')
  .select(`
    *,
    recipe_ingredients (
      ingredient_name,
      amount,
      unit,
      normalized_name
    )
  `)
  .limit(500);
```

**Impact**: 99% reduction in database calls

---

#### Task 1.5: Add FlashList Pagination

**Problem**: Loading all 500 recipes into memory

```typescript
// BEFORE (BAD - loads all)
const recipes = await supabase.from('recipes').select('*');

// AFTER (GOOD - paginated)
import { FlashList } from '@shopify/flash-list';

const RecipeList = () => {
  const [page, setPage] = useState(0);

  const { data } = useQuery(
    ['recipes', page],
    () => supabase
      .from('recipes')
      .select('*')
      .range(page * 20, (page + 1) * 20 - 1)
  );

  return (
    <FlashList
      data={data}
      renderItem={({ item }) => <RecipeCard recipe={item} />}
      estimatedItemSize={200}
      onEndReached={() => setPage(p => p + 1)}
    />
  );
};
```

**Impact**: 96% memory reduction

---

### Day 5: Testing & Validation

**Deliverable**: Test with real pantry data

```bash
# Test scenarios
1. Load 500 recipes → measure load time (<2s target)
2. Match against 20-item pantry → measure accuracy (>80% target)
3. Change 1 pantry item → verify no re-match (debounced)
4. Scroll recipe list → measure FPS (60fps target)
5. Memory usage → measure (<50MB target)
```

**Success Metrics**:
- ✅ 500 recipes loaded
- ✅ <2s load time
- ✅ 80%+ match accuracy
- ✅ Debouncing works (90% fewer matches)
- ✅ 60fps scrolling
- ✅ <50MB memory

---

## **WEEK 2: CORE VALUE - Make It Smart**

**Goal**: Add expiration intelligence (your killer feature)

### Day 6-7: Expiration Scoring (P1 - CORE)

**Priority**: 🔴 HIGH - This is your moat

#### Task 2.1: Implement Urgency Scoring

```typescript
// recipeScorer.ts
interface RecipeScore {
  baseMatch: number;        // 0-100 (% match)
  urgencyBonus: number;     // 0-50 (expiring points)
  diversityBonus: number;   // 0-10 (multi-location)
  totalScore: number;
  urgencyIngredients: {
    name: string;
    daysLeft: number;
    points: number;
  }[];
}

function scoreRecipeWithUrgency(
  recipe: Recipe,
  pantry: PantryItem[]
): RecipeScore {
  // 1. Base matching
  const matched = matchIngredientsToRecipe(recipe, pantry);
  const baseMatch = (matched.length / recipe.ingredients.length) * 100;

  // 2. Urgency calculation
  let urgencyBonus = 0;
  const urgencyIngredients = [];

  for (const ing of matched) {
    const pantryItem = pantry.find(p => matches(p, ing));
    if (!pantryItem?.expiry_date) continue;

    const daysLeft = getDaysUntil(pantryItem.expiry_date);
    let points = 0;

    if (daysLeft <= 0) points = 50;      // EXPIRED
    else if (daysLeft === 1) points = 40; // Tomorrow
    else if (daysLeft === 2) points = 30; // 2 days
    else if (daysLeft <= 7) points = 10;  // This week

    urgencyBonus += points;
    urgencyIngredients.push({
      name: pantryItem.name,
      daysLeft,
      points
    });
  }

  urgencyBonus = Math.min(urgencyBonus, 50); // Cap at 50

  // 3. Diversity bonus (uses multiple locations)
  const locations = new Set(matched.map(m =>
    pantry.find(p => matches(p, m))?.location
  ));
  const diversityBonus = locations.size * 3;

  return {
    baseMatch,
    urgencyBonus,
    diversityBonus,
    totalScore: baseMatch + urgencyBonus + diversityBonus,
    urgencyIngredients
  };
}
```

---

#### Task 2.2: Visual Hierarchy in Recipe List

```tsx
// ExploreRecipesScreen.tsx - Updated
const RecipeListScreen = () => {
  const recipes = useRecipes();
  const pantry = usePantryItems();

  // Score and group
  const { urgent, soon, general } = useMemo(() => {
    const scored = recipes.map(r =>
      scoreRecipeWithUrgency(r, pantry)
    );

    return {
      urgent: scored.filter(r =>
        r.urgencyIngredients.some(i => i.daysLeft <= 2)
      ),
      soon: scored.filter(r =>
        r.urgencyIngredients.some(i => i.daysLeft <= 7 && i.daysLeft > 2)
      ),
      general: scored.filter(r =>
        r.urgencyIngredients.length === 0
      )
    };
  }, [recipes, pantry]);

  return (
    <ScrollView>
      {/* URGENT Section */}
      {urgent.length > 0 && (
        <View style={styles.urgentSection}>
          <SectionHeader
            title="🚨 URGENT: Use Today"
            bgColor="#FEE2E2"
          />
          {urgent.map(recipe => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              urgencyBadge={<UrgentBadge />}
            />
          ))}
        </View>
      )}

      {/* SOON Section */}
      {soon.length > 0 && (
        <View style={styles.soonSection}>
          <SectionHeader title="⏰ USE THIS WEEK" />
          {soon.map(recipe => <RecipeCard ... />)}
        </View>
      )}

      {/* GENERAL Section */}
      <View style={styles.generalSection}>
        <SectionHeader title="📦 FROM YOUR PANTRY" />
        {general.map(recipe => <RecipeCard ... />)}
      </View>
    </ScrollView>
  );
};
```

---

#### Task 2.3: Inventory Auto-Sort by Expiry

```typescript
// inventoryStore.ts
const sortItemsByExpiry = (items: PantryItem[]) => {
  return items.sort((a, b) => {
    // 1. Sort by location first
    const locationOrder = { fridge: 0, freezer: 1, pantry: 2 };
    const locDiff = locationOrder[a.location] - locationOrder[b.location];
    if (locDiff !== 0) return locDiff;

    // 2. Within location, sort by expiry
    if (!a.expiry_date) return 1;  // No expiry to bottom
    if (!b.expiry_date) return -1;

    return new Date(a.expiry_date).getTime() -
           new Date(b.expiry_date).getTime();
  });
};

// Apply in InventoryScreen
const sortedItems = useMemo(() =>
  sortItemsByExpiry(items),
  [items]
);
```

**Visual indicators**:
```tsx
const getExpiryColor = (daysLeft: number) => {
  if (daysLeft <= 2) return '#DC2626'; // Red
  if (daysLeft <= 7) return '#F59E0B'; // Amber
  return '#10B981'; // Green
};

<View style={styles.itemRow}>
  <View style={[styles.expiryDot, {
    backgroundColor: getExpiryColor(daysLeft)
  }]} />
  <Text>{item.name}</Text>
</View>
```

---

### Day 8-9: Match Quality Improvements (P1)

#### Task 2.4: Enhanced Matching Algorithm

**Upgrade from simple string matching to hybrid approach**

```typescript
// ingredientMatcher.ts (enhanced)
class HybridIngredientMatcher {
  match(userItem: string, recipeItem: string): MatchResult {
    // 1. Normalize both
    const userNorm = this.normalize(userItem);
    const recipeNorm = this.normalize(recipeItem);

    // 2. Try canonical exact match
    const userCanonical = CANONICAL_MAP[userNorm];
    const recipeCanonical = CANONICAL_MAP[recipeNorm];

    if (userCanonical && recipeCanonical) {
      if (userCanonical.id === recipeCanonical.id) {
        // Check prep state if available
        if (userCanonical.prep && recipeCanonical.prep) {
          if (userCanonical.prep === recipeCanonical.prep) {
            return { match: true, score: 100, reason: 'exact' };
          }
          return { match: true, score: 70, reason: 'category_match' };
        }
        return { match: true, score: 95, reason: 'canonical' };
      }
    }

    // 3. Fuzzy fallback (Levenshtein)
    const similarity = this.levenshtein(userNorm, recipeNorm);
    if (similarity > 0.75) {
      return { match: true, score: similarity * 100, reason: 'fuzzy' };
    }

    return { match: false, score: 0, reason: 'no_match' };
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/^(hellmanns|kraft|philadelphia|organic|fresh)/i, '') // Remove brands
      .trim();
  }

  private levenshtein(a: string, b: string): number {
    // Levenshtein distance implementation
    // ...
  }
}
```

---

#### Task 2.5: Add Match Explainability

**Show users WHY recipes match**

```tsx
// RecipeCard.tsx
<RecipeCard recipe={recipe}>
  <MatchBreakdown>
    <Text>✅ You have: {matched.join(', ')}</Text>
    <Text>❌ Missing: {missing.join(', ')}</Text>
    {hasExpiring && (
      <Text style={styles.urgent}>
        ⚠️ Uses expiring: {expiring.join(', ')}
      </Text>
    )}
  </MatchBreakdown>
</RecipeCard>
```

---

### Day 10: Integration & Testing

**Test expiration features end-to-end**

```bash
# Test Scenarios
1. Add item expiring tomorrow → Should appear in URGENT
2. Add item expiring in 5 days → Should appear in SOON
3. Cook urgent recipe → Item removed, waste prevented
4. Verify scoring: Recipe with 2 expiring items > 1 expiring item
5. Test sort: Fridge items sorted by expiry within section
```

**Success Metrics**:
- ✅ Urgent recipes surface correctly
- ✅ Scoring prioritizes expiring ingredients
- ✅ Auto-sort works in inventory
- ✅ Match explainability clear to users

---

## **WEEK 3: ENHANCEMENT - Make It Flexible**

**Goal**: Add recipe import, polish UX

### Day 11-12: Recipe Import Feature (P2)

**Priority**: 🟡 MEDIUM - Nice to have, not blocker

#### Task 3.1: URL Parser

```typescript
// services/recipeImporter.ts
async function parseRecipeFromURL(url: string): Promise<Recipe> {
  // 1. Fetch HTML
  const response = await fetch(url);
  const html = await response.text();

  // 2. Try Schema.org JSON-LD
  const jsonLdMatch = html.match(
    /<script type="application\/ld\+json">(.*?)<\/script>/s
  );

  if (jsonLdMatch) {
    const data = JSON.parse(jsonLdMatch[1]);
    return {
      name: data.name,
      description: data.description,
      prepTime: parseDuration(data.prepTime),
      ingredients: data.recipeIngredient.map(text => ({
        recipeText: text,
        parsed: parseIngredientText(text)
      })),
      instructions: data.recipeInstructions.map(s => s.text)
    };
  }

  // 3. Fallback to DOM scraping
  return scrapeRecipeFromDOM(html);
}
```

---

#### Task 3.2: Import UI

```tsx
// ImportRecipeScreen.tsx
const ImportRecipeScreen = () => {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<Recipe | null>(null);

  const handleImport = async () => {
    const recipe = await parseRecipeFromURL(url);
    setPreview(recipe);
  };

  const handleSave = async () => {
    await supabase.from('recipes').insert({
      title: preview.name,
      ingredients: preview.ingredients,
      source: 'imported',
      source_url: url,
      created_by: userId
    });

    Alert.alert('Success', 'Recipe saved!');
  };

  return (
    <View>
      <TextInput
        placeholder="Paste recipe URL"
        value={url}
        onChangeText={setUrl}
      />
      <Button title="Import" onPress={handleImport} />

      {preview && (
        <RecipePreview recipe={preview}>
          <Button title="Save" onPress={handleSave} />
        </RecipePreview>
      )}
    </View>
  );
};
```

---

### Day 13-14: UI Polish (P2)

#### Task 3.3: Animations & Transitions

```typescript
// Smooth recipe card animations
import Animated, { FadeIn, SlideInRight } from 'react-native-reanimated';

<Animated.View entering={FadeIn.duration(300)}>
  <RecipeCard recipe={recipe} />
</Animated.View>
```

#### Task 3.4: Image Optimization

```tsx
import FastImage from 'react-native-fast-image';

<FastImage
  source={{
    uri: recipe.imageUrl,
    priority: FastImage.priority.normal,
    cache: FastImage.cacheControl.immutable
  }}
  style={styles.recipeImage}
/>
```

---

### Day 15: Integration Testing

**Full feature validation**

```bash
# End-to-end tests
1. Browse 500 recipes → <2s load
2. Match pantry → 80%+ accuracy
3. Import URL → Parse correctly
4. Urgency scoring → Correct order
5. Memory stable → No leaks
```

---

## **WEEK 4: VALIDATION - Make It Production-Ready**

**Goal**: Test with real users, gather data, iterate

### Day 16-18: User Testing

**Test with 10 real users (not test accounts)**

```bash
# Scenarios
1. New user with empty pantry
   - Should see empty state with CTA
   - Can they understand how to add items?

2. User with 20 items, 2 expiring
   - Do urgent recipes surface?
   - Do they cook one of them?
   - Does it prevent waste?

3. Power user with 50+ items
   - Performance still good?
   - Match accuracy acceptable?
   - Import feature useful?
```

**Data to collect**:
```sql
-- Match accuracy
SELECT
  AVG(CASE WHEN user_confirmed_match THEN 1 ELSE 0 END) as accuracy
FROM recipe_matches;

-- Urgency effectiveness
SELECT COUNT(*) as waste_prevented
FROM waste_prevention
WHERE recipe_id IS NOT NULL;

-- Feature adoption
SELECT
  COUNT(DISTINCT user_id) as importers
FROM recipes
WHERE source = 'imported';
```

---

### Day 19-20: Iterate Based on Data

**Common issues to fix**:

1. **Match accuracy <80%**
   - Add missing aliases to canonical list
   - Tune fuzzy matching threshold

2. **Users confused by urgency**
   - Improve visual hierarchy
   - Add onboarding tooltip

3. **Import parsing fails**
   - Add more site-specific parsers
   - Improve fallback logic

---

### Day 21: Launch Prep

#### Task 4.1: Performance Audit

```bash
# Metrics to verify
✅ Cold start: <2s
✅ Recipe load: <1s
✅ Match time: <200ms (500 recipes)
✅ Memory usage: <50MB
✅ FPS: 60fps during scroll
✅ Battery: <5% drain per hour of use
```

#### Task 4.2: Analytics Setup

```typescript
// Track key events
analytics.track('recipe_viewed', {
  recipe_id,
  match_pct,
  has_expiring
});

analytics.track('recipe_cooked', {
  recipe_id,
  prevented_waste: true,
  items_saved: ['chicken', 'broccoli']
});

analytics.track('recipe_imported', {
  source_url,
  parse_method: 'schema.org'
});
```

---

## 📊 DECISION RATIONALE

### Why This Order?

#### **Week 1: Foundation First**
**Rationale**: Can't test anything without data
- ❌ Wrong: Build UI first, add data later → wasted effort if matching doesn't work
- ✅ Right: Data + performance → validate → then enhance

**Risk if skipped**: Entire feature unusable

---

#### **Week 2: Core Value Next**
**Rationale**: Expiration is your moat, must nail it
- ❌ Wrong: Generic recipe browsing → just another recipe app
- ✅ Right: Waste prevention → unique value prop

**Risk if skipped**: No differentiation, users don't see value

---

#### **Week 3: Enhancement**
**Rationale**: Import is nice-to-have, not critical
- Can launch without it
- 500 curated recipes enough for MVP
- Import adds customization but not core value

**Risk if skipped**: Limited variety, but core works

---

#### **Week 4: Validation**
**Rationale**: Must validate with real users before scale
- Early feedback prevents waste
- Data-driven iteration better than guessing
- Fixes issues before they compound

**Risk if skipped**: Build wrong thing, waste months

---

## 🚨 RISKS & MITIGATION

### Risk 1: Recipe Quality Poor
**Impact**: HIGH | **Probability**: MEDIUM

**Mitigation**:
- Curate first 500 recipes manually
- Test against real pantries
- Iterate based on match accuracy data

---

### Risk 2: Performance Still Bad
**Impact**: HIGH | **Probability**: LOW

**Mitigation**:
- All major bottlenecks addressed Week 1
- Profiling during development
- Load testing before user rollout

---

### Risk 3: Users Don't Use Urgency Feature
**Impact**: HIGH | **Probability**: MEDIUM

**Mitigation**:
- Make it unmissable (red UI, top of screen)
- Push notifications for expiring items
- A/B test messaging

---

### Risk 4: Match Accuracy <80%
**Impact**: MEDIUM | **Probability**: MEDIUM

**Mitigation**:
- Canonical list covers 80% of common ingredients
- Fuzzy matching catches rest
- Continuous improvement via user feedback

---

## ✅ SUCCESS CRITERIA

### Week 1 Exit Criteria
- [ ] 500 recipes in database
- [ ] 125 canonical ingredients loaded
- [ ] <2s recipe load time
- [ ] 90% reduction in re-match operations
- [ ] 60fps scrolling

### Week 2 Exit Criteria
- [ ] Urgency scoring working (urgent > soon > general)
- [ ] Visual hierarchy clear (red urgent section)
- [ ] Inventory auto-sort by expiry
- [ ] 80%+ match accuracy
- [ ] Match explainability visible

### Week 3 Exit Criteria
- [ ] Recipe import working (Schema.org + fallback)
- [ ] UI animations smooth
- [ ] Images optimized
- [ ] All features integrated

### Week 4 Exit Criteria
- [ ] 10 user tests completed
- [ ] >80% match accuracy confirmed
- [ ] >30% of urgent recipes cooked
- [ ] Performance targets met
- [ ] Analytics tracking active

---

## 🎯 FINAL PRIORITY ORDER

```
1. ⚡ WEEK 1: DATA + PERFORMANCE (P0 Blockers)
   ├── Recipe ingestion (500 recipes)
   ├── Canonical ingredients (125 items)
   ├── Fix re-matching (fingerprinting)
   ├── Fix N+1 queries (joins)
   └── Add pagination (FlashList)

2. 🔥 WEEK 2: EXPIRATION INTELLIGENCE (P1 Core Value)
   ├── Urgency scoring algorithm
   ├── Visual hierarchy (urgent/soon/general)
   ├── Inventory auto-sort
   ├── Enhanced matching (hybrid)
   └── Match explainability

3. ✨ WEEK 3: CUSTOMIZATION (P2 Enhancement)
   ├── Recipe import (URL parser)
   ├── Import UI
   ├── Animations/transitions
   └── Image optimization

4. 🧪 WEEK 4: VALIDATION (Production Readiness)
   ├── User testing (10 users)
   ├── Data analysis
   ├── Iteration based on feedback
   └── Launch prep
```

---

## 📝 NEXT IMMEDIATE STEPS

### Tomorrow (Day 1):
1. ✅ Set up Edamam API credentials
2. ✅ Write recipe ingestion script
3. ✅ Run script, load 500 recipes
4. ✅ Verify in Supabase dashboard

### This Week:
1. ✅ Complete Week 1 tasks (foundation)
2. ✅ Daily progress check
3. ✅ Fix any blockers immediately

### Success Checkpoint (Friday):
- [ ] Can browse 500 recipes
- [ ] Matching works with real data
- [ ] Performance acceptable
- [ ] Ready to add expiration intelligence

---

**STATUS**: ✅ ROADMAP APPROVED
**OWNER**: [Your Team]
**REVIEWER**: [Review before starting each week]
**UPDATES**: Track progress in daily standups
