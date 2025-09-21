# Recipes Feature Implementation Plan v4.0

## Executive Summary

This document outlines the implementation plan for the Pantry Pal recipes feature, designed to provide inventory-aware recipe suggestions with a focus on using up expiring ingredients. The system uses deterministic matching algorithms, safe unit conversions, and a comprehensive canonical ingredient database.

## Core Architecture

### 1. Canonical Ingredient System (125 items)

The foundation of the recipe matching system is a curated database of 125 canonical ingredients with their common aliases and conversion safety flags.

```json
{
  "chicken_breast": {
    "id": "chicken_breast",
    "displayName": "Chicken Breast",
    "category": "meat",
    "density": 1.03,
    "densityGroup": "meat",
    "safeConversions": true,
    "aliases": [
      "chicken breasts",
      "boneless chicken breast",
      "skinless chicken breast",
      "chicken cutlet",
      "chicken filet"
    ]
  },
  "all_purpose_flour": {
    "id": "all_purpose_flour",
    "displayName": "All-Purpose Flour",
    "category": "baking",
    "density": 0.593,
    "densityGroup": "dry",
    "safeConversions": false,
    "aliases": [
      "flour",
      "plain flour",
      "white flour",
      "ap flour",
      "regular flour"
    ]
  }
}
```

### Category Coverage (125 total):
- **Produce (30)**: Common vegetables, fruits, herbs
- **Meat/Fish (15)**: Chicken, beef, pork, fish, seafood
- **Dairy (12)**: Milk, cheeses, yogurt, butter
- **Grains (10)**: Rice, pasta, bread, oats
- **Baking (12)**: Flours, sugars, leavening
- **Condiments (15)**: Sauces, vinegars, oils
- **Spices (15)**: Common cooking spices
- **Canned (8)**: Tomatoes, beans, stocks
- **Nuts/Seeds (8)**: Common cooking nuts and seeds

## 2. Ingredient Parser

### Parser Specification

```typescript
interface ParsedIngredient {
  quantity: number | null;
  unit: string | null;
  ingredient: string;
  preparation?: string;
  original: string;
  confidence: number;
}

class IngredientParser {
  // Unicode fraction support
  private unicodeFractions = {
    '½': 0.5, '⅓': 0.333, '⅔': 0.667,
    '¼': 0.25, '¾': 0.75, '⅕': 0.2,
    '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
    '⅙': 0.167, '⅚': 0.833,
    '⅐': 0.143, '⅛': 0.125, '⅜': 0.375,
    '⅝': 0.625, '⅞': 0.875, '⅑': 0.111, '⅒': 0.1
  };

  parse(line: string): ParsedIngredient {
    // Pattern order (most specific to least)
    // 1. Range: "1-2 cups flour"
    // 2. Mixed number: "1 1/2 cups flour"
    // 3. Fraction: "1/2 cup flour"
    // 4. Unicode: "½ cup flour"
    // 5. Decimal: "1.5 cups flour"
    // 6. Whole: "2 cups flour"
    // 7. No quantity: "Salt to taste"

    // Extract preparation notes
    const prep = this.extractPreparation(line);

    // Normalize and extract core ingredient
    const normalized = this.normalizeIngredient(line);

    return {
      quantity: this.extractQuantity(line),
      unit: this.extractUnit(line),
      ingredient: normalized,
      preparation: prep,
      original: line,
      confidence: this.calculateConfidence(line)
    };
  }
}
```

### Supported Patterns

1. **Quantities**: Whole numbers, decimals, fractions, mixed numbers, ranges, Unicode fractions
2. **Units**: Standard (cup, tsp, tbsp, oz, lb, g, kg, ml, L), colloquial (pinch, dash, handful)
3. **Preparations**: chopped, diced, minced, sliced, grated, melted, room temperature
4. **Edge Cases**:
   - "Salt and pepper to taste"
   - "2 (14.5 oz) cans diced tomatoes"
   - "1 large onion, finely chopped"
   - "Juice of 1 lemon"

## 3. Deterministic Matching System

### Matching Pipeline

