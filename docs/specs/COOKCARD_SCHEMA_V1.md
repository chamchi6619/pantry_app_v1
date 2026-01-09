# CookCard v1.0 Schema Documentation

**Version:** 1.0.0
**Status:** Active
**Last Updated:** 2025-10-07
**Owner:** Engineering

---

## Overview

The CookCard schema defines the data format for social recipe metadata extracted from Instagram, TikTok, YouTube, and web recipe sites. It supports **fail-closed extraction** with per-field confidence and provenance tracking.

**Design Principles:**
1. **Never silently invent data** - All uncertain fields require user confirmation
2. **Always link back to creator** - Legal compliance and attribution
3. **Track extraction provenance** - For quality gates and debugging
4. **Support substitutions** - With explicit rationale, not black-box recommendations

---

## Core Schema

### CookCard Object

```typescript
interface CookCard {
  // Metadata
  id: string;                          // UUID
  version: "1.0";                      // Schema version

  // Source Attribution (REQUIRED)
  source: {
    url: string;                       // Original post URL
    platform: "instagram" | "tiktok" | "youtube" | "web";
    creator: {
      handle: string;                  // @username or channel name
      name?: string;                   // Display name
      avatar_url?: string;             // Profile pic from oEmbed
      verified?: boolean;              // Platform verification badge
    };
  };

  // Recipe Metadata
  title: string;
  description?: string;
  image_url?: string;                  // Thumbnail from oEmbed (NOT rehosted)

  // Time Estimates (optional)
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  total_time_minutes?: number;
  servings?: number;

  // Instructions Handling
  instructions: {
    type: "link_only" | "creator_provided" | "user_notes";
    text?: string;                     // Only if creator explicitly provided
    steps?: InstructionStep[];         // Structured if available
  };

  // Ingredients with Provenance
  ingredients: Ingredient[];

  // Extraction Metadata
  extraction: {
    method: "metadata" | "creator_text" | "llm_assisted" | "user_manual";
    confidence: number;                // 0.0 - 1.0 (overall)
    version: string;                   // Ladder version (e.g., "L2-regex")
    timestamp: string;                 // ISO 8601
    cost_cents?: number;               // LLM cost for Gate 4
  };

  // User Interaction (for Ship Gates)
  user_data?: {
    confirm_taps: number;              // Gate 1: Quality metric
    edited: boolean;
    times_cooked: number;
    last_cooked_at?: string;           // ISO 8601
    is_favorite: boolean;
  };

  // Compliance Flags
  compliance?: {
    flagged: boolean;
    reason?: string;                   // "copyright" | "ToS" | "dietary_safety"
  };

  // Timestamps
  created_at: string;                  // ISO 8601
  updated_at: string;                  // ISO 8601
}
```

### Ingredient Object

```typescript
interface Ingredient {
  // Ingredient Data
  name: string;                        // Raw extracted name
  normalized_name?: string;            // For canonical matching
  canonical_item_id?: string;          // Links to pantry system

  // Quantities (nullable - not all posts include amounts)
  amount?: number;
  unit?: string;                       // "cup", "tbsp", "oz", "g", etc.
  preparation?: string;                // "diced", "minced", "chopped fine"

  // Provenance (per-ingredient)
  confidence: number;                  // 0.0 - 1.0
  provenance: "creator_provided" | "detected" | "user_edited" | "substitution";

  // Pantry Matching
  in_pantry?: boolean;                 // Calculated at query time
  is_substitution?: boolean;
  substitution_for?: string;           // Original ingredient name
  substitution_rationale?: string;     // "Greek yogurt ↔ sour cream: similar fat/protein"

  // Grouping
  group?: string;                      // "For the sauce", "For garnish"
  sort_order?: number;
  is_optional?: boolean;
}
```

### Instruction Step Object

```typescript
interface InstructionStep {
  step_number: number;
  text: string;
  timestamp?: number;                  // Seconds into video (if applicable)
  duration?: number;                   // Seconds for this step
}
```

---

## Extraction Confidence Levels

| Confidence | Color Chip | User Action Required | Examples |
|------------|------------|----------------------|----------|
| **≥0.95** | Green | None | oEmbed metadata, creator-provided JSON |
| **0.80-0.94** | Green | None | Regex-matched ingredients from caption |
| **0.60-0.79** | Amber | Confirm before saving | Partial regex match, ambiguous units |
| **<0.60** | Red | Must edit or discard | LLM guess, no creator text available |

