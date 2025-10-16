/**
 * yt-dlp Integration Module (Cloud Run Version)
 *
 * Purpose: Extract video metadata using yt-dlp via Google Cloud Run microservice
 *
 * Why yt-dlp?
 * - FREE: $0 cost vs YouTube API quotas or paid APIs
 * - High success rate: 91.7% tested on multi-platform sample
 * - Rich metadata: Full descriptions (TikTok oEmbed returns empty)
 * - Wide support: TikTok, YouTube, Instagram, Xiaohongshu, 1000+ sites
 * - Active maintenance: Updates within hours when platforms change
 *
 * Performance:
 * - Latency: 2-4 seconds per URL (includes network hop to Cloud Run)
 * - Reliability: Cloud Run with latest yt-dlp version
 *
 * Deployment:
 * - yt-dlp runs on Google Cloud Run (subprocess execution allowed)
 * - Supabase Edge Function makes HTTP calls to Cloud Run service
 * - See ytdlp-service/ directory for Cloud Run service code
 */

// Cloud Run service URL
const YTDLP_SERVICE_URL = Deno.env.get("YTDLP_SERVICE_URL") || "https://ytdlp-service-23475904497.us-central1.run.app";

/**
 * Platform metadata result from yt-dlp
 */
export interface YtDlpMetadata {
  title: string;
  description: string;
  thumbnail_url: string;
  duration_seconds: number;
  creator_name: string;
  creator_handle: string;
  view_count?: number;
  published_at?: string;
  automatic_captions?: Record<string, any>; // For L2.5 transcript enhancement
  uploader_id?: string;
  uploader_url?: string;
}

/**
 * yt-dlp execution result
 */
export interface YtDlpResult {
  success: boolean;
  metadata?: YtDlpMetadata;
  error?: string;
  latency_ms: number;
  stderr?: string;
}

/**
 * Execute yt-dlp to extract video metadata
 *
 * @param url - Video URL (YouTube, TikTok, Instagram, Xiaohongshu, etc.)
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns Extraction result with metadata or error
 */
export async function extractMetadataWithYtDlp(
  url: string,
  timeoutMs: number = 10000
): Promise<YtDlpResult> {
  const startTime = Date.now();

  try {
    console.log(`🎬 yt-dlp (Cloud Run): Extracting metadata from ${url.substring(0, 60)}...`);

    // Call Cloud Run service
    const response = await fetch(`${YTDLP_SERVICE_URL}/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, timeout: timeoutMs }),
      signal: AbortSignal.timeout(timeoutMs + 2000), // Add 2s buffer
    });

    const latency_ms = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Cloud Run error (HTTP ${response.status}): ${errorText}`);

      // Try to parse error JSON to extract stderr
      let parsedError;
      let stderr;
      try {
        parsedError = JSON.parse(errorText);
        stderr = parsedError.stderr;
      } catch {
        // Couldn't parse as JSON, use raw error text
      }

      return {
        success: false,
        error: parsedError?.error || `Cloud Run service error: HTTP ${response.status}`,
        stderr: stderr,
        latency_ms,
      };
    }

    const data = await response.json();

    if (!data.success) {
      console.error(`❌ yt-dlp failed: ${data.error || 'Unknown error'}`);
      if (data.stderr) {
        console.error(`   stderr: ${data.stderr.substring(0, 300)}`);
      }

      return {
        success: false,
        error: data.error || 'Unknown error',
        stderr: data.stderr,
        latency_ms,
      };
    }

    // Map Cloud Run response to YtDlpMetadata format
    const metadata: YtDlpMetadata = {
      title: data.metadata.title,
      description: data.metadata.description,
      thumbnail_url: data.metadata.thumbnail_url,
      duration_seconds: data.metadata.duration_seconds,
      creator_name: data.metadata.creator_name,
      creator_handle: data.metadata.creator_handle,
      view_count: data.metadata.view_count,
      published_at: data.metadata.published_at,
      uploader_id: data.metadata.uploader_id,
      uploader_url: data.metadata.uploader_url,
    };

    console.log(`✅ yt-dlp (Cloud Run): "${metadata.title}" (${latency_ms}ms, ${metadata.description.length} chars desc)`);

    return {
      success: true,
      metadata,
      latency_ms,
    };

  } catch (err) {
    const latency_ms = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';

    console.error(`❌ yt-dlp Cloud Run error: ${errorMsg}`);

    return {
      success: false,
      error: errorMsg,
      latency_ms,
    };
  }
}

