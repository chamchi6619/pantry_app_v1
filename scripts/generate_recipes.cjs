/**
 * Recipe Generation Script
 *
 * Generates 200 structured recipes using Google Gemini AI
 * Output: JSON file matching cook_cards schema for manual review
 *
 * Usage: GEMINI_API_KEY=your_key node scripts/generate_recipes.js
 */

const fs = require('fs');
const path = require('path');

// Check for API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('❌ Error: GEMINI_API_KEY environment variable not set');
  console.log('Usage: GEMINI_API_KEY=your_key node scripts/generate_recipes.js');
  process.exit(1);
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Load seed list
const seedList = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'recipe_seed_list.json'), 'utf8')
);

// Output file
const OUTPUT_FILE = path.join(__dirname, 'generated_recipes.json');

/**
 * Generate a single recipe using Gemini
 */
async function generateRecipe(dishName, category, categoryEmoji) {
  const prompt = `Generate a detailed recipe for "${dishName}" (${category} cuisine).

Return ONLY valid JSON (no markdown, no explanation) with this EXACT structure:

{
  "title": "${dishName}",
  "description": "<2 sentence appetizing description>",
  "category": "${category.toLowerCase()}",
  "prep_time_minutes": <number>,
  "cook_time_minutes": <number>,
  "total_time_minutes": <number>,
  "servings": 4,
  "difficulty": "<easy|medium|hard>",
  "tags": ["${category.toLowerCase()}", "<difficulty>", "<dietary_info>"],
  "ingredients": [
    {
      "ingredient_name": "<full ingredient name>",
      "normalized_name": "<simplified name for matching>",
      "canonical_item_mapping": "<common pantry item name>",
      "amount": <number or null>,
      "unit": "<cup|tbsp|tsp|lb|oz|g|ml|piece or null>",
      "preparation": "<diced|minced|chopped or null>",
      "sort_order": <1, 2, 3...>,
      "is_optional": <true|false>
    }
  ],
  "instructions": [
    {
      "step_number": 1,
      "instruction_text": "<clear, detailed instruction>"
    }
  ]
}

CRITICAL REQUIREMENTS:

Ingredients:
- "ingredient_name": Full name as it appears in recipe (e.g., "boneless chicken breast")
- "normalized_name": Simplified version (e.g., "chicken breast")
- "canonical_item_mapping": Generic pantry category (e.g., "chicken") - this is KEY for pantry matching!
- Use COMMON ingredients found in typical pantries
- Standard units ONLY: cup, tbsp, tsp, lb, oz, g, ml, piece
- "sort_order": number ingredients 1, 2, 3... in order they're used
- "is_optional": mark garnishes, optional toppings as true

Times:
- Realistic times (don't say "5 min" for lasagna!)
- prep_time + cook_time should equal total_time
- Round to nearest 5 minutes

Instructions:
- Clear, actionable steps
- Each step should be one complete action
- Include temperatures, doneness cues
- step_number starts at 1

Difficulty:
- "easy": < 30 min, simple techniques, few ingredients
- "medium": 30-60 min, moderate skill
- "hard": > 60 min, advanced techniques

Tags:
- Always include: category, difficulty
- Add dietary info: "vegetarian", "vegan", "gluten-free", "dairy-free", "spicy", "quick" (< 30 min)

FORBIDDEN:
- NO placeholder text
- NO "TBD" or "to taste" in amounts (use null instead)
- NO markdown formatting
- NO explanations outside the JSON
- Return ONLY the JSON object

Example canonical_item_mapping:
- "boneless skinless chicken thighs" → canonical_item_mapping: "chicken"
- "extra virgin olive oil" → canonical_item_mapping: "olive oil"
- "san marzano tomatoes" → canonical_item_mapping: "tomatoes"
- "fresh basil leaves" → canonical_item_mapping: "basil"`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.8,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192, // Increased from 3072 to prevent truncation
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Check for MAX_TOKENS truncation
    if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      throw new Error('Response truncated due to MAX_TOKENS (increase maxOutputTokens)');
    }

    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      const finishReason = data.candidates?.[0]?.finishReason || 'UNKNOWN';
      throw new Error(`No text in Gemini response (finishReason: ${finishReason})`);
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonText = generatedText.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '');
    }

    const recipe = JSON.parse(jsonText);

    // Validate required fields
    const required = ['title', 'description', 'category', 'servings', 'difficulty', 'ingredients', 'instructions', 'total_time_minutes'];
    for (const field of required) {
      if (!recipe[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate difficulty value
    if (!['easy', 'medium', 'hard'].includes(recipe.difficulty)) {
      throw new Error(`Invalid difficulty: ${recipe.difficulty}. Must be easy, medium, or hard.`);
    }

    // Validate ingredients structure
    if (recipe.ingredients.length === 0) {
      throw new Error('Recipe must have at least one ingredient');
    }
    for (const ing of recipe.ingredients) {
      if (!ing.ingredient_name || !ing.canonical_item_mapping || ing.sort_order === undefined) {
        throw new Error(`Invalid ingredient structure: ${JSON.stringify(ing)}`);
      }
    }

    // Validate instructions structure
    if (recipe.instructions.length === 0) {
      throw new Error('Recipe must have at least one instruction step');
    }
    for (const step of recipe.instructions) {
      if (!step.step_number || !step.instruction_text) {
        throw new Error(`Invalid instruction structure: ${JSON.stringify(step)}`);
      }
    }

    return recipe;
  } catch (error) {
    console.error(`  ❌ Error generating ${dishName}:`, error.message);
    return null;
  }
}

/**
 * Generate all recipes with rate limiting
 */
async function generateAllRecipes() {
  const results = {
    metadata: {
      generated_at: new Date().toISOString(),
      total_recipes: 0,
      successful: 0,
      failed: 0,
      categories: seedList.metadata.categories
    },
    recipes: {}
  };

  console.log('🚀 Starting recipe generation...\n');
  console.log(`📊 Target: ${seedList.metadata.total_dishes} recipes across ${seedList.metadata.categories} categories\n`);

  for (const [categoryKey, categoryData] of Object.entries(seedList.categories)) {
    console.log(`\n${categoryData.emoji} ${categoryData.name.toUpperCase()}`);
    console.log('─'.repeat(50));

    results.recipes[categoryKey] = {
      name: categoryData.name,
      emoji: categoryData.emoji,
      dishes: []
    };

    for (let i = 0; i < categoryData.dishes.length; i++) {
      const dishName = categoryData.dishes[i];
      const progress = `[${i + 1}/${categoryData.dishes.length}]`;

      process.stdout.write(`${progress} Generating "${dishName}"...`);

      const recipe = await generateRecipe(
        dishName,
        categoryData.name,
        categoryData.emoji
      );

      if (recipe) {
        results.recipes[categoryKey].dishes.push(recipe);
        results.metadata.successful++;
        console.log(' ✅');
      } else {
        results.metadata.failed++;
        console.log(' ❌ FAILED');
      }

      results.metadata.total_recipes++;

      // Rate limiting: 15 requests per minute = 4 second delay
      await new Promise(resolve => setTimeout(resolve, 4000));
    }

    // Save progress after each category
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`\n💾 Progress saved (${results.metadata.successful}/${results.metadata.total_recipes} recipes)`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('🎉 GENERATION COMPLETE!');
  console.log('='.repeat(50));
  console.log(`✅ Successful: ${results.metadata.successful}`);
  console.log(`❌ Failed: ${results.metadata.failed}`);
  console.log(`📁 Output: ${OUTPUT_FILE}`);
  console.log('\n💡 Next steps:');
  console.log('1. Review generated recipes manually');
  console.log('2. Edit any incorrect/placeholder data');
  console.log('3. Run seeding script to upload to Supabase');
}

// Run generation
generateAllRecipes().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
