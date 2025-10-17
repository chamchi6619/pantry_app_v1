/**
 * Recipe Parser Service - Schema.org Recipe Extraction
 *
 * Purpose: Extract structured recipe data from traditional recipe websites
 * that use schema.org JSON-LD markup (1000+ sites including NYT Cooking,
 * Bon Appétit, AllRecipes, Serious Eats, etc.)
 *
 * Cost: $0.00 per recipe (no AI needed, just JSON extraction)
 */

export interface ParsedRecipe {
  title: string;
  description?: string;
  image_url?: string;
  ingredients: string[];
  instructions: string | string[];
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  total_time_minutes?: number;
  servings?: number;
  yield?: string;
  category?: string;
  cuisine?: string;
  author?: {
    name?: string;
    url?: string;
  };
  datePublished?: string;
  rating?: {
    value: number;
    count: number;
  };
  nutrition?: {
    calories?: string;
    protein?: string;
    carbohydrates?: string;
    fat?: string;
  };
  keywords?: string[];
  source_url: string;
}

interface SchemaOrgRecipe {
  '@type': string | string[];
  name?: string;
  description?: string;
  image?: string | string[] | { url: string }[];
  recipeIngredient?: string[];
  recipeInstructions?: any;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  recipeYield?: string | number;
  recipeCategory?: string;
  recipeCuisine?: string;
  author?: { name?: string; url?: string } | { name?: string; url?: string }[];
  datePublished?: string;
  aggregateRating?: {
    ratingValue: number;
    ratingCount?: number;
    reviewCount?: number;
  };
  nutrition?: {
    calories?: string;
    proteinContent?: string;
    carbohydrateContent?: string;
    fatContent?: string;
  };
  keywords?: string | string[];
}

/**
 * Parse ISO 8601 duration string (e.g., "PT30M", "PT1H30M") to minutes
 */
function parseISO8601Duration(duration?: string): number | undefined {
  if (!duration) return undefined;

  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return undefined;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  return hours * 60 + minutes;
}

/**
 * Extract image URL from various schema.org image formats
 */
function extractImageUrl(image?: string | string[] | { url: string }[]): string | undefined {
  if (!image) return undefined;

  if (typeof image === 'string') {
    return image;
  }

  if (Array.isArray(image)) {
    if (typeof image[0] === 'string') {
      return image[0];
    }
    if (typeof image[0] === 'object' && image[0].url) {
      return image[0].url;
    }
  }

  return undefined;
}

/**
 * Extract instructions from various schema.org instruction formats
 */
function extractInstructions(recipeInstructions?: any): string | string[] {
  if (!recipeInstructions) return '';

  // Case 1: Simple string
  if (typeof recipeInstructions === 'string') {
    return recipeInstructions;
  }

  // Case 2: Array of strings
  if (Array.isArray(recipeInstructions)) {
    const steps: string[] = [];

    for (const instruction of recipeInstructions) {
      if (typeof instruction === 'string') {
        steps.push(instruction);
      } else if (instruction['@type'] === 'HowToStep' && instruction.text) {
        steps.push(instruction.text);
      } else if (instruction['@type'] === 'HowToSection') {
        // HowToSection contains nested steps
        if (Array.isArray(instruction.itemListElement)) {
          for (const step of instruction.itemListElement) {
            if (step.text) {
              steps.push(step.text);
            }
          }
        }
      }
    }

    return steps.length > 0 ? steps : '';
  }

  return '';
}

/**
 * Extract servings from recipeYield (handles "6 servings", "6", "6-8")
 */
