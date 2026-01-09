/**
 * yt-dlp Microservice for Google Cloud Run
 *
 * Purpose: Extract video metadata and URLs using yt-dlp
 * Platforms: YouTube, TikTok, Instagram, Xiaohongshu, Facebook
 *
 * Endpoints:
 * - POST /metadata - Extract full metadata (title, description, duration, etc.)
 * - POST /video-url - Extract direct video download URL
 * - POST /download - Download video file directly (bypasses 403 issues)
 * - GET /health - Health check
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const fsSync = require('fs'); // For createReadStream
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 8080; // Cloud Run uses PORT env var

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

/**
 * Health check endpoint
 */
app.get('/health', async (req, res) => {
  try {
    // Check if yt-dlp is available
    const { stdout } = await execAsync('yt-dlp --version');
    const version = stdout.trim();

    res.json({
      status: 'healthy',
      service: 'ytdlp-service',
      ytdlp_version: version,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'yt-dlp not available',
      message: error.message,
    });
  }
});

/**
 * Extract video metadata using yt-dlp --dump-json
 *
 * Request body:
 * {
 *   "url": "https://tiktok.com/...",
 *   "timeout": 15000  // optional, milliseconds
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "metadata": {
 *     "title": "...",
 *     "description": "...",
 *     "thumbnail_url": "...",
 *     "duration_seconds": 123,
 *     "creator_name": "...",
 *     "creator_handle": "...",
 *     ...
 *   },
 *   "latency_ms": 1234
 * }
 */
app.post('/metadata', async (req, res) => {
  const startTime = Date.now();
  const { url, timeout = 15000 } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: url',
    });
  }

  console.log(`📥 Extracting metadata for: ${url.substring(0, 80)}...`);

  try {
    // Run yt-dlp with timeout
    const command = `yt-dlp --dump-json --skip-download --no-warnings --quiet --no-check-certificate "${url}"`;

    const { stdout, stderr } = await Promise.race([
      execAsync(command, { maxBuffer: 10 * 1024 * 1024 }), // 10MB buffer
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('yt-dlp timeout')), timeout)
      ),
    ]);

    const latency_ms = Date.now() - startTime;

    // Parse JSON output
    const data = JSON.parse(stdout);

    // Extract relevant metadata
    const metadata = {
      title: data.title || 'Untitled',
      description: data.description || '',
      thumbnail_url: data.thumbnail || '',
      duration_seconds: data.duration || 0,
      creator_name: data.uploader || data.channel || data.creator || '',
      creator_handle: data.uploader_id || data.channel_id || data.uploader_url || '',
      view_count: data.view_count ? parseInt(data.view_count, 10) : undefined,
      published_at: data.upload_date || data.timestamp || undefined,
      uploader_id: data.uploader_id || data.channel_id,
      uploader_url: data.uploader_url || data.channel_url,
    };

    console.log(`✅ Metadata extracted: "${metadata.title}" (${latency_ms}ms, ${metadata.description.length} chars)`);

    res.json({
      success: true,
      metadata,
      latency_ms,
    });

  } catch (error) {
    const latency_ms = Date.now() - startTime;

    console.error(`❌ Metadata extraction failed: ${error.message}`);

    // Check if it's a timeout
    if (error.message === 'yt-dlp timeout') {
      return res.status(504).json({
        success: false,
        error: `yt-dlp timeout after ${timeout}ms`,
        latency_ms,
      });
    }

    // Check if it's a parsing error
    if (error.message.includes('JSON')) {
      return res.status(500).json({
        success: false,
        error: 'Failed to parse yt-dlp output',
        stderr: error.stderr?.substring(0, 500),
        latency_ms,
      });
    }

    // Generic error
    res.status(500).json({
      success: false,
      error: error.message,
      stderr: error.stderr?.substring(0, 500),
      latency_ms,
    });
  }
});

/**
 * Extract direct video URL using yt-dlp --get-url
 *
 * Request body:
 * {
 *   "url": "https://tiktok.com/...",
 *   "timeout": 20000  // optional, milliseconds
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "video_url": "https://...",
 *   "latency_ms": 1234
 * }
 */
