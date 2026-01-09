# ASR & OCR Implementation Guide - Future Pro Tier Features

**Status:** Deferred to Month 2-3 (Post-MVP Validation)
**Purpose:** Deep extraction mode for videos with sparse descriptions
**Monetization:** Pro tier feature ($15/month)

---

## 🎯 Overview

### What Problem Does This Solve?

**Current Limitation (HTML Scraping):**
- Works great for videos with good descriptions (75% success rate)
- Fails for:
  - Silent cooking videos with text overlays only
  - ASMR cooking videos (no voice-over, minimal description)
  - Shorts/Reels with all info in video (not description)
  - International content with non-English descriptions

**Solution:**
- **ASR (Audio Speech Recognition):** Extract recipe from voice-over
- **OCR (Optical Character Recognition):** Extract recipe from text overlays

---

## 📊 When to Implement

### Decision Gates

**Implement OCR for Shorts IF:**
- ✅ >30% of Short/Reel extractions have confidence <0.70
- ✅ Users explicitly complain: "Text overlay recipes don't work"
- ✅ >20% of pastes are Shorts/Reels (vs regular videos)

**Implement ASR IF:**
- ✅ >25% of regular video extractions have confidence <0.70
- ✅ Users request: "Extract from audio/voice-over"
- ✅ Data shows voice-only recipes are common (cooking tutorials, chef demonstrations)

**Priority:** OCR before ASR (faster, cheaper, more specific use case)

---

## 💰 Cost Analysis

### OCR for Shorts/Reels

**Per-Video Costs:**
- Video download (partial, 30s): **~$0.001** (bandwidth)
- Frame extraction (ffmpeg): **$0.00** (CPU, included in Edge Function)
- Google Vision API OCR (8 frames): **$0.012** ($1.50/1000 images)
- Gemini Flash LLM: **$0.015** (same as current)

**Total Cost per Save:** **~$0.03**

**Pro Tier Pricing:**
- $15/month = 500 saves at $0.03 = $15 cost (breakeven)
- Realistic usage: 30-50 saves/month = $0.90-1.50 cost = **$13.50-14 profit**

---

### ASR (Whisper)

**Per-Video Costs:**
- Audio download (yt-dlp): **~$0.001-0.01** (bandwidth, 3-5MB)
- Whisper API transcription: **$0.006/minute**
  - 3min video: **$0.018**
  - 5min video: **$0.030**
  - 10min video: **$0.060**
- Gemini Flash LLM: **$0.015**

**Total Cost per Save:** **~$0.035-0.075** (average $0.05)

**Pro Tier Pricing:**
- $15/month = 300 saves at $0.05 = $15 cost (breakeven)
- Realistic usage: 30-50 saves/month = $1.50-2.50 cost = **$12.50-13.50 profit**

---

## ⏱️ Latency Analysis

### OCR for Shorts (<60s videos)

**Timeline:**
1. Video metadata fetch: **200-500ms**
2. Partial video download (30s clip): **3-8s**
3. Extract 8 keyframes (ffmpeg): **2-5s**
4. Google Vision OCR (parallel): **1-3s**
5. Merge OCR results: **<100ms**
6. Gemini Flash LLM: **2-4s**
7. Database save: **100-200ms**

**Total Latency: 10-20 seconds** (average 12s)

**User Experience:**
```
User taps "Deep Extract" on Short
→ "Analyzing text overlays..." (10-12s)
→ Cook Card appears ✅
```

**Edge Function Timeout Risk:** ✅ Safe (12s avg, 60s limit)

---

### ASR (Whisper)

**Timeline:**
1. Video metadata fetch: **200-500ms**
2. Audio download (yt-dlp):
   - 2min video: **5-8s**
   - 5min video: **10-15s**
   - 10min video: **15-25s**
3. Whisper API transcription:
   - 2min audio: **5-8s**
   - 5min audio: **15-20s**
   - 10min audio: **30-40s**
4. Gemini Flash LLM: **2-4s**
5. Database save: **100-200ms**

**Total Latency:**
- 2min video: **15-20s** ⚠️
- 5min video: **30-40s** ❌
- 10min video: **50-70s** ❌

**Edge Function Timeout Risk:** ❌ High (5min+ videos exceed 60s limit)

**User Experience:**
```
User taps "Deep Extract"
→ Partial result (4s): Ingredients from HTML ✅
→ "Analyzing audio... we'll notify you" 🔔
→ Background job runs (30-60s)
→ Push notification: "Steps extracted!" ✅
```

**Implementation Requirement:** **Background job system** (not real-time)

