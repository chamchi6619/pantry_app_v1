/**
 * L2 Quality Study Script (Node.js ES6 version)
 * PRD Reference: COOKCARD_PRD_V1.md - Day 3-4 L2 Quality Study
 *
 * Purpose: Test regex ingredient parser on 20 diverse YouTube videos
 *
 * Usage:
 * YOUTUBE_API_KEY="your_key" node scripts/l2_quality_study.js
 */

import fs from 'fs';

// Test video sample - Using current popular recipe videos from YouTube search
// Updated with 20 diverse videos across categories (quick, baking, healthy, dinner, breakfast)
const TEST_VIDEOS = [
  {
    url: "https://www.youtube.com/watch?v=qH__o17xHls",
    title: "5 Minutes EASY Egg Fried Rice",
    category: "quick",
  },
  {
    url: "https://www.youtube.com/watch?v=3ZI6fsJ8MF4",
    title: "Noodles without Noodles",
    category: "quick",
  },
  {
    url: "https://www.youtube.com/watch?v=_HonL1arbaA",
    title: "3-Ingredient Oreo Cake",
    category: "baking",
  },
  {
    url: "https://www.youtube.com/watch?v=3iMBt5_X8bs",
    title: "3 Ingredients Chocolate Milk Pudding",
    category: "baking",
  },
  {
    url: "https://www.youtube.com/watch?v=3NP7g52Jemo",
    title: "5 MIN Tasty Recipe",
    category: "quick",
  },
  {
    url: "https://www.youtube.com/watch?v=r1ZLSbQ0r0I",
    title: "How to Make French Toast",
    category: "breakfast",
  },
  {
    url: "https://www.youtube.com/watch?v=GvgQ6uEgZPw",
    title: "Dough Pastry Recipes",
    category: "baking",
  },
  {
    url: "https://www.youtube.com/watch?v=uREFpDPDDfM",
    title: "Dubai chocolate",
    category: "baking",
  },
  {
    url: "https://www.youtube.com/watch?v=Mgvpmzocbjg",
    title: "Börek",
    category: "baking",
  },
  {
    url: "https://www.youtube.com/watch?v=8JDO3fp_hUc",
    title: "Christmas desserts",
    category: "baking",
  },
  {
    url: "https://www.youtube.com/watch?v=wvnS9zeXV1M",
    title: "8 Desserts in 1 Sheet Tray",
    category: "baking",
  },
  {
    url: "https://www.youtube.com/watch?v=zBEgoOhBXmY",
    title: "Healthy Food is NOT BORING",
    category: "healthy",
  },
  {
    url: "https://www.youtube.com/watch?v=tosO4rbxRYE",
    title: "What I'd Mealprep my son for school",
    category: "healthy",
  },
  {
    url: "https://www.youtube.com/watch?v=3byLB0vIbjI",
    title: "Cheesy Tasty snack",
    category: "healthy",
  },
  {
    url: "https://www.youtube.com/watch?v=xwJrAIYliE0",
    title: "pack husband's lunch for the week",
    category: "healthy",
  },
  {
    url: "https://www.youtube.com/watch?v=t2Bt5FXCRQA",
    title: "Easy Healthy Dinner on a Budget",
    category: "dinner",
  },
  {
    url: "https://www.youtube.com/watch?v=gAdn9olpyh4",
    title: "Egg Curry ASMR Cooking",
    category: "dinner",
  },
  {
    url: "https://www.youtube.com/watch?v=Uxoh8OeBcWQ",
    title: "Pyaaz recipe",
    category: "dinner",
  },
  {
    url: "https://www.youtube.com/watch?v=VoaXkzJVtIo",
    title: "eating viral TikTok recipes",
    category: "dinner",
  },
  {
    url: "https://www.youtube.com/watch?v=LXKRd5i4qj4",
    title: "Special Cheesy Bread Omlet Recipe",
    category: "breakfast",
  },
];

/**
 * Fetch YouTube video description
 */
