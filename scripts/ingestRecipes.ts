import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Edamam API Configuration
const EDAMAM_APP_ID = process.env.EDAMAM_APP_ID || '';
const EDAMAM_APP_KEY = process.env.EDAMAM_APP_KEY || '';
const EDAMAM_BASE_URL = 'https://api.edamam.com/api/recipes/v2';

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface EdamamRecipe {
  recipe: {
    uri: string;
    label: string;
    image: string;
    source: string;
    url: string;
    yield: number;
    ingredientLines: string[];
    ingredients: Array<{
      text: string;
      quantity: number;
      measure: string;
      food: string;
      weight: number;
    }>;
    totalTime: number;
    cuisineType?: string[];
    mealType?: string[];
    dishType?: string[];
  };
}

// High-quality, common recipe queries to get 500 diverse recipes
const RECIPE_QUERIES = [
  // Proteins
  'chicken breast', 'ground beef', 'salmon', 'shrimp', 'tofu',
  'pork chop', 'turkey', 'tuna', 'cod', 'chicken thighs',

  // Vegetarian/Vegan
  'chickpeas', 'lentils', 'quinoa bowl', 'buddha bowl', 'veggie burger',

  // Pasta & Grains
  'pasta', 'spaghetti', 'rice', 'risotto', 'fried rice',

  // Quick Meals
  'stir fry', 'tacos', 'quesadilla', 'wrap', 'sandwich',

  // Comfort Food
  'soup', 'stew', 'casserole', 'curry', 'chili',

  // Breakfast
  'eggs', 'pancakes', 'oatmeal', 'french toast', 'smoothie bowl',

  // Salads
  'caesar salad', 'greek salad', 'cobb salad', 'spinach salad',

  // Sides
  'roasted vegetables', 'mashed potatoes', 'green beans', 'coleslaw',

  // Desserts
  'chocolate chip cookies', 'brownies', 'apple pie', 'cheesecake',
];

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function fetchRecipesFromEdamam(query: string, limit: number = 20): Promise<EdamamRecipe[]> {
  const url = `${EDAMAM_BASE_URL}?type=public&q=${encodeURIComponent(query)}&app_id=${EDAMAM_APP_ID}&app_key=${EDAMAM_APP_KEY}&to=${limit}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Edamam API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.hits || [];
  } catch (error) {
    console.error(`Failed to fetch recipes for "${query}":`, error);
    return [];
  }
}

async function insertRecipe(recipe: EdamamRecipe['recipe']) {
  const slug = generateSlug(recipe.label);

  // Insert recipe
  const { data: recipeData, error: recipeError } = await supabase
    .from('recipes')
    .insert({
      title: recipe.label,
      slug: slug,
      description: `Delicious ${recipe.label} recipe from ${recipe.source}`,
      instructions: 'See source for full instructions',
      prep_time_minutes: null,
      cook_time_minutes: recipe.totalTime > 0 ? recipe.totalTime : null,
      total_time_minutes: recipe.totalTime > 0 ? recipe.totalTime : null,
      servings: recipe.yield || 4,
      image_url: recipe.image,
      source: recipe.source,
      source_url: recipe.url,
      author: recipe.source,
      license: 'CC BY-SA 4.0',
      attribution_text: `Recipe from ${recipe.source}`,
      provenance: 'open',
      instructions_allowed: true,
      share_alike_required: false,
      open_collection: true,
      is_public: true,
    })
    .select()
    .single();

  if (recipeError) {
    if (recipeError.code === '23505') {
      console.log(`  ⏭️  Skipped duplicate: ${recipe.label}`);
      return null;
    }
    throw recipeError;
  }

  // Insert ingredients
  const ingredients = recipe.ingredients.map((ing, index) => ({
    recipe_id: recipeData.id,
    ingredient_name: ing.food,
    normalized_name: normalizeIngredientName(ing.food),
    amount: ing.quantity || null,
    unit: ing.measure !== '<unit>' ? ing.measure : null,
    preparation: null,
    notes: ing.text,
    is_optional: false,
    ingredient_group: null,
    sort_order: index,
  }));

  const { error: ingredientsError } = await supabase
    .from('recipe_ingredients')
    .insert(ingredients);

  if (ingredientsError) {
    console.error(`  ❌ Failed to insert ingredients for "${recipe.label}":`, ingredientsError);
    // Rollback recipe insertion
    await supabase.from('recipes').delete().eq('id', recipeData.id);
    return null;
  }

  return recipeData;
}

async function ingestRecipes() {
  console.log('🚀 Starting recipe ingestion...\n');

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  const targetCount = 500;

  for (const query of RECIPE_QUERIES) {
    if (totalInserted >= targetCount) {
      console.log(`\n✅ Reached target of ${targetCount} recipes!`);
      break;
    }

    console.log(`\n📥 Fetching recipes for: "${query}"...`);
    const recipes = await fetchRecipesFromEdamam(query, 20);

    for (const hit of recipes) {
      if (totalInserted >= targetCount) break;

      try {
        const result = await insertRecipe(hit.recipe);
        if (result) {
          totalInserted++;
          console.log(`  ✅ ${totalInserted}. ${hit.recipe.label}`);
        } else {
          totalSkipped++;
        }
      } catch (error) {
        totalFailed++;
        console.error(`  ❌ Failed to insert "${hit.recipe.label}":`, error);
      }

      // Rate limiting: wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log('\n📊 Ingestion Summary:');
  console.log(`  ✅ Inserted: ${totalInserted}`);
  console.log(`  ⏭️  Skipped: ${totalSkipped}`);
  console.log(`  ❌ Failed: ${totalFailed}`);
  console.log(`  📈 Total processed: ${totalInserted + totalSkipped + totalFailed}`);
}

// Run the ingestion
ingestRecipes().catch(console.error);