```typescript
interface MatchResult {
  canonicalId: string | null;
  confidence: number;
  matchReason: MatchReason;
  debugPath: string[];
}

enum MatchReason {
  EXACT = 'exact_match',
  ALIAS = 'alias_match',
  CATEGORY = 'category_match',
  FUZZY = 'fuzzy_match',
  NO_MATCH = 'no_match'
}

class IngredientMatcher {
  match(inventoryItem: string, recipeIngredient: string): MatchResult {
    // 1. Normalize both strings
    const normInv = this.normalize(inventoryItem);
    const normRecipe = this.normalize(recipeIngredient);

    // 2. Check exact canonical match
    if (this.isCanonical(normInv) && normInv === normRecipe) {
      return {
        canonicalId: normInv,
        confidence: 1.0,
        matchReason: MatchReason.EXACT,
        debugPath: [`exact: ${normInv}`]
      };
    }

    // 3. Check alias matches
    const aliasMatch = this.checkAliases(normInv, normRecipe);
    if (aliasMatch) {
      return {
        canonicalId: aliasMatch,
        confidence: 0.95,
        matchReason: MatchReason.ALIAS,
        debugPath: [`alias: ${normInv} → ${aliasMatch}`]
      };
    }

    // 4. Category-based fuzzy match
    const categoryMatch = this.checkCategoryMatch(normInv, normRecipe);
    if (categoryMatch && categoryMatch.confidence >= 0.85) {
      return {
        canonicalId: categoryMatch.id,
        confidence: categoryMatch.confidence,
        matchReason: MatchReason.CATEGORY,
        debugPath: [`category: ${categoryMatch.category}, L=${categoryMatch.score}`]
      };
    }

    // 5. Cross-category fuzzy (Levenshtein ≥ 0.85)
    const fuzzyMatch = this.fuzzyMatch(normInv, normRecipe);
    if (fuzzyMatch && fuzzyMatch.score >= 0.85) {
      return {
        canonicalId: fuzzyMatch.id,
        confidence: fuzzyMatch.score,
        matchReason: MatchReason.FUZZY,
        debugPath: [`fuzzy: L=${fuzzyMatch.score}`]
      };
    }

    return {
      canonicalId: null,
      confidence: 0,
      matchReason: MatchReason.NO_MATCH,
      debugPath: ['no_match']
    };
  }
}
```

### Match Priority Order
1. **Exact canonical match** (100% confidence)
2. **Alias match** (95% confidence)
3. **Category-constrained fuzzy** (85%+ Levenshtein)
4. **Cross-category fuzzy** (85%+ Levenshtein)
5. **No match** (0% confidence)

## 4. Unit Conversion System

### Safe Conversions

```typescript
interface UnitConversion {
  from: string;
  to: string;
  factor: number;
  requiresDensity: boolean;
  safeForDryGoods: boolean;
}

class UnitConverter {
  // Volume ↔ Weight conversions only when safe
  convert(
    quantity: number,
    fromUnit: string,
    toUnit: string,
    ingredient: CanonicalIngredient
  ): ConversionResult {
    // Direct conversions (tsp → tbsp, g → kg)
    if (this.hasDirectConversion(fromUnit, toUnit)) {
      return this.directConvert(quantity, fromUnit, toUnit);
    }

    // Density-based conversions
    if (this.requiresDensity(fromUnit, toUnit)) {
      // Check safety flag
      if (!ingredient.safeConversions) {
        return {
          success: false,
          reason: 'unsafe_conversion',
          message: `Cannot convert ${fromUnit} to ${toUnit} for ${ingredient.displayName}`
        };
      }

      return this.densityConvert(quantity, fromUnit, toUnit, ingredient.density);
    }

    return { success: false, reason: 'incompatible_units' };
  }
}
```

### Density Groups
- **Liquid** (1.0): Water, milk, oil (always safe)
- **Meat** (0.9-1.1): Chicken, beef, fish (safe with density)
- **Dry** (0.3-0.8): Flour, sugar, rice (NOT safe for cups↔grams)
- **Herbs** (0.2-0.4): Leafy herbs (NOT safe for volume↔weight)

## 5. Recipe Scoring Algorithm

### Use-It-Up Score

