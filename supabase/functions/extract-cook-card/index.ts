/**
 * Extract Cook Card Edge Function
 *
 * Purpose: Ingestion ladder (L1-L3) + Secondary Evidence Ladder
 * Trigger: Share extension or manual API call
 * PRD Reference: COOKCARD_PRD_V1.md Section 4 (Core Product)
 *
 * Primary Ingestion Ladder:
 * - L1: Metadata extraction (oEmbed, 99% confidence)
 * - L2: Creator text parsing (regex, 80-95% confidence) [SKIPPED - 0% pass rate]
 * - L3: LLM-assisted extraction (70-90% confidence, requires confirmation)
 *
 * Secondary Evidence Ladder (for sparse descriptions):
 * - Pre-gate: Skip L3 if description too sparse (save 1¢)
 * - YouTube Comments: Harvest and score comments for ingredient lists
 * - Evidence Phrase Validation: Require literal substring match (prevent hallucinations)
 * - Section Header Filter: Remove meta-items like "Sauce:", "Garnish:"
 *
 * Fail-Closed: Never silently invent data. If confidence <80%, require user confirmation.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeRecipeURL, detectPlatform } from "../_shared/urlUtils.ts";
import { parseIngredientsFromText, calculateAverageConfidence } from "../_shared/ingredientRegex.ts";
import { extractIngredientsWithGemini, extractFromVideoVision } from "../_shared/llm.ts";
import { uploadToGeminiFileAPI, deleteGeminiFile } from "../_shared/geminiFileAPI.ts";
import { extractVideoUrl } from "../_shared/platformScrapers.ts";
import { extractAudioTranscript, shouldRunASR } from "../_shared/asr.ts";
import { crossValidateIngredients, combineMultiSourceText, calculateMultiSourceCost } from "../_shared/multiSourceValidation.ts";
import { normalizeIngredient } from "../_shared/normalize.ts";
import { getCachedExtraction, setCachedExtraction, computeInputHash } from "../_shared/cache.ts";
import { checkExtractionBudget, incrementExtractionCount } from "../_shared/budgetCheck.ts";
import { shouldSkipL3, formatPreGateDecision, getPreGateStats } from "../_shared/preGate.ts";
import { filterByEvidence } from "../_shared/evidenceValidation.ts";
import { filterSectionHeaders } from "../_shared/sectionHeaderFilter.ts";
import { fetchCommentsFromURL, filterToIngredientCandidates, extractIngredientsSection, extractInstructionsSection } from "../_shared/commentHarvester.ts";
import { findBestIngredientComment, analyzeCommentScores, scoreCommentForIngredients } from "../_shared/commentScoring.ts";
import { extractFromHTML } from "../_shared/htmlScraper.ts";
import { checkMonthlyQuota, checkHourlyRateLimit, incrementMonthlyQuota, checkUserL4Budget, checkGlobalL4Budget, reserveL4Budget, releaseL4Budget, RATE_LIMITS } from "../_shared/rateLimiting.ts";
import { hasRecipeQualitySignals, fetchYouTubeTranscriptSafe, groupIngredientsBySections, normalizeFractions, matchCanonicalItems } from "../_shared/extractionHelpers.ts";
import { extractMetadataWithYtDlp, uploadVideoToGeminiFileAPI, checkYtDlpAvailable } from "../_shared/ytdlp.ts";
import { getYouTubeMetadata, getYouTubeCaptions, extractYouTubeVideoId, checkYouTubeAPIAvailable } from "../_shared/youtubeAPI.ts";

interface ExtractionRequest {
  url: string;
  user_id: string;
  household_id?: string;
  bypass_cache?: boolean;
}

interface CookCard {
  version: string;
  source: {
    url: string;
    platform: string;
    creator: {
      handle?: string;
      name?: string;
      avatar_url?: string;
      verified?: boolean;
    };
  };
  title: string;
  description?: string;
  image_url?: string;
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  total_time_minutes?: number;
  servings?: number;
  instructions: {
    type: string;
    text?: string;
    steps?: any[];
  };
  ingredients: Ingredient[];
  extraction: {
    method: string;
    confidence: number;
    version: string;
    timestamp: string;
    cost_cents: number;
    evidence_source?: string;      // Evidence source for secondary ladder
    sources?: string[];            // HTML scraping sources (schema_org, html_description, etc.)
  };
}

interface Ingredient {
  name: string;
  normalized_name?: string;
  canonical_item_id?: string;
  amount?: number;
  unit?: string;
  preparation?: string;
  confidence: number;
  provenance: string;
  sort_order: number;
  is_optional?: boolean;
  evidence_phrase?: string;       // Evidence phrase for validation
  evidence_source?: string;       // Source: 'description', 'youtube_comment', etc.
  comment_score?: number | null;  // Score if sourced from comment
}

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check yt-dlp availability and version (logs version to console)
    await checkYtDlpAvailable();

    // Parse request
    const body: ExtractionRequest = await req.json();
    const { url: rawUrl, user_id, household_id, bypass_cache} = body;

    console.log(`🔧 DEBUG v78.1: Request received, bypass_cache = ${bypass_cache}`);

    if (!rawUrl || !user_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: url, user_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Normalize URL (strip tracking params, expand short URLs, mobile→desktop)
    const url = await normalizeRecipeURL(rawUrl);
    console.log(`🔍 Extracting Cook Card from: ${url}`);

    // Step 1: Detect platform (needed for cache key)
    const platform = detectPlatform(url);
    console.log(`📱 Platform detected: ${platform}`);

    // ============================================================
    // RATE LIMITING CHECKS (TEMPORARILY DISABLED)
    // ============================================================
    // Check monthly quota
    const quotaCheck = await checkMonthlyQuota(supabase, user_id);
    // DISABLED: Rate limiting temporarily disabled for testing
    // if (!quotaCheck.allowed) {
    //   console.error(`❌ Monthly quota exceeded: ${quotaCheck.reason}`);
    //   return new Response(JSON.stringify({
    //     error: quotaCheck.reason,
    //     fallback: "link_only",
    //     quota_info: {
    //       tier: quotaCheck.quota?.tier,
    //       used: quotaCheck.quota?.extractions_this_month,
    //       limit: RATE_LIMITS[quotaCheck.quota?.tier || 'free'].monthly_limit,
    //     },
    //   }), { status: 200, headers: { "Content-Type": "application/json" } });
    // }

    // DISABLED: Hourly rate limit (per-user)
    // const rateLimitCheck = await checkHourlyRateLimit(supabase, user_id, quotaCheck.quota!.tier);
    // if (!rateLimitCheck.allowed) {
    //   console.error(`❌ Hourly rate limit exceeded: ${rateLimitCheck.current_count}/${rateLimitCheck.limit}`);
    //   return new Response(JSON.stringify({
    //     error: "Too many requests. Please try again later.",
    //     retry_after_seconds: rateLimitCheck.retry_after_seconds,
    //     current_count: rateLimitCheck.current_count,
    //     limit: rateLimitCheck.limit,
    //   }), { status: 429, headers: { "Content-Type": "application/json" } });
    // }

    // DISABLED: Hourly rate limit (per-household)
    // if (household_id) {
    //   const householdRateLimitCheck = await checkHourlyRateLimit(supabase, household_id, quotaCheck.quota!.tier);
    //   if (!householdRateLimitCheck.allowed) {
    //     console.error(`❌ Household rate limit exceeded: ${householdRateLimitCheck.current_count}/${householdRateLimitCheck.limit}`);
    //     return new Response(JSON.stringify({
    //       error: "Household rate limit exceeded. Please try again later.",
    //       retry_after_seconds: householdRateLimitCheck.retry_after_seconds,
    //       current_count: householdRateLimitCheck.current_count,
    //       limit: householdRateLimitCheck.limit,
    //       scope: "household",
    //     }), { status: 429, headers: { "Content-Type": "application/json" } });
    //   }
    // }

    console.log(`⚠️  Rate limits DISABLED for testing (tier: ${quotaCheck.quota?.tier}, monthly: ${quotaCheck.quota?.extractions_this_month}/${RATE_LIMITS[quotaCheck.quota?.tier || 'free'].monthly_limit})`);

    // ============================================================
    // STEP 1: PLATFORM METADATA EXTRACTION (L0)
    // ============================================================
    console.log('📋 Step 1: Fetching platform metadata...');

    let platformMetadata = await fetchPlatformMetadata(url, platform);

    // If metadata extraction fails, use minimal fallback metadata
    // This allows Vision extraction (L4) to proceed even when yt-dlp and legacy APIs fail
    if (!platformMetadata) {
      console.warn('⚠️  Metadata extraction failed, using fallback metadata for Vision extraction');

      platformMetadata = {
        title: `Recipe from ${platform}`,
        description: '',
        thumbnail_url: '',
        duration_seconds: platform === 'youtube' ? 0 : 90, // Assume 90s for short-form platforms
        creator_name: '',
        creator_handle: '',
        metadata_source: 'fallback',
      };

      console.log(`   Using fallback metadata - will proceed to L4 Vision extraction`);
    }

    let {
      title,
      description,
      thumbnail_url,
      duration_seconds,
      creator_name,
      creator_handle,
      metadata_source,
      ytdlp_latency_ms
    } = platformMetadata;

    console.log(`✅ Metadata: "${title}" (${duration_seconds}s, ${description.length} chars, source: ${metadata_source || 'unknown'})`);

    // Log metadata extraction metrics
    await logEvent(supabase, {
      user_id,
      household_id,
      event_type: "metadata_extracted",
      metadata_source: metadata_source || 'unknown',
      platform,
      ytdlp_used: metadata_source === 'ytdlp',
      ytdlp_latency_ms: ytdlp_latency_ms || null,
      description_length: description.length,
      duration_seconds,
    });

    // Step 2: Check cache (input-hash based)
    console.log(`🔧 Cache check: bypass_cache = ${bypass_cache}`);
    const cachedExtraction = bypass_cache ? null : await getCachedExtraction(
      supabase,
      url,
      title,
      description,
      undefined // userPaste not implemented yet
    );

    if (cachedExtraction) {
      console.log("✅ Cache hit - returning cached extraction");

      // Log cache hit event
      await logEvent(supabase, {
        user_id,
        household_id,
        event_type: "url_cached",
        cache_hit: true,
        extraction_method: cachedExtraction.cook_card.extraction.method,
        extraction_confidence: cachedExtraction.cook_card.extraction.confidence,
        ingredients_count: cachedExtraction.cook_card.ingredients.length,
      });

      return new Response(JSON.stringify(cachedExtraction), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ============================================================
    // STEP 3: BUILD INITIAL COOKCARD
    // ============================================================
    console.log('🏗️  Step 3: Building CookCard from metadata...');

    const cookCard: CookCard = {
      version: "1.0",
      source: {
        url,
        platform,
        creator: {
          name: creator_name,
          handle: creator_handle,
          avatar_url: thumbnail_url, // Use thumbnail as avatar for now
        },
      },
      title,
      description,
      image_url: thumbnail_url,
      instructions: {
        type: "link_only", // Will be updated if we extract steps
      },
      ingredients: [], // Will be filled by LLM extraction
      extraction: {
        method: "metadata",
        confidence: 0.0, // No ingredients yet
        version: "L0-platform-api",
        timestamp: new Date().toISOString(),
        cost_cents: 0,
      },
    };

    let extractionCost = 0;
    const extractionStartTime = Date.now();
    let asrCost = 0; // Track ASR cost across scopes

    // ============================================================
    // STEP 3.5: SMART EXTRACTION ROUTING (NEW!)
    // ============================================================
    // For short-form videos (< 2min), prioritize L4 Vision over L3 text
    // - Vision is CHEAPER for short videos (~0.67¢ vs 1¢)
    // - Vision extracts BOTH ingredients AND instructions in ONE call
    // - Vision sees text overlays + hears audio narration
    //
    // Fix duration if unknown for TikTok/Instagram
    if ((!duration_seconds || duration_seconds === 0) && ['tiktok', 'instagram'].includes(platform)) {
      duration_seconds = 90;
      console.log(`⚠️  Duration unknown for ${platform}, assuming 90s`);
    }

    const isShortFormVideo = duration_seconds > 0 && duration_seconds <= 120; // ≤ 2 minutes
    const shortFormPlatforms = ['tiktok', 'instagram', 'xiaohongshu', 'facebook'];
    const shouldPrioritizeVision = isShortFormVideo && shortFormPlatforms.includes(platform);

    console.log(`🔀 Routing: platform=${platform}, duration=${duration_seconds}s, prioritizeVision=${shouldPrioritizeVision}`);

    // Declare variables at top level (needed for both Vision-first and text extraction paths)
    let sourceText = "";
    let evidenceSource = "";
    let commentUsed = false;
    let commentScore: number | null = null;
    let evidenceResult: any = null;
    let sectionResult: any = null;
    let transcript = ""; // For L2.5 transcript

    // ============================================================
    // STEP 4A: VISION-FIRST EXTRACTION (NEW PATH!)
    // ============================================================
    // For short-form videos, run L4 Vision FIRST (cheaper & better than L3 text)
    let visionExtractedEarly = false;

    if (shouldPrioritizeVision) {
      console.log('🎬 Step 4A: Vision-first extraction for short-form video...');
      console.log(`   Running L4 Vision to extract BOTH ingredients AND instructions in ONE call`);

      const supportedPlatforms = ['youtube', 'instagram', 'tiktok', 'xiaohongshu', 'facebook'];
      if (supportedPlatforms.includes(platform)) {
        try {
          const videoDurationMinutes = duration_seconds / 60;
          await reserveL4Budget(supabase, user_id, videoDurationMinutes);

          let visionResult;
          let fileUri: string | null = null;

          try {
            // YouTube: Use direct URL
            if (platform === 'youtube') {
              visionResult = await extractFromVideoVision(url, title, duration_seconds, false, false); // Extract BOTH
              extractionCost += visionResult.cost_cents;
            } else {
              // Instagram/TikTok/etc: Upload video to Gemini File API via Cloud Run
              console.log(`⬆️  Uploading to Gemini File API via Cloud Run...`);
              fileUri = await uploadVideoToGeminiFileAPI(url, 60000, 100); // 60s timeout, 100MB max

              if (!fileUri) {
                throw new Error(`Failed to upload video to Gemini File API for ${platform}. The video may be too large, private, region-locked, or require authentication.`);
              }

              console.log(`✅ Uploaded to File API: ${fileUri}`);

              visionResult = await extractFromVideoVision(fileUri, title, duration_seconds, false, false); // Extract BOTH
              extractionCost += visionResult.cost_cents;
            }

            // Check if Vision succeeded with sufficient ingredients
            if (visionResult.success && visionResult.ingredients.length >= 3) {
              console.log(`   ✅ L4 Vision: Extracted ${visionResult.ingredients.length} ingredients + ${visionResult.instructions.length} instructions`);

              // Populate CookCard with Vision results
              cookCard.ingredients = visionResult.ingredients.map((ing, index) => {
                const normalized = normalizeIngredient({
                  name: ing.name,
                  amount: ing.amount,
                  unit: ing.unit,
                });

                return {
                  name: normalized.name,
                  normalized_name: normalized.normalized_name,
                  amount: normalized.amount,
                  unit: normalized.unit,
                  confidence: visionResult.confidence,
                  provenance: 'video_vision',
                  sort_order: index,
                  evidence_phrase: ing.evidence_phrase || null,
                  evidence_source: 'video_vision',
                  comment_score: null,
                  group: undefined,
                };
              });

              // Add instructions if provided
              if (visionResult.instructions && visionResult.instructions.length > 0) {
                cookCard.instructions = {
                  type: "steps",
                  steps: visionResult.instructions,
                };
              }

              cookCard.extraction.method = "video_vision";
              cookCard.extraction.version = "L4-gemini-2.5-flash-vision-v87";
              cookCard.extraction.evidence_source = "video_vision";

              visionExtractedEarly = true;

              await logEvent(supabase, {
                user_id,
                household_id,
                event_type: "l4_vision_early_success",
                ingredients_count: visionResult.ingredients.length,
                instructions_count: visionResult.instructions.length,
                cost_cents: visionResult.cost_cents,
                duration_seconds,
              });

              console.log(`✅ Vision-first extraction succeeded - skipping text extraction ladder`);
            } else {
              // Vision found < 3 ingredients - fallback to L3 text
              console.log(`   ⚠️  L4 Vision: Only found ${visionResult.ingredients.length} ingredients - will fallback to L3 text extraction`);
              await releaseL4Budget(supabase, user_id, videoDurationMinutes);

              await logEvent(supabase, {
                user_id,
                household_id,
                event_type: "l4_vision_early_insufficient",
                ingredients_count: visionResult.ingredients.length,
                duration_seconds,
              });
            }

            // Cleanup File API file
            if (fileUri) {
              deleteGeminiFile(fileUri).catch((err) => {
                console.warn('⚠️  Failed to delete File API file (will auto-delete in 48h):', err.message);
              });
            }
          } catch (visionError) {
            console.error('   ❌ L4 Vision-first extraction failed:', visionError);
            await releaseL4Budget(supabase, user_id, videoDurationMinutes);

            // Cleanup File API file on error
            if (fileUri) {
              await deleteGeminiFile(fileUri).catch((cleanupErr) => {
                console.warn('⚠️  Failed to delete File API file during error cleanup:', cleanupErr.message);
              });
            }

            await logEvent(supabase, {
              user_id,
              household_id,
              event_type: "l4_vision_early_failed",
              error: visionError instanceof Error ? visionError.message : 'Unknown error',
              duration_seconds,
            });
            // Continue to L3 text extraction fallback
          }
        } catch (outerError) {
          console.error('   ❌ L4 Vision-first setup failed:', outerError);
          // Continue to L3 text extraction fallback
        }
      }
    }

    // ============================================================
    // STEP 4: TEXT ACQUISITION LADDER (L1 → L2 → L2.5)
    // ============================================================
    // Skip if Vision already extracted sufficient ingredients
    if (visionExtractedEarly) {
      console.log('⏭️  Step 4-5: Skipping text extraction (Vision-first succeeded)');
    } else {
      console.log('📝 Step 4: Text acquisition ladder...');

    // Variables already declared at top level
    try {
      // L1: Try description first (FREE)
      console.log(`📄 L1: Description length = ${description.length} chars`);

      if (description.length >= 100) {
        sourceText = description;
        evidenceSource = 'description';
        console.log(`✅ L1: Using description as source text`);
      }

      // L2: If description too short, try comments (YouTube only)
      if (!sourceText && platform === 'youtube') {
        console.log(`📝 L2: Description too short, attempting comment harvesting...`);

        try {
          const commentResult = await fetchCommentsFromURL(url, 20);

          if (commentResult.success && commentResult.comments.length > 0) {
            // Debug: Log first 3 comments to see if pinned comment is present
            console.log(`   📋 First 3 fetched comments:`);
            commentResult.comments.slice(0, 3).forEach((c, i) => {
              console.log(`      ${i}: ${c.text.substring(0, 80)}... (${c.text.length} chars, likes: ${c.likeCount})`);
            });

            // Filter to likely ingredient candidates
            const candidates = filterToIngredientCandidates(commentResult.comments);
            console.log(`   Found ${candidates.length}/${commentResult.comments.length} comment candidates`);
            console.log(`   Candidate previews:`);
            candidates.slice(0, 3).forEach((c, i) => {
              console.log(`      ${i}: ${c.text.substring(0, 80)}... (${c.text.length} chars)`);
            });

            // Log top 3 candidate scores for debugging
            const scoredCandidates = candidates.map(c => ({
              score: scoreCommentForIngredients(c).score,
              preview: c.text.substring(0, 50)
            })).sort((a, b) => b.score - a.score).slice(0, 3);
            console.log(`   Top 3 scores:`, JSON.stringify(scoredCandidates));

            // Find best ingredient comment (lowered threshold to 20 for testing)
            const bestComment = findBestIngredientComment(candidates, 20);

            if (bestComment) {
              sourceText = bestComment.comment.text;
              evidenceSource = 'youtube_comment';
              commentUsed = true;
              commentScore = bestComment.score;

              console.log(`   ✅ L2: Found recipe comment (${sourceText.length} chars, score: ${bestComment.score})`);

              await logEvent(supabase, {
                user_id,
                household_id,
                event_type: "l2_comment_found",
                comment_score: bestComment.score,
                text_length: sourceText.length,
              });
            } else {
              console.log('   ❌ L2: No suitable comments found');
              await logEvent(supabase, {
                user_id,
                household_id,
                event_type: "l2_comment_not_found",
              });
            }
          }
        } catch (commentErr) {
          console.error('   ❌ Comment harvesting error:', commentErr);
          await logEvent(supabase, {
            user_id,
            household_id,
            event_type: "comment_harvest_error",
            error: commentErr instanceof Error ? commentErr.message : 'Unknown error',
          });
        }
      }

      // L2.5: Transcript extraction for short-form videos (YouTube only)
      if (platform === 'youtube' && duration_seconds > 0 && duration_seconds < 180) {
        // Only fetch transcript if text is still insufficient
        if (sourceText.length < 200) {
          console.log(`📹 L2.5: Short-form video (${duration_seconds}s), fetching transcript...`);

          const videoId = extractYouTubeVideoId(url);
          if (videoId) {
            // Use safe version with 3s timeout
            transcript = await fetchYouTubeTranscriptSafe(videoId, 3000);

            if (transcript.length > 0) {
              // Combine description + transcript
              sourceText = description + '\n\nTranscript:\n' + transcript;
              evidenceSource = 'description+transcript';
              console.log(`   ✅ L2.5: Transcript added (total: ${sourceText.length} chars)`);

              await logEvent(supabase, {
                user_id,
                household_id,
                event_type: "l2.5_transcript_found",
                transcript_length: transcript.length,
                total_length: sourceText.length,
              });
            } else {
              console.log('   ⚠️ L2.5: No transcript available');
            }
          }
        } else {
          console.log(`   ⏭️  L2.5: Skipping transcript (sufficient text already: ${sourceText.length} chars)`);
        }
      }

      // ============================================================
      // STEP 5: LLM EXTRACTION (L3)
      // ============================================================
      if (sourceText.length >= 50) {
        console.log(`🤖 Step 5 (L3): LLM extraction from ${evidenceSource} (${sourceText.length} chars)`);

        // Normalize unicode fractions (½ → 0.5)
        sourceText = normalizeFractions(sourceText);

        // Check quality signals before calling LLM
        const hasQualitySignals = hasRecipeQualitySignals(sourceText);

        if (!hasQualitySignals) {
          console.log('⏭️  L3 skipped: No recipe quality signals detected');

          await logEvent(supabase, {
            user_id,
            household_id,
            event_type: "l3_gate_failed",
            reason: "no_quality_signals",
            text_length: sourceText.length,
            evidence_source: evidenceSource,
          });

          // Skip to fail case (don't call LLM - save cost)
        } else {
          console.log('✅ L3 gate passed: Recipe quality signals detected');

          await logEvent(supabase, {
            user_id,
            household_id,
            event_type: "l3_gate_passed",
            reason: "quality_signals_detected",
            text_length: sourceText.length,
            evidence_source: evidenceSource,
          });

        // Check budget before calling Gemini
        const budgetCheck = await checkExtractionBudget(supabase, user_id);
        if (!budgetCheck.allowed) {
          console.warn(`⚠️  Budget exceeded: ${budgetCheck.reason}`);

          await logEvent(supabase, {
            user_id,
            household_id,
            event_type: "budget_exceeded",
            event_data: {
              reason: budgetCheck.reason,
              tier: budgetCheck.tier,
              current_count: budgetCheck.current_count,
              monthly_limit: budgetCheck.monthly_limit,
            },
          });

          return new Response(
            JSON.stringify({
              error: "Extraction limit reached",
              fallback: "cook_card_lite",
              cook_card: cookCard,
              budget_info: budgetCheck,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        // Call Gemini
        const llmResult = await extractWithLLM(url, platform, cookCard, sourceText);
        if (llmResult.success && llmResult.ingredients.length > 0) {
          console.log(`   📦 L3 returned ${llmResult.ingredients.length} ingredients (raw)`);
          extractionCost += llmResult.cost;

          // CRITICAL: Evidence phrase validation (prevent hallucinations)
          evidenceResult = filterByEvidence(llmResult.ingredients, sourceText);
          console.log(`   ✅ Evidence validation: ${evidenceResult.stats.validated}/${evidenceResult.stats.total} passed`);

          if (evidenceResult.rejected.length > 0) {
            console.log(`   🚫 Rejected ${evidenceResult.rejected.length} ingredients without evidence`);
            await logEvent(supabase, {
              user_id,
              household_id,
              event_type: "ingredients_rejected_no_evidence",
              rejected_count: evidenceResult.rejected.length,
              rejection_reasons: evidenceResult.stats.rejection_reasons,
            });
          }

          // Section header filter (remove meta-items)
          sectionResult = filterSectionHeaders(evidenceResult.validated);
          console.log(`   ✅ Section header filter: ${sectionResult.stats.kept}/${sectionResult.stats.total} kept`);

          if (sectionResult.removed.length > 0) {
            console.log(`   🚫 Removed ${sectionResult.removed.length} section headers`);
            await logEvent(supabase, {
              user_id,
              household_id,
              event_type: "section_headers_removed",
              removed_count: sectionResult.removed.length,
              removal_reasons: sectionResult.stats.removal_reasons,
            });
          }

          // Group ingredients by sections (e.g., "For the sauce:")
          const groupedIngredients = groupIngredientsBySections(sectionResult.filtered);

          console.log(`   📂 Section grouping: ${groupedIngredients.filter(i => i.group).length} ingredients assigned to groups`);

          // Final cleaned ingredients
          cookCard.ingredients = groupedIngredients.map(ing => ({
            ...ing,
            evidence_source: evidenceSource,
            comment_score: commentScore,
          }));

          // Update instructions from Gemini (structured with ingredients and tips)
          if (llmResult.instructions && llmResult.instructions.length > 0) {
            cookCard.instructions = {
              type: "steps",
              steps: llmResult.instructions,
            };
            console.log(`   ✅ Added ${llmResult.instructions.length} instruction steps from Gemini`);
          }

          cookCard.extraction.method = commentUsed ? "llm_assisted_comment" : "llm_assisted";
          cookCard.extraction.version = "L3-gemini-2.0-flash-evidence";
          cookCard.extraction.evidence_source = evidenceSource;

          console.log(`✅ L3: Final ${cookCard.ingredients.length} ingredients after validation`);
        }
        } // Close quality gate else block
      }
      } catch (l2l3Error) {
        console.error('❌ L2/L3 block error:', l2l3Error);
        console.error('Error details:', {
          message: l2l3Error.message,
          stack: l2l3Error.stack,
          name: l2l3Error.name
        });
        // Continue to fail case below
      }

    // ============================================================
    // STEP 5.5: SMART L4 VISION FOR INSTRUCTIONS (NEW!)
    // ============================================================
    // If L3 succeeded with ingredients but NO instructions, run L4 Vision
    // to extract instructions from video audio (typical for TikTok/Instagram)
    // Skip if Vision already ran in Step 4A

    // CRITICAL: Fix duration BEFORE checking gate conditions
    // This must happen outside any conditional blocks to ensure it's always applied
    if ((!duration_seconds || duration_seconds === 0) && ['tiktok', 'instagram', 'xiaohongshu', 'facebook'].includes(platform)) {
      duration_seconds = 90;
      console.log(`⚠️  Duration unknown for ${platform}, assuming 90s for L4 Vision gate (before gate check: ${duration_seconds})`);
    }

    const hasIngredientsFromL3 = cookCard.ingredients.length > 0;
    const hasInstructions = cookCard.instructions?.steps && cookCard.instructions.steps.length > 0;

    console.log(`🔧 L4 Gate Debug: platform=${platform}, hasIngredients=${hasIngredientsFromL3}, hasInstructions=${hasInstructions}, duration=${duration_seconds}, visionExtractedEarly=${visionExtractedEarly}`);

    const shouldRunVisionForInstructions = !visionExtractedEarly && hasIngredientsFromL3 && !hasInstructions && duration_seconds > 0 && duration_seconds <= 300;

    console.log(`🔧 L4 Gate Result: shouldRunVisionForInstructions=${shouldRunVisionForInstructions}`);

    if (shouldRunVisionForInstructions) {
      console.log('🎬 Step 5.5: Smart L4 Vision for instructions (L3 succeeded, but no instructions)...');
      console.log(`   L3 extracted ${cookCard.ingredients.length} ingredients, but no cooking steps`);
      console.log(`   Running L4 Vision to extract instructions from video audio...`);

      const supportedPlatforms = ['youtube', 'instagram', 'tiktok', 'xiaohongshu', 'facebook'];
      if (supportedPlatforms.includes(platform)) {
        try {
          // Reserve L4 budget
          const videoDurationMinutes = duration_seconds / 60;
          await reserveL4Budget(supabase, user_id, videoDurationMinutes);

          let visionResult;
          let fileUri: string | null = null;

          try {
            // YouTube: Use direct URL
            if (platform === 'youtube') {
              visionResult = await extractFromVideoVision(url, title, duration_seconds, false, true); // instructionsOnly=true
              extractionCost += visionResult.cost_cents;
            } else {
              // Instagram/TikTok/etc: Upload video to Gemini File API via Cloud Run
              console.log(`⬆️  Uploading to Gemini File API via Cloud Run...`);
              fileUri = await uploadVideoToGeminiFileAPI(url, 60000, 100); // 60s timeout, 100MB max

              if (!fileUri) {
                throw new Error(`Failed to upload video to Gemini File API for ${platform}. The video may be too large, private, region-locked, or require authentication.`);
              }

              console.log(`✅ Uploaded to File API: ${fileUri}`);

              visionResult = await extractFromVideoVision(fileUri, title, duration_seconds, false, true); // instructionsOnly=true
              extractionCost += visionResult.cost_cents;
            }

            // Extract instructions from vision result
            if (visionResult.success && visionResult.instructions && visionResult.instructions.length > 0) {
              cookCard.instructions = {
                type: "steps",
                steps: visionResult.instructions,
              };
              console.log(`   ✅ L4 Vision: Added ${visionResult.instructions.length} instruction steps from video audio`);

              // Update extraction metadata
              cookCard.extraction.method = "hybrid_l3_text_l4_vision";
              cookCard.extraction.version = "L3+L4-text+vision-instructions";

              await logEvent(supabase, {
                user_id,
                household_id,
                event_type: "l4_vision_instructions_success",
                instructions_count: visionResult.instructions.length,
                cost_cents: visionResult.cost_cents,
                duration_seconds,
              });
            } else {
              console.log(`   ⚠️  L4 Vision: No instructions extracted from video`);
              await releaseL4Budget(supabase, user_id, videoDurationMinutes);
            }

            // Cleanup File API file
            if (fileUri) {
              deleteGeminiFile(fileUri).catch((err) => {
                console.warn('⚠️  Failed to delete File API file (will auto-delete in 48h):', err.message);
              });
            }
          } catch (visionError) {
            console.error('   ❌ L4 Vision for instructions failed:', visionError);
            await releaseL4Budget(supabase, user_id, videoDurationMinutes);

            // Cleanup File API file on error
            if (fileUri) {
              await deleteGeminiFile(fileUri).catch((cleanupErr) => {
                console.warn('⚠️  Failed to delete File API file during error cleanup:', cleanupErr.message);
              });
            }

            await logEvent(supabase, {
              user_id,
              household_id,
              event_type: "l4_vision_instructions_failed",
              error: visionError instanceof Error ? visionError.message : 'Unknown error',
              duration_seconds,
            });
            // Continue without instructions (not fatal)
          }
        } catch (outerError) {
          console.error('   ❌ Smart L4 Vision setup failed:', outerError);
          // Continue without instructions (not fatal)
        }
      } else {
        console.log(`   ⏭️  Platform ${platform} not supported for Vision extraction`);
      }
    }
    } // Close the visionExtractedEarly else block

    // ============================================================
    // STEP 6: HYBRID MULTI-SOURCE EXTRACTION (L4 Vision + L5 ASR)
    // ============================================================
    // Strategy: Use Vision + Transcript + ASR for maximum coverage
    // - Vision L4: Sees text overlays + visual ingredients
    // - Transcript: FREE audio/captions from YouTube
    // - ASR L5: Whisper transcription (conditional, Pro tier only)
    // - File API: Download video + upload for Instagram/TikTok/Xiaohongshu/Facebook
    // Skip if Vision already ran in Step 4A
    if (!visionExtractedEarly && (!cookCard || cookCard.ingredients.length === 0)) {
      console.log('🎥 Step 6: Multi-Platform Vision Extraction (text methods failed)...');

      // CRITICAL FIX: Skip Vision extraction for photo posts (duration=0 from HTML scraping)
      // Photo posts don't have videos to download, so yt-dlp will fail
      // These should have been handled by L3 text extraction from HTML description
      if (duration_seconds === 0 && metadata_source === 'html_scraper') {
        console.error("❌ L4 skipped: Photo post detected (no video available)");
        console.log(`   This appears to be a photo post. L3 text extraction should have succeeded.`);
        console.log(`   If you're seeing this, the description may not contain parseable recipe text.`);

        await logEvent(supabase, {
          user_id,
          household_id,
          event_type: "l4_vision_skipped",
          reason: "photo_post_no_video",
          platform,
          metadata_source,
        });

        return new Response(
          JSON.stringify({
            error: "Could not extract ingredients from this photo post. The post description may not contain a recipe.",
            fallback: "cook_card_lite",
            cook_card: cookCard,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // Supported platforms: YouTube (direct), Instagram, TikTok, Xiaohongshu, Facebook (via File API)
      const supportedPlatforms = ['youtube', 'instagram', 'tiktok', 'xiaohongshu', 'facebook'];
      if (!supportedPlatforms.includes(platform)) {
        console.error("❌ Vision extraction not supported for platform:", platform);

        await logEvent(supabase, {
          user_id,
          household_id,
          event_type: "l4_vision_skipped",
          reason: "platform_not_supported",
          platform,
        });

        return new Response(
          JSON.stringify({
            error: `Platform not supported: ${platform}. Supported platforms: ${supportedPlatforms.join(', ')}`,
            fallback: "cook_card_lite",
            cook_card: cookCard,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // Check if duration is available - use default for platforms without metadata
      if (!duration_seconds || duration_seconds === 0) {
        // For non-YouTube platforms (Instagram, TikTok, etc.), metadata may not include duration
        // Use a conservative estimate for budget calculation
        if (platform !== 'youtube') {
          duration_seconds = 90; // Assume 90 seconds (typical short-form video)
          console.warn(`⚠️  Duration unknown for ${platform}, using default: ${duration_seconds}s`);
        } else {
          console.error("❌ L4 skipped: Video duration unknown for YouTube");

          await logEvent(supabase, {
            user_id,
            household_id,
            event_type: "l4_vision_skipped",
            reason: "duration_unknown",
          });

          return new Response(
            JSON.stringify({
              error: "Could not extract ingredients from this URL",
              fallback: "cook_card_lite",
              cook_card: cookCard,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      const videoDurationMinutes = duration_seconds / 60;

      // DISABLED: Check global L4 budget
      // const globalBudgetCheck = await checkGlobalL4Budget(supabase, videoDurationMinutes);
      // if (!globalBudgetCheck.allowed) {
      //   console.error(`❌ Global L4 budget exceeded: ${globalBudgetCheck.current_usage}/${globalBudgetCheck.limit} minutes`);
      //
      //   await logEvent(supabase, {
      //     user_id,
      //     household_id,
      //     event_type: "l4_budget_exceeded",
      //     scope: "global",
      //     current_usage: globalBudgetCheck.current_usage,
      //     limit: globalBudgetCheck.limit,
      //   });
      //
      //   return new Response(
      //     JSON.stringify({
      //       error: "System capacity reached. Please try again later.",
      //       fallback: "cook_card_lite",
      //       cook_card: cookCard,
      //     }),
      //     { status: 200, headers: { "Content-Type": "application/json" } }
      //   );
      // }

      // DISABLED: Check user L4 budget
      // const userBudgetCheck = await checkUserL4Budget(supabase, user_id, quotaCheck.quota!.tier, videoDurationMinutes);
      // if (!userBudgetCheck.allowed) {
      //   console.error(`❌ User L4 budget exceeded: ${userBudgetCheck.current_usage}/${userBudgetCheck.limit} minutes`);
      //
      //   await logEvent(supabase, {
      //     user_id,
      //     household_id,
      //     event_type: "l4_budget_exceeded",
      //     scope: "user",
      //     tier: quotaCheck.quota!.tier,
      //     current_usage: userBudgetCheck.current_usage,
      //     limit: userBudgetCheck.limit,
      //   });
      //
      //   return new Response(
      //     JSON.stringify({
      //       error: "Daily video processing limit reached. Upgrade to process more videos.",
      //       fallback: "cook_card_lite",
      //       cook_card: cookCard,
      //       budget_info: {
      //         current_usage: userBudgetCheck.current_usage,
      //         limit: userBudgetCheck.limit,
      //         tier: quotaCheck.quota!.tier,
      //       },
      //     }),
      //     { status: 200, headers: { "Content-Type": "application/json" } }
      //   );
      // }

      console.log(`⚠️  L4 budget checks DISABLED for testing`);

      // Reserve L4 budget BEFORE calling API (optimistic lock to prevent race condition)
      console.log(`🤖 Calling L4 Vision for ${duration_seconds}s video (platform: ${platform})...`);
      await reserveL4Budget(supabase, user_id, videoDurationMinutes);

      let visionResult;
      let fileUri: string | null = null;
      try {
        // YouTube: Use direct URL (Gemini supports YouTube URLs natively)
        if (platform === 'youtube') {
          visionResult = await extractFromVideoVision(url, title, duration_seconds, false);
          extractionCost += visionResult.cost_cents;
        } else {
          // Instagram/TikTok/Xiaohongshu/Facebook: Upload video to Gemini File API via Cloud Run
          console.log(`⬆️  Uploading to Gemini File API via Cloud Run...`);
          fileUri = await uploadVideoToGeminiFileAPI(url, 60000, 100); // 60s timeout, 100MB max

          if (!fileUri) {
            throw new Error(`Failed to upload video to Gemini File API for ${platform}. The video may be too large, private, region-locked, or require authentication.`);
          }

          console.log(`✅ Uploaded to File API: ${fileUri}`);

          // Extract using Vision with File API URI
          visionResult = await extractFromVideoVision(fileUri, title, duration_seconds, false);
          extractionCost += visionResult.cost_cents;
        }

        if (!visionResult.success || visionResult.ingredients.length === 0) {
          // Cleanup File API file (if used)
          if (fileUri) {
            await deleteGeminiFile(fileUri).catch((err) => {
              console.warn('⚠️  Failed to delete File API file (will auto-delete in 48h):', err.message);
            });
          }

          // Refund budget on failure
          await releaseL4Budget(supabase, user_id, videoDurationMinutes);

          console.error("❌ L4 Vision extraction failed:", visionResult.error || "No ingredients found");

          await logEvent(supabase, {
            user_id,
            household_id,
            event_type: "l4_vision_failed",
            error: visionResult.error,
            duration_seconds,
            platform,
          });

          return new Response(
            JSON.stringify({
              error: "Could not extract ingredients from this URL",
              fallback: "cook_card_lite",
              cook_card: cookCard,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        // Cleanup File API file after successful extraction (optional - auto-deletes in 48h)
        if (fileUri) {
          // Delete in background (don't wait)
          deleteGeminiFile(fileUri).catch((err) => {
            console.warn('⚠️  Failed to delete File API file (will auto-delete in 48h):', err.message);
          });
        }
      } catch (err) {
        // Cleanup File API file on error
        if (fileUri) {
          await deleteGeminiFile(fileUri).catch((cleanupErr) => {
            console.warn('⚠️  Failed to delete File API file during error cleanup:', cleanupErr.message);
          });
        }

        // Refund budget on error
        await releaseL4Budget(supabase, user_id, videoDurationMinutes);
        throw err;
      }

      // Success path: L4 extracted ingredients
      console.log(`✅ L4 Vision: Extracted ${visionResult.ingredients.length} ingredients`);

      // ============================================================
      // STEP 6.5: ASR L5 (Conditional - only if needed)
      // ============================================================
      let asrResult = null;
      let transcriptIngredients: any[] = [];

      // Check if we already have transcript from L2.5
      const hasTranscript = Boolean(transcript && transcript.length > 100);

      // Extract ingredients from transcript if available
      if (hasTranscript && transcript) {
        console.log('📝 Extracting ingredients from existing transcript...');
        const transcriptExtraction = await extractIngredientsWithGemini(title, transcript, platform);
        transcriptIngredients = transcriptExtraction.ingredients;
        console.log(`   ✅ Transcript: ${transcriptIngredients.length} ingredients`);
      }

      // Decide if ASR L5 is needed
      const needsASR = shouldRunASR(
        visionResult.ingredients.length,
        transcriptIngredients.length,
        duration_seconds,
        quotaCheck.quota!.tier,
        hasTranscript
      );

      if (needsASR) {
        console.log('🎤 Running ASR L5 (insufficient ingredients from Vision + Transcript)...');
        asrResult = await extractAudioTranscript(url, duration_seconds);
        asrCost = asrResult.cost_cents;
        extractionCost += asrCost;

        if (asrResult.success && asrResult.transcript) {
          console.log(`✅ ASR L5: Transcribed ${asrResult.transcript.length} characters (cost: ${asrCost}¢)`);

          // Extract ingredients from ASR transcript
          const asrExtraction = await extractIngredientsWithGemini(title, asrResult.transcript, platform);
          extractionCost += asrExtraction.cost_cents;

          // Log ASR success
          await logEvent(supabase, {
            user_id,
            household_id,
            event_type: "l5_asr_success",
            transcript_length: asrResult.transcript.length,
            ingredients_count: asrExtraction.ingredients.length,
            cost_cents: asrCost + asrExtraction.cost_cents,
            duration_minutes: asrResult.duration_minutes,
          });

          // Cross-validate all sources
          console.log('🔍 Cross-validating Vision + Transcript + ASR...');
          const validation = crossValidateIngredients(
            visionResult.ingredients,
            asrExtraction.ingredients,
            transcriptIngredients
          );

          console.log(`   ✅ Merged ${validation.ingredients.length} ingredients from ${validation.sources_used.length} sources`);
          if (validation.conflicts.length > 0) {
            console.warn(`   ⚠️  ${validation.conflicts.length} conflicts detected - flagged for review`);
          }

          // Use cross-validated ingredients
          cookCard.ingredients = validation.ingredients.map((ing, index) => {
            const normalized = normalizeIngredient({
              name: ing.name,
              amount: ing.amount,
              unit: ing.unit,
            });

            return {
              name: normalized.name,
              normalized_name: normalized.normalized_name,
              amount: normalized.amount,
              unit: normalized.unit,
              confidence: ing.confidence,
              provenance: `multi_source_${ing.source}`,
              sort_order: index,
              evidence_phrase: ing.evidence_phrase || null,
              evidence_source: ing.source,
              comment_score: null,
              group: undefined,
            };
          });

          cookCard.extraction.method = "multi_source_hybrid";
          cookCard.extraction.version = "L4+L5-vision+asr";
          cookCard.extraction.evidence_source = validation.sources_used.join('+');

        } else {
          console.warn(`⚠️  ASR L5 failed: ${asrResult.error || 'Unknown error'}`);
          // Fall back to Vision-only ingredients (already extracted above)
        }
      } else {
        // No ASR needed - use Vision + Transcript if available
        if (transcriptIngredients.length > 0) {
          console.log('🔍 Cross-validating Vision + Transcript (no ASR needed)...');
          const validation = crossValidateIngredients(
            visionResult.ingredients,
            [],
            transcriptIngredients
          );

          cookCard.ingredients = validation.ingredients.map((ing, index) => {
            const normalized = normalizeIngredient({
              name: ing.name,
              amount: ing.amount,
              unit: ing.unit,
            });

            return {
              name: normalized.name,
              normalized_name: normalized.normalized_name,
              amount: normalized.amount,
              unit: normalized.unit,
              confidence: ing.confidence,
              provenance: `multi_source_${ing.source}`,
              sort_order: index,
              evidence_phrase: ing.evidence_phrase || null,
              evidence_source: ing.source,
              comment_score: null,
              group: undefined,
            };
          });

          cookCard.extraction.method = "vision_transcript_hybrid";
          cookCard.extraction.version = "L4+L2.5-vision+transcript";
          cookCard.extraction.evidence_source = validation.sources_used.join('+');
        } else {
          // Vision only
          cookCard.ingredients = visionResult.ingredients.map((ing, index) => {
            const normalized = normalizeIngredient({
              name: ing.name,
              amount: ing.amount,
              unit: ing.unit,
            });

            return {
              name: normalized.name,
              normalized_name: normalized.normalized_name,
              amount: normalized.amount,
              unit: normalized.unit,
              confidence: visionResult.confidence,
              provenance: 'video_vision',
              sort_order: index,
              evidence_phrase: ing.evidence_phrase || null,
              evidence_source: 'video_vision',
              comment_score: null,
              group: undefined,
            };
          });

          cookCard.extraction.method = "video_vision";
          cookCard.extraction.version = "L4-gemini-2.5-flash-vision";
        }
      }

      // Update instructions if provided by Vision
      if (visionResult.instructions && visionResult.instructions.length > 0) {
        cookCard.instructions = {
          type: "steps",
          steps: visionResult.instructions,
        };
        console.log(`   ✅ Added ${visionResult.instructions.length} instruction steps from vision`);
      }

      // Log successful L4 extraction
      await logEvent(supabase, {
        user_id,
        household_id,
        event_type: "l4_vision_success",
        ingredients_count: cookCard.ingredients.length,
        instructions_count: visionResult.instructions.length,
        cost_cents: visionResult.cost_cents,
        duration_seconds,
        media_resolution: visionResult.media_resolution,
        actual_input_tokens: visionResult.actual_input_tokens,
        actual_output_tokens: visionResult.actual_output_tokens,
      });

      // Continue to finalization
    }

    // Calculate overall confidence
    const avgConfidence =
      cookCard.ingredients.reduce((sum, ing) => sum + ing.confidence, 0) /
      cookCard.ingredients.length;
    cookCard.extraction.confidence = avgConfidence;
    cookCard.extraction.cost_cents = extractionCost;
    cookCard.extraction.timestamp = new Date().toISOString();

    const extractionLatency = Date.now() - extractionStartTime;

    // Step 5: Match ingredients to canonical items
    cookCard.ingredients = await matchCanonicalItems(supabase, cookCard.ingredients);

    // Step 6: Cache extraction (input-hash based, 30-day TTL)
    const inputHash = await computeInputHash(url, title, description, undefined);
    await setCachedExtraction(supabase, url, inputHash, cookCard, extractionCost);

    // Step 6.5: Increment monthly quota for all successful extractions
    await incrementMonthlyQuota(supabase, user_id, extractionCost);

    // Step 7: Log extraction completed event
    await logEvent(supabase, {
      user_id,
      household_id,
      event_type: "extraction_completed",
      extraction_method: cookCard.extraction.method,
      extraction_confidence: avgConfidence,
      extraction_cost_cents: extractionCost,
      input_hash: inputHash,
      ingredients_count: cookCard.ingredients.length,
      extraction_latency_ms: extractionLatency,
      cache_hit: false,

      // Path tracking (updated for hybrid extraction)
      ladder_path: cookCard.extraction.method === 'multi_source_hybrid' ? 'L4+L5' :
                    cookCard.extraction.method === 'vision_transcript_hybrid' ? 'L4+L2.5' :
                    cookCard.extraction.method === 'video_vision' ? 'L4' :
                    evidenceSource === 'description' ? 'L1→L3' :
                    evidenceSource === 'youtube_comment' ? 'L2→L3' :
                    evidenceSource === 'description+transcript' ? 'L2.5→L3' : 'L3',
      evidence_source: cookCard.extraction.evidence_source || evidenceSource,

      // Comment tracking
      comment_used: commentUsed,
      comment_score: commentScore,

      // Quality metrics
      ingredients_rejected_no_evidence: evidenceResult?.rejected?.length || 0,
      ingredients_rejected_section_header: sectionResult?.removed?.length || 0,

      // Source text tracking
      source_text_length: sourceText?.length || 0,

      // Multi-source tracking (if used)
      vision_used: ['video_vision', 'vision_transcript_hybrid', 'multi_source_hybrid'].includes(cookCard.extraction.method),
      vision_model: ['video_vision', 'vision_transcript_hybrid', 'multi_source_hybrid'].includes(cookCard.extraction.method) ? 'gemini-2.5-flash' : null,
      vision_duration_seconds: ['video_vision', 'vision_transcript_hybrid', 'multi_source_hybrid'].includes(cookCard.extraction.method) ? duration_seconds : null,
      asr_used: cookCard.extraction.method === 'multi_source_hybrid',
      asr_cost_cents: asrCost || 0,
      transcript_used: ['vision_transcript_hybrid', 'multi_source_hybrid'].includes(cookCard.extraction.method),
      sources_combined: cookCard.extraction.evidence_source?.split('+').length || 1,
    });

    if (cookCard.extraction.method === "llm_assisted") {
      await logEvent(supabase, {
        user_id,
        household_id,
        event_type: "llm_call_made",
        llm_cost_cents: extractionCost,
        extraction_confidence: avgConfidence,
        ingredients_count: cookCard.ingredients.length,
      });
    }

    // Response
    return new Response(
      JSON.stringify({
        cook_card: cookCard,
        requires_confirmation: avgConfidence < 0.8,
        cache_status: "fresh",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("❌ Extraction error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// Cache functions moved to _shared/cache.ts (input-hash based)

/**
 * Fetch YouTube video description using YouTube Data API v3
 */
