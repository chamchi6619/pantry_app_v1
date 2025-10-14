# Extract Cook Card Edge Function

**Purpose:** Ingestion ladder (L0-L5) for extracting recipe metadata and ingredients from social media URLs.

## yt-dlp Integration (NEW)

**As of v2.0.0**, this function now uses **yt-dlp** as the primary metadata extraction method, with fallback to legacy APIs.

### Why yt-dlp?

- ✅ **FREE:** $0 cost (no API quotas, no rate limits)
- ✅ **Rich metadata:** Full descriptions for TikTok (oEmbed returns empty)
- ✅ **Xiaohongshu support:** ONLY method that works (no oEmbed API)
- ✅ **91.7% success rate:** Tested on multi-platform sample
- ✅ **Active maintenance:** Community updates within hours of platform changes
- ✅ **1000+ platforms:** TikTok, YouTube, Instagram, Xiaohongshu, Facebook, and more

### Extraction Strategy

```
1. Try yt-dlp first (10s timeout)
   ↓
2. On success: Use yt-dlp metadata
   ↓
3. On failure: Fall back to legacy APIs
   - YouTube → YouTube Data API v3
   - Instagram/TikTok → oEmbed
   - Xiaohongshu → (no fallback, yt-dlp only option)
```

### Performance

- **Latency:** 1-4 seconds per URL (acceptable for async extraction)
- **Reliability:** Fallback ensures 100% backward compatibility
- **Cost savings:** TikTok descriptions now free (was $0.013 per Vision fallback)

## Ingestion Ladder

| Level | Method | Confidence | Cost | Description |
|-------|--------|------------|------|-------------|
| **L0** | Metadata | N/A | $0 | yt-dlp or API extraction (title, description, thumbnail) |
| **L1** | Description | N/A | $0 | Use description from L0 as source text |
| **L2** | Comments | N/A | $0 | YouTube comment harvesting (secondary ladder) |
| **L2.5** | Transcript | N/A | $0 | Auto-captions from YouTube/TikTok |
| **L3** | LLM-Assisted | 70-90% | ~$0.002 | Gemini 2.0 Flash extraction |
| **L4** | Vision | 80-95% | ~$0.015 | Gemini 2.5 Flash vision (multi-platform) |
| **L5** | ASR | 85-98% | ~$0.03/min | Whisper transcription (conditional) |

**Fail-Closed:** If confidence <80%, require user confirmation before allowing "Add to Shopping List".

## Supported Platforms

- ✅ **YouTube** (yt-dlp → fallback to YouTube Data API v3)
- ✅ **TikTok** (yt-dlp → fallback to oEmbed)
- ✅ **Instagram** (yt-dlp → fallback to Instagram Graph API)
- ✅ **Xiaohongshu** (yt-dlp ONLY - no API alternative)
- ✅ **Facebook** (yt-dlp → fallback to oEmbed)

## API Reference

### Request

```http
POST /functions/v1/extract-cook-card
Content-Type: application/json
Authorization: Bearer <SUPABASE_ANON_KEY>

{
  "url": "https://www.instagram.com/p/ABC123/",
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "household_id": "661f9511-f30c-52e5-b827-557766551111"
}
```

### Response (Success)

```json
{
  "cook_card": {
    "version": "1.0",
    "source": {
      "url": "https://www.instagram.com/p/ABC123/",
      "platform": "instagram",
      "creator": {
        "handle": "halfbakedharvest",
        "name": "Tieghan Gerard",
        "avatar_url": "https://instagram.fcdn.net/..."
      }
    },
    "title": "Brown Butter Sage Pasta",
    "description": "Quick 20-minute pasta...",
    "image_url": "https://instagram.fcdn.net/.../photo.jpg",
    "ingredients": [
      {
        "name": "pasta",
        "amount": 1,
        "unit": "lb",
        "confidence": 0.95,
        "provenance": "creator_provided",
        "canonical_item_id": "c1e4a89f-...",
        "sort_order": 1
      }
    ],
    "extraction": {
      "method": "creator_text",
      "confidence": 0.92,
      "version": "L2-regex",
      "timestamp": "2025-10-07T16:30:00Z",
      "cost_cents": 0
    }
  },
  "requires_confirmation": false,
  "cache_status": "cached"
}
```

### Response (Requires Confirmation)

```json
{
  "cook_card": { /* ... */ },
  "requires_confirmation": true,
  "cache_status": "fresh"
}
```

### Response (Fallback to Cook Card Lite)

```json
{
  "error": "Could not extract ingredients from this URL",
  "fallback": "cook_card_lite",
  "cook_card": {
    "title": "Recipe from Instagram",
    "source": { /* ... */ },
    "ingredients": []
  }
}
```

## Environment Variables

Set in Supabase Dashboard → Project Settings → Edge Functions:

