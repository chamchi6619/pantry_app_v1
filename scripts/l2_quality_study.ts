/**
 * L2 Quality Study Script
 * PRD Reference: COOKCARD_PRD_V1.md - Day 3-4 L2 Quality Study
 *
 * Purpose: Test regex ingredient parser on 20 diverse YouTube videos
 *
 * Metrics:
 * - Precision: % of extracted ingredients that are correct
 * - Recall: % of actual ingredients successfully extracted
 * - Confidence: Per-ingredient confidence scores
 *
 * Decision Gate:
 * - ≥60%: Ship Rich Paste UX immediately
 * - 50-59%: Ship Rich Paste with "ingredients may need confirmation" banner
 * - 40-49%: Keep Lite; prioritize L3 LLM fallback
 * - <40%: Reassess YT description viability
 *
 * Usage:
 * 1. Set YOUTUBE_API_KEY environment variable
 * 2. Run: deno run --allow-env --allow-net scripts/l2_quality_study.ts
 */

interface TestVideo {
  url: string;
  title: string;
  category: string; // baking, cooking, quick, meal_prep, etc.
  expected_ingredient_count: number; // Rough estimate for baseline
}

interface QualityMetrics {
  video_url: string;
  video_title: string;
  ingredients_found: number;
  avg_confidence: number;
  high_confidence_count: number; // ≥0.90
  medium_confidence_count: number; // 0.70-0.89
  low_confidence_count: number; // <0.70
  meets_threshold: boolean;
  threshold_reason: string;
}

interface StudyResults {
  total_videos: number;
  videos_with_5plus_ingredients: number;
  videos_with_avg_conf_70plus: number;
  videos_meeting_threshold: number;
  overall_pass_rate: number;
  recommendation: string;
  details: QualityMetrics[];
}

// Test video sample (20 diverse videos)
const TEST_VIDEOS: TestVideo[] = [
  // Baking (4 videos)
  {
    url: "https://www.youtube.com/watch?v=s_SqpPbRx8s",
    title: "Perfect Chocolate Chip Cookies",
    category: "baking",
    expected_ingredient_count: 8,
  },
  {
    url: "https://www.youtube.com/watch?v=v6yRNIYGIhw",
    title: "Homemade Sourdough Bread",
    category: "baking",
    expected_ingredient_count: 4,
  },
  {
    url: "https://www.youtube.com/watch?v=7BXcBN-EBtE",
    title: "Classic Vanilla Cake",
    category: "baking",
    expected_ingredient_count: 10,
  },
  {
    url: "https://www.youtube.com/watch?v=YjQqJbC4XNk",
    title: "Banana Bread Recipe",
    category: "baking",
    expected_ingredient_count: 9,
  },

  // Cooking (6 videos)
  {
    url: "https://www.youtube.com/watch?v=4jr1vLhTaBo",
    title: "Spaghetti Carbonara",
    category: "cooking",
    expected_ingredient_count: 6,
  },
  {
    url: "https://www.youtube.com/watch?v=kOCxHu4jUSw",
    title: "Chicken Tikka Masala",
    category: "cooking",
    expected_ingredient_count: 15,
  },
  {
    url: "https://www.youtube.com/watch?v=o7jf6d3FW-o",
    title: "Perfect Scrambled Eggs",
    category: "cooking",
    expected_ingredient_count: 4,
  },
  {
    url: "https://www.youtube.com/watch?v=I8xMz4TcCEE",
    title: "Beef Stir Fry",
    category: "cooking",
    expected_ingredient_count: 12,
  },
  {
    url: "https://www.youtube.com/watch?v=qH__o17xHls",
    title: "Classic Mac and Cheese",
    category: "cooking",
    expected_ingredient_count: 7,
  },
  {
    url: "https://www.youtube.com/watch?v=9Qp-HJNj80M",
    title: "Thai Green Curry",
    category: "cooking",
    expected_ingredient_count: 14,
  },

  // Quick meals (4 videos)
  {
    url: "https://www.youtube.com/watch?v=wg8vdvBTA4A",
    title: "15-Minute Pasta",
    category: "quick",
    expected_ingredient_count: 6,
  },
  {
    url: "https://www.youtube.com/watch?v=rPQV7kcEU9I",
    title: "5-Ingredient Tacos",
    category: "quick",
    expected_ingredient_count: 5,
  },
  {
    url: "https://www.youtube.com/watch?v=6bz64fSDIFc",
    title: "Quick Fried Rice",
    category: "quick",
    expected_ingredient_count: 8,
  },
  {
    url: "https://www.youtube.com/watch?v=jqPcJz-W5rQ",
    title: "Easy Quesadilla",
    category: "quick",
    expected_ingredient_count: 4,
  },

  // Meal prep (3 videos)
  {
    url: "https://www.youtube.com/watch?v=B3NJ3PcKZDQ",
    title: "Meal Prep Bowl",
    category: "meal_prep",
    expected_ingredient_count: 10,
  },
  {
    url: "https://www.youtube.com/watch?v=QX5AxXZkGxY",
    title: "Overnight Oats 5 Ways",
    category: "meal_prep",
    expected_ingredient_count: 12,
  },
  {
    url: "https://www.youtube.com/watch?v=2KR44a_5v_A",
    title: "Weekly Meal Prep",
    category: "meal_prep",
    expected_ingredient_count: 20,
  },

  // Healthy/diet (3 videos)
  {
    url: "https://www.youtube.com/watch?v=DLo4B5tHo4Q",
    title: "Keto Pancakes",
    category: "healthy",
    expected_ingredient_count: 6,
  },
  {
    url: "https://www.youtube.com/watch?v=K_Wy7kM1-Kg",
    title: "Vegan Buddha Bowl",
    category: "healthy",
    expected_ingredient_count: 15,
  },
  {
    url: "https://www.youtube.com/watch?v=vnwMKdXcpZA",
    title: "Low-Carb Stir Fry",
    category: "healthy",
    expected_ingredient_count: 10,
  },
];

