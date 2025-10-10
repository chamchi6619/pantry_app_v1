# PRD: Social Recipe Bridge & Cook Card System

**Version:** 1.0
**Status:** Active
**Owner:** Product/Engineering
**Last Updated:** 2025-10-07
**Context:** Strategic pivot from AI recipe generation to social recipe organization

---

## 1. Background & Problem

### The Reality
People discover recipes on Instagram, TikTok, and YouTube—not in recipe apps. Current behavior:
- Screenshot or bookmark posts
- Lose the post in camera roll or saves folder
- Can't search saved recipes
- Don't know if they can cook it with what's at home
- Can't estimate cost or build shopping lists

### Our Opportunity
We have **unique assets** other recipe apps don't:
- Receipt scanning with purchase history
- Pantry inventory tracking
- Canonical ingredient matching (506 items, years of data)
- Expiry tracking and waste analytics

### The Gap
Current recipe apps either:
1. **Host recipes** (copyright/maintenance burden, stale content), or
2. **Generate recipes with AI** (quality issues, liability, user distrust)

Neither approach leverages social media where discovery actually happens.

---

## 2. Vision & Goals

### Vision Statement
> "Save any recipe from social media → instantly see what you can cook right now with what's in your pantry."

### Primary Goals (MVP)
1. **Convert social posts into Cook Cards** at save-time with high-confidence ingredient extraction and full attribution
2. **Pantry Match**: Show what's on hand vs. missing, with exact/substitutions toggle
3. **Cost Range**: Based on user's purchase history with store provenance
4. **Shopping Lists**: One-tap generation across selected Cook Cards
5. **Fail-Closed Ingestion**: Never silently invent data; uncertain fields require user confirmation