```typescript
interface RecipeScore {
  recipe: Recipe;
  totalScore: number;
  expiringScore: number;
  matchPercentage: number;
  missingIngredients: string[];
  expiringIngredients: InventoryItem[];
  debugInfo: {
    inventoryHash: string;
    matchedCount: number;
    totalRequired: number;
    expiringPoints: number;
    categoryWeights: Record<string, number>;
  };
}

class RecipeScorer {
  scoreRecipe(recipe: Recipe, inventory: InventoryItem[]): RecipeScore {
    // 1. Calculate inventory hash for caching
    const inventoryHash = this.hashInventory(inventory);

    // 2. Match ingredients
    const matches = this.matchAllIngredients(recipe, inventory);

    // 3. Calculate expiring bonus
    const expiringBonus = this.calculateExpiringBonus(matches, inventory);

    // 4. Apply category weights (externalized config)
    const categoryMultiplier = this.getCategoryWeight(recipe.category);

    // 5. Calculate final score
    const baseScore = matches.matchPercentage;
    const expiringScore = expiringBonus * 2; // Double weight for expiring
    const totalScore = (baseScore + expiringScore) * categoryMultiplier;

    return {
      recipe,
      totalScore,
      expiringScore,
      matchPercentage: matches.matchPercentage,
      missingIngredients: matches.missing,
      expiringIngredients: matches.expiring,
      debugInfo: {
        inventoryHash,
        matchedCount: matches.matched,
        totalRequired: recipe.ingredients.length,
        expiringPoints: expiringBonus,
        categoryWeights: this.config.categoryWeights
      }
    };
  }
}
```

### Expiration Tiers
- **Critical** (≤1 day): 10 points
- **Urgent** (2-3 days): 5 points
- **Soon** (4-7 days): 2 points
- **Later** (8+ days): 0 points

## 6. Cache Strategy

### Recipe Match Cache

```typescript
class RecipeMatchCache {
  private cache: Map<string, CachedResult> = new Map();
  private maxAge = 5 * 60 * 1000; // 5 minutes

  generateKey(recipeId: string, inventoryHash: string): string {
    return `${recipeId}:${inventoryHash}`;
  }

  hashInventory(items: InventoryItem[]): string {
    // Sort by ID for consistency
    const sorted = items
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(item => `${item.id}:${item.quantity}:${item.unit}`)
      .join('|');

    return this.simpleHash(sorted);
  }

  get(recipeId: string, inventory: InventoryItem[]): CachedResult | null {
    const hash = this.hashInventory(inventory);
    const key = this.generateKey(recipeId, hash);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.maxAge) {
      return cached;
    }

    return null;
  }
}
```

## 7. Shopping List Integration

### Smart Merge Logic

```typescript
class ShoppingListMerger {
  mergeRecipeIngredients(
    recipe: Recipe,
    inventory: InventoryItem[],
    existingList: ShoppingItem[]
  ): ShoppingItem[] {
    const needed = this.calculateNeeded(recipe, inventory);

    return needed.map(item => {
      // Use canonical ID for merging
      const existing = existingList.find(
        s => s.canonicalId === item.canonicalId
      );

      if (existing) {
        // Merge quantities (convert units if needed)
        const merged = this.mergeQuantities(existing, item);
        return {
          ...existing,
          quantity: merged.quantity,
          unit: merged.unit,
          notes: this.mergeNotes(existing.notes, `For: ${recipe.name}`)
        };
      }

      return {
        id: generateId(),
        name: item.displayName,
        canonicalId: item.canonicalId,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        notes: `For: ${recipe.name}`,
        checked: false
      };
    });
  }
}
```

## 8. QA Playbook

### Test Scenarios

#### A. Parser Tests
```javascript
// Test data
const parserTests = [
  { input: "2 cups flour", expected: { quantity: 2, unit: "cup", ingredient: "flour" }},
  { input: "1½ tsp vanilla", expected: { quantity: 1.5, unit: "tsp", ingredient: "vanilla" }},
  { input: "2 (14.5 oz) cans tomatoes", expected: { quantity: 29, unit: "oz", ingredient: "tomatoes" }},
  { input: "Salt to taste", expected: { quantity: null, unit: null, ingredient: "salt" }},
  { input: "1 large onion, diced", expected: { quantity: 1, unit: null, ingredient: "onion", prep: "diced" }}
];
```