app.post('/video-url', async (req, res) => {
  const startTime = Date.now();
  const { url, timeout = 20000 } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: url',
    });
  }

  console.log(`📥 Extracting video URL for: ${url.substring(0, 80)}...`);

  try {
    // Run yt-dlp with timeout
    const command = `yt-dlp --get-url --format best --no-warnings --quiet "${url}"`;

    const { stdout, stderr } = await Promise.race([
      execAsync(command),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('yt-dlp timeout')), timeout)
      ),
    ]);

    const latency_ms = Date.now() - startTime;

    const videoUrl = stdout.trim();

    if (!videoUrl || !videoUrl.startsWith('http')) {
      throw new Error('Invalid video URL returned by yt-dlp');
    }

    console.log(`✅ Video URL extracted (${latency_ms}ms)`);

    res.json({
      success: true,
      video_url: videoUrl,
      latency_ms,
    });

  } catch (error) {
    const latency_ms = Date.now() - startTime;

    console.error(`❌ Video URL extraction failed: ${error.message}`);

    // Check if it's a timeout
    if (error.message === 'yt-dlp timeout') {
      return res.status(504).json({
        success: false,
        error: `yt-dlp timeout after ${timeout}ms`,
        latency_ms,
      });
    }

    // Generic error
    res.status(500).json({
      success: false,
      error: error.message,
      stderr: error.stderr?.substring(0, 500),
      latency_ms,
    });
  }
});

/**
 * Download video file directly using yt-dlp
 *
 * This endpoint solves the 403 Forbidden issue with TikTok/Instagram direct downloads.
 * Instead of returning a URL that expires, we download the video on Cloud Run and return the file.
 *
 * Request body:
 * {
 *   "url": "https://tiktok.com/...",
 *   "timeout": 45000,  // optional, milliseconds
 *   "max_size_mb": 100  // optional, max file size in MB (default: 100MB)
 * }
 *
 * Response: Binary video file (application/octet-stream)
 */
app.post('/download', async (req, res) => {
  const startTime = Date.now();
  const { url, timeout = 45000, max_size_mb = 100 } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: url',
    });
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ytdlp-'));
  const outputPath = path.join(tempDir, 'video.%(ext)s');

  console.log(`📥 Downloading video from: ${url.substring(0, 80)}...`);
  console.log(`   Temp directory: ${tempDir}`);

  try {
    // Download video with yt-dlp
    // --max-filesize: Reject videos larger than max_size_mb
    // --format: Best quality within size limit
    // --no-playlist: Only download single video (not entire playlist)
    const command = `yt-dlp --max-filesize ${max_size_mb}M --format "best[filesize<${max_size_mb}M]" --no-playlist --no-warnings --quiet -o "${outputPath}" "${url}"`;

    await Promise.race([
      execAsync(command),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('yt-dlp download timeout')), timeout)
      ),
    ]);

    const latency_ms = Date.now() - startTime;

    // Find the downloaded file (extension may vary: .mp4, .webm, etc.)
    const files = await fs.readdir(tempDir);
    if (files.length === 0) {
      throw new Error('No video file downloaded');
    }

    const videoFile = path.join(tempDir, files[0]);
    const stats = await fs.stat(videoFile);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);

    console.log(`✅ Downloaded: ${files[0]} (${fileSizeMB} MB, ${latency_ms}ms)`);

    // Read and send the video file
    const videoBuffer = await fs.readFile(videoFile);

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });

    // Return video file as binary
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': videoBuffer.length,
      'X-Latency-Ms': latency_ms,
      'X-File-Size-MB': fileSizeMB,
    });

    res.send(videoBuffer);

  } catch (error) {
    const latency_ms = Date.now() - startTime;

    console.error(`❌ Video download failed: ${error.message}`);

    // Clean up temp directory on error
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn(`⚠️  Failed to clean up temp directory: ${cleanupError.message}`);
    }

    // Check if it's a timeout
    if (error.message === 'yt-dlp download timeout') {
      return res.status(504).json({
        success: false,
        error: `Video download timeout after ${timeout}ms`,
        latency_ms,
      });
    }

    // Check if it's a size limit error
    if (error.message.includes('File is larger than max-filesize')) {
      return res.status(413).json({
        success: false,
        error: `Video too large (>${max_size_mb}MB)`,
        latency_ms,
      });
    }

    // Generic error
    res.status(500).json({
      success: false,
      error: error.message,
      stderr: error.stderr?.substring(0, 500),
      latency_ms,
    });
  }
});

/**
 * Download video and upload to Gemini File API
 *
 * This endpoint solves the response size limit issue by:
 * 1. Downloading video on Cloud Run (no size limit)
 * 2. Uploading to Gemini File API (supports large files)
 * 3. Returning small File URI (no response size issue)
 *
 * Request body:
 * {
 *   "url": "https://tiktok.com/...",
 *   "timeout": 60000,  // optional, milliseconds
 *   "max_size_mb": 100,  // optional, max file size in MB
 *   "gemini_api_key": "..."  // required
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "file_uri": "https://generativelanguage.googleapis.com/v1beta/files/...",
 *   "file_name": "...",
 *   "file_size_mb": 36.08,
 *   "latency_ms": 12345
 * }
 */