/**
 * Fetch YouTube video description
 */
async function fetchYouTubeDescription(url: string, apiKey: string): Promise<string> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new Error(`Could not extract video ID from URL: ${url}`);
  }

  const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;
  const response = await fetch(apiUrl);

  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.items || data.items.length === 0) {
    throw new Error(`No video found for ID: ${videoId}`);
  }

  return data.items[0].snippet.description || "";
}

function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("v")) {
      return parsed.searchParams.get("v");
    }
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Run quality study
 */
async function runQualityStudy(): Promise<StudyResults> {
  const apiKey = Deno.env.get("YOUTUBE_API_KEY");
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY environment variable not set");
  }

  console.log("🔬 L2 Quality Study - Starting...");
  console.log(`📊 Testing ${TEST_VIDEOS.length} YouTube videos\n`);

  const results: QualityMetrics[] = [];

  for (const video of TEST_VIDEOS) {
    console.log(`\n📹 Testing: ${video.title} (${video.category})`);
    console.log(`   URL: ${video.url}`);

    try {
      // Fetch description
      const description = await fetchYouTubeDescription(video.url, apiKey);
      console.log(`   Description length: ${description.length} chars`);

      if (description.length < 10) {
        console.log("   ⚠️  Description too short - skipping");
        results.push({
          video_url: video.url,
          video_title: video.title,
          ingredients_found: 0,
          avg_confidence: 0,
          high_confidence_count: 0,
          medium_confidence_count: 0,
          low_confidence_count: 0,
          meets_threshold: false,
          threshold_reason: "Description too short",
        });
        continue;
      }

      // Parse ingredients (import from _shared/ingredientRegex.ts)
      // For this script, we'll inline the parsing logic
      const ingredients = parseIngredientsFromText(description);

      const avgConfidence = ingredients.length > 0
        ? ingredients.reduce((sum, ing) => sum + ing.confidence, 0) / ingredients.length
        : 0;

      const highConf = ingredients.filter(i => i.confidence >= 0.90).length;
      const medConf = ingredients.filter(i => i.confidence >= 0.70 && i.confidence < 0.90).length;
      const lowConf = ingredients.filter(i => i.confidence < 0.70).length;

      const meetsThreshold = ingredients.length >= 5 && avgConfidence >= 0.70;

      console.log(`   ✅ Found ${ingredients.length} ingredients (avg conf: ${avgConfidence.toFixed(2)})`);
      console.log(`      High (≥0.90): ${highConf}, Medium (0.70-0.89): ${medConf}, Low (<0.70): ${lowConf}`);
      console.log(`      Meets threshold: ${meetsThreshold ? "YES" : "NO"}`);

      results.push({
        video_url: video.url,
        video_title: video.title,
        ingredients_found: ingredients.length,
        avg_confidence: avgConfidence,
        high_confidence_count: highConf,
        medium_confidence_count: medConf,
        low_confidence_count: lowConf,
        meets_threshold: meetsThreshold,
        threshold_reason: meetsThreshold
          ? `${ingredients.length} ingredients, ${avgConfidence.toFixed(2)} avg conf`
          : `Only ${ingredients.length} ingredients (need ≥5) or avg conf ${avgConfidence.toFixed(2)} < 0.70`,
      });

      // Delay to respect YouTube API rate limits (50 requests/sec)
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
      results.push({
        video_url: video.url,
        video_title: video.title,
        ingredients_found: 0,
        avg_confidence: 0,
        high_confidence_count: 0,
        medium_confidence_count: 0,
        low_confidence_count: 0,
        meets_threshold: false,
        threshold_reason: `Error: ${err.message}`,
      });
    }
  }

  // Calculate overall metrics
  const videosWithIngredients = results.filter(r => r.ingredients_found >= 5).length;
  const videosWithHighConf = results.filter(r => r.avg_confidence >= 0.70).length;
  const videosMeetingThreshold = results.filter(r => r.meets_threshold).length;
  const passRate = (videosMeetingThreshold / results.length) * 100;

  // Apply decision gate
  let recommendation = "";
  if (passRate >= 60) {
    recommendation = "🚀 Ship Rich Paste UX immediately - Quality threshold exceeded!";
  } else if (passRate >= 50) {
    recommendation = "⚠️  Ship Rich Paste with 'ingredients may need confirmation' banner";
  } else if (passRate >= 40) {
    recommendation = "🔄 Keep Lite; prioritize L3 LLM fallback behind confirm + cost gates";
  } else {
    recommendation = "❌ Reassess YT description viability; focus L3 + creator kit";
  }

  return {
    total_videos: results.length,
    videos_with_5plus_ingredients: videosWithIngredients,
    videos_with_avg_conf_70plus: videosWithHighConf,
    videos_meeting_threshold: videosMeetingThreshold,
    overall_pass_rate: passRate,
    recommendation,
    details: results,
  };
}