/**
 * Unified platform metadata
 */
interface PlatformMetadata {
  title: string;
  description: string;
  thumbnail_url: string;
  duration_seconds: number;
  creator_name: string;
  creator_handle: string;
  view_count?: number;
  published_at?: string;
  metadata_source?: string; // Track which method was used: "ytdlp", "youtube_api", "oembed"
  ytdlp_latency_ms?: number; // Latency for yt-dlp extraction
}

/**
 * Fetch platform-specific metadata (with yt-dlp integration)
 *
 * Strategy:
 * 1. Try yt-dlp first (free, rich metadata, supports all platforms)
 * 2. Fall back to legacy APIs if yt-dlp fails (YouTube API, oEmbed)
 *
 * Benefits of yt-dlp:
 * - TikTok: Gets FULL description (oEmbed returns empty)
 * - Xiaohongshu: ONLY method that works (no oEmbed support)
 * - YouTube: No API quota consumption
 * - Instagram: Works when oEmbed fails
 *
 * Returns consistent metadata structure.
 */
async function fetchPlatformMetadata(
  url: string,
  platform: string
): Promise<PlatformMetadata | null> {
  try {
    // For YouTube: Use official YouTube Data API v3 (faster, no bot detection)
    if (platform === 'youtube') {
      console.log(`🎬 L0: Extracting metadata with YouTube Data API v3...`);

      const videoId = extractYouTubeVideoId(url);
      if (!videoId) {
        console.error(`❌ Could not extract YouTube video ID from URL`);
        return null;
      }

      const youtubeMetadata = await getYouTubeMetadata(videoId);

      if (youtubeMetadata) {
        const metadata: PlatformMetadata = {
          title: youtubeMetadata.title,
          description: youtubeMetadata.description,
          thumbnail_url: youtubeMetadata.thumbnail_url,
          duration_seconds: youtubeMetadata.duration_seconds,
          creator_name: youtubeMetadata.channel_name,
          creator_handle: youtubeMetadata.channel_id,
          view_count: youtubeMetadata.view_count,
          published_at: youtubeMetadata.published_at,
          metadata_source: "youtube_api",
        };

        console.log(`✅ YouTube API: "${metadata.title}" (${metadata.duration_seconds}s, ${metadata.description.length} chars desc)`);
        return metadata;
      }

      console.warn(`⚠️  YouTube API failed, falling back to yt-dlp...`);
    }

    // For Instagram: Try oEmbed API first, fallback to HTML scraping
    // Instagram oEmbed works for some posts but not others (inconsistent)
    // HTML scraping is the reliable fallback
    if (platform === 'instagram') {
      console.log(`📸 L0: Trying Instagram oEmbed API...`);

      // Try oEmbed first (fast when it works)
      try {
        const instagramMetadata = await getInstagramOEmbed(url);

        if (instagramMetadata) {
          console.log(`✅ Instagram oEmbed: "${instagramMetadata.title}" by ${instagramMetadata.author_name}`);

          // oEmbed doesn't include caption, fetch via HTML scraping
          console.log(`   Fetching caption via HTML scraping...`);
          const htmlResult = await extractFromHTML(url, platform);

          const metadata: PlatformMetadata = {
            title: instagramMetadata.title || 'Instagram Recipe',
            description: htmlResult.success && htmlResult.text.length > 20 ? htmlResult.text : '',
            thumbnail_url: instagramMetadata.thumbnail_url || '',
            duration_seconds: 0, // oEmbed doesn't provide duration
            creator_name: instagramMetadata.author_name || '',
            creator_handle: instagramMetadata.author_url || '',
            metadata_source: 'instagram_oembed',
          };

          if (metadata.description.length > 0) {
            console.log(`   ✅ Caption extracted: ${metadata.description.length} chars`);
          } else {
            console.warn(`   ⚠️  No caption found (post may have ingredients in video only)`);
          }

          return metadata;
        }
      } catch (oembedError) {
        console.warn(`⚠️  Instagram oEmbed failed (${oembedError instanceof Error ? oembedError.message : 'unknown'}), trying HTML scraping...`);
      }

      // Fallback to HTML scraping if oEmbed fails
      console.log(`📸 L0: Fallback to HTML scraping...`);
      try {
        const htmlResult = await extractFromHTML(url, platform);

        if (htmlResult.success && htmlResult.text.length > 20) {
          console.log(`✅ HTML extraction: ${htmlResult.text.length} chars from ${htmlResult.sources.join(', ')}`);

          const metadata: PlatformMetadata = {
            title: htmlResult.metadata.title || 'Instagram Recipe',
            description: htmlResult.text,
            thumbnail_url: htmlResult.metadata.image_url || '',
            duration_seconds: 0,
            creator_name: htmlResult.metadata.creator?.name || '',
            creator_handle: htmlResult.metadata.creator?.handle || '',
            metadata_source: 'html_scraper',
          };

          return metadata;
        } else {
          console.error(`❌ HTML scraping failed: ${htmlResult.error || 'No text extracted'}`);
        }
      } catch (htmlError) {
        console.error(`❌ HTML scraping error:`, htmlError);
      }

      console.warn(`⚠️  All Instagram extraction methods failed, falling back to yt-dlp...`);
    }

    // For all other platforms: Use yt-dlp (supports 1000+ platforms)
    console.log(`🎬 L0: Extracting metadata with yt-dlp...`);

    const ytdlpResult = await extractMetadataWithYtDlp(url, 15000); // 15s timeout for reliability

    if (ytdlpResult.success && ytdlpResult.metadata) {
      const metadata: PlatformMetadata = {
        title: ytdlpResult.metadata.title,
        description: ytdlpResult.metadata.description,
        thumbnail_url: ytdlpResult.metadata.thumbnail_url,
        duration_seconds: ytdlpResult.metadata.duration_seconds,
        creator_name: ytdlpResult.metadata.creator_name,
        creator_handle: ytdlpResult.metadata.creator_handle,
        view_count: ytdlpResult.metadata.view_count,
        published_at: ytdlpResult.metadata.published_at,
        metadata_source: "ytdlp",
        ytdlp_latency_ms: ytdlpResult.latency_ms,
      };

      console.log(`✅ yt-dlp: "${metadata.title}" (${ytdlpResult.latency_ms}ms, ${metadata.description.length} chars desc)`);
      return metadata;
    }

    // yt-dlp failed - log detailed error
    console.error(`❌ yt-dlp failed: ${ytdlpResult.error || 'Unknown error'}`);
    if (ytdlpResult.stderr) {
      console.error(`   stderr: ${ytdlpResult.stderr.substring(0, 300)}`);
    }

    // Special case: Xiaohongshu photo posts (no video to download)
    // If yt-dlp says "No video formats found", this is likely a photo post
    // Fallback to HTML scraping to extract text description
    if (platform === 'xiaohongshu' && ytdlpResult.stderr?.includes('No video formats found')) {
      console.log('📸 Xiaohongshu: Detected photo post (no video), attempting HTML scraping...');

      try {
        const htmlResult = await extractFromHTML(url, platform);

        if (htmlResult.success && htmlResult.text.length > 50) {
          console.log(`✅ HTML extraction: ${htmlResult.text.length} chars from ${htmlResult.sources.join(', ')}`);

          const metadata: PlatformMetadata = {
            title: htmlResult.metadata.title || 'Xiaohongshu Recipe',
            description: htmlResult.text, // Full description with ingredients & instructions
            thumbnail_url: htmlResult.metadata.image_url || '',
            duration_seconds: 0, // Photo post - no duration
            creator_name: htmlResult.metadata.creator?.name || '',
            creator_handle: htmlResult.metadata.creator?.handle || '',
            metadata_source: 'html_scraper',
          };

          return metadata;
        } else {
          console.error(`❌ HTML scraping failed: ${htmlResult.error || 'No text extracted'}`);
        }
      } catch (htmlError) {
        console.error(`❌ HTML scraping error:`, htmlError);
      }
    }

    // Special case: Instagram rate limiting
    // Instagram blocks automated access and requires authentication
    // Fallback to HTML scraping to extract caption/description from webpage
    if (platform === 'instagram' && (
      ytdlpResult.stderr?.includes('rate-limit') ||
      ytdlpResult.stderr?.includes('login required') ||
      ytdlpResult.stderr?.includes('Requested content is not available')
    )) {
      console.log('🔒 Instagram: Rate limited or auth required, attempting HTML scraping...');

      try {
        const htmlResult = await extractFromHTML(url, platform);

        if (htmlResult.success && htmlResult.text.length > 50) {
          console.log(`✅ HTML extraction: ${htmlResult.text.length} chars from ${htmlResult.sources.join(', ')}`);

          const metadata: PlatformMetadata = {
            title: htmlResult.metadata.title || 'Instagram Recipe',
            description: htmlResult.text, // Caption with ingredients & instructions
            thumbnail_url: htmlResult.metadata.image_url || '',
            duration_seconds: 0, // Cannot determine duration from HTML
            creator_name: htmlResult.metadata.creator?.name || '',
            creator_handle: htmlResult.metadata.creator?.handle || '',
            metadata_source: 'html_scraper',
          };

          return metadata;
        } else {
          console.error(`❌ HTML scraping failed: ${htmlResult.error || 'No text extracted'}`);
        }
      } catch (htmlError) {
        console.error(`❌ HTML scraping error:`, htmlError);
      }
    }

    return null;

  } catch (err) {
    console.error(`❌ Error fetching platform metadata:`, err);
    return null;
  }
}

