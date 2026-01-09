# Pantry Pal v1 - Product Requirements Document

**Version:** 1.0
**Status:** FROZEN
**Last Updated:** 2025-01-09
**Document Owner:** Product

---

## Executive Summary

Pantry Pal v1 is a **pantry intelligence app**, not a recipe app. The core value proposition is helping users know what they have, track expiry dates, and manage shopping lists. Recipe features are secondary and limited to personal storage.

**Tagline:** "Know what you have."

**App Store Pitch:**
> Pantry Pal — Know what you have.
>
> - Scan receipts to auto-fill your pantry
> - Track expiry dates, never waste food
> - Smart shopping lists
> - Save your favorite recipes
>
> Stop guessing what's in your fridge.

---

## V1 Core Loop

```
┌──────────────┐
│   Receipt    │◄──────────────────────────────┐
│    Scan      │                               │
└──────┬───────┘                               │
       │ (credits)                             │
       ▼                                       │
┌──────────────┐                               │
│   Pantry     │                               │
│  (auto-fill) │                               │
└──────┬───────┘                               │
       │                                       │
       ▼                                       │
┌──────────────┐     ┌──────────────┐          │
│   Expiry     │────▶│   Shopping   │──────────┘
│   Tracking   │     │     List     │
└──────────────┘     └──────────────┘
```

**Primary Value:** "What did I buy? What's left? What's expiring?"

**NOT v1:** "What should I cook?" (deferred to v2)

---

## Positioning

| Aspect | V1 Position |
|--------|-------------|
| **Category** | Pantry Management / Inventory |
| **Not** | Recipe Discovery / Meal Planning |
| **Core Promise** | Know what you have |
| **Monetization Hook** | Save time with receipt scanning |
| **AI Mention** | None in marketing (implementation detail) |

### What We Say
- "Scan receipts to fill your pantry"
- "Track what's expiring"
- "Never buy duplicates"
- "Save your recipes in one place"

### What We Don't Say
- "AI-powered"
- "Recipe recommendations"
- "What can I cook?"
- "Meal planning"

---

## Tab Structure

| Tab | Icon | Purpose | Monetization |
|-----|------|---------|--------------|
| **Pantry** | 📦 | View items, locations, expiry | Free |
| **Shopping** | 🛒 | Build lists, check off items | Free |
| **Scan** | 📷 | Receipt → Pantry | **Credits** |
| **Recipes** | 📝 | Personal recipe storage | Mixed |
| **Profile** | 👤 | Settings, credits, subscription | — |

---

## Feature Specifications

### 1. Pantry Tab

**Purpose:** Central view of all pantry items with location and expiry tracking.

| Feature | Free | Credits | Notes |
|---------|------|---------|-------|
| View all pantry items | ✅ | — | List/grid view |
| Manual add item | ✅ | — | Name, quantity, unit |
| Quick-add common items | ✅ | — | Tap to add staples |
| Edit item | ✅ | — | All fields editable |
| Delete item | ✅ | — | Swipe or tap |
| Locations | ✅ | — | Fridge, Freezer, Pantry |
| Expiry date (manual) | ✅ | — | User enters date |
| Sort by expiry | ✅ | — | Soonest first |
| Filter by location | ✅ | — | View one location |
| Search items | ✅ | — | By name |

**NOT in v1:**
- Auto-suggested expiry dates
- Expiry notifications
- "Expiring soon" badges
- Quantity tracking automation

### 2. Shopping Tab

**Purpose:** Create and manage shopping lists.

| Feature | Free | Credits | Notes |
|---------|------|---------|-------|
| Create list | ✅ | — | Multiple lists supported |
| Add item manually | ✅ | — | Name, quantity, optional |
| Check off item | ✅ | — | Tap to complete |
| Uncheck item | ✅ | — | Tap again |
| Delete item | ✅ | — | Swipe |
| Reorder items | ✅ | — | Drag and drop |
| Clear completed | ✅ | — | Bulk action |