---

## 🏗️ Technical Architecture

### OCR Pipeline (Real-Time)

```typescript
// supabase/functions/extract-cook-card/ocr.ts

import { exec } from 'child_process';
import { promisify } from 'util';
import vision from '@google-cloud/vision';

const execAsync = promisify(exec);
const visionClient = new vision.ImageAnnotatorClient();

export async function extractFromOCR(videoUrl: string): Promise<string> {
  // Step 1: Download video (partial, first 60s only)
  const videoPath = `/tmp/${Date.now()}.mp4`;
  await execAsync(`yt-dlp -f "worst[height>=480]" --external-downloader ffmpeg --external-downloader-args "-t 60" -o "${videoPath}" "${videoUrl}"`);

  // Step 2: Extract keyframes (every 5-10 seconds)
  const framePaths = [];
  for (let i = 5; i <= 55; i += 7) { // 8 frames at 5s, 12s, 19s, 26s, 33s, 40s, 47s, 54s
    const framePath = `/tmp/frame_${i}.jpg`;
    await execAsync(`ffmpeg -ss ${i} -i "${videoPath}" -frames:v 1 "${framePath}"`);
    framePaths.push(framePath);
  }

  // Step 3: OCR all frames in parallel
  const ocrResults = await Promise.all(
    framePaths.map(async (framePath) => {
      const [result] = await visionClient.textDetection(framePath);
      return result.textAnnotations?.[0]?.description || '';
    })
  );

  // Step 4: Merge and deduplicate text
  const mergedText = [...new Set(ocrResults.filter(Boolean))].join('\n\n');

  // Step 5: Cleanup temp files
  await execAsync(`rm -f ${videoPath} ${framePaths.join(' ')}`);

  return mergedText;
}

// Usage in extract-cook-card
export async function extractCookCard(url: string, mode: 'speed' | 'deep') {
  const html = await fetchHTML(url);
  const htmlText = extractTextFromHTML(html);

  if (mode === 'deep') {
    const metadata = await getVideoMetadata(url);

    // Only use OCR for short videos (<60s)
    if (metadata.duration <= 60) {
      const ocrText = await extractFromOCR(url);
      const combinedText = `${htmlText}\n\n--- Text from Video Overlays ---\n${ocrText}`;

      return await gemini.extract(combinedText, {
        provenance: ['html', 'ocr'],
      });
    }
  }

  // Default: HTML only
  return await gemini.extract(htmlText, {
    provenance: ['html'],
  });
}
```

**Dependencies:**
```bash
# Install in Edge Function Dockerfile
apt-get install -y ffmpeg yt-dlp
npm install @google-cloud/vision
```

**Environment Variables:**
```bash
GOOGLE_VISION_API_KEY=your_key_here
```

---

### ASR Pipeline (Background Job)

```typescript
// supabase/functions/background-jobs/asr-extract.ts

import { OpenAI } from 'openai';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function extractFromASR(videoUrl: string): Promise<string> {
  // Step 1: Download audio only (faster than full video)
  const audioPath = `/tmp/${Date.now()}.mp3`;
  await execAsync(`yt-dlp -f "bestaudio" --extract-audio --audio-format mp3 -o "${audioPath}" "${videoUrl}"`);

  // Step 2: Transcribe with Whisper
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-1',
    language: 'en', // Or auto-detect
  });

  // Step 3: Cleanup
  await execAsync(`rm -f ${audioPath}`);

  return transcription.text;
}

// Background job handler
export async function processASRJob(job: {
  cookCardId: string;
  url: string;
  userId: string;
}) {
  try {
    // Step 1: Get existing Cook Card (saved with HTML-only extraction)
    const { data: cookCard } = await supabase
      .from('cook_cards')
      .select('*')
      .eq('id', job.cookCardId)
      .single();

    // Step 2: Extract audio transcript
    const transcript = await extractFromASR(job.url);

    // Step 3: Re-extract with LLM (HTML + transcript)
    const htmlText = cookCard.extraction_metadata?.html_text || '';
    const combinedText = `${htmlText}\n\n--- Audio Transcript ---\n${transcript}`;

    const enhanced = await gemini.extract(combinedText, {
      provenance: ['html', 'asr'],
    });

    // Step 4: Update Cook Card
    await supabase
      .from('cook_cards')
      .update({
        ingredients: enhanced.ingredients,
        instructions: enhanced.instructions,
        extraction_confidence: enhanced.confidence,
        extraction_sources: ['html', 'asr'],
      })
      .eq('id', job.cookCardId);

    // Step 5: Send push notification
    await sendPushNotification(job.userId, {
      title: 'Recipe extraction complete!',
      body: 'We analyzed the audio and added missing steps.',
      data: { cookCardId: job.cookCardId },
    });

    console.log(`✅ ASR job complete for Cook Card ${job.cookCardId}`);
  } catch (error) {
    console.error('❌ ASR job failed:', error);

    // Mark job as failed (retry later)
    await supabase
      .from('background_jobs')
      .update({ status: 'failed', error: error.message })
      .eq('id', job.id);
  }
}

// Queue job from main extract function
export async function extractCookCardDeep(url: string, userId: string) {
  // Step 1: Quick HTML extraction (save immediately)
  const quickResult = await extractFromHTML(url);
  const { data: cookCard } = await supabase
    .from('cook_cards')
    .insert({
      ...quickResult,
      extraction_status: 'partial', // Indicates ASR pending
    })
    .select()
    .single();

  // Step 2: Queue background ASR job
  await supabase.from('background_jobs').insert({
    type: 'asr_extract',
    payload: {
      cookCardId: cookCard.id,
      url,
      userId,
    },
    status: 'queued',
  });

  return {
    cookCard,
    status: 'processing_audio', // UI shows "Analyzing audio..."
  };
}
```