app.post('/upload-to-gemini', async (req, res) => {
  const startTime = Date.now();
  const { url, timeout = 60000, max_size_mb = 100, gemini_api_key } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: url',
    });
  }

  if (!gemini_api_key) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: gemini_api_key',
    });
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ytdlp-'));
  const outputPath = path.join(tempDir, 'video.%(ext)s');

  console.log(`📥 Downloading video from: ${url.substring(0, 80)}...`);
  console.log(`   Temp directory: ${tempDir}`);

  try {
    // Step 1: Download video with yt-dlp
    const command = `yt-dlp --max-filesize ${max_size_mb}M --format "best[filesize<${max_size_mb}M]" --no-playlist --no-warnings --quiet -o "${outputPath}" "${url}"`;

    await Promise.race([
      execAsync(command),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('yt-dlp download timeout')), timeout)
      ),
    ]);

    const downloadLatency = Date.now() - startTime;

    // Find the downloaded file
    const files = await fs.readdir(tempDir);
    if (files.length === 0) {
      throw new Error('No video file downloaded');
    }

    const videoFile = path.join(tempDir, files[0]);
    const stats = await fs.stat(videoFile);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);

    console.log(`✅ Downloaded: ${files[0]} (${fileSizeMB} MB, ${downloadLatency}ms)`);

    // Step 2: Upload to Gemini File API
    console.log(`⬆️  Uploading to Gemini File API...`);

    const FormData = require('form-data');
    const formData = new FormData();

    formData.append('file', fsSync.createReadStream(videoFile), {
      filename: files[0],
      contentType: 'video/mp4',
    });

    const uploadResponse = await axios.post(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${gemini_api_key}`,
      formData,
      {
        headers: formData.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    const uploadData = uploadResponse.data;
    const uploadLatency = Date.now() - startTime;

    console.log(`✅ Uploaded to Gemini: ${uploadData.file.name} (${uploadLatency}ms total)`);

    // Step 3: Wait for file to become ACTIVE
    console.log(`⏳ Waiting for file to become ACTIVE...`);

    const fileName = uploadData.file.name;
    const maxWaitTime = 60000; // 60 seconds max wait
    const pollInterval = 2000; // Check every 2 seconds
    let fileState = uploadData.file.state || 'PROCESSING';
    let pollCount = 0;

    while (fileState === 'PROCESSING' && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      pollCount++;

      const statusResponse = await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${gemini_api_key}`
      );

      fileState = statusResponse.data.state;
      console.log(`   Poll ${pollCount}: File state = ${fileState}`);

      if (fileState === 'ACTIVE') {
        break;
      } else if (fileState === 'FAILED') {
        throw new Error('File processing failed on Gemini servers');
      }
    }

    if (fileState !== 'ACTIVE') {
      throw new Error(`File did not become ACTIVE within ${maxWaitTime}ms (state: ${fileState})`);
    }

    const totalLatency = Date.now() - startTime;
    console.log(`✅ File ACTIVE and ready to use (${totalLatency}ms total, ${pollCount} polls)`);

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });

    // Return File URI (tiny response, no size limit issue!)
    res.json({
      success: true,
      file_uri: uploadData.file.uri,
      file_name: uploadData.file.name,
      file_size_mb: parseFloat(fileSizeMB),
      latency_ms: totalLatency,
      file_state: fileState,
      poll_count: pollCount,
    });

  } catch (error) {
    const latency_ms = Date.now() - startTime;

    console.error(`❌ Upload to Gemini failed: ${error.message}`);

    // Clean up temp directory on error
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn(`⚠️  Failed to clean up temp directory: ${cleanupError.message}`);
    }

    // Check if it's a timeout
    if (error.message === 'yt-dlp download timeout') {
      return res.status(504).json({
        success: false,
        error: `Video download timeout after ${timeout}ms`,
        latency_ms,
      });
    }

    // Check if it's a size limit error
    if (error.message.includes('File is larger than max-filesize')) {
      return res.status(413).json({
        success: false,
        error: `Video too large (>${max_size_mb}MB)`,
        latency_ms,
      });
    }

    // Generic error
    res.status(500).json({
      success: false,
      error: error.message,
      latency_ms,
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    available_endpoints: [
      'GET /health',
      'POST /metadata',
      'POST /video-url',
      'POST /download',
      'POST /upload-to-gemini',
    ],
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 yt-dlp service listening on port ${PORT}`);
  console.log(`📋 Endpoints:`);
  console.log(`   GET  /health           - Health check`);
  console.log(`   POST /metadata         - Extract video metadata`);
  console.log(`   POST /video-url        - Extract video URL`);
  console.log(`   POST /download         - Download video file (solves 403 issues)`);
  console.log(`   POST /upload-to-gemini - Download & upload to Gemini File API (solves size limit)`);
});
