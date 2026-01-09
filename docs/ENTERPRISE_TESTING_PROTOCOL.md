# Enterprise-Grade Testing Protocol

**Version:** 1.0
**Date:** 2025-10-20
**Status:** Pre-Production Validation
**Goal:** Air-tight, production-grade functionality validation before design work

---

## Testing Philosophy

**Zero tolerance for:**
- Data corruption
- Race conditions
- Memory leaks
- Incorrect business logic
- Security vulnerabilities
- Performance degradation

**Success criteria:**
- All critical paths pass 100%
- No P0/P1 bugs in production code
- Performance meets or exceeds targets
- Security audit passes
- Data integrity validated

---

## Testing Levels

### Level 1: Unit Tests (Automated)
**Coverage Target:** 80%+ for business logic

### Level 2: Integration Tests (Automated)
**Coverage Target:** 100% for critical paths

### Level 3: End-to-End Tests (Manual + Automated)
**Coverage Target:** 100% for user flows

### Level 4: Performance Tests (Automated)
**Coverage Target:** All benchmarks met

### Level 5: Security Audit (Manual)
**Coverage Target:** Zero critical/high vulnerabilities

### Level 6: Data Integrity Tests (Automated + Manual)
**Coverage Target:** Zero data loss scenarios

---

## Critical Path Testing Matrix

| Component | Critical? | Test Coverage | Status |
|-----------|-----------|---------------|--------|
| **Authentication** | P0 | Unit + Integration + E2E | ⏳ Pending |
| **Canonical Database** | P0 | Unit + Integration + Performance | ⏳ Pending |
| **Recipe Extraction** | P0 | Unit + Integration + E2E | ⏳ Pending |
| **Ingredient Matching** | P0 | Unit + Performance | ⏳ Pending |
| **Recipe Recommendations** | P0 | Integration + Performance | ⏳ Pending |
| **Pantry Management** | P1 | Integration + E2E | ⏳ Pending |
| **Shopping List** | P1 | Integration + E2E | ⏳ Pending |
| **Deep Linking** | P1 | E2E | ⏳ Pending |
| **Data Sync** | P1 | Integration | ⏳ Pending |

---

## Phase 1: Database & Backend Validation

### 1.1 Canonical Items Database

**Objective:** Validate 1,236-item database integrity and performance

#### Test Suite: Database Integrity

```sql
-- Test 1: Verify total count
SELECT COUNT(*) as total FROM canonical_items;
-- Expected: 1236

-- Test 2: Check for duplicates
SELECT canonical_name, COUNT(*)
FROM canonical_items
GROUP BY canonical_name
HAVING COUNT(*) > 1;
-- Expected: 0 rows

-- Test 3: Verify all have categories
SELECT COUNT(*) FROM canonical_items WHERE category IS NULL;
-- Expected: 0

-- Test 4: Check alias format
SELECT canonical_name, aliases
FROM canonical_items
WHERE aliases IS NOT NULL AND array_length(aliases, 1) = 0;
-- Expected: 0 rows (no empty arrays)

-- Test 5: Verify indexes exist
SELECT tablename, indexname
FROM pg_indexes
WHERE tablename = 'canonical_items';
-- Expected: At least idx on canonical_name

-- Test 6: Category distribution
SELECT category, COUNT(*) as count
FROM canonical_items
GROUP BY category
ORDER BY count DESC;
-- Verify: Top category is condiments (237 items)

-- Test 7: Alias coverage
SELECT
  COUNT(*) as total_items,
  COUNT(CASE WHEN aliases IS NOT NULL AND array_length(aliases, 1) > 0 THEN 1 END) as items_with_aliases,
  ROUND(COUNT(CASE WHEN aliases IS NOT NULL AND array_length(aliases, 1) > 0 THEN 1 END)::numeric / COUNT(*) * 100, 2) as pct_with_aliases
FROM canonical_items;
-- Expected: ~60%+ have aliases
```

**Pass Criteria:**
- ✅ All 7 queries return expected results
- ✅ Zero data integrity issues
- ✅ All indexes present

---

#### Test Suite: Matching Algorithm Performance

**Test file:** `pantry-app/src/services/__tests__/canonicalMatcher.test.ts`