/**
 * Get direct video URL using yt-dlp --get-url
 *
 * Alternative to platformScrapers.ts HTML scraping.
 * More reliable and maintained by yt-dlp community.
 *
 * @param url - Video URL
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns Direct video URL or null if failed
 */
export async function getVideoUrlWithYtDlp(
  url: string,
  timeoutMs: number = 10000
): Promise<string | null> {
  const startTime = Date.now();

  try {
    console.log(`🎬 yt-dlp (Cloud Run): Getting video URL for ${url.substring(0, 60)}...`);

    // Call Cloud Run service
    const response = await fetch(`${YTDLP_SERVICE_URL}/video-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, timeout: timeoutMs }),
      signal: AbortSignal.timeout(timeoutMs + 2000), // Add 2s buffer
    });

    const latency_ms = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Cloud Run error: ${errorText}`);
      return null;
    }

    const data = await response.json();

    if (!data.success) {
      console.error(`❌ yt-dlp failed: ${data.error}`);
      return null;
    }

    console.log(`✅ yt-dlp (Cloud Run): Got video URL (${latency_ms}ms)`);
    return data.video_url;

  } catch (err) {
    console.error(`❌ yt-dlp Cloud Run error:`, err);
    return null;
  }
}

/**
 * Extract automatic captions/transcript using yt-dlp
 *
 * Alternative to manual YouTube timedtext scraping.
 * Can also work for TikTok auto-captions.
 *
 * @param url - Video URL
 * @param language - Language code (default: "en")
 * @param timeoutMs - Timeout in milliseconds
 * @returns Transcript text or null if not available
 */
export async function getTranscriptWithYtDlp(
  url: string,
  language: string = "en",
  timeoutMs: number = 10000
): Promise<string | null> {
  try {
    console.log(`📝 yt-dlp: Fetching ${language} captions for ${url.substring(0, 60)}...`);

    const cmd = new Deno.Command("yt-dlp", {
      args: [
        "--skip-download",
        "--write-auto-sub",      // Get auto-generated subtitles
        "--sub-lang", language,
        "--sub-format", "json3", // JSON format for easy parsing
        "--print", "%(subtitles)s",
        "--no-warnings",
        "--quiet",
        url,
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const process = cmd.spawn();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), timeoutMs);
    });

    const outputPromise = process.output();

    let output;
    try {
      output = await Promise.race([outputPromise, timeoutPromise]);
    } catch {
      process.kill("SIGTERM");
      return null;
    }

    if (output.code !== 0) {
      // Not an error - captions may not be available
      return null;
    }

    const stdout = new TextDecoder().decode(output.stdout);

    // Parse subtitle JSON
    // Format: {"events": [{"segs": [{"utf8": "text"}]}]}
    try {
      const data = JSON.parse(stdout);
      const events = data?.events || [];
      const transcriptLines: string[] = [];

      for (const event of events) {
        if (event.segs) {
          const text = event.segs.map((seg: any) => seg.utf8 || "").join("");
          if (text.trim()) {
            transcriptLines.push(text.trim());
          }
        }
      }

      const transcript = transcriptLines.join(" ");

      if (transcript.length > 0) {
        console.log(`✅ yt-dlp: Fetched ${transcript.length} chars of captions`);
        return transcript;
      }

      return null;
    } catch {
      // Parsing failed - no captions available
      return null;
    }

  } catch (err) {
    console.error(`❌ yt-dlp transcript error:`, err);
    return null;
  }
}

/**
 * Download video file directly using yt-dlp (Cloud Run)
 *
 * This solves the 403 Forbidden issue with TikTok/Instagram.
 * Instead of getting a URL that expires, yt-dlp downloads the video
 * on Cloud Run and returns the binary data.
 *
 * @param url - Video URL (YouTube, TikTok, Instagram, Xiaohongshu, etc.)
 * @param timeoutMs - Timeout in milliseconds (default: 45000)
 * @param maxSizeMB - Maximum file size in MB (default: 100)
 * @returns Video file as ArrayBuffer or null if failed
 */