/**
 * Instagram oEmbed API response
 */
interface InstagramOEmbedResponse {
  version: string;
  title: string;
  author_name: string;
  author_url: string;
  author_id: number;
  media_id: string;
  provider_name: string;
  provider_url: string;
  type: string; // "rich" for posts
  width: number;
  height: number;
  html: string; // Embed HTML
  thumbnail_url: string;
  thumbnail_width: number;
  thumbnail_height: number;
}

/**
 * Fetch Instagram post metadata using official oEmbed API
 *
 * Benefits:
 * - Public API (no auth required for public posts)
 * - Returns embed HTML (video player)
 * - Fast and reliable
 * - No rate limiting for reasonable usage
 *
 * Note: oEmbed does NOT include caption text, so we still need HTML scraping for that
 */
async function getInstagramOEmbed(url: string): Promise<InstagramOEmbedResponse | null> {
  try {
    // Instagram oEmbed endpoint (public, no token needed)
    const oembedUrl = `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(url)}&omitscript=true`;

    const response = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!response.ok) {
      console.error(`❌ Instagram oEmbed error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    return data as InstagramOEmbedResponse;

  } catch (err) {
    console.error(`❌ Instagram oEmbed error:`, err);
    return null;
  }
}

/**
 * Parse ISO 8601 duration to seconds
 * Format: PT1H2M10S → 3730 seconds
 */
function parseISO8601Duration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Fetch YouTube metadata (V2 - returns unified PlatformMetadata)
 *
 * Fetches everything in ONE API call:
 * - snippet: title, description, thumbnails, channel info
 * - contentDetails: duration (for short-form detection)
 * - statistics: viewCount
 */
async function fetchYouTubeMetadataV2(url: string): Promise<PlatformMetadata | null> {
  try {
    // Extract video ID from URL
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      console.error("Could not extract YouTube video ID from URL");
      return null;
    }

    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!apiKey) {
      console.error("YOUTUBE_API_KEY not configured");
      return null;
    }

    // Fetch video details - ONE call for all metadata
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${apiKey}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      console.error(`YouTube API error: ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      console.error("No video found for ID:", videoId);
      return null;
    }

    const video = data.items[0];
    const snippet = video.snippet;
    const contentDetails = video.contentDetails;
    const statistics = video.statistics;

    const metadata: PlatformMetadata = {
      title: snippet.title,
      description: snippet.description || "",
      thumbnail_url: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || "",
      duration_seconds: parseISO8601Duration(contentDetails.duration),
      creator_name: snippet.channelTitle,
      creator_handle: snippet.channelId,
      view_count: statistics?.viewCount ? parseInt(statistics.viewCount, 10) : undefined,
      published_at: snippet.publishedAt,
    };

    console.log(`📺 YouTube: "${metadata.title}" (${metadata.duration_seconds}s, ${metadata.description.length} chars)`);

    return metadata;
  } catch (err) {
    console.error("Error fetching YouTube metadata:", err);
    return null;
  }
}