```typescript
import { findMatch } from '../canonicalMatcher';

describe('Canonical Matcher - Performance', () => {
  let canonicalItems: CanonicalItem[];

  beforeAll(async () => {
    // Load all 1,236 items
    canonicalItems = await loadCanonicalItems();
  });

  test('Exact match performance < 1ms', () => {
    const start = performance.now();
    const result = findMatch('chicken', canonicalItems);
    const duration = performance.now() - start;

    expect(result).toBeTruthy();
    expect(result.canonical_item_id).toBeDefined();
    expect(duration).toBeLessThan(1); // < 1ms
  });

  test('Fuzzy match performance < 5ms', () => {
    const start = performance.now();
    const result = findMatch('organic whole chicken breast', canonicalItems);
    const duration = performance.now() - start;

    expect(result).toBeTruthy();
    expect(duration).toBeLessThan(5); // < 5ms
  });

  test('Batch matching 100 items < 100ms', () => {
    const testItems = [
      'chicken', 'beef', 'pork', 'tomatoes', 'onions',
      // ... 95 more items
    ];

    const start = performance.now();
    const results = testItems.map(item => findMatch(item, canonicalItems));
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100); // < 100ms for 100 items
  });
});
```

**Pass Criteria:**
- ✅ Exact match: <1ms
- ✅ Fuzzy match: <5ms
- ✅ Batch 100: <100ms
- ✅ Match rate: ≥95%

---

#### Test Suite: Matching Accuracy

```typescript
describe('Canonical Matcher - Accuracy', () => {
  const testCases = [
    // Exact matches
    { input: 'chicken', expected: 'chicken', confidence: 'exact' },
    { input: 'tomato', expected: 'tomato', confidence: 'exact' },

    // Alias matches
    { input: 'eggplant', expected: 'aubergine', confidence: 'alias' },
    { input: 'cilantro', expected: 'coriander', confidence: 'alias' },
    { input: 'scallions', expected: 'green onion', confidence: 'alias' },

    // Plural/singular
    { input: 'tomatoes', expected: 'tomato', confidence: 'fuzzy' },
    { input: 'chickens', expected: 'chicken', confidence: 'fuzzy' },

    // Contains match
    { input: 'organic chicken breast', expected: 'chicken', confidence: 'fuzzy' },
    { input: 'low-fat milk', expected: 'milk', confidence: 'fuzzy' },

    // Typos (Levenshtein)
    { input: 'chiken', expected: 'chicken', confidence: 'fuzzy' },
    { input: 'tomatoe', expected: 'tomato', confidence: 'fuzzy' },

    // Multi-language
    { input: 'aubergine', expected: 'aubergine', confidence: 'exact' },
    { input: 'courgette', expected: 'zucchini', confidence: 'alias' },

    // Edge cases
    { input: '', expected: null, confidence: 'none' },
    { input: 'xyz123notreal', expected: null, confidence: 'none' },
  ];

  testCases.forEach(({ input, expected, confidence }) => {
    test(`Match "${input}" → "${expected}" (${confidence})`, () => {
      const result = findMatch(input, canonicalItems);

      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).toBeTruthy();
        expect(result.matched_name).toBe(expected);
        expect(result.confidence).toBe(confidence);
      }
    });
  });
});
```

**Pass Criteria:**
- ✅ All test cases pass
- ✅ Match accuracy: 95%+
- ✅ Zero false positives

---

### 1.2 Recipe Extraction & Canonical Linking

#### Test Suite: Social Media Extraction

**Test URLs:**
```javascript
const socialTestURLs = [
  {
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=qH__o17xHls',
    expectedIngredients: 10-15, // Varies by video
    costExpected: true, // Vision API costs money
  },
  {
    platform: 'instagram',
    url: 'https://www.instagram.com/p/SAMPLE/',
    expectedIngredients: 5-10,
    costExpected: true,
  },
  {
    platform: 'xiaohongshu',
    url: 'https://www.xiaohongshu.com/explore/644f0a200000000013030186',
    expectedIngredients: 8-12,
    costExpected: true,
  },
];
```