```bash
SUPABASE_URL=https://dyevpemrrlmbhifhqiwx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
INSTAGRAM_ACCESS_TOKEN=<your-instagram-graph-api-token>
YOUTUBE_API_KEY=<your-youtube-data-api-key>
GEMINI_API_KEY=<your-gemini-api-key>
```

## Caching Strategy

- **30-day TTL** per URL
- **Cache key:** SHA-256 hash of source URL
- **Cache hit:** Return cached extraction (cost = $0)
- **Cache miss:** Run ingestion ladder, cache result

### Cache Invalidation

Caches expire automatically after 30 days. Manual invalidation:

```sql
DELETE FROM extraction_cache WHERE source_url = 'https://...';
```

## Cost Control (Gate 4)

- **L1 (Metadata):** $0 (oEmbed is free)
- **L2 (Creator Text):** $0 (regex parsing)
- **L3 (LLM):** ~$0.01 per extraction (Gemini 2.0 Flash)

**Target:** <$0.015/save, <0.4 LLM calls per URL

**Strategy:**
1. Always try L1 → L2 first (free)
2. Only invoke L3 if L1+L2 fail
3. Cache all results (30-day TTL)
4. Fail-closed: Don't silently invent ingredients

## Testing

### Test Locally

```bash
npx supabase functions serve extract-cook-card
```

### Test with Sample URLs

```bash
# Instagram
curl -X POST http://localhost:54321/functions/v1/extract-cook-card \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.instagram.com/p/ABC123/", "user_id": "test-user-id"}'

# YouTube
curl -X POST http://localhost:54321/functions/v1/extract-cook-card \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "user_id": "test-user-id"}'
```

## Deployment

### Prerequisites

**yt-dlp Installation:** This function requires a custom Dockerfile to install yt-dlp. The `Dockerfile` is located at `supabase/functions/Dockerfile`.

### Deploy to Supabase

```bash
# Deploy with custom Docker image (includes yt-dlp)
npx supabase functions deploy extract-cook-card --no-verify-jwt

# Supabase will automatically detect and use the Dockerfile
# Build time: ~2-3 minutes (first deploy), ~30s (cached)
```

### Verify Deployment

```bash
# Test yt-dlp availability
npx supabase functions invoke extract-cook-card --body '{"url":"https://youtube.com/shorts/ZYs3TGnXeHs","user_id":"test"}'

# Check logs for yt-dlp usage
npx supabase functions logs extract-cook-card --tail
# Look for: "✅ yt-dlp: ..." or "⚠️ yt-dlp failed: ..."
```

### Monitoring yt-dlp Adoption

Track adoption via `cook_card_events` table:

```sql
-- yt-dlp usage rate
SELECT
  metadata_source,
  COUNT(*) as extractions,
  AVG(ytdlp_latency_ms) as avg_latency_ms,
  AVG(description_length) as avg_desc_length
FROM cook_card_events
WHERE event_type = 'metadata_extracted'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY metadata_source;

-- Platform-specific success rates
SELECT
  platform,
  metadata_source,
  COUNT(*) as count
FROM cook_card_events
WHERE event_type = 'metadata_extracted'
GROUP BY platform, metadata_source
ORDER BY platform, count DESC;
```

## Implementation Status

- ✅ **L0:** Metadata extraction (yt-dlp + fallback to YouTube API/oEmbed)
- ✅ **L1:** Description-based extraction
- ✅ **L2:** YouTube comment harvesting (secondary ladder)
- ✅ **L2.5:** Transcript extraction (auto-captions)
- ✅ **L3:** LLM extraction (Gemini 2.0 Flash with evidence validation)
- ✅ **L4:** Vision extraction (Gemini 2.5 Flash, multi-platform)
- ✅ **L5:** ASR extraction (Whisper, conditional)
- ✅ Canonical item matching
- ✅ 30-day input-hash caching
- ✅ Ship gate event logging
- ✅ Rate limiting (user + household + global)

## Next Steps

### Phase 1: Monitor yt-dlp Adoption (Week 1)
- [ ] Track yt-dlp vs fallback API usage rates by platform
- [ ] Measure latency improvements (target: <3s avg)
- [ ] Validate TikTok description quality (expect: >80% non-empty)
- [ ] Confirm Xiaohongshu extraction success (expect: 70-80% success)

### Phase 2: Cost Optimization (Week 2-3)
- [ ] Measure L3 LLM call reduction (expect: 20-30% fewer Vision fallbacks)
- [ ] Calculate actual cost savings (target: 47% reduction = $0.05/1000 extractions)
- [ ] A/B test yt-dlp timeout values (5s vs 10s vs 15s)

### Phase 3: Optional Enhancements
- [ ] Use yt-dlp for L4 video URL extraction (replace platformScrapers.ts)
- [ ] Leverage yt-dlp automatic_captions for L2.5 (replace timedtext scraping)
- [ ] Add yt-dlp version monitoring (auto-alert on new releases)