**Fail-Closed Rule:** If ANY ingredient has confidence <0.80, show amber banner and require user confirmation before allowing "Add to Shopping List."

---

## JSON Examples

### Example 1: High-Confidence Instagram Recipe

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "version": "1.0",
  "source": {
    "url": "https://www.instagram.com/p/ABC123/",
    "platform": "instagram",
    "creator": {
      "handle": "halfbakedharvest",
      "name": "Tieghan Gerard",
      "avatar_url": "https://instagram.fcdn.net/...",
      "verified": true
    }
  },
  "title": "Brown Butter Sage Pasta",
  "description": "Quick 20-minute pasta with crispy sage and nutty brown butter. Perfect weeknight dinner!",
  "image_url": "https://instagram.fcdn.net/v/t51.../photo.jpg",
  "prep_time_minutes": 5,
  "cook_time_minutes": 15,
  "total_time_minutes": 20,
  "servings": 4,
  "instructions": {
    "type": "link_only"
  },
  "ingredients": [
    {
      "name": "pasta",
      "normalized_name": "pasta",
      "canonical_item_id": "c1e4a89f-...",
      "amount": 1,
      "unit": "lb",
      "confidence": 0.98,
      "provenance": "creator_provided",
      "in_pantry": true,
      "sort_order": 1
    },
    {
      "name": "butter",
      "normalized_name": "butter",
      "canonical_item_id": "d2f5b90g-...",
      "amount": 0.5,
      "unit": "cup",
      "confidence": 0.98,
      "provenance": "creator_provided",
      "in_pantry": false,
      "sort_order": 2
    },
    {
      "name": "fresh sage",
      "normalized_name": "sage",
      "canonical_item_id": "e3g6c01h-...",
      "amount": 10,
      "unit": "leaves",
      "confidence": 0.95,
      "provenance": "detected",
      "in_pantry": false,
      "sort_order": 3
    },
    {
      "name": "parmesan cheese",
      "normalized_name": "parmesan",
      "canonical_item_id": "f4h7d12i-...",
      "amount": 0.5,
      "unit": "cup",
      "preparation": "grated",
      "confidence": 0.92,
      "provenance": "detected",
      "in_pantry": true,
      "sort_order": 4
    }
  ],
  "extraction": {
    "method": "creator_text",
    "confidence": 0.96,
    "version": "L2-regex",
    "timestamp": "2025-10-07T14:23:45Z",
    "cost_cents": 0
  },
  "user_data": {
    "confirm_taps": 0,
    "edited": false,
    "times_cooked": 0,
    "is_favorite": false
  },
  "created_at": "2025-10-07T14:23:45Z",
  "updated_at": "2025-10-07T14:23:45Z"
}
```

### Example 2: Low-Confidence TikTok Recipe (Requires Confirmation)

```json
{
  "id": "661f9511-f30c-52e5-b827-557766551111",
  "version": "1.0",
  "source": {
    "url": "https://www.tiktok.com/@user/video/123456",
    "platform": "tiktok",
    "creator": {
      "handle": "tastyfoods",
      "name": "Tasty Foods",
      "avatar_url": "https://p16-sign-va.tiktokcdn.com/..."
    }
  },
  "title": "Viral Feta Pasta",
  "description": "The TikTok pasta everyone's making!",
  "image_url": "https://p16-sign.tiktokcdn.com/.../cover.jpg",
  "cook_time_minutes": 30,
  "servings": 4,
  "instructions": {
    "type": "link_only"
  },
  "ingredients": [
    {
      "name": "feta cheese",
      "amount": 8,
      "unit": "oz",
      "confidence": 0.72,
      "provenance": "detected",
      "in_pantry": false,
      "sort_order": 1
    },
    {
      "name": "cherry tomatoes",
      "amount": 2,
      "unit": "cups",
      "confidence": 0.68,
      "provenance": "detected",
      "in_pantry": false,
      "sort_order": 2
    },
    {
      "name": "pasta",
      "confidence": 0.55,
      "provenance": "detected",
      "in_pantry": true,
      "sort_order": 3
    },
    {
      "name": "olive oil",
      "confidence": 0.82,
      "provenance": "detected",
      "in_pantry": true,
      "sort_order": 4
    }
  ],
  "extraction": {
    "method": "llm_assisted",
    "confidence": 0.67,
    "version": "L3-gemini-flash",
    "timestamp": "2025-10-07T15:10:22Z",
    "cost_cents": 1.2
  },
  "user_data": {
    "confirm_taps": 3,
    "edited": true,
    "times_cooked": 0,
    "is_favorite": false
  },
  "created_at": "2025-10-07T15:10:22Z",
  "updated_at": "2025-10-07T15:12:08Z"
}
```

### Example 3: YouTube Recipe with Timestamps

```json
{
  "id": "772ga622-g41d-63f6-c938-668877662222",
  "version": "1.0",
  "source": {
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "platform": "youtube",
    "creator": {
      "handle": "BonAppetitTest",
      "name": "Bon Appétit Test Kitchen",
      "avatar_url": "https://yt3.googleusercontent.com/...",
      "verified": true
    }
  },
  "title": "The Perfect Chocolate Chip Cookies | From the Test Kitchen",
  "description": "Our perfected recipe for chewy, golden cookies.",
  "image_url": "https://i.ytimg.com/vi/.../maxresdefault.jpg",
  "prep_time_minutes": 15,
  "cook_time_minutes": 12,
  "servings": 24,
  "instructions": {
    "type": "creator_provided",
    "steps": [
      {
        "step_number": 1,
        "text": "Cream butter and sugars until light and fluffy",
        "timestamp": 45,
        "duration": 30
      },
      {
        "step_number": 2,
        "text": "Add eggs one at a time, then vanilla",
        "timestamp": 120,
        "duration": 25
      },
      {
        "step_number": 3,
        "text": "Fold in dry ingredients until just combined",
        "timestamp": 180,
        "duration": 40
      }
    ]
  },
  "ingredients": [
    {
      "name": "all-purpose flour",
      "amount": 2.25,
      "unit": "cups",
      "confidence": 0.99,
      "provenance": "creator_provided",
      "canonical_item_id": "a1b2c3d4-...",
      "in_pantry": true,
      "sort_order": 1
    },
    {
      "name": "unsalted butter",
      "amount": 1,
      "unit": "cup",
      "preparation": "softened",
      "confidence": 0.99,
      "provenance": "creator_provided",
      "canonical_item_id": "b2c3d4e5-...",
      "in_pantry": false,
      "sort_order": 2
    },
    {
      "name": "chocolate chips",
      "amount": 2,
      "unit": "cups",
      "confidence": 0.99,
      "provenance": "creator_provided",
      "canonical_item_id": "c3d4e5f6-...",
      "in_pantry": false,
      "sort_order": 3
    }
  ],
  "extraction": {
    "method": "creator_text",
    "confidence": 0.99,
    "version": "L1-oembed",
    "timestamp": "2025-10-07T16:30:00Z",
    "cost_cents": 0
  },
  "user_data": {
    "confirm_taps": 0,
    "edited": false,
    "times_cooked": 2,
    "last_cooked_at": "2025-10-06T19:45:00Z",
    "is_favorite": true
  },
  "created_at": "2025-10-05T10:15:00Z",
  "updated_at": "2025-10-06T19:45:00Z"
}
```

---

## Validation Rules

### Required Fields
- `id`, `version`, `source.url`, `source.platform`, `title`, `ingredients` (at least 1)
- `extraction.method`, `extraction.confidence`, `extraction.timestamp`

### Constraints
- `version` must be `"1.0"` (for this schema version)
- `source.platform` must be one of: `instagram`, `tiktok`, `youtube`, `web`
- `extraction.confidence` must be `0.0 - 1.0`
- Each `ingredient.confidence` must be `0.0 - 1.0`
- `instructions.type` must be one of: `link_only`, `creator_provided`, `user_notes`
- `source.url` must be a valid URL (unique per user)

### Optional but Recommended
- `servings`, `prep_time_minutes`, `cook_time_minutes` (for better UX)
- `image_url` (improves engagement)
- `canonical_item_id` for each ingredient (enables pantry matching)

---

## Versioning & Changelog

### v1.0 (2025-10-07)
- Initial schema release
- Support for 4 platforms: Instagram, TikTok, YouTube, web
- Per-ingredient confidence tracking
- Substitution support with rationale
- Extraction provenance metadata
- Ship gate metrics integration

### Future Versions (Planned)

**v1.1** (anticipated Q1 2026):
- Add `dietary_tags` array (vegan, gluten-free, etc.)
- Add `cuisine` field (Italian, Mexican, etc.)
- Add `equipment` array (stand mixer, food processor, etc.)

**v1.2** (anticipated Q2 2026):
- Add `nutrition` object (calories, protein, fat, carbs)
- Add `allergen_warnings` array
- Add `substitutions` array with pre-calculated alternatives

---

## Creator Kit Integration

Creators can publish structured CookCard JSON via Google Sheets export:

### Google Sheet Template

| Column | Required | Type | Example |
|--------|----------|------|---------|
| title | ✅ | Text | "Brown Butter Sage Pasta" |
| description | ❌ | Text | "Quick 20-minute pasta..." |
| source_url | ✅ | URL | https://instagram.com/p/ABC123 |
| servings | ❌ | Number | 4 |
| prep_time_minutes | ❌ | Number | 5 |
| cook_time_minutes | ❌ | Number | 15 |
| ingredients | ✅ | JSON Array | `[{"name": "pasta", "amount": 1, "unit": "lb"}, ...]` |
| steps | ❌ | JSON Array | `[{"step_number": 1, "text": "Boil water"}, ...]` |

### Export Script

```javascript
// Google Apps Script to export CookCard JSON
function exportToCookCardJSON() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();

  // Transform to CookCard schema
  const cookCard = {
    version: "1.0",
    source: {
      url: data[1][2], // source_url column
      platform: detectPlatform(data[1][2]),
      creator: {
        handle: Session.getActiveUser().getEmail().split('@')[0],
        name: data[1][0] // Creator name from sheet
      }
    },
    title: data[1][0],
    description: data[1][1],
    servings: data[1][3],
    prep_time_minutes: data[1][4],
    cook_time_minutes: data[1][5],
    ingredients: JSON.parse(data[1][6]),
    instructions: {
      type: "creator_provided",
      steps: JSON.parse(data[1][7] || "[]")
    },
    extraction: {
      method: "user_manual",
      confidence: 1.0,
      version: "creator-kit-v1",
      timestamp: new Date().toISOString()
    }
  };

  // Download as JSON
  const blob = Utilities.newBlob(JSON.stringify(cookCard, null, 2), 'application/json', 'cookcard.json');
  DriveApp.createFile(blob);
}
```

---

## API Reference

### Save CookCard

**Endpoint:** `POST /api/cook-cards`

**Request Body:**
```json
{
  "cook_card": { /* CookCard JSON */ }
}
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "saved",
  "requires_confirmation": false,
  "pantry_match": {
    "have": 2,
    "need": 2,
    "match_percentage": 50
  }
}
```

### Get CookCard

**Endpoint:** `GET /api/cook-cards/:id`

**Response:** Full CookCard JSON

### Update CookCard (User Edits)

**Endpoint:** `PATCH /api/cook-cards/:id`

**Request Body:**
```json
{
  "ingredients": [
    {
      "name": "pasta",
      "amount": 1.5,
      "unit": "lb",
      "provenance": "user_edited"
    }
  ]
}
```

**Response:** Updated CookCard JSON

---

## Ship Gate Metrics

The schema directly supports the 4 ship gates:

| Gate | Relevant Fields | Calculation |
|------|----------------|-------------|
| **Gate 1: Quality** | `extraction.confidence`, `user_data.confirm_taps` | avg_taps ≤2.0 AND p95_confidence ≥0.80 |
| **Gate 2: Conversion** | `user_data.times_cooked`, `created_at` | save→cook ≥20% within 7 days |
| **Gate 3: Compliance** | `compliance.flagged`, `compliance.reason` | 0 violations in 200-save audit |
| **Gate 4: Economics** | `extraction.cost_cents`, `extraction.method` | <$0.015/save AND <0.4 LLM calls/URL |

---

## References

- **PRD:** `COOKCARD_PRD_V1.md` (complete product spec)
- **Database Schema:** `supabase/migrations/003_create_cook_card_schema.sql`
- **Gate Instrumentation:** `supabase/migrations/004_create_gate_instrumentation.sql`
- **TypeScript Types:** `pantry-app/src/types/CookCard.ts` (to be created)

---

**Questions or feedback?** Open an issue in the repository or contact the engineering team.