**Test Protocol:**
```typescript
describe('Social Media Recipe Extraction', () => {
  socialTestURLs.forEach(({ platform, url, expectedIngredients }) => {
    test(`Extract from ${platform}`, async () => {
      const result = await extractCookCard(url, userId, householdId);

      // Basic extraction
      expect(result.cookCard).toBeDefined();
      expect(result.cookCard.title).toBeTruthy();
      expect(result.cookCard.platform).toBe(platform);

      // Ingredients
      expect(result.ingredients.length).toBeGreaterThanOrEqual(expectedIngredients - 3);
      expect(result.ingredients.length).toBeLessThanOrEqual(expectedIngredients + 3);

      // Canonical linking
      const linkedIngredients = result.ingredients.filter(i => i.canonical_item_id);
      const linkRate = linkedIngredients.length / result.ingredients.length;
      expect(linkRate).toBeGreaterThanOrEqual(0.90); // 90%+ link rate

      // Database verification
      const { data: cookCard } = await supabase
        .from('cook_cards')
        .select('*, ingredients:cook_card_ingredients(*)')
        .eq('id', result.cookCard.id)
        .single();

      expect(cookCard).toBeDefined();
      expect(cookCard.ingredients.length).toBe(result.ingredients.length);
    }, 30000); // 30s timeout for video processing
  });
});
```

**Pass Criteria:**
- ✅ All platforms extract successfully
- ✅ Canonical link rate: ≥90%
- ✅ Data persisted correctly
- ✅ No extraction failures

---

#### Test Suite: Traditional Recipe Extraction

**Test URLs:**
```javascript
const traditionalTestURLs = [
  {
    site: 'NYT Cooking',
    url: 'https://cooking.nytimes.com/recipes/1027194-chicken-meatballs-with-yogurt-sauce',
    expectedIngredients: 12,
    costExpected: false, // Free schema.org
  },
  {
    site: 'Bon Appétit',
    url: 'https://www.bonappetit.com/recipe/basically-roasted-chicken',
    expectedIngredients: 8,
    costExpected: false,
  },
  {
    site: 'AllRecipes',
    url: 'https://www.allrecipes.com/recipe/8805/quick-and-easy-pizza-crust/',
    expectedIngredients: 6,
    costExpected: false,
  },
];
```

**Test Protocol:**
```typescript
describe('Traditional Recipe Extraction', () => {
  traditionalTestURLs.forEach(({ site, url, expectedIngredients }) => {
    test(`Extract from ${site}`, async () => {
      const result = await ingestTraditionalRecipe(url, userId, householdId);

      // Basic extraction
      expect(result.cookCard).toBeDefined();
      expect(result.cookCard.platform).toBe('traditional');
      expect(result.cookCard.extraction_cost_cents).toBe(0); // FREE

      // Ingredients
      expect(result.ingredients.length).toBeCloseTo(expectedIngredients, 2);

      // Canonical linking
      const linkedIngredients = result.ingredients.filter(i => i.canonical_item_id);
      const linkRate = linkedIngredients.length / result.ingredients.length;
      expect(linkRate).toBeGreaterThanOrEqual(0.85); // 85%+ for traditional

      // Cost verification
      expect(result.totalCostCents).toBe(0);
    });
  });
});
```

**Pass Criteria:**
- ✅ All sites extract successfully
- ✅ Extraction cost: $0.00
- ✅ Canonical link rate: ≥85%
- ✅ Platform field correct

---

### 1.3 Recommendation Engine

#### Test Suite: Pantry-to-Recipe Matching

