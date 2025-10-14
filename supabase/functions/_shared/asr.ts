/**
 * ASR (Automatic Speech Recognition) Module
 *
 * Purpose: Extract audio transcripts from YouTube videos using OpenAI Whisper
 * Use case: L5 fallback when Vision + Transcript yield <5 ingredients
 *
 * Cost: $0.006/minute (Whisper API)
 * Latency: ~1-2s per minute of audio
 * Pro tier only: Free tier blocked
 */

/**
 * Whisper Pricing
 * - $0.006 per minute of audio
 * - Max file size: 25 MB
 * - Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm
 */
const WHISPER_PRICING = {
  COST_PER_MINUTE: 0.006, // $0.006 per minute
  MAX_FILE_SIZE_MB: 25,
};

export interface ASRResult {
  success: boolean;
  transcript: string;
  cost_cents: number;
  duration_minutes: number;
  language?: string;
  error?: string;
}

/**
 * Extract audio transcript from YouTube video using Whisper API
 *
 * NOTE: This function does NOT actually call Whisper API (requires yt-dlp binary + OpenAI key)
 * It's a placeholder for future implementation when ASR is needed
 *
 * Real implementation would:
 * 1. Download audio with yt-dlp (requires binary in Edge Function)
 * 2. Upload to Whisper API
 * 3. Get transcript
 * 4. Clean up temp files
 *
 * @param youtubeUrl - Full YouTube URL
 * @param durationSeconds - Video duration (for cost calculation)
 * @returns ASR result with transcript and cost
 */
export async function extractAudioTranscript(
  youtubeUrl: string,
  durationSeconds: number
): Promise<ASRResult> {
  const apiKey = Deno.env.get('L4_OPENAI_WHISPER');

  if (!apiKey) {
    return {
      success: false,
      transcript: '',
      cost_cents: 0,
      duration_minutes: 0,
      error: 'L4_OPENAI_WHISPER not configured',
    };
  }

  const durationMinutes = durationSeconds / 60;
  const estimatedCostCents = Math.ceil(durationMinutes * WHISPER_PRICING.COST_PER_MINUTE * 100);

  console.log(`🎤 ASR L5: Extracting audio from ${durationSeconds}s video`);
  console.log(`💰 Estimated cost: ${estimatedCostCents}¢ (${durationMinutes.toFixed(1)}min × $0.006/min)`);

  try {
    // STEP 1: Extract video ID from URL
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return {
        success: false,
        transcript: '',
        cost_cents: 0,
        duration_minutes: durationMinutes,
        error: 'Invalid YouTube URL',
      };
    }

    // STEP 2: Download audio using yt-dlp
    // NOTE: Requires yt-dlp binary installed in Edge Function
    // For now, return placeholder (implement when binary available)
    console.warn('⚠️  ASR L5: yt-dlp not available in Edge Function (requires Docker setup)');
    console.warn('⚠️  ASR L5: Returning mock transcript for development');

    // TODO: Real implementation when yt-dlp is available:
    /*
    const audioPath = `/tmp/${videoId}.mp3`;
    const downloadCmd = new Deno.Command("yt-dlp", {
      args: [
        "-f", "bestaudio",
        "--extract-audio",
        "--audio-format", "mp3",
        "-o", audioPath,
        youtubeUrl
      ],
    });

    const { code: downloadCode } = await downloadCmd.output();
    if (downloadCode !== 0) {
      throw new Error('Failed to download audio');
    }

    // STEP 3: Transcribe with Whisper API
    const audioFile = await Deno.readFile(audioPath);
    const formData = new FormData();
    formData.append('file', new Blob([audioFile]), `${videoId}.mp3`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'en'); // Or auto-detect

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const transcript = data.text || '';

    // STEP 4: Clean up temp file
    await Deno.remove(audioPath);

    // Calculate actual cost
    const actualCostCents = Math.ceil(durationMinutes * WHISPER_PRICING.COST_PER_MINUTE * 100);

    console.log(`✅ ASR L5: Transcribed ${transcript.length} characters (cost: ${actualCostCents}¢)`);

    return {
      success: true,
      transcript,
      cost_cents: actualCostCents,
      duration_minutes: durationMinutes,
      language: data.language || 'en',
    };
    */

    // ARCHITECTURAL LIMITATION: Supabase Edge Functions cannot run yt-dlp
    // - No custom binaries allowed
    // - No file system writes
    // - 60 second timeout (too short for download + transcription)
    //
    // Alternative approaches:
    // 1. Use YouTube Transcript API (L2.5 - already implemented, FREE)
    // 2. External service (Railway/Render) with yt-dlp + webhook back
    // 3. Pre-download audio in client app, upload to Edge Function (not scalable)
    //
    // Recommendation: Rely on Vision L4 + Transcript L2.5 (90-95% coverage)

    console.warn('⚠️  ASR L5 requires external service with yt-dlp binary');
    console.warn('⚠️  Edge Functions cannot download YouTube audio (architectural limitation)');
    console.warn('⚠️  Recommend using Vision L4 + Transcript L2.5 instead (90-95% coverage)');

    return {
      success: false,
      transcript: '',
      cost_cents: 0,
      duration_minutes: durationMinutes,
      error: 'ASR requires external service - Edge Functions cannot download YouTube audio. Use Vision + Transcript instead (covers 90-95% of videos).',
    };

  } catch (err) {
    console.error('❌ ASR L5 error:', err);
    return {
      success: false,
      transcript: '',
      cost_cents: 0,
      duration_minutes: durationMinutes,
      error: (err as Error).message,
    };
  }
}

/**
 * Extract video ID from YouTube URL
 */
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Check if ASR should run based on cost/benefit analysis
 *
 * ASR is expensive ($0.006/min) so only run when:
 * 1. Vision + Transcript yielded <5 ingredients (insufficient data)
 * 2. Video is <10 minutes (cost control: max 6¢)
 * 3. User is Pro tier (free tier blocked)
 * 4. No free transcript available (prefer free sources)
 *
 * @param visionIngredientsCount - Number of ingredients from Vision
 * @param transcriptIngredientsCount - Number from YouTube transcript
 * @param durationSeconds - Video duration
 * @param userTier - User's subscription tier
 * @param hasTranscript - Whether free transcript is available
 * @returns Whether to run ASR
 */
export function shouldRunASR(
  visionIngredientsCount: number,
  transcriptIngredientsCount: number,
  durationSeconds: number,
  userTier: string,
  hasTranscript: boolean
): boolean {
  const totalIngredients = visionIngredientsCount + transcriptIngredientsCount;

  // Gate 1: Only run if we're missing ingredients
  if (totalIngredients >= 5) {
    console.log(`⏭️  ASR L5 skip: Already have ${totalIngredients} ingredients from free sources`);
    return false;
  }

  // Gate 2: Cost control - max 10 minutes ($0.06)
  if (durationSeconds > 600) {
    console.log(`⏭️  ASR L5 skip: Video too long (${durationSeconds}s > 600s, would cost ${(durationSeconds / 60 * 0.006).toFixed(2)}¢)`);
    return false;
  }

  // Gate 3: Pro tier only
  if (userTier === 'free') {
    console.log(`⏭️  ASR L5 skip: Free tier (ASR requires Pro)`);
    return false;
  }

  // Gate 4: Prefer free transcript if available
  if (hasTranscript) {
    console.log(`⏭️  ASR L5 skip: Free transcript already available`);
    return false;
  }

  console.log(`✅ ASR L5 approved: ${totalIngredients} ingredients, ${durationSeconds}s video, ${userTier} tier, no transcript`);
  return true;
}