**Dependencies:**
```bash
npm install openai yt-dlp
```

**Environment Variables:**
```bash
OPENAI_API_KEY=your_key_here
```

**Database Migration:**
```sql
-- Migration: Add background jobs table
CREATE TABLE background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'asr_extract', 'ocr_extract'
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'processing', 'completed', 'failed'
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_background_jobs_status ON background_jobs(status, created_at);

-- Add extraction_status to cook_cards
ALTER TABLE cook_cards
ADD COLUMN extraction_status TEXT DEFAULT 'complete', -- 'partial', 'complete'
ADD COLUMN extraction_sources TEXT[]; -- ['html', 'asr', 'ocr']
```

---

## 🎨 User Experience Design

### Two-Tier Extraction Modes

#### Free Tier: Speed Mode (Current HTML Scraping)
```
User pastes link
→ "Extract Recipe" button
→ Loading spinner (4-5s)
→ Cook Card appears ✅

If confidence < 0.70:
→ Show banner: "Low quality extraction"
→ CTA: "Try Deep Mode (Pro)" → Upsell
```

#### Pro Tier: Deep Mode

**For Shorts/Reels (<60s):**
```
User pastes Short link
→ Toggle: "Speed ⚡" vs "Deep 🔬"
→ User selects "Deep"
→ "Analyzing text overlays..." (10-12s)
→ Cook Card appears with OCR badge ✅
→ "Extracted from: HTML + Text Overlays"
```

**For Regular Videos (>60s with voice-over):**
```
User pastes video link
→ "Deep Extract" button
→ Partial result (4s): Ingredients from HTML ✅
→ "Analyzing audio... we'll notify you in ~30s" 🔔
→ User can navigate away
→ [30s later] Push notification: "Recipe steps added!"
→ User taps notification → Cook Card with full steps ✅
```

---

## 📱 UI Components

### Extraction Mode Toggle (Pro Tier)

```tsx
// PasteLinkScreen.tsx - Pro users only
{isPro && (
  <View style={styles.modeSelector}>
    <Text style={styles.modeSelectorLabel}>Extraction Quality</Text>
    <SegmentedControl
      segments={[
        { label: 'Speed ⚡', value: 'speed', subtitle: '4-5s' },
        { label: 'Deep 🔬', value: 'deep', subtitle: '10-30s' },
      ]}
      activeSegment={extractionMode}
      onSegmentPress={setExtractionMode}
    />

    {extractionMode === 'deep' && (
      <Text style={styles.modeDescription}>
        Analyzes audio and text overlays for better accuracy
      </Text>
    )}
  </View>
)}
```

### Progress Indicator (ASR Background Job)

```tsx
// CookCardScreen.tsx - Show partial state
{cookCard.extraction_status === 'partial' && (
  <View style={styles.processingBanner}>
    <ActivityIndicator size="small" color="#10B981" />
    <View style={{ flex: 1, marginLeft: 12 }}>
      <Text style={styles.processingTitle}>
        Analyzing audio... 🎧
      </Text>
      <Text style={styles.processingSubtitle}>
        We'll notify you when steps are ready (~30s)
      </Text>
    </View>
    <Pressable onPress={dismissBanner}>
      <Ionicons name="close" size={20} color="#6B7280" />
    </Pressable>
  </View>
)}
```

