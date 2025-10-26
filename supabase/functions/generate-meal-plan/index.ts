/**
 * Generate Meal Plan Edge Function
 *
 * Purpose: Use Gemini AI to generate a weekly meal plan based on user's pantry and preferences
 * Input: household_id, meal_plan_id, constraints (locked meals, dietary restrictions, etc.)
 * Output: Array of suggested meals with rationale
 *
 * Algorithm:
 * 1. Fetch user's pantry items
 * 2. Fetch available cook cards with pantry match scores
 * 3. Fetch locked meals (if regenerating)
 * 4. Call Gemini with structured prompt
 * 5. Parse and validate AI response
 * 6. Return suggested meals for client to add
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GenerateMealPlanRequest {
  household_id: string;
  meal_plan_id: string;
  user_id: string;
  constraints?: {
    locked_meal_ids?: string[];
    dietary_restrictions?: string[];
    max_prep_time?: number;
    avoid_ingredients?: string[];
    preferred_cuisines?: string[];
  };
}

interface SuggestedMeal {
  day: string; // ISO date
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  cook_card_id: string;
  rationale: string;
  pantry_match_estimate: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body: GenerateMealPlanRequest = await req.json();
    const { household_id, meal_plan_id, user_id, constraints } = body;

    console.log("🤖 Generating meal plan", {
      household_id,
      meal_plan_id,
      constraints,
    });

    // 1. Fetch pantry items for household
    const { data: pantryItems, error: pantryError } = await supabaseClient
      .from("pantry_items")
      .select("name, quantity, unit")
      .eq("household_id", household_id)
      .eq("status", "active");

    if (pantryError) throw pantryError;

    const pantryList = (pantryItems || [])
      .map((item) => `${item.name} (${item.quantity} ${item.unit})`)
      .join(", ");

    console.log(`📦 Pantry: ${pantryItems?.length || 0} items`);

    // 2. Fetch cook cards (limit to recent/popular ones for performance)
    const { data: cookCards, error: cookCardsError } = await supabaseClient
      .from("cook_cards")
      .select(
        `
        id,
        title,
        cuisine_type,
        cook_time_minutes,
        total_time_minutes,
        servings,
        ingredients:cook_card_ingredients(ingredient_name)
      `
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (cookCardsError) throw cookCardsError;

    console.log(`🍳 Available recipes: ${cookCards?.length || 0}`);

    // 3. Fetch locked meals (if regenerating)
    let lockedMeals: any[] = [];
    if (constraints?.locked_meal_ids && constraints.locked_meal_ids.length > 0) {
      const { data, error } = await supabaseClient
        .from("planned_meals")
        .select(
          `
          id,
          planned_date,
          meal_type,
          cook_card:cook_cards(id, title)
        `
        )
        .in("id", constraints.locked_meal_ids);

      if (!error) lockedMeals = data || [];
    }

    // 4. Fetch week date range from meal plan
    const { data: mealPlan, error: planError } = await supabaseClient
      .from("meal_plans")
      .select("week_start_date, week_end_date")
      .eq("id", meal_plan_id)
      .single();

    if (planError) throw planError;

    // Generate 7 days starting from week_start_date
    const weekDays: string[] = [];
    const startDate = new Date(mealPlan.week_start_date);
    for (let i = 0; i < 7; i++) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      weekDays.push(day.toISOString().split("T")[0]);
    }

    // 5. Call Gemini AI
    const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY") || "");
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
    });

    const prompt = `
You are a meal planning assistant. Generate a weekly meal plan based on the user's pantry inventory and available recipes.

**User's Pantry:**
${pantryList || "Empty pantry"}

**Available Recipes:**
${cookCards
  ?.map(
    (recipe, idx) =>
      `${idx + 1}. ${recipe.title} (ID: ${recipe.id})
   - Cuisine: ${recipe.cuisine_type || "N/A"}
   - Cook time: ${recipe.cook_time_minutes || recipe.total_time_minutes || "N/A"} min
   - Ingredients: ${recipe.ingredients?.map((i: any) => i.ingredient_name).join(", ") || "N/A"}`
  )
  .join("\n\n")}

**Week to Plan:**
${weekDays.map((day, idx) => `${idx + 1}. ${day} (${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][idx]})`).join("\n")}

**Constraints:**
- Dietary restrictions: ${constraints?.dietary_restrictions?.join(", ") || "None"}
- Max prep time: ${constraints?.max_prep_time ? `${constraints.max_prep_time} minutes` : "No limit"}
- Avoid ingredients: ${constraints?.avoid_ingredients?.join(", ") || "None"}
- Preferred cuisines: ${constraints?.preferred_cuisines?.join(", ") || "No preference"}

**Locked Meals (must not change):**
${
  lockedMeals.length > 0
    ? lockedMeals
        .map(
          (m) =>
            `- ${m.planned_date} ${m.meal_type}: ${m.cook_card?.title} (ID: ${m.cook_card?.id})`
        )
        .join("\n")
    : "None"
}

**Task:**
Generate a meal plan for the week with 2-3 meals per day (lunch and/or dinner). Prioritize recipes that:
1. Use ingredients from the user's pantry (high pantry match)
2. Are varied (different cuisines, proteins, cooking methods)
3. Respect all constraints
4. Are practical and balanced

**Output Format (JSON only, no markdown):**
{
  "meals": [
    {
      "day": "YYYY-MM-DD",
      "meal_type": "lunch" | "dinner",
      "cook_card_id": "uuid",
      "rationale": "Why this recipe was chosen (1 sentence)",
      "pantry_match_estimate": 70
    }
  ],
  "overall_rationale": "Brief explanation of the meal plan strategy (2-3 sentences)"
}

Return ONLY valid JSON, no additional text.
`;

    console.log("🤖 Calling Gemini API...");
    const startTime = Date.now();

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    const generationTimeMs = Date.now() - startTime;
    console.log(`⏱️ Generation time: ${generationTimeMs}ms`);

    // Extract JSON from response (handle potential markdown wrapping)
    let jsonText = text.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```\n?/g, "");
    }

    const aiResponse = JSON.parse(jsonText);

    console.log(`✅ Generated ${aiResponse.meals?.length || 0} meal suggestions`);

    // 6. Save AI generation to ai_meal_generations table
    const { error: saveError } = await supabaseClient
      .from("ai_meal_generations")
      .insert({
        meal_plan_id,
        user_id,
        constraints_json: constraints || {},
        suggested_meals: aiResponse.meals,
        rationale: aiResponse.overall_rationale,
        generation_time_ms: generationTimeMs,
        cost_cents: Math.ceil(generationTimeMs / 1000), // Rough estimate: 1¢ per second
        cache_hit: false,
        user_accepted: null,
      });

    if (saveError) {
      console.error("⚠️ Failed to save AI generation:", saveError);
    }

    // Return suggested meals to client
    return new Response(
      JSON.stringify({
        success: true,
        meals: aiResponse.meals,
        rationale: aiResponse.overall_rationale,
        generation_time_ms: generationTimeMs,
        model: "gemini-2.0-flash-exp",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Error generating meal plan:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to generate meal plan",
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