```typescript
describe('Recommendation Engine', () => {
  let testPantry: PantryItem[];
  let testRecipes: CookCard[];

  beforeAll(async () => {
    // Setup test pantry
    testPantry = await createTestPantry([
      { name: 'chicken', canonical_item_id: 'chicken-id' },
      { name: 'rice', canonical_item_id: 'rice-id' },
      { name: 'soy sauce', canonical_item_id: 'soy-sauce-id' },
      { name: 'garlic', canonical_item_id: 'garlic-id' },
      { name: 'ginger', canonical_item_id: 'ginger-id' },
    ]);

    // Setup test recipes
    testRecipes = await createTestRecipes([
      {
        title: 'Chicken Stir Fry',
        ingredients: ['chicken', 'rice', 'soy sauce', 'garlic', 'ginger', 'bell peppers', 'onions'],
      },
      {
        title: 'Chicken Soup',
        ingredients: ['chicken', 'onions', 'carrots', 'celery'],
      },
      {
        title: 'Pasta Carbonara',
        ingredients: ['pasta', 'eggs', 'bacon', 'parmesan'],
      },
    ]);
  });

  test('Recommendation accuracy', async () => {
    const recommendations = await getPersonalizedRecommendations(
      userId,
      householdId,
      10
    );

    // Should have recommendations
    expect(recommendations.length).toBeGreaterThan(0);

    // Top recommendation should be Chicken Stir Fry (5/7 = 71% match)
    expect(recommendations[0].cook_card.title).toBe('Chicken Stir Fry');
    expect(recommendations[0].completeness).toBeCloseTo(0.71, 1);

    // Second should be Chicken Soup (1/4 = 25% match)
    expect(recommendations[1].cook_card.title).toBe('Chicken Soup');

    // Pasta should not appear (0% match)
    expect(recommendations.find(r => r.cook_card.title === 'Pasta Carbonara')).toBeUndefined();
  });

  test('Performance: <100ms for 50 recipes', async () => {
    const start = performance.now();
    const recommendations = await getPersonalizedRecommendations(
      userId,
      householdId,
      50
    );
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100);
  });

  test('Missing ingredients list accuracy', async () => {
    const recommendations = await getPersonalizedRecommendations(
      userId,
      householdId,
      1
    );

    const chickenStirFry = recommendations[0];
    expect(chickenStirFry.missing_ingredients).toHaveLength(2);
    expect(chickenStirFry.missing_ingredients.map(i => i.ingredient_name)).toContain('bell peppers');
    expect(chickenStirFry.missing_ingredients.map(i => i.ingredient_name)).toContain('onions');
  });
});
```

**Pass Criteria:**
- ✅ Recommendations sorted by match %
- ✅ Missing ingredients accurate
- ✅ Performance: <100ms
- ✅ Zero recipes with 0% match

---

## Phase 2: Frontend & Integration Testing

### 2.1 Deep Linking & Share Handling

#### Test Suite: URL Parsing

```typescript
describe('Deep Link Handling', () => {
  const testURLs = [
    // Social media
    { url: 'https://youtube.com/watch?v=abc', platform: 'youtube', type: 'social' },
    { url: 'https://instagram.com/p/abc/', platform: 'instagram', type: 'social' },
    { url: 'https://tiktok.com/@user/video/123', platform: 'tiktok', type: 'social' },

    // Traditional sites
    { url: 'https://cooking.nytimes.com/recipes/123-chicken', platform: 'traditional', type: 'traditional' },
    { url: 'https://allrecipes.com/recipe/123/pizza/', platform: 'traditional', type: 'traditional' },

    // Edge cases
    { url: 'https://youtube.com/playlist?list=abc', platform: null, type: null }, // Not supported
    { url: 'not-a-url', platform: null, type: null },
  ];

  testURLs.forEach(({ url, platform, type }) => {
    test(`Parse "${url}"`, () => {
      const result = parseRecipeURL(url);
      expect(result.platform).toBe(platform);
      expect(result.type).toBe(type);
    });
  });
});
```

#### Test Suite: Share Intent Handling

```typescript
describe('Share Intent Flow', () => {
  test('Handle YouTube share from iOS', async () => {
    const shareURL = 'https://youtu.be/qH__o17xHls';

    // Simulate share intent
    await handleShareIntent(shareURL);

    // Should navigate to extraction screen
    expect(navigationSpy).toHaveBeenCalledWith('ShareHandler', { url: shareURL });

    // Should extract recipe
    const cookCards = await getCookCards(userId);
    expect(cookCards.some(c => c.platform === 'youtube')).toBe(true);
  });

  test('Handle paste from clipboard', async () => {
    // Copy URL to clipboard
    await Clipboard.setString('https://cooking.nytimes.com/recipes/123-test');

    // User navigates to browse screen
    await navigateTo('BrowsePlatforms');

    // Should detect clipboard URL
    expect(clipboardDetected).toBe(true);

    // User taps "Paste Link"
    await tapPasteLink();

    // Should extract traditional recipe
    const cookCards = await getCookCards(userId);
    expect(cookCards.some(c => c.platform === 'traditional')).toBe(true);
  });
});
```