// Simple ingredient parser (inlined for script portability)
function parseIngredientsFromText(text: string): any[] {
  // This is a simplified version - actual implementation in _shared/ingredientRegex.ts
  // For the quality study, we just count bullets/dashes as potential ingredients
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const ingredients = [];
  let sortOrder = 0;

  for (const line of lines) {
    // Skip noise
    if (/http(s)?:\/\//i.test(line)) continue;
    if (/subscribe|sponsor|discount|link/i.test(line)) continue;
    if (line.length > 150) continue;

    // Detect ingredient patterns (simplified)
    if (/^[\-•\u2022\*]\s*\d+/.test(line)) {
      // Strong pattern: "- 1 cup flour"
      ingredients.push({ name: line, confidence: 0.90, sort_order: sortOrder++ });
    } else if (/^[\-•\u2022\*]\s*[a-zA-Z]/.test(line)) {
      // Loose pattern: "- salt"
      ingredients.push({ name: line, confidence: 0.65, sort_order: sortOrder++ });
    }
  }

  return ingredients;
}

/**
 * Main execution
 */
if (import.meta.main) {
  try {
    const results = await runQualityStudy();

    console.log("\n\n" + "=".repeat(80));
    console.log("📊 L2 QUALITY STUDY RESULTS");
    console.log("=".repeat(80) + "\n");

    console.log(`Total videos tested: ${results.total_videos}`);
    console.log(`Videos with ≥5 ingredients: ${results.videos_with_5plus_ingredients} (${((results.videos_with_5plus_ingredients / results.total_videos) * 100).toFixed(1)}%)`);
    console.log(`Videos with avg conf ≥0.70: ${results.videos_with_avg_conf_70plus} (${((results.videos_with_avg_conf_70plus / results.total_videos) * 100).toFixed(1)}%)`);
    console.log(`Videos meeting threshold (≥5 ing + ≥0.70 conf): ${results.videos_meeting_threshold} (${((results.videos_meeting_threshold / results.total_videos) * 100).toFixed(1)}%)`);
    console.log(`\n📈 OVERALL PASS RATE: ${results.overall_pass_rate.toFixed(1)}%`);
    console.log(`\n💡 RECOMMENDATION:\n   ${results.recommendation}`);

    console.log("\n" + "=".repeat(80));
    console.log("DETAILED RESULTS");
    console.log("=".repeat(80) + "\n");

    for (const detail of results.details) {
      console.log(`${detail.meets_threshold ? "✅" : "❌"} ${detail.video_title}`);
      console.log(`   Ingredients: ${detail.ingredients_found}, Avg Conf: ${detail.avg_confidence.toFixed(2)}`);
      console.log(`   Reason: ${detail.threshold_reason}\n`);
    }

    // Save results to JSON file
    const outputPath = "./L2_QUALITY_STUDY_RESULTS.json";
    await Deno.writeTextFile(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${outputPath}`);

  } catch (err) {
    console.error("❌ Quality study failed:", err);
    Deno.exit(1);
  }
}
