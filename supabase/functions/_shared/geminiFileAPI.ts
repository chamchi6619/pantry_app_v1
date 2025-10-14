/**
 * Gemini File API Helper
 *
 * Provides utilities for uploading videos to Gemini File API for Vision extraction.
 *
 * Key Features:
 * - Upload video files to Gemini File API (FREE, no storage cost)
 * - Auto-deletion after 48 hours (no manual cleanup needed)
 * - Supports up to 2GB files
 * - Returns file URI for Vision API usage
 *
 * Cost: $0.00 for upload/storage (only extraction cost applies)
 */

interface GeminiFileMetadata {
  name: string;
  displayName?: string;
  mimeType: string;
  sizeBytes?: string;
  createTime?: string;
  updateTime?: string;
  expirationTime?: string;
  sha256Hash?: string;
  uri: string;
  state?: 'PROCESSING' | 'ACTIVE' | 'FAILED';
  error?: {
    code: number;
    message: string;
  };
}

interface GeminiFileUploadResponse {
  file: GeminiFileMetadata;
}

/**
 * Uploads a video to Gemini File API for Vision extraction
 *
 * @param videoBlob - Video file as ArrayBuffer
 * @param mimeType - MIME type (default: video/mp4)
 * @param displayName - Optional display name for the file
 * @returns File URI for use in Vision API calls
 *
 * @example
 * const videoBlob = await fetch(videoUrl).then(r => r.arrayBuffer());
 * const fileUri = await uploadToGeminiFileAPI(videoBlob, 'video/mp4');
 * // Use fileUri in Vision API call
 */
export async function uploadToGeminiFileAPI(
  videoBlob: ArrayBuffer,
  mimeType: string = 'video/mp4',
  displayName?: string
): Promise<string> {
  // CRITICAL: Must use same API key as Vision API (L4_GEMINI_VISION)
  // Files uploaded with one key can only be accessed with the same key
  const apiKey = Deno.env.get('L4_GEMINI_VISION') || Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('L4_GEMINI_VISION or GEMINI_API_KEY not configured');
  }

  // Step 1: Start resumable upload session
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;

  const metadata = {
    file: {
      display_name: displayName || `video_${Date.now()}`,
    }
  };

  const initResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(videoBlob.byteLength),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!initResponse.ok) {
    const error = await initResponse.text();
    throw new Error(`Failed to start upload: ${initResponse.status} ${error}`);
  }

  const uploadSessionUrl = initResponse.headers.get('X-Goog-Upload-URL');
  if (!uploadSessionUrl) {
    throw new Error('No upload session URL returned');
  }

  // Step 2: Upload the actual file
  const uploadResponse = await fetch(uploadSessionUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(videoBlob.byteLength),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: videoBlob,
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`Failed to upload file: ${uploadResponse.status} ${error}`);
  }

  const result: GeminiFileUploadResponse = await uploadResponse.json();

  // Step 3: Wait for file to be ACTIVE (may take a few seconds for processing)
  const fileUri = result.file.uri;
  await waitForFileActive(fileUri, apiKey);

  return fileUri;
}

/**
 * Waits for uploaded file to be in ACTIVE state (ready for Vision API)
 *
 * @param fileUri - File URI from upload response
 * @param apiKey - Gemini API key
 * @param maxAttempts - Maximum polling attempts (default: 10)
 * @param delayMs - Delay between attempts in ms (default: 1000)
 */
async function waitForFileActive(
  fileUri: string,
  apiKey: string,
  maxAttempts: number = 10,
  delayMs: number = 1000
): Promise<void> {
  console.log(`⏳ Waiting for file to be ACTIVE: ${fileUri}`);

  for (let i = 0; i < maxAttempts; i++) {
    const fileMetadata = await getFileMetadata(fileUri, apiKey);
    console.log(`   📊 Attempt ${i + 1}/${maxAttempts}: state = ${fileMetadata.state}`);

    if (fileMetadata.state === 'ACTIVE') {
      console.log(`   ✅ File is ACTIVE and ready for Vision API`);
      return;
    }

    if (fileMetadata.state === 'FAILED') {
      console.error(`   ❌ File upload failed:`, fileMetadata.error);
      throw new Error(`File upload failed: ${fileMetadata.error?.message || 'Unknown error'}`);
    }

    // Wait before next check
    console.log(`   ⏳ File still ${fileMetadata.state}, waiting ${delayMs}ms...`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  throw new Error(`File did not become ACTIVE after ${maxAttempts} attempts`);
}

/**
 * Gets metadata for an uploaded file
 *
 * @param fileUri - File URI
 * @param apiKey - Gemini API key
 * @returns File metadata
 */
async function getFileMetadata(fileUri: string, apiKey: string): Promise<GeminiFileMetadata> {
  const response = await fetch(`${fileUri}?key=${apiKey}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get file metadata: ${response.status} ${error}`);
  }

  return await response.json();
}

/**
 * Deletes a file from Gemini File API
 *
 * Note: Files auto-delete after 48 hours, so manual deletion is optional.
 * Use this for immediate cleanup if needed.
 *
 * @param fileUri - File URI to delete
 * @returns True if deleted successfully
 */
export async function deleteGeminiFile(fileUri: string): Promise<boolean> {
  // Use same API key as upload (L4_GEMINI_VISION)
  const apiKey = Deno.env.get('L4_GEMINI_VISION') || Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('L4_GEMINI_VISION or GEMINI_API_KEY not configured');
  }

  try {
    const response = await fetch(`${fileUri}?key=${apiKey}`, {
      method: 'DELETE',
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to delete Gemini file:', error);
    return false;
  }
}

/**
 * Downloads a video from a URL and returns it as ArrayBuffer
 *
 * @param videoUrl - Direct video URL
 * @param maxSizeBytes - Maximum allowed file size (default: 2GB)
 * @returns Video as ArrayBuffer
 */
export async function downloadVideo(
  videoUrl: string,
  maxSizeBytes: number = 2 * 1024 * 1024 * 1024, // 2GB
  timeoutMs: number = 45000 // 45 seconds (leave 15s for upload + processing)
): Promise<ArrayBuffer> {
  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Platform-specific headers
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    // TikTok requires additional headers
    if (videoUrl.includes('tiktok')) {
      headers['Referer'] = 'https://www.tiktok.com/';
      headers['Accept'] = '*/*';
      headers['Accept-Language'] = 'en-US,en;q=0.9';
      headers['Range'] = 'bytes=0-'; // Required for TikTok CDN
    }

    const response = await fetch(videoUrl, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > maxSizeBytes) {
      throw new Error(`Video too large: ${contentLength} bytes (max: ${maxSizeBytes})`);
    }

    const videoData = await response.arrayBuffer();
    return videoData;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Video download timeout (>${timeoutMs}ms) - video may be too large or connection too slow`);
    }

    throw error;
  }
}