**NOT in v1:**
- Auto-add from recipes
- "Add missing ingredients" from recipe match
- Store aisle organization
- Price tracking

### 3. Scan Tab

**Purpose:** Scan receipts to auto-populate pantry.

| Feature | Free | Credits | Notes |
|---------|------|---------|-------|
| Camera capture | ✅ | — | Opens camera |
| Receipt OCR | — | **1 credit** | Gemini extraction |
| Fix queue review | ✅ | — | User confirms items |
| Edit before save | ✅ | — | Modify extracted items |
| Save to pantry | ✅ | — | After confirmation |

**Flow:**
```
[Scan Receipt] (1 credit)
       ↓
   Processing...
       ↓
   Fix Queue Screen
   - Review extracted items
   - Edit names/quantities
   - Set locations
   - Add expiry dates (optional)
       ↓
   [Confirm & Save]
       ↓
   Items added to Pantry
```

**NOT in v1:**
- Gallery photo import
- Multi-receipt batch scanning
- Store detection/history
- Price saving

### 4. Recipes Tab

**Purpose:** Personal recipe storage. NOT discovery or recommendations.

| Feature | Free | Credits | Notes |
|---------|------|---------|-------|
| View saved recipes | ✅ | — | List view |
| Manual recipe entry | ✅ | — | Title, link, notes, ingredients |
| Import from URL | — | **1 credit** | Extract from any URL |
| View recipe detail | ✅ | — | Full recipe view |
| Edit recipe | ✅ | — | All fields |
| Delete recipe | ✅ | — | 1-tap + confirm |
| Open source link | ✅ | — | External browser |

**Manual Entry Fields:**
- Title (required)
- Source URL (optional)
- Notes (optional)
- Ingredients (optional, free text)
- Instructions (optional, free text)

**URL Import Extraction:**
- Title (auto)
- Source URL (auto)
- Ingredients (auto-extracted)
- Instructions (auto-extracted)
- User confirms before saving

**NOT in v1:**
- Explore/browse recipes
- Recipe recommendations
- "What can I cook?" matching
- Pantry match percentage
- Public sharing
- Recipe database
- Category browsing

#### Recipes Tab UX

**Empty State:**
```
┌─────────────────────────────────────────┐
│  My Recipes                    [+ Add]  │
├─────────────────────────────────────────┤
│                                         │
│         📝                              │
│                                         │
│    No recipes saved yet                 │
│                                         │
│    Save your favorite recipes here.     │
│    Add them manually or import          │
│    from a URL.                          │
│                                         │
│         [+ Add Recipe]                  │
│                                         │
└─────────────────────────────────────────┘
```

**With Recipes:**
```
┌─────────────────────────────────────────┐
│  My Recipes (12)               [+ Add]  │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🍝 Grandma's Pasta              │    │
│  │ Added manually • 8 ingredients  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🥗 TikTok Salmon Bowl           │    │
│  │ Imported from tiktok.com        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🍜 Mom's Soup Recipe            │    │
│  │ Added manually • Link attached  │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

**Add Recipe Flow:**
```
┌─────────────────────────────────────────┐
│  Add Recipe                             │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  📝 Add Manually           FREE │    │
│  │  Type in your own recipe        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  🔗 Import from URL       1 🪙  │    │
│  │  Paste a link, we'll extract it │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

### 5. Profile Tab

**Purpose:** Settings, account, credits management.

| Feature | Free | Credits | Notes |
|---------|------|---------|-------|
| View credit balance | ✅ | — | Always visible |
| Buy credit packs | ✅ | — | IAP |
| Subscribe to Pro | ✅ | — | IAP |
| View subscription status | ✅ | — | — |
| Account settings | ✅ | — | Email, password |
| Sign out | ✅ | — | — |
| Delete account | ✅ | — | GDPR compliance |

---

## Monetization: Credit System

### Credit Economy