export async function downloadVideoWithYtDlp(
  url: string,
  timeoutMs: number = 45000,
  maxSizeMB: number = 100
): Promise<ArrayBuffer | null> {
  const startTime = Date.now();

  try {
    console.log(`🎬 yt-dlp (Cloud Run): Downloading video for ${url.substring(0, 60)}...`);

    // Call Cloud Run service
    const response = await fetch(`${YTDLP_SERVICE_URL}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, timeout: timeoutMs, max_size_mb: maxSizeMB }),
      signal: AbortSignal.timeout(timeoutMs + 5000), // Add 5s buffer
    });

    const latency_ms = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Cloud Run download error: ${errorText}`);
      return null;
    }

    // Get video binary data
    const videoBuffer = await response.arrayBuffer();
    const fileSizeMB = (videoBuffer.byteLength / 1024 / 1024).toFixed(2);

    console.log(`✅ yt-dlp (Cloud Run): Downloaded video (${fileSizeMB} MB, ${latency_ms}ms)`);
    return videoBuffer;

  } catch (err) {
    console.error(`❌ yt-dlp Cloud Run download error:`, err);
    return null;
  }
}

/**
 * Download video and upload to Gemini File API (Cloud Run)
 *
 * This solves the response size limit issue by:
 * 1. Cloud Run downloads video (no size limit)
 * 2. Cloud Run uploads to Gemini File API
 * 3. Returns tiny File URI (no response size issue)
 *
 * @param url - Video URL (YouTube, TikTok, Instagram, Xiaohongshu, etc.)
 * @param timeoutMs - Timeout in milliseconds (default: 60000)
 * @param maxSizeMB - Maximum file size in MB (default: 100)
 * @returns Gemini File URI or null if failed
 */
export async function uploadVideoToGeminiFileAPI(
  url: string,
  timeoutMs: number = 60000,
  maxSizeMB: number = 100
): Promise<string | null> {
  const startTime = Date.now();

  try {
    console.log(`🎬 yt-dlp (Cloud Run): Uploading video to Gemini File API for ${url.substring(0, 60)}...`);
    console.log(`   🔧 DEBUG: timeout=${timeoutMs}ms, maxSize=${maxSizeMB}MB, startTime=${startTime}`);

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      console.error("❌ GEMINI_API_KEY not configured");
      return null;
    }

    console.log(`   🔧 DEBUG: Calling fetch to ${YTDLP_SERVICE_URL}/upload-to-gemini...`);

    // Call Cloud Run service
    const fetchStartTime = Date.now();
    const response = await fetch(`${YTDLP_SERVICE_URL}/upload-to-gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        timeout: timeoutMs,
        max_size_mb: maxSizeMB,
        gemini_api_key: geminiApiKey
      }),
      signal: AbortSignal.timeout(timeoutMs + 5000), // Add 5s buffer
    });

    const fetchLatency = Date.now() - fetchStartTime;
    console.log(`   🔧 DEBUG: fetch() returned after ${fetchLatency}ms, status=${response.status}`);

    const latency_ms = Date.now() - startTime;

    if (!response.ok) {
      console.error(`   🔧 DEBUG: Response not OK (status ${response.status}), reading error text...`);
      const errorText = await response.text();
      console.error(`❌ Cloud Run upload error: ${errorText}`);
      return null;
    }

    console.log(`   🔧 DEBUG: Response OK, parsing JSON...`);
    const data = await response.json();
    console.log(`   🔧 DEBUG: JSON parsed, success=${data.success}, has_file_uri=${!!data.file_uri}`);

    if (!data.success) {
      console.error(`❌ Upload to Gemini failed: ${data.error || 'Unknown error'}`);
      return null;
    }

    console.log(`✅ yt-dlp (Cloud Run): Uploaded to Gemini (${data.file_size_mb} MB, ${latency_ms}ms)`);
    console.log(`   File URI: ${data.file_uri}`);

    return data.file_uri;

  } catch (err) {
    const errorLatency = Date.now() - startTime;
    console.error(`❌ yt-dlp Cloud Run upload error after ${errorLatency}ms:`, err);
    console.error(`   🔧 DEBUG: Error type: ${err instanceof Error ? err.constructor.name : typeof err}`);
    console.error(`   🔧 DEBUG: Error message: ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) {
      console.error(`   🔧 DEBUG: Stack trace: ${err.stack.substring(0, 500)}`);
    }
    return null;
  }
}

/**
 * Check if yt-dlp is installed and accessible
 *
 * @returns true if yt-dlp is available, false otherwise
 */
export async function checkYtDlpAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${YTDLP_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ yt-dlp Cloud Run available: version ${data.ytdlp_version}`);
      return true;
    }

    console.warn("⚠️  yt-dlp Cloud Run unhealthy");
    return false;
  } catch (err) {
    console.warn(`⚠️  yt-dlp Cloud Run not reachable: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return false;
  }
}