/**
 * Fetch metadata via oEmbed (Instagram, TikTok, Web)
 *
 * Fallback for platforms without dedicated APIs
 */
async function fetchOEmbedMetadata(
  url: string,
  platform: string
): Promise<PlatformMetadata | null> {
  try {
    let oEmbedUrl = "";

    switch (platform) {
      case "instagram":
        oEmbedUrl = `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=${Deno.env.get("INSTAGRAM_ACCESS_TOKEN")}`;
        break;
      case "tiktok":
        oEmbedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
        break;
      case "youtube":
        oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        break;
      default:
        console.error(`Unsupported platform for oEmbed: ${platform}`);
        return null;
    }

    const response = await fetch(oEmbedUrl);
    if (!response.ok) {
      console.error(`oEmbed fetch failed: ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    // oEmbed provides limited metadata
    const metadata: PlatformMetadata = {
      title: data.title || "Untitled Recipe",
      description: "", // oEmbed doesn't provide description
      thumbnail_url: data.thumbnail_url || "",
      duration_seconds: 0, // oEmbed doesn't provide duration
      creator_name: data.author_name || "",
      creator_handle: data.author_url || "",
    };

    console.log(`🌐 oEmbed (${platform}): "${metadata.title}"`);

    return metadata;
  } catch (err) {
    console.error("Error fetching oEmbed metadata:", err);
    return null;
  }
}

/**
 * Fetch YouTube video transcript (captions)
 *
 * Uses unofficial YouTube transcript API (timedtext endpoint)
 * This is a workaround since official API requires OAuth for transcript download
 *
 * Note: May break if YouTube changes their internal API
 */
async function fetchYouTubeTranscript(videoId: string): Promise<string> {
  try {
    // YouTube's internal timedtext API endpoint (used by youtube-transcript libraries)
    // This works without OAuth but is unofficial
    const timedTextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`;

    const response = await fetch(timedTextUrl);

    if (!response.ok) {
      console.log(`   ℹ️  No transcript available for video ${videoId}`);
      return "";
    }

    const data = await response.json();

    if (!data.events || data.events.length === 0) {
      console.log(`   ℹ️  Transcript empty`);
      return "";
    }

    // Extract text from transcript events
    const transcriptLines: string[] = [];
    for (const event of data.events) {
      if (event.segs) {
        const text = event.segs.map((seg: any) => seg.utf8 || "").join("");
        if (text.trim()) {
          transcriptLines.push(text.trim());
        }
      }
    }

    const transcript = transcriptLines.join(" ");
    console.log(`   📝 Transcript fetched: ${transcript.length} chars`);

    return transcript;
  } catch (err) {
    console.log(`   ℹ️  Transcript unavailable: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return "";
  }
}

/**
 * Extract video ID from YouTube URL
 * Handles:
 * - https://youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://youtube.com/shorts/VIDEO_ID
 */
function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);

    // Standard watch URL: /watch?v=VIDEO_ID
    if (parsed.pathname === "/watch") {
      return parsed.searchParams.get("v");
    }

    // Short URL: youtu.be/VIDEO_ID
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1); // Remove leading slash
    }

    // Shorts: /shorts/VIDEO_ID
    if (parsed.pathname.startsWith("/shorts/")) {
      return parsed.pathname.replace("/shorts/", "");
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * L1: Extract metadata using oEmbed APIs
 */
async function extractMetadata(url: string, platform: string) {
  try {
    let oEmbedUrl = "";

    switch (platform) {
      case "instagram":
        oEmbedUrl = `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=${Deno.env.get("INSTAGRAM_ACCESS_TOKEN")}`;
        break;
      case "youtube":
        oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        break;
      case "tiktok":
        oEmbedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
        break;
      default:
        // Generic oEmbed endpoint (not all sites support this)
        return { success: false, cookCard: null, cost: 0 };
    }

    const response = await fetch(oEmbedUrl);
    if (!response.ok) {
      console.error(`oEmbed fetch failed: ${response.statusText}`);
      return { success: false, cookCard: null, cost: 0 };
    }

    const oEmbedData = await response.json();

    // Filter out iframe HTML from description (it's not useful text)
    let description = oEmbedData.html || "";
    if (description.includes('<iframe')) {
      description = ""; // oEmbed returned iframe HTML, not description text
    }

    // Build CookCard from oEmbed data
    const cookCard: CookCard = {
      version: "1.0",
      source: {
        url,
        platform,
        creator: {
          handle: oEmbedData.author_name || oEmbedData.author_url,
          name: oEmbedData.author_name,
          avatar_url: oEmbedData.thumbnail_url,
        },
      },
      title: oEmbedData.title || "Untitled Recipe",
      description,
      image_url: oEmbedData.thumbnail_url,
      instructions: {
        type: "link_only",
      },
      ingredients: [], // Will be filled by L2 or L3
      extraction: {
        method: "metadata",
        confidence: 0.0, // L1 has no ingredients yet, set low confidence
        version: "L1-oembed",
        timestamp: new Date().toISOString(),
        cost_cents: 0,
      },
    };

    return { success: true, cookCard, cost: 0 };
  } catch (err) {
    console.error("L1 extraction error:", err);
    return { success: false, cookCard: null, cost: 0 };
  }
}

/**
 * L2: Parse creator text (captions, descriptions) with regex
 */
async function parseCreatorText(url: string, platform: string, cookCard: CookCard) {
  try {
    let creatorText = "";

    // Fetch platform-specific description/caption
    if (platform === "youtube") {
      creatorText = await fetchYouTubeDescription(url);
    } else if (platform === "instagram") {
      // Instagram Graph API requires access token - skip for now
      console.log("⚠️  Instagram caption extraction requires Graph API token (not provisioned)");
      return { success: false, ingredients: [], cost: 0 };
    } else if (platform === "tiktok") {
      // TikTok API requires auth - skip for now
      console.log("⚠️  TikTok description extraction requires API auth (not provisioned)");
      return { success: false, ingredients: [], cost: 0 };
    } else {
      return { success: false, ingredients: [], cost: 0 };
    }

    if (!creatorText || creatorText.length < 10) {
      console.log("⚠️  No creator text found or too short");
      return { success: false, ingredients: [], cost: 0 };
    }

    // Parse ingredients using regex patterns
    const parsedIngredients = parseIngredientsFromText(creatorText);

    if (parsedIngredients.length === 0) {
      console.log("⚠️  No ingredients parsed from creator text");
      return { success: false, ingredients: [], cost: 0 };
    }

    // Convert to CookCard ingredient format
    const ingredients: Ingredient[] = parsedIngredients.map(ing => ({
      name: ing.name,
      normalized_name: ing.normalized_name,
      amount: typeof ing.amount === 'number' ? ing.amount : undefined,
      unit: ing.unit,
      preparation: ing.preparation,
      confidence: ing.confidence,
      provenance: 'creator_text',
      sort_order: ing.sort_order,
      is_optional: ing.is_optional,
    }));

    const avgConfidence = calculateAverageConfidence(parsedIngredients);

    console.log(`✅ L2: Extracted ${ingredients.length} ingredients (avg confidence: ${avgConfidence.toFixed(2)})`);

    return {
      success: true,
      ingredients,
      cost: 0, // No LLM cost for regex parsing
    };
  } catch (err) {
    console.error("L2 extraction error:", err);
    return { success: false, ingredients: [], cost: 0 };
  }
}

/**
 * L3: LLM-assisted extraction (Gemini 2.0 Flash)
 *
 * UPDATED: Now accepts sourceText parameter (can be description or comment)
 */
async function extractWithLLM(
  url: string,
  platform: string,
  cookCard: CookCard,
  sourceText?: string
) {
  try {
    // Use provided sourceText (should always be provided now)
    let description = sourceText || cookCard.description || "";

    if (!description) {
      console.warn("⚠️  extractWithLLM called without sourceText - this shouldn't happen");
      return { success: false, ingredients: [], instructions: [], cost: 0, confidence: 0 };
    }

    // Send FULL text to Gemini (now extracts both ingredients AND instructions)
    // IMPORTANT: Send full text to ensure evidence phrases are valid
    const result = await extractIngredientsWithGemini(
      cookCard.title,
      description, // Full text, not truncated
      platform
    );

    // Normalize units/amounts (preserve evidence_phrase)
    const normalizedIngredients = result.ingredients.map((ing, index) => {
      const normalized = normalizeIngredient({
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
      });

      return {
        name: normalized.name,
        normalized_name: normalized.normalized_name,
        amount: normalized.amount,
        unit: normalized.unit,
        confidence: result.confidence,
        provenance: 'detected',
        sort_order: index,
        evidence_phrase: ing.evidence_phrase, // CRITICAL: Preserve for validation
      };
    });

    return {
      success: true,
      ingredients: normalizedIngredients,
      instructions: result.instructions, // Structured instructions from Gemini
      cost: result.cost_cents,
      confidence: result.confidence,
    };
  } catch (err) {
    console.error("L3 extraction error:", err);
    return { success: false, ingredients: [], instructions: [], cost: 0, confidence: 0 };
  }
}

/**
 * Match ingredients to canonical items
 */
async function matchCanonicalItems(supabase: any, ingredients: Ingredient[]) {
  const { data: canonicalItems } = await supabase
    .from("canonical_items")
    .select("id, canonical_name, aliases");

  if (!canonicalItems) return ingredients;

  return ingredients.map((ingredient) => {
    const normalized = ingredient.name.toLowerCase().trim();

    // Simple matching logic (will improve in Task 3.1)
    for (const item of canonicalItems) {
      if (item.canonical_name.toLowerCase() === normalized) {
        ingredient.canonical_item_id = item.id;
        break;
      }

      // Check aliases
      if (item.aliases && Array.isArray(item.aliases)) {
        for (const alias of item.aliases) {
          if (alias.toLowerCase() === normalized) {
            ingredient.canonical_item_id = item.id;
            break;
          }
        }
      }
    }

    ingredient.normalized_name = normalized;
    return ingredient;
  });
}

// cacheExtraction and hashURL moved to _shared/cache.ts (input-hash based)

/**
 * Log event for gate tracking
 */
async function logEvent(supabase: any, event: any) {
  await supabase.from("cook_card_events").insert({
    ...event,
    created_at: new Date().toISOString(),
  });
}