function extractServings(recipeYield?: string | number): number | undefined {
  if (!recipeYield) return undefined;

  if (typeof recipeYield === 'number') {
    return recipeYield;
  }

  // Try to extract first number from string
  const match = recipeYield.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Extract author name from various author formats
 */
function extractAuthor(author?: { name?: string; url?: string } | { name?: string; url?: string }[]): {
  name?: string;
  url?: string;
} | undefined {
  if (!author) return undefined;

  if (Array.isArray(author)) {
    return author[0];
  }

  return author;
}

/**
 * Validate that recipe has minimum required fields
 */
function isValidRecipe(recipe: SchemaOrgRecipe): boolean {
  const hasTitle = !!recipe.name && recipe.name.trim().length > 0;
  const hasIngredients = Array.isArray(recipe.recipeIngredient) && recipe.recipeIngredient.length > 0;

  return hasTitle && hasIngredients;
}

/**
 * Parse schema.org Recipe data from JSON-LD
 */
export async function parseSchemaOrgRecipe(url: string): Promise<ParsedRecipe | null> {
  try {
    console.log('[RecipeParser] Fetching URL:', url);

    // Fetch HTML
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PantryApp/1.0; +https://pantryapp.com)',
      },
    });

    if (!response.ok) {
      console.error('[RecipeParser] HTTP error:', response.status);
      return null;
    }

    const html = await response.text();
    console.log('[RecipeParser] HTML length:', html.length);

    // Extract all JSON-LD blocks
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis);

    if (!jsonLdMatches || jsonLdMatches.length === 0) {
      console.error('[RecipeParser] No JSON-LD found in HTML');
      return null;
    }

    console.log('[RecipeParser] Found', jsonLdMatches.length, 'JSON-LD blocks');

    // Try to find Recipe schema in each block
    for (const match of jsonLdMatches) {
      try {
        // Extract JSON content (remove script tags)
        const jsonContent = match.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
        const data = JSON.parse(jsonContent);

        // Handle both single object and array of objects
        const items = Array.isArray(data) ? data : [data];

        // Look for Recipe type
        for (const item of items) {
          // Check if this is a Recipe (handle @type as string or array)
          const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
          const isRecipe = types.some((type: string) => type === 'Recipe');

          if (!isRecipe) continue;

          const recipe: SchemaOrgRecipe = item;

          // Validate recipe has required fields
          if (!isValidRecipe(recipe)) {
            console.warn('[RecipeParser] Recipe missing required fields');
            continue;
          }

          console.log('[RecipeParser] Found valid Recipe schema');

          // Parse and return structured data
          const author = extractAuthor(recipe.author);

          return {
            title: recipe.name!,
            description: recipe.description,
            image_url: extractImageUrl(recipe.image),
            ingredients: recipe.recipeIngredient || [],
            instructions: extractInstructions(recipe.recipeInstructions),
            prep_time_minutes: parseISO8601Duration(recipe.prepTime),
            cook_time_minutes: parseISO8601Duration(recipe.cookTime),
            total_time_minutes: parseISO8601Duration(recipe.totalTime),
            servings: extractServings(recipe.recipeYield),
            yield: typeof recipe.recipeYield === 'string' ? recipe.recipeYield : undefined,
            category: recipe.recipeCategory,
            cuisine: recipe.recipeCuisine,
            author: author,
            datePublished: recipe.datePublished,
            rating: recipe.aggregateRating
              ? {
                  value: recipe.aggregateRating.ratingValue,
                  count: recipe.aggregateRating.ratingCount || recipe.aggregateRating.reviewCount || 0,
                }
              : undefined,
            nutrition: recipe.nutrition
              ? {
                  calories: recipe.nutrition.calories,
                  protein: recipe.nutrition.proteinContent,
                  carbohydrates: recipe.nutrition.carbohydrateContent,
                  fat: recipe.nutrition.fatContent,
                }
              : undefined,
            keywords: Array.isArray(recipe.keywords)
              ? recipe.keywords
              : typeof recipe.keywords === 'string'
              ? recipe.keywords.split(',').map((k) => k.trim())
              : undefined,
            source_url: url,
          };
        }
      } catch (parseError) {
        console.warn('[RecipeParser] Failed to parse JSON-LD block:', parseError);
        continue;
      }
    }

    console.error('[RecipeParser] No valid Recipe schema found');
    return null;
  } catch (error) {
    console.error('[RecipeParser] Error parsing recipe:', error);
    return null;
  }
}

/**
 * Detect if a URL is likely a recipe website
 * (Heuristic check before attempting schema.org parsing)
 */
export function isLikelyRecipeUrl(url: string): boolean {
  const recipeIndicators = [
    'allrecipes.com',
    'food.com',
    'foodnetwork.com',
    'bonappetit.com',
    'epicurious.com',
    'seriouseats.com',
    'cooking.nytimes.com',
    'simplyrecipes.com',
    'delish.com',
    'tasty.co',
    'minimalistbaker.com',
    'budgetbytes.com',
    'thekitchn.com',
    'cookieandkate.com',
    'pinchofyum.com',
    'skinnytaste.com',
    'kingarthurbaking.com',
    '/recipe/',
    '/recipes/',
  ];

  const lowerUrl = url.toLowerCase();
  return recipeIndicators.some((indicator) => lowerUrl.includes(indicator));
}

/**
 * Test if a URL supports schema.org Recipe extraction
 * (Quick validation before full processing)
 */
export async function testSchemaOrgSupport(url: string): Promise<boolean> {
  try {
    const recipe = await parseSchemaOrgRecipe(url);
    return recipe !== null;
  } catch {
    return false;
  }
}