**Pass Criteria:**
- ✅ All URL types route correctly
- ✅ Share intents work on iOS/Android
- ✅ Clipboard detection works
- ✅ No crashes on invalid URLs

---

### 2.2 CookCard Display & Data Integrity

#### Test Suite: CookCard Screen

```typescript
describe('CookCard Screen', () => {
  let testCookCard: CookCard;

  beforeAll(async () => {
    testCookCard = await createTestCookCard({
      title: 'Test Chicken Recipe',
      platform: 'youtube',
      ingredients: [
        { ingredient_name: 'chicken', amount: 2, unit: 'lbs', canonical_item_id: 'chicken-id' },
        { ingredient_name: 'soy sauce', amount: 0.25, unit: 'cup', canonical_item_id: 'soy-sauce-id' },
      ],
      instructions: ['Step 1', 'Step 2', 'Step 3'],
    });
  });

  test('Displays all fields correctly', () => {
    render(<CookCardScreen cookCardId={testCookCard.id} />);

    expect(screen.getByText('Test Chicken Recipe')).toBeTruthy();
    expect(screen.getByText('2 lbs chicken')).toBeTruthy();
    expect(screen.getByText('0.25 cup soy sauce')).toBeTruthy();
    expect(screen.getByText('Step 1')).toBeTruthy();
  });

  test('Ingredients link to pantry', async () => {
    // Add chicken to pantry
    await addToPantry({ name: 'chicken', canonical_item_id: 'chicken-id' });

    render(<CookCardScreen cookCardId={testCookCard.id} />);

    // Chicken should be highlighted/checked
    const chickenIngredient = screen.getByText('2 lbs chicken');
    expect(chickenIngredient).toHaveStyle({ textDecoration: 'line-through' }); // Or checkmark

    // Soy sauce should NOT be highlighted (not in pantry)
    const soySauceIngredient = screen.getByText('0.25 cup soy sauce');
    expect(soySauceIngredient).not.toHaveStyle({ textDecoration: 'line-through' });
  });

  test('Add missing ingredients to shopping list', async () => {
    render(<CookCardScreen cookCardId={testCookCard.id} />);

    // Tap "Add to Shopping List"
    fireEvent.press(screen.getByText('Add to Shopping List'));

    // Should add only missing ingredients
    const shoppingList = await getShoppingList(householdId);
    expect(shoppingList.some(i => i.name === 'soy sauce')).toBe(true);
    expect(shoppingList.some(i => i.name === 'chicken')).toBe(false); // Already in pantry
  });
});
```

**Pass Criteria:**
- ✅ All data displays correctly
- ✅ Pantry matching works
- ✅ Shopping list integration works
- ✅ No UI crashes

---

### 2.3 Saved Recipes Screen

#### Test Suite: Recipe Library

```typescript
describe('Saved Recipes Screen', () => {
  beforeAll(async () => {
    // Create 50 test recipes
    await createMultipleTestRecipes(50, {
      platforms: ['youtube', 'instagram', 'traditional'],
      dateRange: { start: '2024-01-01', end: '2024-10-20' },
    });
  });

  test('Display all saved recipes', () => {
    render(<SavedRecipesScreen />);

    const recipes = screen.getAllByTestId('recipe-card');
    expect(recipes.length).toBeGreaterThanOrEqual(50);
  });

  test('Filter by platform', () => {
    render(<SavedRecipesScreen />);

    // Filter to YouTube only
    fireEvent.press(screen.getByText('YouTube'));

    const recipes = screen.getAllByTestId('recipe-card');
    recipes.forEach(recipe => {
      expect(recipe).toHaveTextContent('youtube'); // Platform badge
    });
  });

  test('Search functionality', () => {
    render(<SavedRecipesScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Search recipes...'), 'chicken');

    const recipes = screen.getAllByTestId('recipe-card');
    recipes.forEach(recipe => {
      expect(recipe.props.title.toLowerCase()).toContain('chicken');
    });
  });

  test('Performance: Render 100 recipes < 2s', async () => {
    await createMultipleTestRecipes(100);

    const start = performance.now();
    render(<SavedRecipesScreen />);
    await waitFor(() => screen.getAllByTestId('recipe-card'));
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(2000); // < 2s
  });
});
```