### Non-Goals (MVP)
- ❌ Hosting full recipe instructions or re-posting creator media
- ❌ AI-generated cooking steps
- ❌ Competing as a generic recipe discovery platform
- ❌ Using RuleChef or AI recipe generation for production data
- ❌ Retroactive fixing of v5.2 recipes (delete, don't repair)

---

## 3. Users & Key Jobs-to-be-Done

### Primary User
**Busy home cook who saves social recipes**

**JTBD-1:** "I saved a recipe—can I make it tonight?"
→ Cook Card with pantry match % & time fit

**JTBD-2:** "What will this cost me?"
→ Cost range with store provenance from purchase history

**JTBD-3:** "I want to use up what's expiring"
→ Substitution suggestions and Use-It-Up prompts

**JTBD-4:** "Build a weekly shop from saved recipes"
→ Consolidated shopping list across multiple Cook Cards

### Secondary User
**Creator/Publisher**

- Publish structured CookCard JSON for accurate ingredients & attribution
- See basic analytics (saves, cooks, household reach)
- Get proper attribution with link-back to original content

---

## 4. Core Product: Cook Card

### What Users See (at save-time, ≤2 seconds)

**Cook Card Header:**
- Title, creator handle/avatar, platform badge, link back to original

**Pantry Intelligence:**
- **Match Score**: "8/10 ingredients in your pantry" with confidence chips
- **Have vs Need**: Color-coded ingredient list with availability status
- **Toggle**: "Exact only / Allow substitutions" with rationale popup
- **Confidence Provenance per Field**: Each ingredient shows:
  - "Creator-provided" (green)
  - "Detected (93%)" (amber)
  - "You edited" (blue)

**Cost Intelligence:**
- **Range**: "$12–15 based on your Costco/Target history (last 60 days)"
- **Never show**: Fake single-cent precision
- **Provenance**: Which stores, which time period

**Time Fit:**
- User-selectable filters: 20-min / 45-min / weekend
- Score updates dynamically
- Shows prep + cook time from creator

**Waste Rescue:**
- Smart substitutions to use expiring items
- Example: "Use Greek yogurt expiring in 3 days instead of sour cream"
- Clear rationale for each swap

**Actions:**
- Add to Shopping List
- Plan for Later
- Start Cook-Along (with timers referencing creator media timestamps)

**Transparency:**
- **"Why this matches you"**: Breakdown of pantry %, expiry rescue, time fit, history
- **"Why this ranks here"**: Visible formula (60/20/10/10)
- **Time-to-value = 0 seconds**: Cook Card is the FIRST thing shown after share, not a second step

### Ranking Formula (Explainable)

```
Total Score = (Pantry Match × 60%) + (Expiry Rescue × 20%) + (Time Fit × 10%) + (History Fit × 10%)
```

**Examples shown to user:**
- Pantry Match (60%): "8/10 ingredients in your pantry"
- Imminent Expiry Rescue (20%): "Uses Greek yogurt expiring in 3 days"
- Time Fit (10%): "Fits your '45-min' filter"
- Personal History Fit (10%): "You cook Italian 2×/month"

**Principle:** No black-box ranking. User can always see "Why this ranks here."

---

## 5. Ingestion Ladder (Fail-Closed)

**Priority order** (deterministic-first to control costs and quality):

### Level 1: Official Metadata
- **Source**: oEmbed, Open Graph, platform APIs
- **Extracts**: URL, title, creator handle, platform, link-back
- **Cost**: $0 per URL
- **Confidence**: 99%+

### Level 2: Creator-Provided Text
- **Source**: Caption, description, pinned comment, creator-submitted JSON
- **Method**: Regex, rules-based extraction
- **Extracts**: Ingredients with quantities/units
- **Cost**: $0 per URL
- **Confidence**: 85–95% (depends on format quality)

### Level 3: User Confirm UI
- **When**: Uncertain items from Level 1–2
- **Method**: 1-tap chips to accept/edit
- **User action required**: Must confirm before proceeding
- **Cost**: $0 per URL
- **Confidence**: 100% (user-verified)

### Level 4: OCR/LLM (Opt-In Only)
- **When**: Levels 1–3 insufficient AND user opts in
- **Method**: Vision model on video frames, Gemini 2.0 Flash for text
- **Shows**: Confidence chips on every field
- **Limit**: ≤2 user taps to confirm
- **Cost**: ~$0.01–0.015 per URL
- **Confidence**: 70–90% (varies by image quality)

### Level 5: Cook Card Lite
- **When**: Extraction fails or confidence too low
- **Contains**: Link to original, partial ingredients (if any), title, creator
- **Never contains**: AI-generated instructions or silently invented data
- **Cost**: $0 per URL

### Core Principle
> **No silent invention.** Uncertain fields always require user confirmation. We fail closed, not open.

---

## 6. Data Model: CookCard v1.0 Schema

### Minimum Viable Schema

```json
{
  "version": "1.0",
  "url": "https://instagram.com/p/...",
  "source_platform": "instagram|tiktok|youtube|web",
  "title": "Spicy Vodka Pasta",

  "attribution": {
    "creator_handle": "@chef_maria",
    "creator_name": "Maria Rodriguez",
    "verified": false,
    "license": "creator-owned",
    "linkback": "https://instagram.com/p/...",
    "saved_at": "2025-10-07T22:30:00Z"
  },

  "ingredients": [
    {
      "raw_text": "1 lb pasta",
      "canonical_id": "550e8400-e29b-41d4-a716-446655440000",
      "quantity": 1,
      "unit": "lb",
      "confidence": 0.93,
      "provenance": "detected|creator|user"
    },
    {
      "raw_text": "1/2 cup vodka",
      "canonical_id": null,
      "quantity": 0.5,
      "unit": "cup",
      "confidence": 0.88,
      "provenance": "detected"
    }
  ],

  "steps": [
    {
      "type": "link",
      "url": "https://instagram.com/p/...",
      "timestamp_sec": 48,
      "description": "Boil pasta"
    }
  ],

  "yields": "4 servings",
  "time_minutes": 30,
  "tags": ["pasta", "italian", "spicy", "weeknight"],
  "checksum": "sha256:a3c5e8f2..."
}
```

### Schema Rules

1. **Versioning**: Semantic versioning (1.0, 1.1, 2.0); breaking changes bump major
2. **Checksum**: SHA-256 of canonical JSON (sorted keys); ensures integrity for creator-signed submissions
3. **No Prose Instructions**: `steps` array contains ONLY links/timestamps, never AI-generated text
4. **Confidence Required**: Every extracted field has `confidence` score and `provenance` label
5. **Saved Timestamp**: Required for "last 60 days" cost calculations and analytics

---

## 7. Functional Requirements (MVP)

### FR-1: Share Extension
- **Platforms**: iOS, Android
- **Accepts**: URLs from Instagram, TikTok, YouTube, web recipe sites
- **Action**: Trigger Cook Card generation via ingestion ladder
- **Latency**: ≤2s to show Cook Card for 95th percentile

### FR-2: Cook Card Generation
- **Method**: Ingestion ladder (Levels 1–5)
- **Output**: Cook Card with per-field confidence and provenance
- **Fallback**: Cook Card Lite if extraction fails
- **Logging**: Event stream for every extraction attempt

### FR-3: Pantry Match
- **Logic**: Match ingredients to canonical items in user's pantry
- **Display**: "Have" (green), "Need" (red), confidence chips
- **Toggle**: "Exact only / Allow substitutions"
- **Rationale**: Popup explaining each substitution (e.g., "Greek yogurt ↔ sour cream: similar fat/protein")

### FR-4: Cost Range
- **Data Source**: User's purchase history (last 60 days by default)
- **Output**: "$12–15 based on Costco/Target history"
- **Provenance**: Always show which stores and time period
- **Never**: Single-cent precision (e.g., "$12.47")

### FR-5: Shopping List
- **Input**: Selected Cook Cards (multi-select)
- **Logic**: Merge missing ingredients, deduplicate via canonical matching
- **Output**: Grouped by store/aisle, quantities summed
- **Action**: Export to notes, share, or in-app checkout (Phase 2)

### FR-6: Use-It-Up (Waste Rescue)
- **Trigger**: User has items expiring within 7 days
- **Logic**: Surface Cook Cards with smart substitutions using expiring items
- **Display**: Highlight swaps in Cook Card with clear annotation
- **Ranking Boost**: +20% weight for expiry rescue in ranking formula

### FR-7: Creator Kit (v1)
- **Input**: Google Sheet template with columns: title, ingredients, steps (timestamps), yields, time
- **Output**: CookCard JSON conforming to v1.0 schema
- **Submission**: Portal to upload JSON with checksum validation
- **Verification**: Optional creator key signing for "Verified" badge

### FR-8: Gate Instrumentation
- **Infrastructure**: Event logging for all four ship gates (quality, conversion, compliance, economics)
- **Dashboard**: Real-time visualization of gate metrics
- **Alerts**: Trigger if any gate falls below threshold
- **Rollback**: Automated feature flag disable if Gate 1 or Gate 4 fails

### FR-9: Security & Privacy
- **Per-URL Delete**: User can delete any saved Cook Card
- **Encrypted Storage**: Purchase history and receipts encrypted at rest
- **No Media Caching**: Zero storage of creator media files
- **Takedown Workflow**: 48-hour SLA for DMCA/ToS violation removal

---

## 8. Non-Functional Requirements

### Performance
- **Latency**: Cook Card visible ≤2s after share for 95th percentile
- **Throughput**: Support 100 concurrent share requests without degradation
- **Cache Hit Rate**: ≥80% for popular URLs (cache per-URL artifacts)

### Reliability
- **Availability**: 99.5% uptime for share extension and Cook Card generation
- **Graceful Degradation**: Fall back to Cook Card Lite if extraction fails
- **Error Recovery**: Retry logic with exponential backoff for LLM calls

### Scalability
- **Cost Control**: <0.4 LLM calls per URL (average), <$0.015 LLM cost per save
- **Caching**: Per-URL extraction results cached for 30 days
- **Database**: Supabase PostgreSQL with read replicas for analytics queries

### Observability
- **Event Stream**: All extractions, confirmations, saves, cooks, LLM calls, compliance flags
- **Metrics**: Latency histograms, confidence distributions, cost per save, gate pass rates
- **Alerting**: PagerDuty for gate failures, cost spikes, compliance violations
- **Dashboards**: Grafana for real-time monitoring, weekly gate review reports

---

## 9. Acceptance Criteria & Ship Gates

### Feature-Level Acceptance Criteria

**AC-PantryMatch:**
- Given a user with 10 pantry items including "pasta" and "tomatoes"
- When they save a pasta recipe requiring pasta, tomatoes, vodka, cream
- Then Cook Card shows "Have: 2/4" with pasta/tomatoes green, vodka/cream red
- And toggling "exact only" updates Need list immediately without LLM call

**AC-Cost:**
- Given a user with Costco purchases in last 60 days
- When Cook Card calculates cost range
- Then display shows "$12–15 (Costco, last 60 days)" not "$12.47"
- And tapping provenance shows itemized breakdown by store

**AC-Fail-Closed:**
- Given an ingredient extracted with 75% confidence (below 0.80 threshold)
- When Cook Card is generated
- Then amber banner shows: "We found 7 of ~10 ingredients. Tap to confirm before planning."
- And user cannot add to shopping list until confirmed/edited
- And tapping "Confirm All" requires exactly 1 tap to batch-accept

**AC-Substitutions:**
- Given user has Greek yogurt expiring in 3 days
- When Cook Card requires sour cream
- Then substitution chip shows "Greek yogurt ↔ sour cream (similar fat/protein)"
- And toggling "exact only" hides substitution and marks sour cream as "Need"

### Go/No-Go Ship Gates (Must Pass All)

#### Gate 1: Quality
**Threshold:** ≥95% of saves yield Cook Card with:
- ≥80% confidence on ALL ingredients, OR
- ≤2 user taps to confirm/edit low-confidence items

**Measurement:** Average taps-to-confirm per save over 7-day rolling window

**Instrumentation:**
```sql
SELECT
  AVG(confirm_taps) as avg_taps,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY min_confidence) as p95_confidence
FROM cook_card_saves
WHERE created_at > NOW() - INTERVAL '7 days'
```

**Pass Criteria:** `avg_taps ≤ 2.0` AND `p95_confidence ≥ 0.80`

---

#### Gate 2: Conversion
**Threshold:** Save → Cook ≥20% in beta cohort within 7 days

**Measurement:**
```
Conversion Rate = (Unique users who cooked / Unique users who saved) × 100%
```

**Instrumentation:**
```sql
SELECT
  COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'cook_started') * 100.0 /
  COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'cook_card_saved') as conversion_pct
FROM events
WHERE created_at > NOW() - INTERVAL '7 days'
  AND cohort = 'beta'
```

**Pass Criteria:** `conversion_pct ≥ 20.0`

---

#### Gate 3: Compliance
**Threshold:** 0 copyright/ToS violations in 200-save audit

**Measurement:** Manual audit + automated compliance scanner

**Process:**
1. Random sample 200 Cook Cards from production
2. Legal review for: media caching, instruction rehosting, attribution accuracy
3. Automated scan: `grep -r "instructions_text" cook_cards/` (should return 0 matches)
4. Takedown workflow test: Submit DMCA notice, verify 48h removal SLA

**Pass Criteria:**
- Zero instances of media caching or instruction rehosting
- 100% attribution accuracy (linkback + creator handle)
- Takedown SLA ≤48 hours in test

---

#### Gate 4: Economics
**Threshold:** LLM cost <$0.015 per save (rolling 7-day average)

**Measurement:**
```
Cost Per Save = Total LLM API Cost / Total Saves
LLM Call Rate = Total LLM Calls / Total URLs Processed
```

**Instrumentation:**
```sql
SELECT
  SUM(llm_cost_usd) / COUNT(DISTINCT save_id) as cost_per_save,
  COUNT(*) FILTER (WHERE llm_called = true) * 1.0 / COUNT(DISTINCT url) as llm_call_rate
FROM cook_card_extractions
WHERE created_at > NOW() - INTERVAL '7 days'
```

**Pass Criteria:**
- `cost_per_save < 0.015` USD
- `llm_call_rate < 0.4` (most extractions use deterministic methods)

---

### Gate Enforcement

**Before Launch:**
- All 4 gates must pass for 14 consecutive days in beta

**Post-Launch:**
- Weekly gate review meeting
- Automated alerts if any gate falls below threshold
- Feature flag killswitch if Gate 1 or Gate 4 fails for >24 hours

---

## 10. UX Notes

### Transparency First
- **"Why this matches you"** breakdown always visible
- **"Why this ranks here"** formula shown on tap
- **Confidence chips**: High (≥0.90), Medium (0.65–0.89), Low (<0.65)

### Fail-Closed UX Behavior
- **If <80% confidence on ANY ingredient:**
  - Cook Card shows amber banner: "We found 7 of ~10 ingredients. Tap to confirm before planning."
  - "Add to Shopping List" button disabled until confirmed
  - User can batch-confirm medium-confidence items (1 tap) or individually edit
- **If extraction completely fails:**
  - Cook Card Lite: Link to original + partial ingredients + "Help us improve" feedback button

### Substitution Rationale
- **Display**: "Greek yogurt ↔ sour cream (similar fat/protein)"
- **Sources**: USDA FoodData Central, culinary substitution databases
- **Toggle**: "Exact only" mode for allergen/religious compliance (disables all subs)

### Creator Attribution
- **Always visible**: Handle, avatar (if available), platform badge
- **Link-back**: Prominent "View Original" button
- **Verified badge**: For creator-signed CookCard JSON submissions

---

## 11. Privacy, Legal, Compliance

### What We DO NOT Do
- ❌ Store or rehost creator media (photos, videos)
- ❌ Store full instruction text (only link + timestamps)
- ❌ Generate AI cooking steps
- ❌ Scrape without respecting robots.txt and platform ToS

### What We DO
- ✅ Per-URL delete: User can remove any Cook Card from their library
- ✅ GDPR/CCPA compliance: Export and delete flows for all user data
- ✅ Encrypted storage: Purchase history and receipts encrypted at rest (AES-256)
- ✅ Creator verification: Optional key signing for CookCard JSON (checksum + public key)
- ✅ Takedown SLA: 48-hour response to DMCA/ToS violation reports

### Platform ToS Compliance
- **Instagram**: Use official oEmbed API, no media caching
- **TikTok**: Use official API where available, respect share limits
- **YouTube**: Use YouTube Data API v3, link to video with timestamps
- **Web**: Respect robots.txt, no aggressive crawling

### Legal Review Checklist
- [ ] Fair use analysis for ingredient extraction (facts, not creative expression)
- [ ] DMCA safe harbor compliance (designated agent, takedown process)
- [ ] Terms of Service explicitly forbid rehosting media or instructions
- [ ] Privacy policy covers purchase history encryption and retention

---

## 12. Analytics & KPIs

### Core KPIs

**User Engagement:**
- **Save → Cook %**: Users who cook within 7 days of saving
- **Time-to-Cook**: Median hours from save to cook start
- **Repeat Save Rate**: % users who save ≥5 recipes in 30 days

**Quality Metrics:**
- **Confidence Distribution**: % saves by confidence bucket (high/med/low)
- **Confirm Taps per Save**: Average user taps to confirm/edit ingredients
- **Cook Card Lite Rate**: % saves that fall back to Lite (target: <5%)

**Economic Impact:**
- **Waste Reduction %**: Comparison of food waste before/after (60-day window)
- **Cost Per Save**: Blended LLM + infrastructure cost
- **Substitution Acceptance**: % users who accept suggested swaps

**Compliance:**
- **Takedown Requests**: Count, median response time, resolution status
- **Copyright Flags**: User-reported or automated scanner detections
- **ToS Violations Logged**: Audit trail for legal review

### Event Funnel

```
Share Extension Opened
  ↓
URL Submitted
  ↓
Cook Card Generated (or Lite fallback)
  ↓
Ingredients Confirmed (if needed)
  ↓
Added to Saved Recipes
  ↓
Added to Shopping List (optional)
  ↓
Cook Started
  ↓
Cook Completed
```

**Drop-off Analysis:** Track where users abandon, optimize highest-impact steps

### Creator KPIs (Phase 2)

- **Saves per Creator**: Top creators by save count
- **Cook Completion Rate**: % of saves that result in cook
- **Household Reach**: Unique households who saved creator's recipes
- **Ingredient Match Rate**: Avg pantry match % for creator's recipes

---

## 13. Roadmap

### Phase 1: MVP Foundation (Weeks 1–4)

**Week 1–2: Schema & Infrastructure**
- [ ] Publish CookCard v1.0 schema (JSON spec, examples, changelog)
- [ ] Instrument four ship gates (quality, conversion, compliance, economics)
- [ ] Set up event logging pipeline (Supabase → analytics dashboard)
- [ ] Database cleanup: Delete all recipes/recipe_ingredients from RuleChef v5.2
- [ ] Update `.gitignore`: Exclude `*.json >1MB`, `__pycache__`, `.env`, `*_errors.txt`

**Week 3–4: Share Extension & Cook Card UI**
- [ ] iOS/Android share target implementation
- [ ] Ingestion ladder: Levels 1–3 (metadata, creator text, user confirm)
- [ ] Cook Card UI: Pantry match, cost range, confidence chips
- [ ] Substitution toggle with rationale popup
- [ ] Basic shopping list (single Cook Card)

**Week 5–6: Intelligence & Lists**
- [ ] Pantry match logic with canonical item mapping
- [ ] Cost range calculation from purchase history (60-day default)
- [ ] Multi-select shopping lists with store grouping
- [ ] Use-It-Up: Surface recipes using expiring items
- [ ] Ranking formula implementation (60/20/10/10)

**Week 7–8: Creator Kit & Beta Launch**
- [ ] Google Sheet → CookCard JSON exporter
- [ ] Creator submission portal with checksum validation
- [ ] Seed 10–20 creators (Instagram food bloggers, TikTok chefs)
- [ ] Beta launch with 100 users
- [ ] Gate validation: Measure all 4 gates for 14 days

**Gate Review:** If all gates pass → expand beta. If any fail → iterate and re-test.

---

### Phase 2: Scale & Community (Weeks 9–16)

**Cook-Along Features:**
- [ ] Timers synced to creator video timestamps
- [ ] Step-by-step checkpoints (reference media, not generate text)
- [ ] Cook session analytics (time spent, steps completed)

**Creator Analytics Dashboard:**
- [ ] Saves, cooks, household reach per creator
- [ ] Top ingredients, avg pantry match %, cost distribution
- [ ] "Creator Verified" badge for signed CookCard submissions

**Community Curation (Light):**
- [ ] Upvote/downvote on Cook Cards
- [ ] Flag for incorrect ingredients (moderation queue)
- [ ] Rollback mechanism for community edits
- [ ] "Helpful" votes on substitution suggestions

**Browser Extension (Desktop):**
- [ ] Chrome/Firefox extension for web recipe sites
- [ ] Same ingestion ladder as mobile share extension
- [ ] Sync Cook Cards across devices via Supabase real-time

---

### Phase 3: Advanced Features (Post-MVP)

**Household Sharing:**
- [ ] Invite family members to shared pantry
- [ ] Collaborative shopping lists
- [ ] "Who cooked what" activity feed (privacy controls)

**OCR for Video Frames (Opt-In):**
- [ ] Extract ingredients from video frames when creator text unavailable
- [ ] Confidence chips on all OCR-extracted fields
- [ ] User must confirm before adding to Cook Card

**Advanced Substitution Engine:**
- [ ] USDA FoodData Central integration for nutritional similarity
- [ ] Allergen-safe substitutions (mark common allergens)
- [ ] Cultural/religious dietary preferences (halal, kosher, vegan)

**Retail Partnerships:**
- [ ] In-app checkout with Instacart/Amazon Fresh
- [ ] Affiliate revenue share with creators
- [ ] Store-specific pricing for cost range accuracy

---

## 14. Risks & Mitigations

### Risk 1: LLM Cost Spiral
**Impact:** High
**Likelihood:** Medium

**Mitigation:**
- Budget guardrails: Kill switch at $0.02/save threshold
- Ingestion ladder prioritizes deterministic methods (Levels 1–3)
- Per-URL caching (30-day TTL) to avoid re-extraction
- Alerting on LLM call rate >0.5 per URL

---

### Risk 2: Platform ToS Changes
**Impact:** High
**Likelihood:** Medium

**Mitigation:**
- Zero media caching (only link to original)
- Quick takedown workflow (48h SLA)
- Legal review every 6 months
- Diversify across platforms (Instagram, TikTok, YouTube, web)

---

### Risk 3: Data Quality Degradation
**Impact:** Medium
**Likelihood:** Medium

**Mitigation:**
- Fail-closed confirms prevent bad data from entering system
- Provenance labeling (creator/detected/user) for transparency
- Community edits require moderation + rollback capability
- Weekly quality audits (sample 50 Cook Cards, manual review)

---

### Risk 4: Cold Start Problem
**Impact:** Low (we have existing pantry data)
**Likelihood:** Low

**Mitigation:**
- Use-It-Up feature surfaces value immediately (expiring items)
- Purchase history enables cost estimates from day 1
- Community sharing (Phase 3) creates viral loop
- Anonymized household clustering for "similar to you" recommendations

---

### Risk 5: Creator Backlash
**Impact:** Medium
**Likelihood:** Low

**Mitigation:**
- Prominent attribution with link-back to original
- Creator Kit enables verified, high-quality submissions
- Analytics dashboard shows creators their reach/impact
- Revenue share model (Phase 3) aligns incentives
- "Report incorrect attribution" flow with 48h resolution

---

## 15. Out of Scope (MVP)

The following are **explicitly not part of MVP** to maintain focus:

### Content Generation
- ❌ Hosting or paraphrasing recipe instructions
- ❌ AI-generated cooking steps, tips, or variations
- ❌ Automated recipe recommendations without explainable ranking

### First-Party Recipe Database
- ❌ "Recipe search" across a proprietary recipe collection
- ❌ Using RuleChef or any AI recipe generation for production data
- ❌ Retroactive fixing of v5.2 recipes (delete, don't repair)

### Advanced Features
- ❌ Black-box recommendation models (all ranking must be explainable)
- ❌ Meal planning beyond shopping list generation
- ❌ Nutrition tracking or calorie counting
- ❌ Social features beyond basic upvote/flag (deferred to Phase 2)

### Monetization
- ❌ In-app purchases or premium tiers (Phase 3)
- ❌ Affiliate revenue or retailer partnerships (Phase 3)
- ❌ Creator revenue share mechanics (design in Phase 2, launch Phase 3)

---

## 16. Open Questions & Decisions

### Resolved Decisions

**Q: What exact confidence threshold triggers confirm?**
**DECISION:** 0.80 per-ingredient threshold. Any ingredient <0.80 triggers confirm chip. User can batch-confirm all medium-confidence (0.65–0.79) items with one tap, or individually edit.

**Q: How long do we cache per-URL extractions?**
**DECISION:** 30 days. Reduces LLM costs for popular URLs while ensuring freshness if creator edits post.

**Q: What platforms do we support at launch?**
**DECISION:** iOS and Android share extension. Desktop browser extension deferred to Phase 2.

---

### Outstanding Questions

**Q: Initial set of "allowable substitutions" and sources of rationale?**
**PROPOSED:** USDA FoodData Central for nutritional similarity + culinary substitution databases (e.g., Cook's Illustrated). Needs engineering validation for API costs.

**Q: Creator revenue share mechanics (if/when carts/affiliates land)?**
**PROPOSED:** 70/30 split (creator/platform) on affiliate revenue from Cook Cards. Needs legal review and creator feedback in Phase 2.

**Q: Minimum devices/browsers for share/extension at launch?**
**PROPOSED:** iOS 15+, Android 12+. Chrome/Firefox extension (desktop) in Phase 2 only.

**Q: How do we handle recipe updates from creators?**
**PROPOSED:** Checksum mismatch triggers "Recipe updated by creator" notification. User can accept update (re-confirm ingredients) or keep saved version.

---

## 17. Engineering Checklist: Hard No's

These are **non-negotiable** constraints enforced via code review and architecture review:

### ❌ LLM-First Extraction or Silent AI Edits
**Enforcement:** PR requirement to show deterministic path (Levels 1–3) before LLM call
**Review Gate:** Architecture review for any new LLM usage

### ❌ Scrape/Rehost Media or Full Instruction Text
**Enforcement:** Zero media storage in database schema; `steps` array limited to `type: link`
**Review Gate:** Database migration review rejects any `instructions_text` column

### ❌ AI-Generated Cooking Steps
**Enforcement:** Hard rule in product spec; no `generate_instructions()` function allowed
**Review Gate:** Manual code review flags any instruction generation logic

### ❌ Black-Box Ranking or Fake Cost Precision
**Enforcement:** Ranking formula must be explainable (60/20/10/10); cost always shows range + provenance
**Review Gate:** UX review rejects single-cent cost displays

### ❌ Unmoderated Crowdsourcing Without Rollback
**Enforcement:** Community edits require moderation queue + rollback mechanism
**Review Gate:** Feature flag disabled until moderation infrastructure ships

### ❌ Launch Before All Four Gates Pass
**Enforcement:** Release blocker in CI/CD pipeline until 14 consecutive days of gate pass
**Review Gate:** Product sign-off required with gate metrics dashboard screenshot

---

## 18. Success Definition

### What Success Looks Like (6 Months Post-Launch)

**User Behavior:**
- Users regularly go from save → Cook Card → cooked with ≤2 taps
- 30% of users save ≥5 recipes per month
- 25% Save → Cook conversion sustained over 90 days

**Impact Metrics:**
- Measurable waste reduction: 15% decrease in expired items per household
- Time-to-cook improvements: 20% reduction in "what's for dinner?" decision time
- Cost transparency: 80% of users report cost range as "helpful" or "very helpful"

**Creator Ecosystem:**
- 100+ creators view us as value-add partner (verified CookCards, analytics)
- Creators share "Save to [App]" CTAs in their posts
- 10% of saves come from creator-submitted CookCard JSON

**Economics:**
- Sustainable unit economics: LLM cost <$0.012/save (20% under budget)
- 90% of extractions use deterministic methods (Levels 1–3)
- <5% Cook Card Lite fallback rate

---

### What Failure Looks Like (Warning Signs)

**User Distrust:**
- Users screenshot Cook Cards because they don't trust the data
- Confidence chips routinely show <80% (Gate 1 failing)
- Cost ranges are too wide to be useful ("$5–$30")

**Poor Conversion:**
- Save → Cook <15% sustained for 30+ days (Gate 2 failing)
- Users save recipes but never cook them (intent vs action gap)
- Shopping lists created but not used

**Cost Spiral:**
- LLM cost >$0.02/save for 7+ consecutive days (Gate 4 failing)
- LLM call rate >0.6 per URL (deterministic methods failing)
- Budget alerts triggering weekly

**Legal/Compliance Issues:**
- DMCA takedown requests >5/month (Gate 3 risk)
- Platform API access revoked due to ToS violations
- Media caching or instruction rehosting detected in audit

---

### Leading Indicators (30 Days Post-Launch)

**Positive:**
- ✅ Avg confirm taps ≤1.5 per save
- ✅ 80% of saves have ≥90% confidence on ingredients
- ✅ Save → Plan rate ≥60% (users intend to cook)
- ✅ Substitution acceptance ≥40% (users trust swap suggestions)

**Negative:**
- ⚠️ Cook Card Lite rate >10% (extraction failing too often)
- ⚠️ LLM call rate >0.5 per URL (deterministic methods insufficient)
- ⚠️ User feedback: "I don't trust the ingredients" >20% of surveys
- ⚠️ Churn after first save >50% (value not clear)

---

## 19. Appendix

### Change Log

**v1.0 (2025-10-07):**
- Initial PRD post-RuleChef quality audit
- Strategic pivot to social recipe organization
- Four ship gates defined with thresholds
- CookCard v1.0 schema published

---

### References

**Internal Docs:**
- `ARCHITECTURE.md`: Complete system architecture
- `AI_RECIPE_GENERATION_STRATEGY.md`: Cook Card pivot strategy
- `RECIPE_API_PRICING_2025.md`: Cost analysis for recipe APIs
- `V5_2_RECIPE_INTEGRATION_PLAN.md`: (Deprecated) RuleChef integration

**External Resources:**
- USDA FoodData Central: https://fdc.nal.usda.gov/
- Instagram oEmbed API: https://developers.facebook.com/docs/instagram/oembed
- TikTok Embed: https://developers.tiktok.com/doc/embed-videos
- YouTube Data API v3: https://developers.google.com/youtube/v3

---

### Glossary

**Cook Card:** Structured recipe view with pantry match, cost range, and substitutions
**Cook Card Lite:** Fallback when extraction fails; link + partial ingredients only
**Canonical Item:** Normalized ingredient in our 506-item master list
**Fail-Closed:** System design principle where uncertain data requires user confirmation
**Ingestion Ladder:** Priority-ordered extraction methods (metadata → creator text → LLM)
**Provenance:** Label showing data source (creator-provided, detected, user-edited)
**Ship Gate:** Measurable threshold that must pass before launch (quality, conversion, compliance, economics)
**Use-It-Up:** Feature surfacing recipes that use expiring pantry items

---

**END OF PRD v1.0**

---

## 20. Implementation Task Breakdown (8-Week Plan)

This section provides actionable tasks for engineering execution. All tasks are sized for small team velocity with clear dependencies.

---

### WEEK 1-2: Foundation & Clean Slate

#### **TASK 1.1: Database Cleanup & Schema Migration** ⚠️ BLOCKING
**Priority:** P0 | **Est:** 3 days | **Owner:** Backend

**Subtasks:**
1. Backup current `recipes` and `recipe_ingredients` to archive table
2. Delete all rows from both tables (RuleChef v5.2 data unusable)
3. Create migration `003_cook_card_schema.sql`:

```sql
-- Cook Cards table
CREATE TABLE cook_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  url text NOT NULL,
  source_platform text NOT NULL CHECK (source_platform IN ('instagram', 'tiktok', 'youtube', 'web')),
  title text NOT NULL,
  attribution jsonb NOT NULL, -- {creator_handle, creator_name, verified, linkback, saved_at}
  yields text,
  time_minutes integer,
  tags text[],
  checksum text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, url)
);

-- Cook Card Ingredients
CREATE TABLE cook_card_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cook_card_id uuid REFERENCES cook_cards ON DELETE CASCADE,
  raw_text text NOT NULL,
  canonical_id uuid REFERENCES canonical_items,
  quantity numeric,
  unit text,
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  provenance text NOT NULL CHECK (provenance IN ('creator', 'detected', 'user')),
  created_at timestamptz DEFAULT now()
);

-- Event Tracking
CREATE TABLE cook_card_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cook_card_id uuid REFERENCES cook_cards,
  user_id uuid REFERENCES auth.users,
  event_type text NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Extraction Cache
CREATE TABLE extraction_cache (
  url text PRIMARY KEY,
  metadata jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_cook_cards_user ON cook_cards(user_id, created_at DESC);
CREATE INDEX idx_events_created ON cook_card_events(created_at);
CREATE INDEX idx_events_type ON cook_card_events(event_type);
CREATE INDEX idx_ingredients_confidence ON cook_card_ingredients(confidence);
CREATE INDEX idx_cache_expires ON extraction_cache(expires_at);

-- Enable RLS
ALTER TABLE cook_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE cook_card_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE cook_card_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can only see their own cook cards"
  ON cook_cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own cook cards"
  ON cook_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

4. Enable RLS and test policies
5. Run migration on staging, then production

**AC:** Zero rows in old tables, new tables with RLS enabled, sample insert succeeds

---

#### **TASK 1.2: Gate Instrumentation & Analytics** ⚠️ BLOCKING
**Priority:** P0 | **Est:** 4 days | **Owner:** Backend + DevOps

**Subtasks:**
1. Create event logging service (`lib/analytics.ts`):

```typescript
export async function logCookCardEvent(params: {
  cook_card_id?: string;
  user_id: string;
  event_type: 'saved' | 'confirmed' | 'cooked' | 'llm_call' | 'compliance_flag';
  metadata?: {
    confirm_taps?: number;
    min_confidence?: number;
    llm_cost_usd?: number;
    url?: string;
    [key: string]: any;
  };
}) {
  const { error } = await supabase
    .from('cook_card_events')
    .insert([{
      cook_card_id: params.cook_card_id,
      user_id: params.user_id,
      event_type: params.event_type,
      metadata: params.metadata,
      created_at: new Date().toISOString()
    }]);
  
  if (error) console.error('Event logging failed:', error);
}
```

2. Create SQL views for gates:

```sql
-- Gate 1: Quality
CREATE VIEW gate_1_quality AS
SELECT
  AVG((metadata->>'confirm_taps')::int) as avg_confirm_taps,
  PERCENTILE_CONT(0.95) WITHIN GROUP (
    ORDER BY (metadata->>'min_confidence')::numeric
  ) as p95_confidence,
  CASE 
    WHEN AVG((metadata->>'confirm_taps')::int) <= 2.0 
      AND PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (metadata->>'min_confidence')::numeric) >= 0.80
    THEN true
    ELSE false
  END as passing
FROM cook_card_events
WHERE event_type = 'saved'
  AND created_at > NOW() - INTERVAL '7 days';

-- Gate 2: Conversion
CREATE VIEW gate_2_conversion AS
SELECT
  COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'cooked') * 100.0 /
  NULLIF(COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'saved'), 0) as conversion_pct,
  CASE 
    WHEN COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'cooked') * 100.0 /
         NULLIF(COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'saved'), 0) >= 20.0
    THEN true
    ELSE false
  END as passing