#### B. Matcher Tests
```javascript
// Inventory → Recipe matching
const matcherTests = [
  { inventory: "Chicken Breast", recipe: "boneless chicken", expected: "chicken_breast", confidence: 0.95 },
  { inventory: "AP Flour", recipe: "all-purpose flour", expected: "all_purpose_flour", confidence: 0.95 },
  { inventory: "Green Pepper", recipe: "bell pepper", expected: "bell_pepper", confidence: 0.85 },
  { inventory: "Yogurt", recipe: "Greek yogurt", expected: null, confidence: 0 }
];
```

#### C. Conversion Tests
```javascript
// Safe and unsafe conversions
const conversionTests = [
  { ingredient: "milk", from: "cup", to: "ml", expected: 236.6, safe: true },
  { ingredient: "flour", from: "cup", to: "g", expected: null, safe: false },
  { ingredient: "chicken", from: "lb", to: "kg", expected: 0.454, safe: true },
  { ingredient: "basil", from: "cup", to: "g", expected: null, safe: false }
];
```

#### D. Scoring Tests
```javascript
// Recipe scoring scenarios
const scoringTests = [
  {
    scenario: "High match, no expiring",
    inventory: ["chicken", "rice", "broccoli"],
    recipe: { ingredients: ["chicken", "rice", "broccoli"] },
    expectedScore: { match: 100, expiring: 0, total: 100 }
  },
  {
    scenario: "Medium match, critical expiring",
    inventory: [
      { name: "chicken", expiresIn: 1 },
      { name: "rice", expiresIn: 30 }
    ],
    recipe: { ingredients: ["chicken", "rice", "carrots"] },
    expectedScore: { match: 66, expiring: 10, total: 86 }
  }
];
```

### Edge Cases to Test

1. **Unicode Handling**: "½ cup", "¼ tsp", emoji ingredients
2. **Compound Ingredients**: "salt and pepper", "butter or margarine"
3. **Brand Names**: "Kraft cheese" → "cheese"
4. **Pluralization**: "tomato" vs "tomatoes"
5. **Abbreviations**: "tbsp" vs "tablespoon", "oz" vs "ounce"
6. **Missing Units**: "2 eggs", "1 large onion"
7. **Ranges**: "1-2 cups", "2 to 3 tablespoons"
8. **Parentheticals**: "1 can (14.5 oz) tomatoes"

## 9. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create canonicalIngredients.json (125 items)
- [ ] Implement IngredientParser with tests
- [ ] Implement UnitConverter with safety checks
- [ ] Set up test harness with sample data

### Phase 2: Matching (Week 2)
- [ ] Implement IngredientMatcher
- [ ] Create match debugging tools
- [ ] Implement RecipeMatchCache
- [ ] Integration tests for parser + matcher

### Phase 3: Scoring (Week 3)
- [ ] Implement RecipeScorer
- [ ] Add expiration tier calculations
- [ ] Externalize category weights config
- [ ] Create score explainability hooks

### Phase 4: Integration (Week 4)
- [ ] Update RecipesScreen with real matching
- [ ] Implement shopping list merge
- [ ] Add "Why this recipe?" modal
- [ ] Performance testing and optimization

### Phase 5: Polish (Week 5)
- [ ] Handle edge cases from QA
- [ ] Add analytics events
- [ ] Implement feedback collection
- [ ] Production deployment prep

## 10. Configuration Files

### External Config (config/recipes.json)
```json
{
  "matching": {
    "minConfidence": 0.85,
    "aliasPenalty": 0.05,
    "categoryBonus": 0.1
  },
  "scoring": {
    "expiringWeight": 2.0,
    "categoryWeights": {
      "quick": 1.2,
      "healthy": 1.1,
      "comfort": 1.0,
      "dessert": 0.8
    }
  },
  "cache": {
    "ttlMinutes": 5,
    "maxEntries": 100
  }
}
```

## 11. Developer Handoff Checklist