**Pass Criteria:**
- ✅ All recipes display
- ✅ Filtering works
- ✅ Search works
- ✅ Performance: <2s for 100 items

---

## Phase 3: Data Integrity & Security

### 3.1 Database Constraints

```sql
-- Test 1: Unique constraints
INSERT INTO canonical_items (canonical_name, category)
VALUES ('chicken', 'protein');
-- Expected: ERROR (duplicate)

-- Test 2: Foreign key constraints
INSERT INTO cook_card_ingredients (cook_card_id, ingredient_name)
VALUES ('nonexistent-id', 'test');
-- Expected: ERROR (FK violation)

-- Test 3: Check constraints
INSERT INTO cook_cards (platform) VALUES ('invalid-platform');
-- Expected: ERROR (check constraint)

-- Test 4: NOT NULL constraints
INSERT INTO pantry_items (household_id) VALUES (NULL);
-- Expected: ERROR (NOT NULL)
```

**Pass Criteria:**
- ✅ All constraints enforced
- ✅ No invalid data in production

---

### 3.2 Row Level Security (RLS)

```typescript
describe('Row Level Security', () => {
  let user1: User;
  let user2: User;
  let household1: string;
  let household2: string;

  beforeAll(async () => {
    user1 = await createTestUser('user1@test.com');
    user2 = await createTestUser('user2@test.com');

    household1 = user1.household_id;
    household2 = user2.household_id;
  });

  test('User cannot access another household pantry', async () => {
    // User 1 adds item to their pantry
    await addToPantry({ name: 'secret item', household_id: household1 }, user1.token);

    // User 2 tries to query User 1's pantry
    const { data, error } = await supabase
      .from('pantry_items')
      .select('*')
      .eq('household_id', household1);

    expect(data).toEqual([]); // RLS should block
  });

  test('User cannot modify another household cook cards', async () => {
    // User 1 creates cook card
    const cookCard = await createCookCard({ title: 'Private Recipe' }, user1.token);

    // User 2 tries to update it
    const { error } = await supabase
      .from('cook_cards')
      .update({ title: 'Hacked!' })
      .eq('id', cookCard.id);

    expect(error).toBeTruthy(); // RLS should block
  });
});
```

**Pass Criteria:**
- ✅ RLS blocks cross-household access
- ✅ Zero data leakage
- ✅ All policies enforced

---

### 3.3 Data Migration & Backup

```typescript
describe('Data Integrity', () => {
  test('Canonical database migration idempotent', async () => {
    // Get count before
    const { count: before } = await supabase
      .from('canonical_items')
      .select('*', { count: 'exact', head: true });

    // Re-apply migrations (should be no-op)
    await applyMigrations(['014', '015', 'final_gap_fill']);

    // Get count after
    const { count: after } = await supabase
      .from('canonical_items')
      .select('*', { count: 'exact', head: true });

    expect(before).toBe(after); // No duplicates
    expect(after).toBe(1236);
  });

  test('No orphaned cook card ingredients', async () => {
    const { data: orphans } = await supabase
      .from('cook_card_ingredients')
      .select('id')
      .not('cook_card_id', 'in', supabase.from('cook_cards').select('id'));

    expect(orphans.length).toBe(0);
  });

  test('All cook cards have telemetry events', async () => {
    const { data: cookCards } = await supabase
      .from('cook_cards')
      .select('id');

    const { data: events } = await supabase
      .from('cook_card_ingress_events')
      .select('cook_card_id')
      .in('cook_card_id', cookCards.map(c => c.id));

    expect(events.length).toBe(cookCards.length);
  });
});
```

**Pass Criteria:**
- ✅ Migrations idempotent
- ✅ No orphaned records
- ✅ Referential integrity maintained

---

## Phase 4: Performance & Load Testing

### 4.1 API Performance Benchmarks