### Provenance Badge

```tsx
// CookCardScreen.tsx - Show extraction sources
{cookCard.extraction_sources && (
  <View style={styles.provenanceBadge}>
    <Ionicons name="checkmark-circle" size={16} color="#10B981" />
    <Text style={styles.provenanceText}>
      Extracted from: {cookCard.extraction_sources.join(', ')}
    </Text>
  </View>
)}
```

---

## 🧪 Testing Strategy

### OCR Testing

**Test Videos:**
1. ✅ YouTube Short with text overlays only (silent)
2. ✅ Instagram Reel with step-by-step text
3. ✅ TikTok recipe with ingredients on screen
4. ⚠️ Video with handwritten text (test OCR accuracy)
5. ⚠️ Video with low-contrast text (white text on light background)

**Expected Results:**
- ✅ 80%+ extraction success for clear, printed text overlays
- ⚠️ 50-70% for handwritten or low-contrast text
- ❌ Fails for cursive fonts or stylized text

**Quality Threshold:**
- If OCR confidence < 0.70 → Show "Review recommended" banner
- If OCR returns <3 ingredients → Fall back to HTML-only

---

### ASR Testing

**Test Videos:**
1. ✅ Cooking tutorial with clear voice-over
2. ✅ Chef demonstration (professional narration)
3. ⚠️ ASMR cooking (ambient noise, soft voice)
4. ⚠️ Background music (tests Whisper noise filtering)
5. ⚠️ Accent-heavy voice-over (tests transcription accuracy)

**Expected Results:**
- ✅ 90%+ accuracy for clear, professional narration
- ✅ 75-85% for accented English
- ⚠️ 50-70% for ASMR/whispered speech
- ❌ Fails for heavy background music or multiple speakers

**Quality Threshold:**
- If ASR confidence < 0.60 → Don't save steps, show "Transcript unclear"
- If ASR returns <50 words → Fall back to HTML-only

---

## 📊 Success Metrics

### OCR Feature Validation

**Launch Criteria:**
- ✅ >30% of Shorts have confidence <0.70 (without OCR)
- ✅ User feedback: "Text overlay recipes don't work"

**Success Metrics (1 month post-launch):**
- ✅ Shorts extraction confidence improves from 65% → 85%+ avg
- ✅ <5% user complaints about OCR failures
- ✅ 20%+ of Pro users enable Deep Mode for Shorts

**Failure Criteria (pivot away):**
- ❌ OCR confidence still <70% (Google Vision not accurate enough)
- ❌ Latency > 20s (too slow for real-time UX)
- ❌ <5% of users use Deep Mode (feature not valued)

---

### ASR Feature Validation

**Launch Criteria:**
- ✅ >25% of videos have confidence <0.70 (without ASR)
- ✅ User requests: "Extract from voice-only videos"

**Success Metrics (1 month post-launch):**
- ✅ Voice-only video confidence improves from 60% → 80%+ avg
- ✅ Background job completion rate >95% (within 60s)
- ✅ <10% user complaints about "waiting too long"

**Failure Criteria (pivot away):**
- ❌ Whisper transcription accuracy <75% (too many errors)
- ❌ Background jobs frequently timeout or fail
- ❌ Users abandon app while waiting (poor async UX)

---

## 💡 Optimization Ideas

### OCR Optimizations

**1. Smart Frame Selection:**
Instead of extracting frames every 7s, use **scene detection** to find frames with text:
```bash
# Use ffmpeg scene detection
ffmpeg -i video.mp4 -vf "select='gt(scene,0.3)',showinfo" -vsync vfr frames%03d.jpg
```

**2. Text Detection Pre-Filter:**
Before OCR, use cheap **text detection** (Google Vision) to skip frames without text:
```typescript
const hasText = await visionClient.textDetection(frame, { maxResults: 1 });
if (!hasText) return null; // Skip OCR for this frame
```

**3. Caching:**
Cache OCR results by video URL (same as current extraction cache):
```typescript
const cacheKey = `ocr:${videoId}`;
const cached = await getCachedOCR(cacheKey);
if (cached) return cached;
```

---

### ASR Optimizations

**1. Audio-Only Download:**
Use `yt-dlp -f bestaudio` to download only audio (3-5x smaller than video):
```bash
yt-dlp -f "bestaudio[ext=m4a]" -o audio.m4a URL
# 5min video: 3-5MB audio vs 20-50MB video
```

