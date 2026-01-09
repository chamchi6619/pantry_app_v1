/**
 * Debug script to test Gemini API responses and identify failure causes
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('❌ Error: GEMINI_API_KEY environment variable not set');
  process.exit(1);
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

async function testGeminiResponse(dishName, category) {
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
}`;

  console.log(`\n🔍 Testing: ${dishName} (${category})`);
  console.log('='.repeat(70));

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 3072,
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ HTTP Error:', response.status, response.statusText);
      console.log('Response:', errorText);
      return;
    }

    const data = await response.json();

    // Debug: Log full response structure
    console.log('\n📦 API Response Structure:');
    console.log('  candidates:', data.candidates ? 'EXISTS' : 'MISSING');
    console.log('  candidates.length:', data.candidates?.length);
    console.log('  promptFeedback:', JSON.stringify(data.promptFeedback, null, 2));

    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0];
      console.log('  finishReason:', candidate.finishReason);
      console.log('  safetyRatings:', JSON.stringify(candidate.safetyRatings, null, 2));

      if (candidate.content?.parts?.[0]?.text) {
        const generatedText = candidate.content.parts[0].text;
        console.log('  text.length:', generatedText.length);
        console.log('  text.preview:', generatedText.substring(0, 200) + '...');

        // Try to extract JSON
        let jsonText = generatedText.trim();
        if (jsonText.startsWith('```json')) {
          jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/```\n?/g, '');
        }

        console.log('\n📝 Extracted JSON Preview:');
        console.log('  starts with:', jsonText.substring(0, 50));
        console.log('  ends with:', jsonText.substring(jsonText.length - 50));

        try {
          const recipe = JSON.parse(jsonText);
          console.log('\n✅ JSON Parse Success!');
          console.log('  title:', recipe.title);
          console.log('  ingredients:', recipe.ingredients?.length);
          console.log('  instructions:', recipe.instructions?.length);
        } catch (parseError) {
          console.log('\n❌ JSON Parse Failed:');
          console.log('  error:', parseError.message);
          console.log('\n🔍 Full extracted text:');
          console.log(jsonText);
        }
      } else {
        console.log('❌ No text in candidate.content.parts[0]');
        console.log('  candidate.content:', JSON.stringify(candidate.content, null, 2));
      }
    } else {
      console.log('❌ No candidates in response');
      console.log('\n🔍 Full response:');
      console.log(JSON.stringify(data, null, 2));
    }

  } catch (error) {
    console.log('❌ Exception:', error.message);
    console.log('  stack:', error.stack);
  }
}

// Test the failed recipes
async function runTests() {
  const tests = [
    { dish: "Chicken Tacos", category: "mexican" },
    { dish: "Kung Pao Chicken", category: "chinese" },
    { dish: "Pad Thai", category: "thai" }
  ];

  for (const test of tests) {
    await testGeminiResponse(test.dish, test.category);
    console.log('\n⏳ Waiting 5 seconds...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

runTests();