```typescript
describe('API Performance', () => {
  test('Recipe extraction < 10s', async () => {
    const urls = [
      'https://youtube.com/watch?v=qH__o17xHls',
      'https://cooking.nytimes.com/recipes/1027194-chicken-meatballs',
    ];

    for (const url of urls) {
      const start = performance.now();
      await extractRecipe(url, userId, householdId);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10000); // < 10s
    }
  });

  test('Recommendation engine < 500ms', async () => {
    const start = performance.now();
    await getPersonalizedRecommendations(userId, householdId, 50);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(500); // < 500ms
  });

  test('Canonical matching batch < 1s for 1000 items', async () => {
    const testItems = generateRandomIngredients(1000);

    const start = performance.now();
    const results = testItems.map(item => findMatch(item, canonicalItems));
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(1000); // < 1s
  });
});
```

**Pass Criteria:**
- ✅ All benchmarks met
- ✅ No performance regressions
- ✅ P95 latency acceptable

---

### 4.2 Load Testing

```typescript
describe('Concurrent Operations', () => {
  test('10 simultaneous extractions', async () => {
    const urls = Array(10).fill('https://youtube.com/watch?v=test');

    const promises = urls.map(url =>
      extractRecipe(url, userId, householdId)
    );

    const results = await Promise.all(promises);

    expect(results.filter(r => r.success).length).toBe(10);
  });

  test('100 simultaneous pantry updates', async () => {
    const updates = Array(100).fill(null).map((_, i) => ({
      name: `Item ${i}`,
      quantity: Math.random() * 10,
    }));

    const promises = updates.map(item => addToPantry(item));
    const results = await Promise.all(promises);

    expect(results.filter(r => r.success).length).toBe(100);
  });
});
```

**Pass Criteria:**
- ✅ No race conditions
- ✅ No deadlocks
- ✅ All operations succeed

---

## Phase 5: Error Handling & Edge Cases

### 5.1 Network Failures

```typescript
describe('Network Resilience', () => {
  test('Extraction fails gracefully on timeout', async () => {
    // Mock network timeout
    mockNetworkTimeout();

    const result = await extractRecipe('https://youtube.com/watch?v=test', userId, householdId);

    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
    expect(result.userMessage).toBeTruthy(); // User-friendly message
  });

  test('Retry logic works', async () => {
    let attempt = 0;
    mockNetworkIntermittent(() => attempt++ < 2); // Fail first 2 attempts

    const result = await extractRecipe('https://youtube.com/watch?v=test', userId, householdId);

    expect(result.success).toBe(true);
    expect(attempt).toBe(3); // Succeeded on 3rd attempt
  });

  test('Offline queue stores operations', async () => {
    mockOffline();

    await addToPantry({ name: 'offline item' });

    const queue = await getOfflineQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].operation).toBe('addToPantry');

    mockOnline();
    await syncOfflineQueue();

    const queueAfter = await getOfflineQueue();
    expect(queueAfter.length).toBe(0);
  });
});
```

**Pass Criteria:**
- ✅ Graceful error handling
- ✅ Retry logic works
- ✅ Offline queue functional

---

### 5.2 Invalid Data Handling

```typescript
describe('Invalid Input Handling', () => {
  test('Invalid URL rejected', async () => {
    const result = await extractRecipe('not-a-url', userId, householdId);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid URL');
  });

  test('Empty ingredient name rejected', async () => {
    const result = await addToPantry({ name: '', quantity: 1 });
    expect(result.success).toBe(false);
  });

  test('Negative quantity rejected', async () => {
    const result = await addToPantry({ name: 'test', quantity: -5 });
    expect(result.success).toBe(false);
  });

  test('SQL injection prevented', async () => {
    const malicious = "'; DROP TABLE pantry_items; --";
    const result = await addToPantry({ name: malicious });

    // Should be sanitized, not executed
    const { data: tables } = await supabase.rpc('get_tables');
    expect(tables.includes('pantry_items')).toBe(true); // Table still exists
  });
});
```

**Pass Criteria:**
- ✅ All invalid inputs rejected
- ✅ SQL injection prevented
- ✅ No crashes on edge cases

---

## Phase 6: Production Readiness Checklist

### Pre-Launch Validation

#### Critical Systems (P0)

