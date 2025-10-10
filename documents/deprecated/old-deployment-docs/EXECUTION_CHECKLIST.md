# Execution Checklist - Stage 1 MVP

**Goal:** Ship pantry-driven YouTube recommendations in 2 weeks
**Status:** Ready to start Phase 0 (Validation)

---

## Phase 0: Validation (NEXT - 1-2 hours)

### Task 1: Get YouTube API Key
- [ ] Go to https://console.cloud.google.com/
- [ ] Create project or select existing
- [ ] Enable YouTube Data API v3
- [ ] Create API key (restrict to YouTube Data API v3)
- [ ] Set environment variable: `export YOUTUBE_API_KEY="AIza..."`
- [ ] Verify: `echo $YOUTUBE_API_KEY`

**Time Estimate:** 15 minutes

---

### Task 2: Run L2 Quality Study
- [ ] Open terminal in project root
- [ ] Run: `deno run --allow-env --allow-net --allow-write scripts/l2_quality_study.ts`
- [ ] Wait for 20 videos to be tested (~5-10 minutes)
- [ ] Note the overall pass rate (e.g., 70%)

**Expected Output:**
```
📊 L2 QUALITY STUDY RESULTS
Total videos tested: 20
Videos meeting threshold: 14 (70.0%)
OVERALL PASS RATE: 70.0%
RECOMMENDATION: 🚀 Ship Rich Paste UX immediately
```

**Time Estimate:** 10 minutes

---

### Task 3: Analyze Results & Update Docs
- [ ] Open `L2_QUALITY_STUDY_RESULTS.json`
- [ ] Review detailed breakdown by category
- [ ] Make decision based on pass rate:
  - ≥60% → Ship Rich Paste (L2 regex for YouTube)
  - 50-59% → Ship with warning banner
  - <50% → Use L3 LLM for YouTube too

- [ ] Update PROJECT_STATUS.md with results:
  - Add L2 pass rate to "Current State" section
  - Document decision (Rich Paste vs Lite vs LLM)
  - Update cost structure if using L3

**Time Estimate:** 30 minutes

---

## Stage 1: MVP Implementation (Week 1-2)

### Week 1: Core Services

#### Day 1-2: Pantry Recommendations Service
- [ ] Create `pantry-app/src/services/pantryRecommendations.ts`
  - [ ] `getPantryRecommendations()` function
  - [ ] Query recipes from Supabase
  - [ ] Calculate pantry match % (client-side)
  - [ ] Estimate cost to complete (from purchase history)
  - [ ] Boost recipes with expiring ingredients (20% weight)
  - [ ] Return sorted by match %

- [ ] Create TypeScript types:
  ```typescript
  interface Recommendation {
    recipe: Recipe;
    match: {
      have: number;
      need: number;
      percentage: number;
    };
    cost: {
      min: number;
      max: number;
      store: string;
    };
    expiringIngredients?: string[];
  }
  ```

- [ ] Write unit tests for matching logic
- [ ] Test with real pantry data

**Time Estimate:** 8-12 hours

---

#### Day 3: YouTube Deep Links
- [ ] Modify `pantry-app/src/services/cookCardService.ts`
- [ ] Add `openYouTubeDeepLink(recipe: Recipe)` function
  - [ ] Try `youtube://results?search_query=...`
  - [ ] Fallback to `https://youtube.com/results?...`
  - [ ] Log telemetry event (`video_opened`)

- [ ] Test on iOS (YouTube app installed vs not installed)
- [ ] Test on Android (YouTube app installed vs not installed)

**Time Estimate:** 2-4 hours

---

#### Day 4: Telemetry Events
- [ ] Extend `pantry-app/src/services/telemetry.ts`
- [ ] Add new event types:
  - `pantry_match_shown` - User sees recommendation
  - `video_opened` - User taps "Watch on YouTube"
  - `recipe_saved` - User saves recipe
  - `cook_started` - User starts cook mode
  - `cook_completed` - User marks as cooked

