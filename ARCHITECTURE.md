# Pantry App Architecture

**Last Updated:** 2025-10-03

## 🏗️ System Architecture

```
Mobile App (React Native + Expo)
  ↓
Supabase (Backend-as-a-Service)
  ├── Edge Functions (Deno/TypeScript)
  │   └── parse-receipt-gemini (ACTIVE - Gemini 2.0 Flash AI)
  └── PostgreSQL Database
      ├── recipes (1,328+ rows)
      ├── recipe_ingredients (11,521+ rows)
      ├── canonical_items (506 rows)
      ├── receipts (101+ rows)
      ├── receipt_fix_queue (747+ rows)
      ├── pantry_items
      └── households
```

## 📱 Core Services

### Recipe System
- **Service**: Direct Supabase queries via `recipeServiceSupabase.ts`
- **Canonical Items**: Synced from Supabase (506 items from 58k recipe CSV)
- **Matching**: Client-side pantry matching with cached canonical items
- **No backend needed**: All queries go directly to Supabase PostgreSQL

### Receipt Parsing
- **Active Parser**: `parse-receipt-gemini` Edge Function **ONLY**
- **AI Model**: Google Gemini 2.0 Flash
- **Features**:
  - Smart price matching (handles "You Pay" discounts)
  - Item name normalization (ORG→Organic, CHKN→Chicken)
  - Quantity extraction from weight lines
  - Auto-categorization (dairy, produce, meat, etc.)
  - Receipt validation (rejects non-receipts)
- **Cost**: ~$0.01-0.03 per receipt
- **Accuracy**: 90-95%

### Deprecated/Unused Services
- ❌ **Python FastAPI Backend** - Removed (was redundant)
- ❌ **parse-receipt-hybrid** Edge Function - Not used (Gemini is better)
- ❌ **parse-receipt** (store-specific) Edge Function - Not used (Gemini handles all stores)

## 🗄️ Data Flow

### Recipe Browsing
```
User opens Recipes tab
  → App queries Supabase: recipes + recipe_ingredients
  → Client-side matching with canonical_items cache
  → Display recipes sorted by match %
```

### Receipt Scanning
```
User scans receipt
  → OCR extracts text (device camera + OCR library)
  → Call Supabase Edge Function: parse-receipt-gemini
  → Gemini AI parses items + prices
  → Saves to: receipts + receipt_fix_queue tables
  → User reviews in Fix Queue screen
  → Approved items → Added to pantry_items
```

### Pantry Management
```
User adds/updates items
  → Direct Supabase insert/update to pantry_items
  → Real-time sync via Supabase subscriptions
  → Local state managed by Zustand store
```

## 🔑 Key Design Decisions

1. **Why Supabase over Python backend?**
   - Supabase Edge Functions handle all server-side logic
   - Built-in auth, real-time, storage, database
   - Serverless scaling, no infrastructure management
   - Lower cost than running Python server

2. **Why Gemini over pattern-based parsing?**
   - Handles ANY receipt format (Costco, Safeway, Walmart, etc.)
   - Smart price matching for complex discount formats
   - Better accuracy (90%+ vs 75-85%)
   - Worth the $0.02/receipt cost for quality

3. **Why client-side recipe matching?**
   - Faster (no network roundtrip)
   - Works offline with cached canonical items
   - Reduces server load
   - User privacy (pantry items don't leave device)

## 📊 Database Schema (Key Tables)

### recipes
- `id` (uuid)
- `title`, `description`, `instructions`
- `total_time_minutes`, `servings`
- `image_url`, `source`, `attribution_text`
- **1,328+ recipes** from USDA MyPlate + TheMealDB

### recipe_ingredients
- `recipe_id` (foreign key)
- `ingredient_name`, `normalized_name`
- `amount`, `unit`, `preparation`
- **11,521+ ingredient entries**

### canonical_items
- `canonical_name`, `aliases[]`
- `category`, `typical_unit`, `typical_location`
- `is_perishable`, `typical_shelf_life_days`
- **506 items** extracted from 58k recipe CSV by frequency (98% coverage)

### receipt_fix_queue
- User reviews parsed receipt items here
- `parsed_name`, `price_cents`, `confidence`
- `resolved`, `linked_item_id` (links to pantry_items)

## 🚀 Performance Optimizations

1. **Canonical Items Caching**
   - Loaded once on app start
   - Cached in AsyncStorage
   - Auto-sync every 24 hours
   - Enables offline recipe matching

2. **Recipe Query Optimization**
   - Pagination (limit 50 per query)
   - Index on `title`, `total_time_minutes`
   - Client-side filtering for categories

3. **Receipt Deduplication**
   - SHA-256 content hash
   - Checks `receipt_jobs` table before parsing
   - Returns cached result if duplicate found

## 📈 Scalability

- **Recipes**: Can handle 10k+ recipes (currently 1,328)
- **Canonical Items**: 506 items, can scale to 1,000+
- **Receipts**: Unlimited (serverless Edge Functions)
- **Database**: Supabase free tier = 500MB (using <20MB currently)

## 🔒 Security

- Row-Level Security (RLS) enabled on all tables
- Household-based isolation
- JWT authentication via Supabase Auth
- Edge Functions use service role key (server-side only)

---

**Note**: This architecture eliminates all Python backend dependencies. Everything runs on Supabase (Edge Functions + PostgreSQL) with direct client queries from React Native.
