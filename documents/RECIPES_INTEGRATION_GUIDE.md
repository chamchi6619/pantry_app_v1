# Recipes Feature Integration Guide

## Quick Start

To use the new intelligent recipes system in your app, replace the old RecipesScreen with the enhanced version:

```tsx
// In your navigation or main app file
import { EnhancedRecipesScreen } from './src/features/recipes/screens/EnhancedRecipesScreen';

// Replace the old screen
<Tab.Screen name="Recipes" component={EnhancedRecipesScreen} />
```

## Features Available

### 1. Intelligent Recipe Matching
- Automatically scores recipes based on your inventory
- Prioritizes recipes using expiring ingredients
- Shows match percentage for each recipe

### 2. "Why This Recipe?" Explainability
- Tap the info icon on any recipe card
- See detailed breakdown of scoring
- Understand which ingredients are expiring
- View missing ingredients

### 3. Shopping List Integration
- Tap on missing ingredients count
- Automatically adds needed items to shopping list
- Smart merging prevents duplicates
- Unit conversion handled automatically

## Store Integration

The enhanced recipe system uses:
- `useInventoryStore` - For current inventory items
- `useEnhancedRecipeStore` - For recipe scoring and caching
- `useShoppingListStore` - For shopping list integration

## Adding New Recipes

Add recipes to the enhanced store with full ingredient parsing:

```typescript
import { useEnhancedRecipeStore } from './src/stores/enhancedRecipeStore';

const addRecipe = useEnhancedRecipeStore(state => state.addRecipe);

addRecipe({
  name: 'Chicken Stir Fry',
  description: 'Quick and healthy dinner',
  category: 'quick',
  prepTime: 10,
  cookTime: 15,
  servings: 4,
  difficulty: 'easy',
  ingredients: [
    {
      id: 'ing-1',
      recipeText: '1 lb chicken breast, diced',
      parsed: ingredientParser.parse('1 lb chicken breast, diced'),
      requiredQuantity: 1,
      requiredUnit: 'lb'
    },
    // ... more ingredients
  ],
  instructions: [
    'Dice the chicken',
    'Heat oil in wok',
    // ... more steps
  ],
  tags: ['Asian', 'Healthy', 'Quick']
});
```

## Canonical Ingredients

The system recognizes 125 common ingredients with aliases:
- `chicken breast` = `boneless chicken` = `chicken cutlet`
- `all-purpose flour` = `flour` = `AP flour`
- `vegetable oil` = `cooking oil` = `canola oil`

See `src/features/recipes/data/canonicalIngredients.json` for the full list.

## Unit Conversions

Safe conversions are automatic:
- Volume: cups ↔ ml, tbsp ↔ tsp
- Weight: lb ↔ kg, oz ↔ g
- Unsafe: cups ↔ grams for flour (blocked)

## Customization

### Adjust Scoring Weights

Edit `src/features/recipes/config/recipeConfig.json`:

```json
{
  "scoring": {
    "expiringWeight": 2.0,  // How much to prioritize expiring items
    "categoryWeights": {
      "quick": 1.2,      // Boost quick recipes by 20%
      "healthy": 1.1,    // Boost healthy recipes by 10%
      "comfort": 1.0,    // No boost
      "dessert": 0.8     // Reduce dessert priority by 20%
    }
  }
}
```

### Modify Match Threshold

```json
{
  "matching": {
    "minConfidence": 0.85  // Require 85% confidence for ingredient match
  }
}
```

## Performance

- Results cached for 5 minutes per inventory state
- Cache automatically cleared on inventory changes
- Pull-to-refresh forces cache clear
- Typical response time: <50ms (cached), <200ms (uncached)

## Troubleshooting

### Recipes not showing
- Check that inventory has items
- Verify recipe ingredients are properly formatted
- Check console for parsing errors

### Poor matching
- Ensure ingredient names use common terms
- Add aliases to canonical ingredients if needed
- Lower minConfidence threshold if too strict

### Unit conversion failures
- Check safeConversions flag for dry goods
- Verify density values in canonical ingredients
- Use standard unit abbreviations

## Testing

Run the included tests:
```bash
npm test -- --testMatch="**/recipes/**/*.test.ts"
```

Key test files:
- `ingredientParser.test.ts` - Parser validation
- `ingredientMatcher.test.ts` - Matching accuracy
- Integration tests coming soon

## Next Steps

1. Add more recipes to the store
2. Customize scoring weights for your users
3. Add recipe images (imageUrl field)
4. Implement recipe detail screen
5. Add user recipe creation flow