- [ ] **Authentication**
  - [ ] Sign up works
  - [ ] Sign in works
  - [ ] Password reset works
  - [ ] Session persistence works
  - [ ] RLS enforced

- [ ] **Canonical Database**
  - [ ] 1,236 items verified
  - [ ] No duplicates
  - [ ] All categories assigned
  - [ ] Indexes present
  - [ ] Performance benchmarks met

- [ ] **Recipe Extraction**
  - [ ] YouTube extraction works
  - [ ] Instagram extraction works
  - [ ] Traditional sites work
  - [ ] Canonical linking ≥90%
  - [ ] Error handling graceful

- [ ] **Recommendation Engine**
  - [ ] Matches sorted correctly
  - [ ] Missing ingredients accurate
  - [ ] Performance <100ms
  - [ ] SQL function optimized

#### Important Systems (P1)

- [ ] **Deep Linking**
  - [ ] Share intents work
  - [ ] Clipboard detection works
  - [ ] URL routing correct

- [ ] **CookCard Display**
  - [ ] All fields render
  - [ ] Pantry integration works
  - [ ] Shopping list integration works

- [ ] **Saved Recipes**
  - [ ] All recipes display
  - [ ] Search works
  - [ ] Filters work
  - [ ] Performance acceptable

#### Data Integrity

- [ ] **Database Constraints**
  - [ ] Unique constraints enforced
  - [ ] FK constraints enforced
  - [ ] Check constraints enforced
  - [ ] NOT NULL enforced

- [ ] **Security**
  - [ ] RLS prevents cross-household access
  - [ ] SQL injection prevented
  - [ ] No sensitive data leaks

- [ ] **Backups**
  - [ ] Migrations idempotent
  - [ ] No orphaned records
  - [ ] Rollback tested

#### Performance

- [ ] **API Latency**
  - [ ] Extraction: <10s
  - [ ] Recommendations: <500ms
  - [ ] Matching: <1ms exact, <5ms fuzzy

- [ ] **UI Performance**
  - [ ] Recipe list: <2s for 100 items
  - [ ] CookCard render: <1s
  - [ ] No ANR (Application Not Responding)

#### Error Handling

- [ ] **Network Failures**
  - [ ] Timeout handling works
  - [ ] Retry logic works
  - [ ] Offline queue works

- [ ] **Invalid Input**
  - [ ] URL validation works
  - [ ] Form validation works
  - [ ] Edge cases handled

---

## Testing Execution Plan

### Week 1: Database & Backend
- **Day 1-2:** Canonical database integrity tests
- **Day 3-4:** Matching algorithm tests
- **Day 5:** Performance benchmarks

### Week 2: Recipe Extraction
- **Day 1-2:** Social media extraction tests
- **Day 3:** Traditional extraction tests
- **Day 4:** Canonical linking validation
- **Day 5:** Error handling tests

### Week 3: Frontend Integration
- **Day 1-2:** Deep linking tests
- **Day 3:** CookCard screen tests
- **Day 4:** Saved recipes tests
- **Day 5:** End-to-end flows

### Week 4: Security & Production
- **Day 1:** RLS testing
- **Day 2:** Data integrity tests
- **Day 3:** Load testing
- **Day 4:** Performance validation
- **Day 5:** Final checklist review

---

## Success Metrics

| Category | Metric | Target | Current |
|----------|--------|--------|---------|
| **Functionality** | Critical path pass rate | 100% | ⏳ Pending |
| **Performance** | API p95 latency | <500ms | ⏳ Pending |
| **Accuracy** | Canonical match rate | ≥95% | ⏳ Pending |
| **Security** | RLS violation rate | 0% | ⏳ Pending |
| **Reliability** | Crash-free rate | ≥99.9% | ⏳ Pending |

---

## Sign-Off Requirements

Before proceeding to design work, require sign-off from:

- [ ] **Engineering Lead** - All tests pass
- [ ] **QA Lead** - No P0/P1 bugs
- [ ] **Security Lead** - Security audit clean
- [ ] **Product Lead** - Business logic correct

---

**Status:** 🔴 **Testing Not Started**
**Next Action:** Begin Week 1 database testing
**Expected Completion:** 4 weeks from start
**Ready for Design:** ❌ Not ready until all tests pass
