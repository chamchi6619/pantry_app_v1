/**
 * Fix Failed Recipe Generation Script
 *
 * Regenerates the 4 failed recipes with adjusted prompts to handle edge cases
 */

const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('❌ Error: GEMINI_API_KEY environment variable not set');
  process.exit(1);
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Failed recipes to regenerate
const FAILED_RECIPES = [
  { dish: "Lasagna Bolognese", category: "italian", reason: "MAX_TOKENS" },
  { dish: "Kimchi Jjigae (Kimchi Stew)", category: "korean", reason: "JSON_PARSE_ERROR" },
  { dish: "Mandu (Dumplings)", category: "korean", reason: "MAX_TOKENS" },
  { dish: "Brownies", category: "american comfort", reason: "INVALID_DIFFICULTY" }
];

/**
 * Generate recipe with CONCISE prompt to avoid MAX_TOKENS
 */
async function generateRecipeConcise(dishName, category) {
  const prompt = `Generate a recipe for "${dishName}" (${category} cuisine).

Return ONLY valid JSON (no markdown, no backticks in text, no explanation):

{
  "title": "${dishName}",
  "description": "<2 sentences maximum>",
  "category": "${category.toLowerCase()}",
  "prep_time_minutes": <number>,
  "cook_time_minutes": <number>,
  "total_time_minutes": <number>,
  "servings": 4,
  "difficulty": "<MUST be exactly: easy, medium, OR hard>",
  "tags": ["${category.toLowerCase()}", "<difficulty>", "<dietary_info>"],
  "ingredients": [
    {
      "ingredient_name": "<full name>",
      "normalized_name": "<simplified>",
      "canonical_item_mapping": "<pantry item>",
      "amount": <number or null>,
      "unit": "<cup|tbsp|tsp|lb|oz|g|ml|piece or null>",
      "preparation": "<prep or null>",
      "sort_order": <number>,
      "is_optional": <boolean>
    }
  ],
  "instructions": [
    {
      "step_number": <number>,
      "instruction_text": "<CONCISE step - keep brief>"
    }
  ]
}

CRITICAL RULES:
1. difficulty MUST be EXACTLY "easy", "medium", or "hard" (no combinations like "easy-medium")
2. Keep instructions BRIEF (1-2 sentences per step)
3. NO backticks (\`) in any text fields
4. NO markdown formatting
5. For complex recipes like lasagna/dumplings: combine multiple actions into single steps
6. Return ONLY the JSON object

Example concise instruction:
"Heat oil, sauté garlic until fragrant, add chicken and cook until browned (5-7 min)."

NOT:
"First, heat the oil. Then add garlic. Wait until it's fragrant. Now add chicken..."`;

  try {
    console.log(`\n🔄 Regenerating "${dishName}"...`);

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7, // Lower temp for more consistent output
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    // Check for truncation
    if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      throw new Error('Still truncated even with concise prompt');
    }

    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!generatedText) {
      const finishReason = data.candidates?.[0]?.finishReason || 'UNKNOWN';
      throw new Error(`No text in response (finishReason: ${finishReason})`);
    }

    // Extract JSON
    let jsonText = generatedText.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '');
    }

    // Remove any stray backticks
    jsonText = jsonText.replace(/`/g, '"');

    const recipe = JSON.parse(jsonText);

    // Validate
    const required = ['title', 'description', 'category', 'servings', 'difficulty', 'ingredients', 'instructions', 'total_time_minutes'];
    for (const field of required) {
      if (!recipe[field]) throw new Error(`Missing: ${field}`);
    }

    // Validate difficulty
    if (!['easy', 'medium', 'hard'].includes(recipe.difficulty)) {
      // Auto-fix if it's a combination
      if (recipe.difficulty.includes('easy')) recipe.difficulty = 'easy';
      else if (recipe.difficulty.includes('medium')) recipe.difficulty = 'medium';
      else if (recipe.difficulty.includes('hard')) recipe.difficulty = 'hard';
      else throw new Error(`Invalid difficulty: ${recipe.difficulty}`);
    }

    // Validate structure
    if (recipe.ingredients.length === 0) throw new Error('No ingredients');
    if (recipe.instructions.length === 0) throw new Error('No instructions');

    for (const ing of recipe.ingredients) {
      if (!ing.ingredient_name || !ing.canonical_item_mapping || ing.sort_order === undefined) {
        throw new Error(`Invalid ingredient: ${JSON.stringify(ing)}`);
      }
    }

    for (const step of recipe.instructions) {
      if (!step.step_number || !step.instruction_text) {
        throw new Error(`Invalid instruction: ${JSON.stringify(step)}`);
      }
    }

    console.log(`✅ Success! (${recipe.ingredients.length} ingredients, ${recipe.instructions.length} steps, ${recipe.difficulty})`);
    return recipe;

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return null;
  }
}

/**
 * Regenerate all failed recipes
 */
async function fixFailedRecipes() {
  console.log('🔧 FIXING FAILED RECIPES');
  console.log('='.repeat(70));
  console.log(`Attempting to regenerate ${FAILED_RECIPES.length} failed recipes with adjusted prompts\n`);

  const results = {
    successful: [],
    failed: []
  };

  for (let i = 0; i < FAILED_RECIPES.length; i++) {
    const { dish, category, reason } = FAILED_RECIPES[i];
    console.log(`\n[${i + 1}/${FAILED_RECIPES.length}] ${dish}`);
    console.log(`   Original failure: ${reason}`);

    const recipe = await generateRecipeConcise(dish, category);

    if (recipe) {
      results.successful.push({ dish, category, recipe });
    } else {
      results.failed.push({ dish, category, reason });
    }

    // Rate limiting
    if (i < FAILED_RECIPES.length - 1) {
      console.log('⏳ Waiting 4 seconds...');
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
  }

  // Save results
  const outputFile = path.join(__dirname, 'fixed_recipes.json');
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

  console.log('\n' + '='.repeat(70));
  console.log('🎉 FIX ATTEMPT COMPLETE');
  console.log('='.repeat(70));
  console.log(`✅ Successfully regenerated: ${results.successful.length}/${FAILED_RECIPES.length}`);
  console.log(`❌ Still failed: ${results.failed.length}`);
  console.log(`📁 Output: ${outputFile}`);

  if (results.successful.length > 0) {
    console.log('\n📋 Successfully regenerated recipes:');
    results.successful.forEach(({ dish, recipe }) => {
      console.log(`   ✅ ${dish} (${recipe.difficulty}, ${recipe.ingredients.length} ingredients)`);
    });
  }

  if (results.failed.length > 0) {
    console.log('\n❌ Still failed:');
    results.failed.forEach(({ dish, reason }) => {
      console.log(`   ❌ ${dish} (${reason})`);
    });
    console.log('\n💡 These can be manually created or simplified further.');
  }
}

fixFailedRecipes().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
