import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Path to your recipe datasets
const USDA_RECIPES_PATH = '../recipe_crawler/all_recipes.jsonl';
const CSV_RECIPES_PATH = '../recipe_crawler/Food Ingredients and Recipe Dataset with Image Name Mapping.csv';

interface USDARecipe {
  id: string;
  title: string;
  url: string;
  servings: string;
  ingredients: string[];
  directions: string[];
  provenance: {
    publisher: string;
    attribution: string;
  };
  image?: {
    url: string;
  };
}

interface CSVRecipe {
  Title: string;
  Ingredients: string;
  Instructions: string;
  Image_Name: string;
  Cleaned_Ingredients: string;
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function extractServings(servingsText: string): number {
  const match = servingsText.match(/(\d+)/);
  return match ? parseInt(match[1]) : 4;
}

function parseIngredient(ingredientText: string) {
  // Extract quantity, unit, and ingredient name
  const quantityMatch = ingredientText.match(/^([\d\/\.\s]+)/);
  const quantity = quantityMatch ? parseFloat(quantityMatch[1].replace(/\s/g, '')) : null;

  // Common units
  const unitMatch = ingredientText.match(/(tablespoon|tbsp|teaspoon|tsp|cup|ounce|oz|pound|lb|can|clove|medium|large|small)/i);
  const unit = unitMatch ? unitMatch[1].toLowerCase() : null;

  // Extract ingredient name (everything after unit or quantity)
  let ingredient = ingredientText;
  if (unitMatch) {
    ingredient = ingredientText.substring(ingredientText.indexOf(unitMatch[0]) + unitMatch[0].length).trim();
  } else if (quantityMatch) {
    ingredient = ingredientText.substring(quantityMatch[0].length).trim();
  }

  // Remove parenthetical notes and cleanup
  ingredient = ingredient
    .replace(/\(.*?\)/g, '')
    .replace(/,.*$/, '')
    .trim();

  return {
    amount: quantity,
    unit,
    name: ingredient,
    normalized: normalizeIngredientName(ingredient),
  };
}

async function ingestUSDARecipes(limit: number = 999999): Promise<number> {
  console.log('📥 Reading ALL USDA recipes from JSONL...\n');

  const fileContent = readFileSync(USDA_RECIPES_PATH, 'utf-8');
  const lines = fileContent.trim().split('\n');

  console.log(`  Found ${lines.length} USDA recipes in file\n`);

  let inserted = 0;
  let skipped = 0;

  for (const line of lines.slice(0, limit)) {
    if (!line.trim()) continue;

    try {
      const recipe: USDARecipe = JSON.parse(line);

      // Skip if no ingredients
      if (!recipe.ingredients || recipe.ingredients.length === 0) {
        skipped++;
        continue;
      }

      const slug = generateSlug(recipe.title);

      // Insert recipe
      const { data: recipeData, error: recipeError } = await supabase
        .from('recipes')
        .insert({
          title: recipe.title,
          slug: slug,
          description: `USDA MyPlate Kitchen recipe: ${recipe.title}`,
          instructions: recipe.directions?.join('\n\n') || 'See source for instructions',
          servings: extractServings(recipe.servings),
          image_url: recipe.image?.url || null,
          source: recipe.provenance.publisher,
          source_url: recipe.url,
          author: 'USDA MyPlate Kitchen',
          license: 'Public Domain',
          attribution_text: recipe.provenance.attribution,
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
          skipped++;
          continue;
        }
        throw recipeError;
      }

      // Insert ingredients
      const ingredients = recipe.ingredients.map((ing, index) => {
        const parsed = parseIngredient(ing);
        return {
          recipe_id: recipeData.id,
          ingredient_name: parsed.name,
          normalized_name: parsed.normalized,
          amount: parsed.amount,
          unit: parsed.unit,
          notes: ing,
          is_optional: false,
          sort_order: index,
        };
      });

      const { error: ingredientsError } = await supabase
        .from('recipe_ingredients')
        .insert(ingredients);

      if (ingredientsError) {
        console.error(`  ❌ Failed ingredients for "${recipe.title}"`);
        await supabase.from('recipes').delete().eq('id', recipeData.id);
        skipped++;
        continue;
      }

      inserted++;
      console.log(`  ✅ ${inserted}. ${recipe.title} (${recipe.ingredients.length} ingredients)`);

    } catch (error) {
      console.error(`  ❌ Parse error:`, error);
      skipped++;
    }
  }

  console.log(`\n📊 USDA Summary:`);
  console.log(`  ✅ Inserted: ${inserted}`);
  console.log(`  ⏭️  Skipped: ${skipped}\n`);

  return inserted;
}

async function ingestTheMealDB(limit: number = 999999): Promise<number> {
  console.log('📥 Fetching ALL recipes from TheMealDB (free API)...\n');

  let inserted = 0;
  let skipped = 0;

  // TheMealDB categories (expanded to get all ~600 recipes)
  const categories = [
    'Chicken', 'Beef', 'Pork', 'Lamb', 'Pasta', 'Seafood',
    'Vegetarian', 'Vegan', 'Dessert', 'Breakfast', 'Side',
    'Starter', 'Goat', 'Miscellaneous'
  ];

  console.log(`  Fetching from ${categories.length} categories...\n`);

  for (const category of categories) {
    if (inserted >= limit) break;

    console.log(`  📂 Category: ${category}`);

    try {
      const response = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?c=${category}`);
      const data = await response.json();

      if (!data.meals) {
        console.log(`    ⏭️  No meals in category`);
        continue;
      }

      console.log(`    Found ${data.meals.length} meals`);

      // Get details for each meal (fetch ALL, not just 15)
      for (const meal of data.meals) {
        if (inserted >= limit) break;

        const detailResponse = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${meal.idMeal}`);
        const detailData = await detailResponse.json();

        if (!detailData.meals || !detailData.meals[0]) continue;

        const recipe = detailData.meals[0];
        const slug = generateSlug(recipe.strMeal);

        // Extract ingredients from numbered fields
        const ingredients = [];
        for (let i = 1; i <= 20; i++) {
          const ingredient = recipe[`strIngredient${i}`];
          const measure = recipe[`strMeasure${i}`];

          if (ingredient && ingredient.trim()) {
            ingredients.push({
              name: ingredient.trim(),
              measure: measure?.trim() || '',
            });
          }
        }

        if (ingredients.length === 0) {
          skipped++;
          continue;
        }

        // Insert recipe
        const { data: recipeData, error: recipeError } = await supabase
          .from('recipes')
          .insert({
            title: recipe.strMeal,
            slug: slug,
            description: recipe.strMeal,
            instructions: recipe.strInstructions || 'See source for instructions',
            servings: 4,
            image_url: recipe.strMealThumb,
            source: 'TheMealDB',
            source_url: recipe.strSource || `https://www.themealdb.com/meal/${meal.idMeal}`,
            author: 'TheMealDB Community',
            license: 'CC BY-SA 3.0',
            attribution_text: 'Recipe from TheMealDB',
            provenance: 'open',
            instructions_allowed: true,
            share_alike_required: true,
            open_collection: true,
            is_public: true,
          })
          .select()
          .single();

        if (recipeError) {
          if (recipeError.code === '23505') {
            skipped++;
            continue;
          }
          throw recipeError;
        }

        // Insert ingredients
        const ingredientRecords = ingredients.map((ing, index) => {
          const parsed = parseIngredient(`${ing.measure} ${ing.name}`);
          return {
            recipe_id: recipeData.id,
            ingredient_name: parsed.name,
            normalized_name: parsed.normalized,
            amount: parsed.amount,
            unit: parsed.unit,
            notes: `${ing.measure} ${ing.name}`.trim(),
            is_optional: false,
            sort_order: index,
          };
        });

        const { error: ingredientsError } = await supabase
          .from('recipe_ingredients')
          .insert(ingredientRecords);

        if (ingredientsError) {
          await supabase.from('recipes').delete().eq('id', recipeData.id);
          skipped++;
          continue;
        }

        inserted++;
        if (inserted % 10 === 0) {
          console.log(`    Progress: ${inserted} recipes ingested...`);
        }

        // Rate limiting: 100ms between requests (be nice to free API)
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`  ❌ Error fetching ${category}:`, error);
    }
  }

  console.log(`\n📊 TheMealDB Summary:`);
  console.log(`  ✅ Inserted: ${inserted}`);
  console.log(`  ⏭️  Skipped: ${skipped}\n`);

  return inserted;
}