- [ ] Update Supabase gate_instrumentation table if needed
- [ ] Test event logging in Supabase Studio

**Time Estimate:** 2-3 hours

---

### Week 2: UI Components

#### Day 5-6: Recommendation Card Component
- [ ] Create `pantry-app/src/components/recipe/RecommendationCard.tsx`
- [ ] Display:
  - Recipe title + image
  - Pantry match badge ("7/10 ingredients")
  - Cost range ("$8-12 at Costco")
  - Expiring ingredients highlight (if any)
  - "Watch on YouTube" button

- [ ] Style per design system
- [ ] Test on iOS + Android

**Time Estimate:** 6-8 hours

---

#### Day 7-8: Recommendations Screen
- [ ] Create `pantry-app/src/screens/RecipeRecommendationsScreen.tsx`
- [ ] Hook up pantry recommendations service
- [ ] Display list of recommendations
- [ ] Pull-to-refresh
- [ ] Empty state (if no pantry items)
- [ ] Loading state

- [ ] Add to navigation:
  - [ ] Update `pantry-app/src/navigation/AppNavigator.tsx`
  - [ ] Add tab bar icon or home screen widget

**Time Estimate:** 6-8 hours

---

#### Day 9: Testing & Bug Fixes
- [ ] Test full flow on physical device
- [ ] Verify telemetry logs correctly
- [ ] Check performance (loads in <2s)
- [ ] Test with 0 pantry items (empty state)
- [ ] Test with 50+ pantry items (performance)
- [ ] Fix any crashes or bugs

**Time Estimate:** 4-6 hours

---

#### Day 10: Ship to Beta
- [ ] Deploy any Edge Function updates
- [ ] Push to TestFlight (iOS) / Play Store Beta (Android)
- [ ] Invite 100 beta users
- [ ] Send onboarding email with instructions
- [ ] Monitor telemetry dashboard

**Time Estimate:** 2-3 hours

---

## Success Criteria Checklist

### Week 2 MVP Validation
- [ ] User sees pantry-matched recipes on home screen
- [ ] Tapping "Watch" opens YouTube app or web
- [ ] Telemetry logs all funnel events correctly
- [ ] No crashes, loads in <2s
- [ ] Works on iOS + Android
- [ ] 100 beta users invited

### Week 4 Conversion Validation (After 2 weeks of usage)
- [ ] 100 users tested
- [ ] Measure conversion funnel:
  - [ ] pantry_match_shown → video_opened (target >30%)
  - [ ] video_opened → recipe_saved (target >50%)
  - [ ] recipe_saved → cook_started (target >20%)
  - [ ] cook_started → cook_completed (target >80%)

- [ ] Overall save→cook conversion >20%?
  - **YES:** Proceed to Stage 2 (User Ratings) or Stage 3 (Selective Curation)
  - **NO:** Pivot strategy, analyze drop-off points

---

## Files to Create (Summary)

**New Files:**
- `pantry-app/src/services/pantryRecommendations.ts`
- `pantry-app/src/screens/RecipeRecommendationsScreen.tsx`
- `pantry-app/src/components/recipe/RecommendationCard.tsx`
- `pantry-app/src/types/Recommendation.ts` (if not in existing types)

**Modified Files:**
- `pantry-app/src/services/cookCardService.ts` (add deep link)
- `pantry-app/src/services/telemetry.ts` (add events)
- `pantry-app/src/navigation/AppNavigator.tsx` (add screen)

---

## Estimated Total Time

| Phase | Time |
|-------|------|
| Phase 0: Validation | 1-2 hours |
| Week 1: Core Services | 12-19 hours |
| Week 2: UI Components | 18-25 hours |
| **Total** | **31-46 hours** |

**Realistic Timeline:** 2 weeks at 20-25 hours/week

---

## Next Action

**RIGHT NOW:** Start Phase 0, Task 1 - Get YouTube API key (15 minutes)

After that: Run L2 quality study → Analyze results → Start Stage 1 implementation
