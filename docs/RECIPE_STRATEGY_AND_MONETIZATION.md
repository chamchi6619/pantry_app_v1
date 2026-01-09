# Pantry App Recipe & Monetization Strategy
**Complete Strategy Document**

---

## Executive Summary

**Strategic Pivot:** The app does NOT need a traditional recipe database to launch. Instead, it positions as a **"Personal Recipe Organizer + Pantry Intelligence Platform"** where users bring their own recipes from social media/web, and the app provides the intelligence layer (pantry matching, shopping lists, meal planning).

**Core Value Proposition:** "Save any recipe from anywhere. Instantly see what ingredients you have and what you need to buy."

**Monetization:** Freemium model with credit system + optional rewarded ads. Premium tier unlocks unlimited extractions and AI-powered features.

**Financial Viability:** Sustainable at 15% premium conversion with 94% profit margin.

---

## Table of Contents

1. [The Recipe Database Problem](#i-the-recipe-database-problem)
2. [Recipe Strategy: User-Generated Content](#ii-recipe-strategy-user-generated-content-model)
3. [Meal Planning Strategy](#iii-meal-planning-strategy)
4. [Monetization Structure](#iv-monetization-structure)
5. [Technical Implementation](#v-technical-implementation-requirements)
6. [Launch Roadmap](#vi-launch-roadmap)
7. [Success Metrics](#vii-key-success-metrics)
8. [Risk Analysis](#viii-risk-analysis--mitigation)
9. [Conclusion & Recommendation](#ix-conclusion--recommendation)

---

## I. The Recipe Database Problem (Why We Abandoned It)

### A. What We Tried
- NHS/USDA/MealDB public recipe APIs
- Traditional recipe blog scraping
- YouTube video extraction with blog fallback
- Quality testing on 15 diverse videos

### B. Results from Testing
```
Blog Extraction Success Rate: 7% (1/15)
✅ 1 full success: Natasha's Kitchen (has Schema.org)
⚠️ 9 partial: Found recipes but wrong domain (AllRecipes instead of creator blogs)
❌ 5 complete failures: HTTP 403 bot protection, no URLs found, API quota exceeded

Problems Encountered:
- Cloudflare bot protection (HTTP 403 errors)
- Rate limiting and CAPTCHAs
- Free API quotas too restrictive
- URL selector algorithm picked aggregators over creator blogs
- Most blogs lack Schema.org structured data
- Headless browser workarounds too expensive/slow
```

### C. Cost Analysis of Building Recipe DB
```
Vision API Fallback Needed: 93% of extractions
Cost for 10,000 Free Users: $32.67/month (assuming 10 videos/month each)
Annual Cost: $392/year

Conclusion: UNSUSTAINABLE without significant revenue
```

### D. Why Recipe DB Is NOT Required for Launch

**Key Insight:** Users already get recipes from Instagram, TikTok, YouTube, Pinterest, and food blogs. They don't need another discovery platform - they need **organization + intelligence**.

**What the app actually provides:**
1. ✅ Save any recipe from anywhere (extraction service)
2. ✅ Pantry match intelligence ("you have 8/10 ingredients")
3. ✅ Shopping list generation (missing ingredients → list)
4. ✅ Household sharing (shared recipes + pantry)
5. ✅ Meal planning (manual drag-and-drop + AI-assisted)
6. ✅ Recipe organization (tags, categories, favorites)

**Competitor Comparison:**

| Feature | Paprika | Mealime | Plan to Eat | **Pantry App** |
|---------|---------|---------|-------------|----------------|
| Recipe discovery | No | 200 recipes | No | User-generated |
| Save from web | Yes | No | Yes | Yes |
| Pantry matching | No | No | No | **YES** ✅ |
| Shopping lists | Yes | Yes | Yes | Yes |
| Meal planning | Yes | Yes | Yes | Yes |
| Receipt scanning | No | No | No | **YES** ✅ |
| Expiration tracking | No | No | No | **YES** ✅ |
| Pricing | $5 one-time | $6/mo | $5/mo | Free + $4.99/mo |

**Differentiation:** Pantry matching + receipt scanning + expiration tracking = unique value no competitor has.

---

## II. Recipe Strategy: User-Generated Content Model

### A. Core Concept

**Users ARE the recipe database.**

Instead of scraping/curating recipes, the app provides:
1. **Extraction tools** (share extension, paste URL, manual entry)
2. **Intelligence layer** (pantry matching, nutritional analysis, cost estimation)
3. **Organization tools** (calendar, tags, meal planning)

### B. How Users Get Recipes Into the App

**Method 1: Share Extension (Primary)**
```
User flow:
1. User browses Instagram/TikTok/YouTube (existing behavior)
2. Finds recipe they like
3. Taps Share → Pantry App
4. App extracts ingredients automatically
5. Shows pantry match: "You have 7/10 ingredients (70%)"
6. Missing items → Add to shopping list
```

**Method 2: Paste URL**
```
User flow:
1. User finds recipe on blog/website
2. Copies URL
3. Opens Pantry App → "Add Recipe" → Paste URL
4. App attempts extraction (Schema.org → Regex → Vision API)
5. Success: Recipe saved with ingredients
```

**Method 3: Manual Entry**
```
User flow:
1. User has recipe from cookbook/family/handwritten note
2. Opens app → "Add Recipe" → Manual Entry
3. Enters title, ingredients, instructions
4. Saves to collection
```

### C. Extraction Pipeline (Optimized for Cost)

**L1: Cache Check (Free)**
```
Before extracting, check if URL already exists:
SELECT * FROM cook_cards WHERE source_url = ? AND is_public = true

If found:
  → Copy to user's collection
  → Cost: $0
  → Time: <1 second

Cache hit rate expectations:
- Month 1-2: 10-20% (building cache)
- Month 3-6: 40-60% (popular recipes repeat)
- Month 6+: 70-80% (mature cache)

Impact: 70-80% of extractions cost $0 after 6 months
```

**L2: Schema.org Structured Data (Cheap)**
```
Attempt to parse Schema.org Recipe markup:

If successful:
  → Extract ingredients, steps, metadata
  → Light LLM cleaning for canonicalization
  → Cost: $0.0001-0.0002
  → Time: 2-5 seconds
  → Success rate: 15-20% of sites

Sites with Schema.org:
- AllRecipes
- NYT Cooking
- Serious Eats
- Food Network
- Bon Appétit
- Many WordPress recipe blogs
```

**L3: YouTube Description Parsing (Free)**
```
For YouTube videos:
1. Fetch video metadata via YouTube Data API (free within quota)
2. Parse description for ingredient lists
3. Regex matching for common patterns:
   - "Ingredients:"
   - "You'll need:"
   - Bulleted/numbered lists

Success rate: 30-40% (many creators list ingredients)
Cost: $0 (just API quota)
Time: 3-5 seconds
```

**L4: Vision API + LLM Cleaning (Expensive)**
```
Last resort for:
- Instagram/TikTok posts (no structured data)
- YouTube videos without descriptions
- Blogs with heavy bot protection

Process:
1. Extract video frame or image
2. Vision API: Detect text/ingredients
3. Gemini Flash: Clean and structure
4. Canonicalize ingredients

Cost breakdown:
- Vision API: $0.0025 per image
- Gemini Flash cleaning: $0.002
- Canonicalization: $0.0005
Total: ~$0.004-0.005 per extraction

Time: 15-30 seconds
```

**Effective Cost Per Extraction (with cache):**
```
Month 1: $0.004 (building cache)
Month 3: $0.004 × 50% = $0.002 (50% cache hits)
Month 6+: $0.004 × 20% = $0.0008 (80% cache hits)
```

### D. Explore/Discovery Screen Strategy

**For New Users (0-5 saved recipes):**
```
Hero Section:
"Find recipes on Instagram, TikTok, YouTube, or your favorite blogs
→ Share them to Pantry App
→ Instantly see what you can make with your pantry"

[Tutorial Card: How to Save Recipes]
[Example: "Try saving from Instagram"]

Optional: 30-50 Curated Starter Recipes
- Manually extracted one-time (3-4 hours work or $20 Spoonacular API)
- Categories: Pantry Staples, Quick Meals, Use-Up-Leftovers
- Proves the concept without ongoing curation costs
```

**For Established Users (10+ saved recipes):**
```
Section 1: "From Your Pantry" (Personalized)
- Recommendations from saved recipes based on pantry match
- Uses existing recommendationEngine.ts (no LLM cost)
- Sorting: High match % first, expiring ingredients boost

Section 2: "Your Collection"
- Recently saved
- Frequently cooked
- High rated
- By category/cuisine

Section 3: "Save More"
- Tutorial reminder
- Quick access to paste URL
```

**Empty State Messaging:**
```
"Your recipe collection is empty!

Here's how to start:
1. Find a recipe on Instagram, YouTube, or TikTok
2. Tap Share → Pantry App
3. We'll extract the ingredients automatically
4. See what you can make with your pantry!

[Watch Tutorial] [Paste Recipe URL]"
```

---

## III. Meal Planning Strategy

### A. Free Tier: Manual Planning (No LLM Cost)

**Core Features (All Free):**

1. **7-Day Calendar View**
   - Grid layout: Days × Meal slots (Breakfast, Lunch, Dinner, Snacks)
   - Drag-and-drop recipes from "Your Recipes" section
   - Duplicate/copy recipes across days
   - Visual pantry match indicators

2. **Shopping List Generation**
   - Aggregate all ingredients from planned meals
   - Check against pantry inventory
   - Output: "Need to buy" list
   - One-tap copy to shopping app
   - Cost: $0 (database queries only)

3. **Pantry Match Intelligence**
   - For each planned meal: "You have 8/10 ingredients (80%)"
   - Highlight missing items
   - Suggest swaps from pantry
   - Cost: $0 (existing recommendationEngine.ts)

4. **Nutritional Totals**
   - Sum calories, protein, carbs, fat per day
   - Weekly totals and averages
   - Cost: $0 (if ingredient nutrition data exists)

5. **Serving Size Adjustment**
   - Scale recipes (2 servings → 4 servings)
   - Update ingredient amounts
   - Update shopping list
   - Cost: $0 (multiplication)

**User Flow:**
```
1. User opens Meal Planning tab
2. Sees empty 7-day calendar
3. Taps "Add Meal" on Monday Dinner
4. Browses their saved recipes
5. Selects "Chicken Stir Fry"
6. Recipe appears on calendar with pantry match: 85%
7. Repeats for other days
8. Taps "Generate Shopping List"
9. App shows: "You need 12 items. 8 are missing from your pantry."
10. Add to shopping list
11. Done
```

**Why This Works Without LLM:**
- Manual planning is intuitive (users do this mentally already)
- No AI needed for drag-and-drop
- Shopping list generation is simple aggregation
- Pantry matching uses existing database queries
- Clear value even without AI automation

**Comparison to Competitors:**

| App | Free Manual Planning | Premium AI Planning | Price |
|-----|---------------------|-------------------|-------|
| Mealime | ❌ Must pick from 200 recipes | ✅ Custom plans | $6/mo |
| Plan to Eat | ❌ 30-day trial only | Required | $5/mo |
| Paprika | ✅ Full manual planning | ❌ No AI | $5 one-time |
| **Pantry App** | ✅ Full manual + pantry match | ✅ AI generation | Free / $4.99 |

**Positioning:** Better than competitors even in free tier (pantry matching unique).

---

### B. Premium Tier: AI-Assisted Planning (LLM-Powered)

**Premium Features:**

1. **"Generate Weekly Plan" Button**
```
User taps button → AI generates full week based on:
- Pantry contents (prioritize what you have)
- Expiring ingredients (use first)
- Dietary preferences (vegan, low-carb, etc.)
- Cooking time constraints (weeknight <30min)
- Past favorites (meal history + ratings)
- Variety (different cuisines, cooking methods)

Output:
- 7 days × 1-3 meals = 10-20 meals planned
- Reasoning for each: "Uses expiring spinach, takes 25min, you rated 5⭐"
- Editable (user can swap/remove)
```

**LLM Prompt Structure:**
```typescript
const prompt = `
You are a meal planning assistant. Generate a 7-day meal plan.

Context:
Pantry items: ${JSON.stringify(pantryItems)}
Expiring soon: ${JSON.stringify(expiringItems)}
User's saved recipes: ${JSON.stringify(userRecipes)}
Dietary preferences: ${userPreferences}
Cooking time constraint: ${maxCookTime} minutes on weeknights
Past favorites: ${highRatedRecipes}

Requirements:
- Prioritize recipes using expiring ingredients
- Balance variety (different cuisines, proteins, cooking methods)
- Weeknight dinners: <${maxCookTime} minutes
- Weekend: Can be longer/more complex
- Use user's saved recipes when possible
- Minimize shopping (maximize pantry usage)

Output JSON:
{
  "monday": {
    "dinner": {
      "recipe_id": "uuid-123",
      "recipe_title": "Chicken Stir Fry",
      "rationale": "Uses expiring bell peppers, takes 25 min, you rated 5⭐ last time"
    }
  },
  ...
}
`;
```

**Cost Analysis:**
```
Prompt size: ~3k tokens (pantry + recipes + context)
Response: ~1.5k tokens (JSON output)
Total: ~4.5k tokens

Gemini Flash 2.0 pricing:
Input: $0.075 per 1M tokens = $0.000075 per 1k tokens
Output: $0.30 per 1M tokens = $0.0003 per 1k tokens

Cost per generation:
- Input: 3k × $0.000075 = $0.000225
- Output: 1.5k × $0.0003 = $0.00045
Total: ~$0.0007 per plan

With buffer/complexity: ~$0.001-0.003 per plan
Conservative estimate: $0.01 per generation
```

**Realistic Usage:**
```
Average premium user:
- Generates 1-2 meal plans per week
- 4-8 plans per month
- Cost: 8 × $0.01 = $0.08/user/month

10,000 users, 15% premium (1,500):
- 1,500 × $0.08 = $120/month LLM cost
- Revenue: 1,500 × $4.99 = $7,485/month
- Profit: $7,365/month
- Margin: 98%
```

**✅ Highly sustainable**

2. **Smart Suggestions**
```
AI analyzes pantry + history and suggests:
- "Your spinach expires in 2 days. Try Spinach & Feta Pasta (saved recipe)"
- "You haven't cooked Italian in 2 weeks. How about Margherita Pizza?"
- "Quick meal tonight? You have ingredients for 3 recipes under 20 min"

Cost: ~$0.001-0.005 per suggestion batch
Frequency: 1-2x per week (user opens meal planning tab)
```

3. **Meal Plan Optimization**
```
User creates manual plan → AI reviews and suggests:
- "Swap Tuesday's recipe to use expiring mushrooms"
- "Move Friday's slow-cooked meal to Sunday for better time management"
- "Your plan is missing vegetables. Add Roasted Veggie Bowl?"

Cost: ~$0.005 per optimization
Frequency: Optional, user-initiated
```

---

### C. Why Meal Planning Works Despite LLM Costs

**Key Points:**

1. **Manual planning is fully functional (free)**
   - No degraded experience
   - Not a "lite" version
   - Actually useful on its own
   - Clear upgrade path

2. **AI is a convenience upgrade, not a requirement**
   - Free users can achieve same outcome (planned meals + shopping list)
   - Premium just makes it faster/easier
   - Value proposition: "Save 20 minutes, let AI do it"

3. **LLM costs are sustainable at premium pricing**
   - $0.08/user/month LLM cost
   - $4.99/month revenue
   - 98% margin even with LLM

4. **Natural upsell moment**
   - User plans manually a few times
   - Realizes it takes 10-15 minutes
   - Sees "Generate with AI" button (premium)
   - Converts for convenience

---

## IV. Monetization Structure

### A. Free Tier

**Recipe Management:**
```
✅ Save unlimited cached recipes (already extracted by others)
   - Cost: $0
   - Most popular recipes cached within weeks
   - 70-80% of saves after month 6

✅ Save unlimited Schema.org recipes (structured data sites)
   - Cost: $0.0002 per extraction (minimal LLM cleaning)
   - ~15-20% of recipe sites

✅ 10 extraction credits per month (NEW social media extractions)
   - For Instagram/TikTok/YouTube videos not in cache
   - Cost: $0.004 per extraction
   - Monthly cost: 10 × $0.004 = $0.04 per user
   - Covers 95% of users' needs

✅ Manual recipe entry (unlimited)
   - Cost: $0
   - For cookbooks, family recipes, handwritten notes

✅ Watch ads to earn credits (optional)
   - Rewarded video ad: +5 credits
   - User choice, not forced
   - Revenue: $0.015 per ad view
   - Profitable: $0.015 > $0.004 × 5 = $0.02 (covers cost)
```

**Pantry & Shopping:**
```
✅ Unlimited pantry items
✅ Receipt scanning (unlimited)
✅ Expiration tracking
✅ Shopping list generation (unlimited)
✅ Pantry match intelligence (unlimited)
✅ Household sharing
```

**Meal Planning:**
```
✅ Unlimited manual planning (drag-and-drop calendar)
✅ 7-day calendar view
✅ Shopping list aggregation from meal plans
✅ Pantry match for planned meals
✅ Nutrition totals
✅ Serving size adjustments

❌ AI meal plan generation (premium only)
❌ Smart suggestions (premium only)
```

**Limits:**
```
⚠️ 10 NEW recipe extractions per month
   - Cached recipes don't count (unlimited)
   - Schema.org recipes don't count (unlimited)
   - Can earn +5 credits by watching ads (unlimited)

⚠️ No AI meal planning
   - Manual planning fully functional
```

---

### B. Premium Tier ($4.99/month or $49/year)

**Recipe Management:**
```
✅ Everything in Free tier
✅ Unlimited extraction credits (no limits on NEW extractions)
✅ Priority processing (faster extractions)
✅ Batch import (paste multiple URLs at once)
✅ Advanced organization (custom tags, folders, collections)
```

**Meal Planning:**
```
✅ AI meal plan generation
   - "Generate Weekly Plan" button
   - Customizable constraints (dietary, time, variety)
   - Uses pantry + expiring items + preferences

✅ Smart suggestions
   - "Use expiring ingredients" alerts
   - Recipe recommendations based on pantry
   - Cooking time optimization

✅ Meal plan optimization
   - AI reviews manual plans
   - Suggests improvements
   - Ingredient usage optimization
```

**Analytics & Insights:**
```
✅ Advanced pantry analytics
   - Waste tracking (expired items)
   - Cost analysis (spending trends)
   - Usage patterns (frequently used items)

✅ Nutrition tracking
   - Weekly/monthly nutrition trends
   - Goal setting (protein, calories)
   - Dietary compliance reports

✅ Cooking history insights
   - Frequently cooked recipes
   - Favorite cuisines
   - Time-saving opportunities
```

**Premium Features Summary:**
```
Headline: "Save unlimited recipes instantly, no ads, AI plans your meals"

Value props:
1. Unlimited extractions (no credit limits)
2. Instant processing (no waits)
3. AI meal planning (save 20 minutes/week)
4. Advanced analytics (reduce waste, save money)
5. Priority support
```

---

### C. Rewarded Ads System (Free Tier Revenue)

**How It Works:**

1. **User Hits Credit Limit**
```
User tries to save 11th NEW recipe in a month:

Dialog appears:
┌─────────────────────────────────────┐
│ You've used your 10 free credits!   │
│                                      │
│ Choose an option:                    │
│                                      │
│ 🎥 Watch ad for +5 credits (30 sec) │
│ ⭐ Upgrade to Premium (unlimited)   │
│ ⏳ Wait until next month            │
└─────────────────────────────────────┘

User choice distribution (estimated):
- 60% watch ad (earn credits)
- 30% upgrade to premium
- 10% wait/churn
```

2. **Rewarded Video Ad**
```
User chooses "Watch ad":
1. Ad loads (AdMob/IronSource/AppLovin)
2. User watches 15-30 second video
3. Ad completes successfully
4. User receives +5 credits instantly
5. Can save more recipes

User experience:
- Clear value exchange (watch ad = get credits)
- User consent (not forced)
- Immediate reward (instant credits)
- Fair trade-off
```

3. **Ad Network Economics**
```
Rewarded Video CPM: $10-25 (high because guaranteed completion)
Average CPM: $15
Revenue per view: $15 ÷ 1000 = $0.015

LLM extraction cost: $0.004 per recipe
Credits granted: 5
Credits cost: 5 × $0.004 = $0.02

Profit per ad: $0.015 revenue - $0.02 cost = -$0.005 (loss)

BUT: Ad covers 75% of cost ($0.015 / $0.02 = 75%)
Net cost per ad: $0.005 instead of $0.02
Reduction: 75% cheaper than pure LLM cost
```

**Why Accept a Small Loss on Ads?**
```
Retention value:
- User who watches ads stays engaged
- Stays in ecosystem
- Eventually converts to premium (30% conversion at limit)
- LTV calculation:
  - Free user: $0 revenue, $0.05 cost/month = -$0.60/year
  - With ads: $0.045 revenue (3 ads), $0.065 cost = -$0.24/year (60% cheaper)
  - Premium conversion: 30% × $4.99 × 12 = $17.96/user/year

Expected LTV:
- 70% stay free with ads: -$0.24 × 0.7 = -$0.17
- 30% convert to premium: $59.88 × 0.3 = $17.96
Net LTV: $17.79 per user

✅ Profitable even with ad subsidies
```

4. **Ad Implementation Notes**
```
Ad network: AdMob (best React Native integration)
Ad format: Rewarded Video (highest CPM)
Ad frequency: Unlimited (user-initiated, not spammy)
Fill rate: 70-80% (industry average)
Fallback: If ad fails to load, grant 1 credit as apology

User messaging:
✅ "Watch a short ad to earn 5 credits"
✅ "Ads help keep Pantry App free"
❌ Never: "Please watch this ad" (sounds desperate)
```

---

### D. Pricing Strategy

**Premium Tier Options:**

1. **Monthly: $4.99**
   - No commitment
   - Cancel anytime
   - Try before annual

2. **Annual: $49.99 ($4.17/mo, 17% discount)**
   - Upfront payment
   - Higher LTV
   - Reduces churn

**Competitor Pricing:**
```
Paprika: $5 one-time (no subscription, no AI)
Mealime: $6/month (limited recipe DB, AI planning)
Plan to Eat: $5/month (manual planning only)
Yummly: Free with ads / $5/month premium
Whisk: Free (limited) / $6/month

Positioning:
- More features than Paprika (AI, pantry matching)
- Cheaper than Mealime ($4.99 vs $6)
- Better value than Plan to Eat (AI + pantry)
- Unique features (pantry match, receipt scan)

$4.99 is sweet spot: Premium feel, competitive pricing
```

**Promotional Pricing:**
```
Launch offer: First month $0.99
Annual early bird: $39.99 ($3.33/mo)
Household plan: $7.99/mo (2-5 users, 40% savings)
```

---

### E. Financial Projections

**Scenario: 10,000 Users (8,500 Free, 1,500 Premium @ 15% conversion)**

**Free Tier Costs:**
```
Month 1 (building cache):
- 8,500 users × 10 credits × $0.004 = $340

Month 3 (50% cache hits):
- 8,500 users × 5 new extractions × $0.004 = $170

Month 6+ (80% cache hits):
- 8,500 users × 2 new extractions × $0.004 = $68

Average ongoing: $100-150/month
```

**Free Tier Revenue (Ads):**
```
40% of free users hit credit limit (3,400 users)
60% watch ads instead of upgrading (2,040 users)
Average 2.5 ads per month
2,040 × 2.5 × $0.015 = $76.50/month

Net free tier cost: $100 - $76.50 = $23.50/month
```

**Premium Tier Costs:**
```
Recipe extractions:
- 1,500 users × 20 extractions/month × $0.004 = $120

AI meal planning:
- 1,500 users × 6 plans/month × $0.01 = $90

Total premium costs: $210/month
```

**Premium Tier Revenue:**
```
1,500 users × $4.99 = $7,485/month
Annual: $89,820
```

**Total Monthly:**
```
Costs:
- Free tier: $23.50
- Premium tier: $210
Total: $233.50/month

Revenue:
- Free ads: $76.50
- Premium: $7,485
Total: $7,561.50/month

Profit: $7,328/month ($87,936/year)
Margin: 97%
```

**✅ Highly sustainable and profitable**

**Sensitivity Analysis:**

| Conversion Rate | Premium Users | Monthly Revenue | Monthly Cost | Profit | Margin |
|----------------|---------------|-----------------|--------------|--------|--------|
| 5% | 500 | $2,495 | $233 | $2,262 | 91% |
| 10% | 1,000 | $4,990 | $233 | $4,757 | 95% |
| 15% | 1,500 | $7,485 | $233 | $7,252 | 97% |
| 20% | 2,000 | $9,980 | $233 | $9,747 | 98% |

**Break-even: <3% premium conversion**

Even at pessimistic 5% conversion, profit margin is 91%.

---

## V. Technical Implementation Requirements

### A. Database Schema Additions

**User Credits Table:**
```sql
CREATE TABLE user_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  credits_remaining INT DEFAULT 10,
  credits_reset_at TIMESTAMP DEFAULT NOW() + INTERVAL '1 month',
  total_credits_used INT DEFAULT 0,
  total_ads_watched INT DEFAULT 0,
  is_premium BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Recipe Cache Table:**
```sql
CREATE TABLE recipe_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_url TEXT UNIQUE NOT NULL,
  cook_card_id UUID REFERENCES cook_cards(id),
  is_public BOOLEAN DEFAULT TRUE,
  extraction_cost_cents INT,
  cache_hits INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_recipe_cache_url ON recipe_cache(source_url);
```

**Ad Events Table:**
```sql
CREATE TABLE ad_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  ad_network TEXT, -- 'admob', 'ironsource', etc.
  ad_type TEXT, -- 'rewarded_video'
  credits_granted INT,
  revenue_cents INT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### B. Extraction Service Updates

**Current Flow:**
```typescript
// pantry-app/src/services/cookCardService.ts
export async function extractCookCard(url, userId, householdId) {
  // Direct call to extract-cook-card edge function
  const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-cook-card`, ...);
  return response.json();
}
```

**New Flow with Caching + Credits:**
```typescript
export async function extractCookCard(url, userId, householdId, options?) {
  // Step 1: Check cache
  const cached = await checkRecipeCache(url);
  if (cached && !options?.bypassCache) {
    console.log('✅ Cache hit, copying to user collection');
    await copyCookCardToUser(cached.cook_card_id, userId, householdId);
    await incrementCacheHit(cached.id);
    return {
      cook_card: cached.cook_card,
      cache_status: 'cached',
      credits_used: 0
    };
  }

  // Step 2: Check if user has credits (unless premium)
  const userCredits = await getUserCredits(userId);
  if (!userCredits.is_premium && userCredits.credits_remaining <= 0) {
    throw new Error('INSUFFICIENT_CREDITS');
  }

  // Step 3: Attempt extraction
  const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-cook-card`, {
    method: 'POST',
    body: JSON.stringify({ url, user_id: userId, household_id: householdId })
  });

  const data = await response.json();

  // Step 4: Deduct credits (unless premium)
  if (!userCredits.is_premium) {
    await deductCredit(userId);
  }

  // Step 5: Add to cache for future users
  await addToRecipeCache(url, data.cook_card.id, data.extraction.cost_cents);

  return {
    ...data,
    cache_status: 'fresh',
    credits_used: 1
  };
}
```

**Helper Functions:**
```typescript
async function checkRecipeCache(url: string) {
  const { data } = await supabase
    .from('recipe_cache')
    .select('*, cook_card:cook_cards(*)')
    .eq('source_url', url)
    .eq('is_public', true)
    .single();
  return data;
}

async function getUserCredits(userId: string) {
  const { data } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .single();

  // Reset credits if month has passed
  if (data && new Date(data.credits_reset_at) < new Date()) {
    await supabase
      .from('user_credits')
      .update({
        credits_remaining: 10,
        credits_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      })
      .eq('user_id', userId);
    data.credits_remaining = 10;
  }

  return data || { credits_remaining: 10, is_premium: false };
}

async function deductCredit(userId: string) {
  await supabase.rpc('deduct_user_credit', { p_user_id: userId });
}
```

**SQL Function:**
```sql
CREATE OR REPLACE FUNCTION deduct_user_credit(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE user_credits
  SET
    credits_remaining = GREATEST(credits_remaining - 1, 0),
    total_credits_used = total_credits_used + 1,
    updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
```

### C. UI Components

**Credit Display (Header):**
```tsx
// pantry-app/src/components/CreditsBadge.tsx
export const CreditsBadge: React.FC = () => {
  const { user } = useAuth();
  const [credits, setCredits] = useState(10);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    fetchUserCredits();
  }, []);

  if (isPremium) {
    return (
      <View style={styles.premiumBadge}>
        <Ionicons name="star" size={16} color="#FFD700" />
        <Text style={styles.premiumText}>Premium</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.creditsBadge}
      onPress={() => navigation.navigate('Credits')}
    >
      <Ionicons name="ticket" size={16} color="#10B981" />
      <Text style={styles.creditsText}>{credits} credits</Text>
    </TouchableOpacity>
  );
};
```

**Insufficient Credits Dialog:**
```tsx
// pantry-app/src/components/InsufficientCreditsDialog.tsx
export const InsufficientCreditsDialog: React.FC<{
  visible: boolean;
  onWatchAd: () => void;
  onUpgrade: () => void;
  onCancel: () => void;
}> = ({ visible, onWatchAd, onUpgrade, onCancel }) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>You've used your 10 free credits!</Text>
          <Text style={styles.subtitle}>
            Credits reset monthly. Choose an option:
          </Text>

          {/* Watch Ad Option */}
          <TouchableOpacity style={styles.adButton} onPress={onWatchAd}>
            <Ionicons name="play-circle" size={24} color="#3B82F6" />
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Watch ad for +5 credits</Text>
              <Text style={styles.optionSubtitle}>30 seconds</Text>
            </View>
          </TouchableOpacity>

          {/* Premium Option */}
          <TouchableOpacity style={styles.premiumButton} onPress={onUpgrade}>
            <Ionicons name="star" size={24} color="#FFD700" />
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Upgrade to Premium</Text>
              <Text style={styles.optionSubtitle}>Unlimited credits, $4.99/mo</Text>
            </View>
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};
```

**Rewarded Ad Implementation:**
```typescript
// pantry-app/src/services/adService.ts
import { AdMobRewarded } from 'expo-ads-admob';

export async function showRewardedAd(): Promise<boolean> {
  try {
    await AdMobRewarded.setAdUnitID('ca-app-pub-xxxxx'); // Your AdMob ID
    await AdMobRewarded.requestAdAsync();
    await AdMobRewarded.showAdAsync();

    return new Promise((resolve) => {
      AdMobRewarded.addEventListener('rewardedVideoUserDidEarnReward', () => {
        resolve(true);
      });
      AdMobRewarded.addEventListener('rewardedVideoDidDismiss', () => {
        resolve(false);
      });
    });
  } catch (error) {
    console.error('Ad error:', error);
    return false;
  }
}

export async function grantCreditsForAd(userId: string) {
  await supabase.rpc('grant_ad_credits', {
    p_user_id: userId,
    p_credits: 5
  });

  await supabase.from('ad_events').insert({
    user_id: userId,
    ad_network: 'admob',
    ad_type: 'rewarded_video',
    credits_granted: 5
  });
}
```

**SQL Function:**
```sql
CREATE OR REPLACE FUNCTION grant_ad_credits(p_user_id UUID, p_credits INT)
RETURNS VOID AS $$
BEGIN
  UPDATE user_credits
  SET
    credits_remaining = credits_remaining + p_credits,
    total_ads_watched = total_ads_watched + 1,
    updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
```

---

## VI. Launch Roadmap

### Phase 1: Core Features (Weeks 1-4)
```
✅ Recipe extraction with caching
✅ Credit system (10/month free)
✅ Manual recipe entry
✅ Pantry matching
✅ Shopping list generation
✅ Basic meal planning (manual drag-and-drop calendar)

Technical:
- Database schema updates (credits, cache)
- Extract-cook-card edge function optimization
- Cache-first extraction flow
- Credit tracking UI
```

### Phase 2: Monetization (Weeks 5-6)
```
✅ Rewarded ad integration (AdMob)
✅ Premium subscription (RevenueCat/Stripe)
✅ Paywall UI
✅ Insufficient credits dialog
✅ Premium features gating

Technical:
- AdMob setup
- Subscription management
- Feature flags (is_premium checks)
```

### Phase 3: AI Features (Weeks 7-8)
```
✅ AI meal plan generation (premium)
✅ Smart suggestions (premium)
✅ Meal plan optimization (premium)

Technical:
- Gemini Flash integration
- Prompt engineering
- Cost tracking
```

### Phase 4: Polish & Launch (Weeks 9-10)
```
✅ Onboarding flow
✅ Tutorial videos
✅ Empty states
✅ Error handling
✅ Analytics (Mixpanel/Amplitude)
✅ Beta testing (TestFlight/Play Console)
✅ App Store submission
```

---

## VII. Key Success Metrics

**Acquisition:**
- App Store/Play Store installs
- Share extension usage rate
- Recipe extraction success rate

**Activation:**
- % users who save 1+ recipes (Day 1)
- % users who complete pantry setup (Day 1-3)
- % users who create meal plan (Week 1)

**Retention:**
- D1, D7, D30 retention
- Weekly active users (WAU)
- Monthly active users (MAU)

**Monetization:**
- Free → Premium conversion rate (target: 15%)
- Ad revenue per free user (target: $0.50/month)
- Premium LTV (target: $50-60/year)
- Churn rate (target: <5%/month)

**Engagement:**
- Recipes saved per user (target: 25+)
- Meal plans created per week (target: 0.5+)
- Shopping lists generated per week (target: 1+)
- Pantry items tracked (target: 30+)

**Revenue Targets:**
```
Month 1: $500 (100 premium @ $4.99)
Month 3: $2,000 (400 premium)
Month 6: $5,000 (1,000 premium)
Month 12: $10,000 (2,000 premium)
```

---

## VIII. Risk Analysis & Mitigation

### Risk 1: Low Premium Conversion (<5%)
**Mitigation:**
- Free tier genuinely useful (not crippled)
- Clear premium value (AI saves time)
- Trial period (7 days free premium)
- Referral incentives (free month for referrals)

### Risk 2: High Extraction Costs (Cache doesn't work)
**Mitigation:**
- Start with strict credit limits (5/month)
- Monitor cache hit rates
- Optimize extraction pipeline
- Increase premium pricing if needed

### Risk 3: Users Don't Watch Ads
**Mitigation:**
- Make ads optional (not forced)
- Clear value exchange (credits for watch)
- Fallback to manual entry
- Promote premium as better option

### Risk 4: Recipe Extraction Quality Issues
**Mitigation:**
- Multi-tier extraction (Schema.org → Vision)
- User feedback loop ("Was this correct?")
- Manual editing tools
- Community corrections

### Risk 5: Competition (Established Apps)
**Mitigation:**
- Unique features (pantry match + receipt scan)
- Better pricing ($4.99 vs $6+)
- Modern UI/UX
- Social sharing features

---

## IX. Conclusion & Recommendation

### Summary

**The app does NOT need a traditional recipe database to succeed.**

Instead, position as a **"Personal Recipe Organizer + Pantry Intelligence Platform"** where:
1. Users bring recipes from social media/web (their existing behavior)
2. App provides intelligence (pantry matching, shopping lists, meal planning)
3. Differentiation is pantry features, not recipe discovery

**Monetization is sustainable:**
- Free tier: 10 credits/month + unlimited cached + ads
- Premium: $4.99/month for unlimited + AI features
- Break-even at <3% premium conversion
- Target 15% conversion = 97% profit margin

**Technical complexity is manageable:**
- Caching reduces costs by 70-80% over time
- Extraction pipeline already exists
- Meal planning uses existing pantry data
- AI features are additive, not required

### Go/No-Go Decision

**✅ GO** if you can accept:
- Slower initial growth (no viral recipe discovery)
- Manual curation of 30-50 starter recipes
- 3-6 months to build recipe cache
- 10-15% premium conversion target

**❌ NO-GO** if you believe:
- Recipe discovery is essential at launch
- Free tier must have unlimited extractions
- AI features must be free
- Can't build 30-50 starter recipes

### Final Recommendation

**Launch with this strategy:**

1. Position as recipe organizer, not discovery
2. Implement credit system (10/month free)
3. Build recipe cache aggressively
4. Curate 30-50 starter recipes
5. Premium at $4.99 with AI features
6. Target 15% conversion

**This is the most realistic path to a sustainable, profitable launch given:**
- Recipe database extraction challenges (7% success)
- LLM cost constraints
- Competitive landscape
- Your unique strengths (pantry matching, receipt scanning)

---

**Document Version:** 1.0
**Last Updated:** 2025-10-25
**Author:** Strategic Planning Session
**Status:** Ready for Review