async function ingestRecipes() {
  console.log('🚀 Starting recipe ingestion (100% FREE sources)...\n');
  console.log('📊 Strategy: Ingest ALL available recipes (no artificial limits)\n');

  let totalInserted = 0;

  // Phase 1: USDA recipes (high quality, public domain)
  console.log('=== Phase 1: USDA MyPlate Recipes (ALL 1,043) ===\n');
  const usdaCount = await ingestUSDARecipes();
  totalInserted += usdaCount;

  // Phase 2: TheMealDB (free, good variety)
  console.log('\n=== Phase 2: TheMealDB Recipes (ALL ~600) ===\n');
  const mealDBCount = await ingestTheMealDB();
  totalInserted += mealDBCount;

  console.log('\n✅ FINAL SUMMARY:');
  console.log(`  📈 Total recipes ingested: ${totalInserted}`);
  console.log(`  🎯 USDA: ${usdaCount} recipes`);
  console.log(`  🎯 TheMealDB: ${mealDBCount} recipes`);
  console.log(`  💾 Estimated storage: ~${Math.round(totalInserted * 5 / 1024)}MB`);
  console.log(`  💰 Total cost: $0 (100% FREE!)`);
  console.log(`  ⚡ No artificial limits - using ALL available data!`);
}

ingestRecipes().catch(console.error);