FROM cook_card_events
WHERE created_at > NOW() - INTERVAL '7 days';

-- Gate 4: Economics
CREATE VIEW gate_4_economics AS
SELECT
  SUM((metadata->>'llm_cost_usd')::numeric) /
  NULLIF(COUNT(DISTINCT cook_card_id), 0) as cost_per_save,
  COUNT(*) FILTER (WHERE event_type = 'llm_call') * 1.0 /
  NULLIF(COUNT(DISTINCT metadata->>'url'), 0) as llm_call_rate,
  CASE
    WHEN SUM((metadata->>'llm_cost_usd')::numeric) / NULLIF(COUNT(DISTINCT cook_card_id), 0) < 0.015
      AND COUNT(*) FILTER (WHERE event_type = 'llm_call') * 1.0 / NULLIF(COUNT(DISTINCT metadata->>'url'), 0) < 0.4
    THEN true
    ELSE false
  END as passing
FROM cook_card_events
WHERE created_at > NOW() - INTERVAL '7 days';
```

3. Create Supabase Edge Function `gate-metrics`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const [gate1, gate2, gate4] = await Promise.all([
    supabase.from('gate_1_quality').select('*').single(),
    supabase.from('gate_2_conversion').select('*').single(),
    supabase.from('gate_4_economics').select('*').single()
  ])

  return new Response(JSON.stringify({
    gate_1_quality: gate1.data,
    gate_2_conversion: gate2.data,
    gate_4_economics: gate4.data,
    all_passing: gate1.data?.passing && gate2.data?.passing && gate4.data?.passing
  }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

4. Set up Grafana dashboard or use Supabase Studio for visualization
5. Configure PagerDuty alerts:
   - Alert when any gate fails for >24 hours
   - Alert when cost_per_save > $0.015
   - Kill switch at $0.020 (disable LLM calls via feature flag)

**AC:** Event logging works, all gate views return metrics, dashboard live, alerts tested

---

#### **TASK 1.3: CookCard Schema Documentation**
**Priority:** P1 | **Est:** 2 days | **Owner:** Product

**Subtasks:**
1. Create `docs/COOKCARD_SCHEMA_V1.md` with examples
2. Create TypeScript validator using Ajv
3. Publish schema to repo

**AC:** Schema doc exists, validator works, examples provided

---

#### **TASK 1.4: Repository Cleanup**
**Priority:** P2 | **Est:** 1 day | **Owner:** DevOps

**Subtasks:**
1. Update `.gitignore` to exclude large files
2. Archive RuleChef scripts to `archive/rulechef_deprecated/`
3. Remove ProfileScreen.{old,v1-v5}.tsx duplicates
4. Commit cleanup

**AC:** Repo size reduced >50MB, `.gitignore` prevents future bloat

---

### WEEK 3-4: Share Extension + Cook Card UI

#### **TASK 2.1: iOS Share Extension (REVISED)**
**Priority:** P0 | **Est:** 5 days | **Owner:** iOS

**Scope Update:** YouTube native share only. Instagram/TikTok require manual "Copy Link → Paste" workflow due to platform restrictions (custom share sheets).

**Subtasks:**
1. Create Share Extension target
2. Configure Info.plist for URL handling (add NSExtensionActivationSupportsText)
3. Implement ShareViewController
4. Handle URL in main app
5. Build Paste Link screen for Instagram/TikTok fallback

**AC (Revised):**
- ✅ YouTube: Share button → "Save Recipe" appears → App opens → Extraction begins
- ⚠️ Instagram/TikTok: Copy Link → Paste in app → Extraction begins (backup flow)
- ❌ Direct share from Instagram/TikTok not possible (custom share sheets block third-party apps)

---

#### **TASK 2.2: Android Share Extension (REVISED)**
**Priority:** P0 | **Est:** 5 days | **Owner:** Android

**Scope Update:** YouTube native share only. Instagram/TikTok require manual "Copy Link → Paste" workflow due to platform restrictions (custom share dialogs).

**Subtasks:**
1. Create IntentFilter in manifest (text/plain for ACTION_SEND)
2. Implement ShareActivity
3. Handle URL in MainActivity
4. Build Paste Link screen for Instagram/TikTok fallback

**AC (Revised):**
- ✅ YouTube: Share button → "Pantry App" appears → App opens → Extraction begins
- ⚠️ Instagram/TikTok: Copy Link → Paste in app → Extraction begins (backup flow)
- ❌ Direct share from Instagram/TikTok not possible (custom share dialogs don't expose third-party apps)

---

#### **TASK 2.3: Ingestion L1 - Metadata Extraction**
**Priority:** P0 | **Est:** 3 days | **Owner:** Backend

**Subtasks:**
1. Create Edge Function `extract-metadata`
2. Implement oEmbed fetchers (Instagram, YouTube)
3. Add per-URL caching (30-day TTL)
4. Test with sample URLs

**AC:** Metadata extracted with 99% confidence, cache working

---

#### **TASK 2.4: Ingestion L2 - Creator Text Parsing**
**Priority:** P0 | **Est:** 4 days | **Owner:** Backend

**Subtasks:**
1. Create regex ingredient parser
2. Platform-specific extractors (caption, description)
3. Canonical item matching
4. Test with 20 real recipes per platform

**AC:** ≥80% ingredient extraction rate, canonical matching ≥70%

---

#### **TASK 2.5: Cook Card UI - Basic Display**
**Priority:** P0 | **Est:** 5 days | **Owner:** Frontend

**Subtasks:**
1. Create `CookCardScreen.tsx` component
2. Create ConfidenceChip component
3. Ingredient list with Have/Need status
4. Pantry match calculation
5. Style per design system

**AC:** Cook Card displays correctly, pantry match accurate

---

#### **TASK 2.6: User Confirmation Flow**
**Priority:** P0 | **Est:** 3 days | **Owner:** Frontend + Backend

**Subtasks:**
1. Confirmation modal for <0.80 confidence
2. Amber banner UI
3. Disable "Add to List" until confirmed
4. Log confirmation events

**AC:** Banner appears when needed, taps tracked for Gate 1

---

### WEEK 5-6: Intelligence Features

#### **TASK 3.1: Pantry Match Service**
**Priority:** P0 | **Est:** 4 days | **Owner:** Backend

**Subtasks:**
1. Create `pantry-match` Edge Function
2. Substitution toggle logic
3. Create `substitution_rules` table
4. Seed 20 common substitution pairs

**AC:** Pantry match categorizes correctly, substitutions work

---

#### **TASK 3.2: Cost Range Calculation**
**Priority:** P0 | **Est:** 5 days | **Owner:** Backend

**Subtasks:**
1. Create `cost-estimate` Edge Function
2. Price lookup with fallback to similar households
3. Format range (no cents)
4. Provenance display

**AC:** Cost calculated from history, never shows cents, provenance visible

---

#### **TASK 3.3: Shopping List Generation**
**Priority:** P1 | **Est:** 3 days | **Owner:** Frontend

**Subtasks:**
1. Multi-select Cook Cards UI
2. Merge ingredients logic
3. Group by aisle
4. Export to share/clipboard

**AC:** Multi-select works, ingredients merged, list exportable

---

#### **TASK 3.4: Use-It-Up (Waste Rescue)**
**Priority:** P1 | **Est:** 3 days | **Owner:** Backend + Frontend

**Subtasks:**
1. Query expiring items (7-day window)
2. Ranking boost for expiry rescue (20% weight)
3. Highlight expiry rescues in UI
4. "Why this ranks" breakdown modal

**AC:** Expiring items surfaced, ranking transparent

---

### WEEK 7-8: Creator Kit + Beta Launch

#### **TASK 4.1: Creator Kit - Google Sheet Template**
**Priority:** P1 | **Est:** 2 days | **Owner:** Product

**Subtasks:**
1. Create Google Sheet with instructions
2. Apps Script to export JSON
3. Test with sample data

**AC:** Template exports valid CookCard JSON

---

#### **TASK 4.2: Creator Submission Portal**
**Priority:** P1 | **Est:** 3 days | **Owner:** Frontend + Backend

**Subtasks:**
1. Submission form UI
2. Backend validation (schema + checksum)
3. Store in `creator_submissions` table
4. Admin review UI

**AC:** Creators can submit, validation works, admin can approve

---

#### **TASK 4.3: Beta Launch Prep**
**Priority:** P0 | **Est:** 3 days | **Owner:** Product + DevOps

**Subtasks:**
1. Seed 10-20 creators
2. Recruit 100 beta users
3. Beta onboarding flow
4. Feedback collection (NPS surveys, bug reporting)

**AC:** 10+ creators, 100 users, onboarding tested

---

#### **TASK 4.4: Gate Validation (14-Day Monitoring)** ⚠️ BLOCKING
**Priority:** P0 | **Est:** 14 days | **Owner:** Product + Engineering

**Process:**
1. Daily gate review meetings
2. Iterate on failing gates:
   - Gate 1: Improve regex, add canonical items
   - Gate 2: A/B test UI, improve match accuracy
   - Gate 3: Manual audit, fix bugs
   - Gate 4: Optimize LLM usage, increase cache TTL
3. Track metrics daily
4. Go/No-Go decision after 14 consecutive days of passing

**AC:** All 4 gates passing for 14 days → Expand beta to 1,000 users

---

## 21. Task Dependencies & Critical Path

```
Week 1-2 Foundation:
Task 1.1 (DB Cleanup) → [BLOCKS ALL]
  ├─→ Task 1.2 (Gate Instrumentation) → [BLOCKS ALL]
  └─→ Task 1.3 (Schema Docs)