| Tier | Monthly Credits | Rollover | Price |
|------|-----------------|----------|-------|
| **Free** | 10 | No | $0 |
| **Pro** | 100 | Yes (cap 200) | $4.99/mo or $29.99/yr |

### Credit Costs

| Action | Credits |
|--------|---------|
| Receipt scan | 1 |
| Recipe URL import | 1 |

### Credit Packs (One-Time Purchase)

| Pack | Credits | Price | Per Credit |
|------|---------|-------|------------|
| Small | 25 | $1.99 | $0.08 |
| Medium | 75 | $4.99 | $0.067 |
| Large | 200 | $9.99 | $0.05 |

**Credit packs never expire** (Apple IAP compliance).

### Your Cost Structure

| Action | Your Cost | User Pays | Margin |
|--------|-----------|-----------|--------|
| Receipt scan | ~$0.025 | $0.08/credit | ~70% |
| Recipe import | ~$0.015 | $0.08/credit | ~80% |

### Pro Subscription Details

- **Monthly:** $4.99/month
- **Annual:** $29.99/year (50% discount)
- **Includes:** 100 credits/month
- **Rollover:** Unused credits roll to next month (cap: 200)
- **Overage:** Buy credit packs at normal price

### Credit UX

**Balance Display (Header):**
```
┌──────────────────────────────────────┐
│  [☰]  Pantry Pal        🪙 7 credits │
└──────────────────────────────────────┘
```

**Low Balance Warning:**
```
┌──────────────────────────────────────┐
│  ⚠️ 2 credits remaining              │
│  [Get More]           [Go Pro]       │
└──────────────────────────────────────┘
```

**Out of Credits:**
```
┌─────────────────────────────────────────┐
│  You're out of credits                  │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  🪙 25 credits     $1.99        │    │
│  │  🪙 75 credits     $4.99 ⭐     │    │
│  │  🪙 200 credits    $9.99        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ─────── or ───────                     │
│                                         │
│  [Go Pro - $4.99/mo]                    │
│  100 credits/month + rollover           │
│                                         │
│  [Add items manually instead]           │
└─────────────────────────────────────────┘
```

---

## Onboarding Flow

**Goal:** Complete in <90 seconds.

### Step 1: Quick-Add Staples (15 sec)
```
┌─────────────────────────────────────────┐
│  What's in your kitchen?                │
├─────────────────────────────────────────┤
│                                         │
│  Tap items you have right now:          │
│                                         │
│  [🥛 Milk] [🥚 Eggs] [🧈 Butter]        │
│  [🍞 Bread] [🧀 Cheese] [🍚 Rice]       │
│  [🍝 Pasta] [🧅 Onions] [🧄 Garlic]     │
│  [🥕 Carrots] [🍗 Chicken] [🥩 Beef]    │
│                                         │
│                      [Continue →]       │
└─────────────────────────────────────────┘
```

### Step 2: Scan a Receipt (30 sec, skippable)
```
┌─────────────────────────────────────────┐
│  Add items faster                       │
├─────────────────────────────────────────┤
│                                         │
│         📷                              │
│                                         │
│  Scan a grocery receipt to              │
│  auto-fill your pantry.                 │
│                                         │
│  You have 10 free credits to start.     │
│                                         │
│  [📷 Scan Receipt]                      │
│                                         │
│  [Skip for now]                         │
│                                         │
└─────────────────────────────────────────┘
```

### Step 3: Save a Recipe (30 sec, skippable)
```
┌─────────────────────────────────────────┐
│  Save a favorite recipe                 │
├─────────────────────────────────────────┤
│                                         │
│  Got a recipe link handy?               │
│  Paste it here and we'll save it.       │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  https://...                    │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [Import Recipe] (1 credit)             │
│                                         │
│  [Skip - I'll add recipes later]        │
│                                         │
└─────────────────────────────────────────┘
```