### Code Quality
- [ ] TypeScript types for all functions
- [ ] JSDoc comments on public APIs
- [ ] Unit tests achieving 80%+ coverage
- [ ] Integration tests for critical paths
- [ ] Performance benchmarks documented

### Documentation
- [ ] API documentation generated
- [ ] Architecture diagrams updated
- [ ] Runbook for common issues
- [ ] Monitoring dashboard configured

### Data Management
- [ ] Canonical ingredients validated
- [ ] Sample recipes for each category
- [ ] Test data for QA scenarios
- [ ] Migration plan for existing data

### Deployment
- [ ] Feature flags configured
- [ ] Rollback plan documented
- [ ] A/B test variants defined
- [ ] Success metrics identified

## 12. Success Metrics

### User Engagement
- Recipe view rate from inventory matches
- Shopping list additions from recipes
- Reduction in expired items
- User satisfaction scores

### Technical Performance
- Match accuracy (manual validation)
- Cache hit rate (target: >80%)
- Response time (target: <200ms)
- Error rate (target: <0.1%)

## 13. Future Enhancements

### V2 Considerations
1. **ML-powered matching**: Train on user corrections
2. **Nutritional tracking**: Integrate with nutrition APIs
3. **Meal planning**: Weekly planning with inventory awareness
4. **Recipe suggestions**: Based on purchase patterns
5. **Social features**: Share recipes, family meal planning
6. **Voice input**: "Add ingredients from this recipe"
7. **Barcode scanning**: Quick inventory updates
8. **Smart substitutions**: "You could use yogurt instead of sour cream"

## Appendix A: Sample Canonical Ingredients

```json
{
  "produce": [
    "tomato", "onion", "garlic", "carrot", "celery",
    "bell_pepper", "broccoli", "spinach", "lettuce", "cucumber",
    "potato", "sweet_potato", "mushroom", "zucchini", "corn",
    "lemon", "lime", "apple", "banana", "strawberry",
    "basil", "cilantro", "parsley", "thyme", "rosemary",
    "ginger", "green_onion", "jalapeno", "avocado", "kale"
  ],
  "meat_fish": [
    "chicken_breast", "chicken_thigh", "ground_beef", "beef_steak", "pork_chop",
    "bacon", "sausage", "ground_turkey", "ham", "lamb",
    "salmon", "tuna", "shrimp", "cod", "tilapia"
  ],
  "dairy": [
    "milk", "heavy_cream", "sour_cream", "yogurt", "greek_yogurt",
    "butter", "cream_cheese", "cheddar", "mozzarella", "parmesan",
    "feta", "eggs"
  ],
  "grains": [
    "white_rice", "brown_rice", "pasta", "bread", "tortilla",
    "quinoa", "oats", "couscous", "flour_tortilla", "noodles"
  ],
  "baking": [
    "all_purpose_flour", "bread_flour", "sugar", "brown_sugar", "powdered_sugar",
    "baking_soda", "baking_powder", "vanilla_extract", "cocoa_powder", "chocolate_chips",
    "yeast", "cornstarch"
  ]
}
```

## Appendix B: Algorithm Pseudocode

### Inventory Hash Generation
```
function hashInventory(items):
  sorted = items.sortBy(id)
  string = sorted.map(i => "${i.id}:${i.quantity}:${i.unit}").join("|")
  return sha256(string).substring(0, 8)
```

### Expiration Score Calculation
```
function calculateExpirationScore(item):
  daysUntilExpiry = item.expirationDate - today
  if daysUntilExpiry <= 1: return 10
  if daysUntilExpiry <= 3: return 5
  if daysUntilExpiry <= 7: return 2
  return 0
```

### Levenshtein Distance (Optimized)
```
function levenshtein(s1, s2):
  if s1 == s2: return 1.0
  if !s1 or !s2: return 0.0

  matrix = createMatrix(s1.length + 1, s2.length + 1)
  // ... standard Levenshtein implementation

  distance = matrix[s1.length][s2.length]
  maxLength = max(s1.length, s2.length)
  return 1 - (distance / maxLength)
```

---

*This document represents the complete implementation plan for the Pantry Pal recipes feature, incorporating all feedback and refinements through v4.0.*