async function fetchYouTubeDescription(url, apiKey) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new Error(`Could not extract video ID from URL: ${url}`);
  }

  const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;
  const response = await fetch(apiUrl);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`YouTube API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();

  if (!data.items || data.items.length === 0) {
    throw new Error(`No video found for ID: ${videoId}`);
  }

  return data.items[0].snippet.description || "";
}

function extractYouTubeVideoId(url) {
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
 * L2 ingredient parser (ported from ingredientRegex.ts)
 */

// Units
const UNITS = [
  'cup', 'cups', 'c', 'tablespoon', 'tablespoons', 'tbsp', 'tbs', 'T',
  'teaspoon', 'teaspoons', 'tsp', 'ts', 't', 'ounce', 'ounces', 'oz',
  'pound', 'pounds', 'lb', 'lbs', 'gram', 'grams', 'g', 'pinch', 'pinches',
  'dash', 'dashes', 'clove', 'cloves'
];
const UNIT_PATTERN = UNITS.join('|');
const QTY_PATTERN = '(?:\\d+\\s*-\\s*\\d+|\\d+\\s+to\\s+\\d+|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+\\.\\d+|\\d+)';

// Patterns (bullet is optional at start of line)
const STRONG_PATTERN = new RegExp(
  `^[\\-•\\u2022\\*\\+]?\\s*(${QTY_PATTERN})\\s+(${UNIT_PATTERN})\\s+(?:of\\s+)?(.+)`,
  'i'
);
const MEDIUM_PATTERN = new RegExp(
  `^[\\-•\\u2022\\*\\+]?\\s*(${UNIT_PATTERN})\\s+(?:of\\s+)?(.+)`,
  'i'
);
const SOFT_WORDS = ['pinch', 'dash', 'handful', 'sprinkle', 'to taste'];
const SOFT_PATTERN = new RegExp(
  `^[\\-•\\u2022\\*\\+]?\\s*(${SOFT_WORDS.join('|')})\\s+(?:of\\s+)?(.*)`,
  'i'
);

const NOISE_PATTERNS = [
  /http(s)?:\/\//i, /subscribe/i, /sponsor/i, /discount/i, /link\s?in\s?bio/i,
  /instagram/i, /tiktok/i, /youtube/i, /^\d+\.\s/i
];

function parseIngredientsFromText(text, debug = false) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const ingredients = [];
  let sortOrder = 0;

  for (const line of lines) {
    if (debug && line.match(/\d+\s+(tbsp|cup|tsp|oz|lb)/i)) {
      console.log(`   [DEBUG] Testing line: "${line}"`);
    }

    // Skip noise
    if (NOISE_PATTERNS.some(rx => rx.test(line))) {
      if (debug && line.match(/\d+\s+(tbsp|cup|tsp|oz|lb)/i)) {
        console.log(`   [DEBUG] Skipped as noise`);
      }
      continue;
    }
    if (line.length > 150) continue;

    // Try strong pattern (quantity + unit + name)
    let match = STRONG_PATTERN.exec(line);
    if (match) {
      if (debug) console.log(`   [DEBUG] STRONG match: ${line}`);
      ingredients.push({
        name: match[3].trim().toLowerCase(),
        confidence: 0.92,
        sort_order: sortOrder++
      });
      continue;
    }

    // Try medium pattern (unit + name, no quantity)
    match = MEDIUM_PATTERN.exec(line);
    if (match) {
      if (debug) console.log(`   [DEBUG] MEDIUM match: ${line}`);
      ingredients.push({
        name: match[2].trim().toLowerCase(),
        confidence: 0.80,
        sort_order: sortOrder++
      });
      continue;
    }

    // Try soft pattern (pinch, dash, to taste)
    match = SOFT_PATTERN.exec(line);
    if (match) {
      if (debug) console.log(`   [DEBUG] SOFT match: ${line}`);
      ingredients.push({
        name: (match[2] || match[1]).trim().toLowerCase(),
        confidence: 0.75,
        sort_order: sortOrder++
      });
    }
  }

  return ingredients;
}

/**
 * Run quality study
 */
async function runQualityStudy() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY environment variable not set");
  }

  console.log("🔬 L2 Quality Study - Starting...");
  console.log(`📊 Testing ${TEST_VIDEOS.length} YouTube videos\n`);

  const results = [];

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

      // Parse ingredients
      const ingredients = parseIngredientsFromText(description, false);

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

      // Delay to respect YouTube API rate limits
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

/**
 * Main execution
 */
async function main() {
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
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${outputPath}`);

  } catch (err) {
    console.error("❌ Quality study failed:", err.message);
    process.exit(1);
  }
}

main();