Week 3-4 Share + UI:
Task 1.2 → Task 2.1 (iOS Share)
Task 1.2 → Task 2.2 (Android Share)
Task 1.2 → Task 2.3 (Metadata Extract)
  └─→ Task 2.4 (Creator Text Extract)
    └─→ Task 2.5 (Cook Card UI)
      └─→ Task 2.6 (Confirmation Flow)

Week 5-6 Intelligence:
Task 2.6 → Task 3.1 (Pantry Match)
  └─→ Task 3.2 (Cost Range)
    └─→ Task 3.3 (Shopping List)
      └─→ Task 3.4 (Use-It-Up)

Week 7-8 Beta:
Task 3.4 → Task 4.1 (Creator Kit)
  └─→ Task 4.2 (Submission Portal)
    └─→ Task 4.3 (Beta Launch)
      └─→ Task 4.4 (Gate Validation - 14 days)
```

**Critical Path Total:** 8 weeks with parallelization

---

## 22. Success Milestones

### Milestone 1 (Week 4): Share + Basic Cook Card
- ✅ 50 Cook Cards saved by beta users
- ✅ Avg confirm taps <3.0
- ✅ 80% extractions use L1-L2 (no LLM)

### Milestone 2 (Week 6): Intelligence Live
- ✅ Pantry match accuracy >85%
- ✅ Cost range shown for 90% Cook Cards
- ✅ 20+ shopping lists generated

### Milestone 3 (Week 8): Beta + Gates
- ✅ 100 beta users enrolled
- ✅ 10+ creator submissions approved
- ✅ All 4 gates passing for 14 days

---

## 23. Engineering Anti-Patterns to Avoid

These common mistakes violate our Hard No's:

❌ **Creating `instructions_text` column** → Fails Gate 3 (compliance)
❌ **LLM call without cache check** → Fails Gate 4 (economics)
❌ **Storing media files** → Legal liability
❌ **Silent confidence <0.80** → Breaks fail-closed principle
❌ **Launching before 14-day gate pass** → PR blocked

---

**v1.1 Changelog (2025-10-07):**
- Added Section 20: Implementation Task Breakdown (8-week plan)
- Added Section 21: Task Dependencies & Critical Path
- Added Section 22: Success Milestones
- Added Section 23: Engineering Anti-Patterns
- All tasks sized for small team, clear owners, acceptance criteria

---

**END OF PRD v1.1**
