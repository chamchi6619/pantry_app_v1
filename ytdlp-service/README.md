# yt-dlp Microservice for Google Cloud Run

A lightweight Express.js service that wraps yt-dlp for extracting video metadata and URLs from social platforms.

## Supported Platforms

- YouTube (videos, shorts)
- TikTok
- Instagram (reels, posts)
- Xiaohongshu (小红书)
- Facebook
- 1000+ other platforms supported by yt-dlp

## API Endpoints

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "ytdlp-service",
  "ytdlp_version": "2024.10.07",
  "timestamp": "2025-10-12T10:00:00.000Z"
}
```

### POST /metadata
Extract full video metadata.

**Request:**
```json
{
  "url": "https://www.tiktok.com/@user/video/123456",
  "timeout": 15000
}
```

**Response:**
```json
{
  "success": true,
  "metadata": {
    "title": "Amazing Recipe!",
    "description": "Ingredients: 1 cup flour, 2 eggs...",
    "thumbnail_url": "https://...",
    "duration_seconds": 45,
    "creator_name": "Chef Name",
    "creator_handle": "@chefname",
    "view_count": 10000,
    "published_at": "20250101"
  },
  "latency_ms": 1234
}
```

### POST /video-url
Extract direct video download URL.

**Request:**
```json
{
  "url": "https://www.tiktok.com/@user/video/123456",
  "timeout": 20000
}
```

**Response:**
```json
{
  "success": true,
  "video_url": "https://v16-webapp.tiktok.com/.../video.mp4",
  "latency_ms": 2345
}
```

## Local Development

### Prerequisites
- Node.js 18+
- Python 3.8+
- yt-dlp installed (`pip3 install yt-dlp`)

### Setup
```bash
cd ytdlp-service
npm install
npm run dev
```

### Test
```bash
# Health check
curl http://localhost:8080/health

# Extract metadata
curl -X POST http://localhost:8080/metadata \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# Extract video URL
curl -X POST http://localhost:8080/video-url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

## Deployment to Google Cloud Run

### Prerequisites
1. Google Cloud account
2. gcloud CLI installed
3. Docker installed (for local testing)

### Deploy Steps

1. **Authenticate with Google Cloud:**
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

2. **Enable required APIs:**
```bash
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

3. **Build and deploy:**
```bash
cd ytdlp-service

# Deploy directly from source (Cloud Run builds the Docker image)
gcloud run deploy ytdlp-service \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --timeout 60s \
  --max-instances 10
```

4. **Get the service URL:**
```bash
gcloud run services describe ytdlp-service --region us-central1 --format 'value(status.url)'
```

### Alternative: Build Docker image locally first
```bash
# Build
docker build -t gcr.io/YOUR_PROJECT_ID/ytdlp-service .

# Test locally
docker run -p 8080:8080 gcr.io/YOUR_PROJECT_ID/ytdlp-service

# Push to Google Container Registry
docker push gcr.io/YOUR_PROJECT_ID/ytdlp-service

# Deploy
gcloud run deploy ytdlp-service \
  --image gcr.io/YOUR_PROJECT_ID/ytdlp-service \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

## Configuration

### Environment Variables
- `PORT` - Port to listen on (default: 8080, set by Cloud Run)

### Cloud Run Settings
- **Memory**: 512Mi (sufficient for yt-dlp)
- **Timeout**: 60s (handles slow video platforms)
- **Max instances**: 10 (adjust based on traffic)
- **Min instances**: 0 (scales to zero when idle - FREE!)

## Cost Estimate

Google Cloud Run free tier:
- 2M requests/month: FREE
- 360,000 GB-seconds/month: FREE

Typical usage (1000 extractions/month):
- ~3 seconds per request
- ~512MB memory
- Cost: **$0** (well within free tier)

## Monitoring

View logs:
```bash
gcloud run services logs read ytdlp-service --region us-central1
```

View metrics:
- Go to: https://console.cloud.google.com/run
- Select `ytdlp-service`
- View: Metrics, Logs, Revisions

## Updating yt-dlp

yt-dlp is installed during Docker build. To update:

1. Redeploy the service (rebuilds with latest yt-dlp):
```bash
gcloud run deploy ytdlp-service --source . --region us-central1
```

2. Or set up automatic updates via Cloud Scheduler (call a rebuild endpoint daily)

## Troubleshooting

### Cold starts
- First request after idle: ~1-2 seconds
- Subsequent requests: <100ms
- To keep warm: Use Cloud Scheduler to ping /health every 5 minutes (costs ~$0.01/month)

### yt-dlp errors
- Check logs: `gcloud run services logs read ytdlp-service`
- Common issues: Video region-locked, private, or requires authentication
- Solution: yt-dlp updates frequently - redeploy to get latest version

### Timeouts
- Increase timeout: `--timeout 120s` in deploy command
- Default 60s should handle most videos

## Security

- Service is public (`--allow-unauthenticated`) for simplicity
- To add authentication, remove flag and use IAM or API keys
- Rate limiting: Add middleware or use Cloud Armor

## Integration with Supabase

In your Supabase Edge Function:

```typescript
// Replace local yt-dlp calls with HTTP requests
const response = await fetch('https://ytdlp-service-xxx.run.app/metadata', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url, timeout: 15000 }),
});

const result = await response.json();

if (result.success) {
  const metadata = result.metadata;
  // Continue with extraction...
}
```