### Step 4: Done
```
┌─────────────────────────────────────────┐
│  You're all set! 🎉                     │
├─────────────────────────────────────────┤
│                                         │
│  Your pantry has 8 items.               │
│  You have 9 credits remaining.          │
│                                         │
│  Scan receipts after shopping           │
│  to keep your pantry up to date.        │
│                                         │
│  [Go to My Pantry]                      │
│                                         │
└─────────────────────────────────────────┘
```

---

## Success Metrics

### Week 1 KPIs

| Metric | Target | Event |
|--------|--------|-------|
| **Activation A** | ≥40% | Pantry items ≥10 within 24h |
| **Activation B** | ≥20% | Recipe added within 24h |
| **Magic Moment** | ≥30% | Receipt scan completed |

### Engagement (Day 1-7)

| Metric | Target | Event |
|--------|--------|-------|
| D1 Retention | ≥30% | Return to app day after install |
| D7 Retention | ≥15% | Return to app after 7 days |
| Receipts scanned/user | ≥1.5 | `receipt_scan_completed` |

### Monetization (Month 1)

| Metric | Target | Notes |
|--------|--------|-------|
| Credit purchase rate | ≥5% | % of users who buy credits |
| Pro conversion rate | ≥3% | % of users who subscribe |
| ARPU | ≥$0.30 | Average revenue per user |

### Telemetry Events to Instrument

```typescript
// Onboarding
'onboarding_started'
'onboarding_quickadd_items_count'
'onboarding_receipt_scan_attempted'
'onboarding_receipt_skipped'
'onboarding_recipe_skipped'
'onboarding_completed'

// Pantry
'pantry_item_added'          // + source: 'manual' | 'quickadd' | 'receipt'
'pantry_item_edited'
'pantry_item_deleted'
'pantry_viewed'

// Receipt
'receipt_scan_started'
'receipt_scan_completed'     // + items_count
'receipt_scan_failed'        // + error_reason
'fix_queue_item_edited'
'fix_queue_item_deleted'
'fix_queue_confirmed'

// Recipe
'recipe_manual_created'
'recipe_import_started'
'recipe_import_completed'    // + extraction_method
'recipe_import_failed'       // + fail_reason
'recipe_viewed'
'recipe_deleted'

// Shopping
'shopping_list_created'
'shopping_item_added'
'shopping_item_checked'
'shopping_list_cleared'

// Credits
'credits_balance_viewed'
'credits_pack_purchased'     // + pack_size
'credits_insufficient'       // User tried action without credits
'subscription_started'       // + plan: 'monthly' | 'annual'
'subscription_cancelled'
```

---

## Technical Requirements

### Database Schema Additions