**2. Streaming Transcription:**
For long videos, stream audio to Whisper in chunks (reduce memory):
```typescript
// Split 10min audio into 2min chunks
const chunks = splitAudio(audioPath, chunkDuration: 120);
const transcripts = await Promise.all(chunks.map(whisper.transcribe));
return transcripts.join(' ');
```

**3. Fallback to YouTube Auto-Captions:**
Before running ASR, check if YouTube has auto-generated captions:
```typescript
const captions = await fetchYouTubeCaptions(videoId);
if (captions && captions.length > 100) {
  // Use free captions instead of paid ASR
  return captions;
}
```

---

## 🔐 Security & Abuse Prevention

### Rate Limiting

**Free Tier:**
- HTML scraping only (no ASR/OCR)
- 5 saves/month

**Pro Tier:**
- Deep Mode enabled (ASR + OCR)
- 500 saves/month (prevents abuse)
- Rate limit: 10 Deep extractions per hour (prevent API abuse)

**Implementation:**
```sql
CREATE TABLE extraction_limits (
  user_id UUID PRIMARY KEY,
  deep_extractions_count INT DEFAULT 0,
  deep_extractions_reset_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour'
);

-- Check before running Deep Mode
SELECT deep_extractions_count FROM extraction_limits WHERE user_id = $1;
-- If count >= 10 AND reset_at > NOW() → Return error "Rate limit exceeded"
```

---

### Cost Protection

**Background Job Timeout:**
```typescript
// Kill ASR jobs that run >120s
setTimeout(() => {
  job.cancel();
  updateJobStatus(job.id, 'failed', 'Timeout after 120s');
}, 120000);
```

**Per-User Budget Cap:**
```typescript
// Track Deep Mode costs per user
const userCosts = await supabase
  .from('user_extraction_costs')
  .select('total_cost_cents')
  .eq('user_id', userId)
  .single();

if (userCosts.total_cost_cents > 1500) { // $15 cap
  throw new Error('Monthly budget exceeded. Upgrade to unlimited plan.');
}
```

---

## 📝 Documentation for Future Implementation

### When Ready to Implement OCR:

**Step 1: Add Dependencies**
```bash
cd supabase/functions/extract-cook-card
npm install @google-cloud/vision
```

**Step 2: Add Environment Variables**
```bash
supabase secrets set GOOGLE_VISION_API_KEY=your_key
```

**Step 3: Implement OCR Pipeline**
- Copy code from "OCR Pipeline (Real-Time)" section above
- Test with 5 Shorts
- Validate confidence >0.80 before shipping

**Step 4: Add UI Toggle**
- Add "Deep Mode" toggle to PasteLinkScreen (Pro users)
- Show "Analyzing text overlays..." loader
- Add provenance badge to CookCardScreen

**Step 5: Monitor Metrics**
- Track: OCR success rate, latency, cost per save
- Measure: Pro user adoption of Deep Mode
- Decide: Keep/improve/remove based on data

---

### When Ready to Implement ASR:

**Step 1: Add Background Job System**
```bash
# Install Supabase Queue or use pg_cron
supabase migrations new add_background_jobs_table
```

**Step 2: Add Dependencies**
```bash
npm install openai
apt-get install yt-dlp ffmpeg
```

**Step 3: Add Environment Variables**
```bash
supabase secrets set OPENAI_API_KEY=your_key
```

**Step 4: Implement ASR Pipeline**
- Copy code from "ASR Pipeline (Background Job)" section above
- Test with 5 voice-over videos
- Validate job completion <60s

**Step 5: Add Push Notifications**
- Integrate Expo Push Notifications
- Send notification when ASR job completes
- Deep link to Cook Card

**Step 6: Monitor Metrics**
- Track: ASR success rate, job completion time, user wait time
- Measure: Push notification open rate
- Decide: Keep/improve/remove based on data

---

## 🎯 Summary

**OCR for Shorts:**
- **Cost:** +$0.015/save
- **Latency:** 10-12s (real-time)
- **When:** Month 2, if >30% of Shorts fail
- **Value:** Unlocks silent recipe Shorts/Reels

**ASR (Whisper):**
- **Cost:** +$0.035/save
- **Latency:** 30-60s (background job required)
- **When:** Month 3+, if users request voice extraction
- **Value:** Unlocks voice-only cooking tutorials

**Both Features:**
- Gate behind **Pro tier** ($15/month)
- Differentiation: Free = Speed Mode (HTML), Pro = Deep Mode (+ASR +OCR)
- Defer until **Stage 1 data validates demand**

---

**Next Steps:** Implement HTML scraping this week, revisit ASR/OCR in Month 2 based on production data.