```sql
-- User credits table
CREATE TABLE user_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  free_credits_remaining INT DEFAULT 10,
  free_credits_reset_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 month',
  purchased_credits INT DEFAULT 0,
  is_pro BOOLEAN DEFAULT FALSE,
  pro_expires_at TIMESTAMPTZ,
  pro_credits_remaining INT DEFAULT 0,
  total_credits_used INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credit transactions
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  amount INT NOT NULL,
  type TEXT NOT NULL,  -- 'monthly_reset', 'purchase', 'receipt_scan', 'recipe_import', 'pro_grant'
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User recipes (manual + imported)
CREATE TABLE user_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  household_id UUID REFERENCES households(id),
  title TEXT NOT NULL,
  source_url TEXT,
  notes TEXT,
  ingredients TEXT,        -- Free text for manual entry
  instructions TEXT,       -- Free text for manual entry
  parsed_ingredients JSONB, -- Structured data from import
  parsed_instructions JSONB, -- Structured data from import
  source_type TEXT NOT NULL, -- 'manual' | 'imported'
  extraction_method TEXT,    -- 'gemini' | 'schema_org' | etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### IAP Products

| Product ID | Type | Price |
|------------|------|-------|
| `credits_25` | Consumable | $1.99 |
| `credits_75` | Consumable | $4.99 |
| `credits_200` | Consumable | $9.99 |
| `pro_monthly` | Auto-renewable | $4.99/mo |
| `pro_annual` | Auto-renewable | $29.99/yr |

### Feature Flags

```typescript
const FEATURE_FLAGS = {
  // V1 - Ship enabled
  RECEIPT_SCANNING: true,
  FIX_QUEUE: true,
  PANTRY_CRUD: true,
  PANTRY_LOCATIONS: true,
  SHOPPING_LIST: true,
  RECIPE_MANUAL_ENTRY: true,
  RECIPE_URL_IMPORT: true,
  CREDIT_SYSTEM: true,
  EXPIRY_DATE_MANUAL: true,
  EXPIRY_SORT_FILTER: true,

  // V1 - Ship disabled (kill switches)
  SOCIAL_VIDEO_EXTRACTION: false,  // TikTok/IG video frames

  // V2 - Not implemented
  RECIPE_DATABASE: false,
  RECIPE_EXPLORE: false,
  RECIPE_RECOMMENDATIONS: false,
  PANTRY_MATCHING: false,
  EXPIRY_NOTIFICATIONS: false,
  EXPIRY_AUTO_SUGGEST: false,
  HOUSEHOLD_SHARING: false,
};
```

---

## What's Explicitly OUT of V1

| Feature | Reason | Target Version |
|---------|--------|----------------|
| Recipe database | Licensing, maintenance | v2+ |
| Explore/browse recipes | No trusted data | v2+ |
| Recipe recommendations | Complexity, needs data | v2 |
| "What can I cook?" | Needs matching | v2 |
| Pantry match % | Needs canonical linking | v2 |
| Public recipe sharing | UGC moderation | v2+ |
| Expiry notifications | Needs testing, opt-in | v1.1 |
| Auto-suggested expiry | Liability, regional variance | v2+ |
| Household sharing | Complexity | v2 |
| Social video extraction | Store approval risk | v1.1 (behind flag) |
| Meal planning | Out of scope | v3+ |

---

## V1 Guardrails

### Recipe Import
- **Private by default** - No public sharing option in v1
- **User confirms before save** - No silent scraping
- **Per-site failure messaging** - Clear errors when extraction fails
- **Fallback to manual** - Always offer manual entry option
- **1-tap delete** - Easy to remove unwanted imports

### Receipt Scanning
- **Fix queue required** - User must review before saving
- **Edit before confirm** - All fields editable
- **No silent saves** - Explicit confirmation required

### Credits
- **Clear balance display** - Always visible in header
- **Warning at low balance** - Prompt at ≤2 credits
- **Graceful degradation** - Manual entry always available
- **No negative balance** - Block action if insufficient

---

## Launch Checklist

### Pre-Launch
- [ ] Credit system implemented and tested
- [ ] IAP products configured in App Store Connect
- [ ] RevenueCat integrated
- [ ] Onboarding flow complete
- [ ] Telemetry events instrumented
- [ ] Fix queue UX polished
- [ ] Manual recipe entry working
- [ ] URL recipe import working
- [ ] Expiry date field + sort working
- [ ] Profile tab with credits display
- [ ] App Store assets prepared
- [ ] Privacy policy updated
- [ ] Terms of service updated

### TestFlight
- [ ] Internal testing (team)
- [ ] External testing (10-20 users)
- [ ] Monitor crash reports
- [ ] Collect feedback
- [ ] Iterate on UX issues

### App Store Submission
- [ ] Screenshots (all device sizes)
- [ ] App preview video (optional)
- [ ] Description (no AI mentions)
- [ ] Keywords optimized
- [ ] Age rating configured
- [ ] Privacy labels accurate
- [ ] Review notes prepared

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-09 | Initial frozen spec |

---

## Approval

This document represents the frozen v1 specification for Pantry Pal. Any changes to scope require explicit approval and documentation update.

**Scope is frozen as of:** 2025-01-09
