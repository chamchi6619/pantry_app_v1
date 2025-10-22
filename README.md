# Pantry App - Smart Pantry + Social Recipe Bridge

## 📱 Overview
The only recipe app that knows what you ALREADY HAVE. Combines pantry inventory management with social recipe discovery - see YouTube/TikTok/IG recipes you can cook right now with what's in your pantry.

**Current Phase:** Phase 3 Complete - Personalized Recommendation Engine ✅
**See:** [PROJECT_STATUS.md](PROJECT_STATUS.md) for current state and next steps.

## 📂 Project Structure

```
pantry_app_v1/
├── pantry-app/          # React Native mobile app (main application)
│   ├── src/            # Source code
│   │   ├── features/  # Feature modules
│   │   ├── stores/    # State management
│   │   ├── services/  # API and services
│   │   └── navigation/
│   ├── assets/        # Images, fonts, etc.
│   └── scripts/       # Utility scripts
├── backend/            # Python FastAPI backend (for OCR services)
├── supabase/          # Supabase configuration and migrations
├── docs/              # Project documentation
│   ├── specs/        # Technical specifications
│   ├── guides/       # Implementation guides
│   ├── phase-reports/# Phase completion reports
│   └── archive/      # Deprecated documentation
└── README.md          # This file
```

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ (18.19 works with warnings)
- npm or yarn
- Expo CLI
- iOS Simulator (Mac) or Android Emulator

### Installation
```bash
# Install dependencies
cd pantry-app
npm install

# Install iOS pods (Mac only)
cd ios && pod install && cd ..
```

### Environment Setup
1. Copy `.env.example` to `.env`
2. Add your Supabase credentials:
```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### Running the App
```bash
# Start development server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android

# Run with tunnel (for device testing)
npx expo start --tunnel
```

## 🔑 Key Features

### ✅ Core Features (Live)
- **Pantry Inventory**: Track items by location (fridge/freezer/pantry)
- **Receipt OCR**: Scan receipts with Gemini AI (parse items, prices, categories)
- **Shopping Lists**: Create and manage lists with recipe tracking
- **Purchase History**: Cost tracking and price analytics
- **Profile Management**: User settings and preferences

### ✅ Cook Card System (Phase 1 & 2 - Complete)
- **Multi-Platform Recipe Import**: Paste Instagram/TikTok/YouTube/Web recipe links
- **Universal Extraction**: Traditional recipes (schema.org) + social media (transcript/vision)
- **Hybrid Extraction Ladder**: L1→L2→L3 quality ladder for best results
- **Smart Fallback**: Transcript → Vision API → Instructions-only modes
- **Cost Optimization**: $0.03-0.11 per recipe extraction

### ✅ Personalized Recommendations (Phase 3 - Complete)
- **Pantry Match Intelligence**: "8/10 ingredients in your pantry"
- **Smart Scoring Algorithm**: Prioritizes expiring items, highly-rated recipes, variety
- **Meal History Tracking**: Track what you cook and rate recipes (1-5 stars)
- **Hybrid Discovery**: Toggle between "Your Recipes" (saved) and "Discover New" (YouTube)
- **Zero Variable Cost**: $0.00 per recommendation (database queries only)

### 📋 Planned (Phase 4+)
- **Enhanced Analytics**: Most cooked recipes, favorite cuisines, waste reduction metrics
- **Smart Notifications**: Remind users to use expiring ingredients
- **Weekly Meal Planning**: Plan meals based on pantry + preferences
- **Household Sharing**: Collaborative pantry + shared recipes

## 🏗️ Architecture

### State Management
- Zustand for local state
- Supabase for remote sync
- AsyncStorage for persistence

### Sync Strategy
- **Lite Mode**: 5-minute periodic sync
- **Smart Mode**: Real-time when co-shopping
- **Offline Queue**: Actions queued when offline

### Recipe Extraction Pipeline
1. **L1 - Metadata**: Schema.org structured data (traditional recipes)
2. **L2 - Transcript**: Video transcripts + regex parsing (social media)
3. **L3 - Vision AI**: Gemini Flash vision analysis (fallback)
4. **Hybrid Mode**: Automatically selects best extraction method

### Recommendation Engine
1. Fetch user's saved Cook Cards with ingredients
2. Match ingredients to pantry items (canonical matching)
3. Score recipes based on:
   - Ingredient completeness (0-1)
   - Expiring ingredients (+30% boost)
   - Older pantry items (+15% boost)
   - Never cooked before (+5% boost)
   - Recent cooking penalty (-50%)
   - High ratings (+20% boost)
4. Sort by match score and return top N

## 📊 Database Schema

See `supabase/migrations/` for full schema. Key tables:
- `profiles` - User profiles
- `households` - Household groups
- `pantry_items` - Inventory items
- `shopping_lists` & `shopping_list_items` - Shopping with recipe tracking
- `receipts` & `receipt_fix_queue` - OCR pipeline
- `purchase_history` - Analytics
- `cook_cards` - Saved recipes (multi-platform)
- `cook_card_ingredients` - Recipe ingredients with canonical matching
- `meal_history` - Cooking sessions with ratings (Phase 3)
- `canonical_items` - Normalized ingredient names

## 🧪 Testing

### Test Utilities
```bash
# Verify user setup
node scripts/verify_user.js test@example.com

# Check database sync
node scripts/check_sync_status.js

# Clean up test data
node scripts/cleanup_test_accounts.js
```

### Test Accounts
- test1@pantry.app / test1234
- test2@pantry.app / test1234
- test3@pantry.app / test1234

## 🐛 Common Issues

### Loading Screen Hang
- Check `isInitialized` state in AuthContext
- Verify profile creation trigger

### Sync Errors
- ID mismatch between local and remote
- Reload app to refresh IDs
- Use manual sync button

### Receipt OCR
- Ensure Gemini API key is configured
- Check Edge Function logs
- Verify `receipt_fix_queue` table name

## 🛠️ Technology Stack

- **Frontend**: React Native + Expo
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **OCR**: Google Cloud Vision + Gemini 2.0 Flash
- **Recipe Extraction**: yt-dlp + Gemini Vision API
- **State**: Zustand + AsyncStorage
- **Auth**: Supabase Auth

## 📚 Documentation

### Core Documentation (Root)
- **[README.md](README.md)** - This file (project overview)
- **[PROJECT_STATUS.md](PROJECT_STATUS.md)** - Current state and next steps ⭐ **READ THIS FIRST**
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture overview
- **[IMPLEMENTATION_PLAN_V2.md](IMPLEMENTATION_PLAN_V2.md)** - Phase 1-3 implementation plan

### Specifications (`docs/specs/`)
- **[COOKCARD_SCHEMA_V1.md](docs/specs/COOKCARD_SCHEMA_V1.md)** - Cook Card data structure
- **[COOKCARD_PRD_V1.md](docs/specs/COOKCARD_PRD_V1.md)** - Product requirements
- **[L3_IMPLEMENTATION_SPEC.md](docs/specs/L3_IMPLEMENTATION_SPEC.md)** - Vision API extraction
- **[CANONICAL_LINKING_GUIDE.md](docs/specs/CANONICAL_LINKING_GUIDE.md)** - Ingredient matching

### Implementation Guides (`docs/guides/`)
- **[L2_QUALITY_STUDY_GUIDE.md](docs/guides/L2_QUALITY_STUDY_GUIDE.md)** - YouTube quality testing
- **[TESTING_TRADITIONAL_RECIPES.md](docs/guides/TESTING_TRADITIONAL_RECIPES.md)** - Traditional recipe testing
- **[ASR_OCR_FUTURE_IMPLEMENTATION.md](docs/guides/ASR_OCR_FUTURE_IMPLEMENTATION.md)** - Future enhancements

### Phase Reports (`docs/phase-reports/`)
- **[PHASE_1_COMPLETE.md](docs/phase-reports/PHASE_1_COMPLETE.md)** - Traditional recipe extraction
- **[PHASE_3_COMPLETE.md](docs/phase-reports/PHASE_3_COMPLETE.md)** - Recommendation engine backend
- **[PHASE_3_UI_INTEGRATION_COMPLETE.md](docs/phase-reports/PHASE_3_UI_INTEGRATION_COMPLETE.md)** - UI integration
- **[FRONTEND_INTEGRATION_AUDIT.md](docs/phase-reports/FRONTEND_INTEGRATION_AUDIT.md)** - Integration audit

### Archived Documentation (`docs/archive/`)
See `docs/archive/` for deprecated implementation docs, analyses, and completed feature reports.

## 📈 Roadmap

### ✅ Completed (Phase 0-3)
1. ✅ Core inventory management (pantry, fridge, freezer)
2. ✅ Authentication & profiles (Supabase Auth)
3. ✅ Shopping lists (create, edit, share)
4. ✅ Receipt OCR (Gemini AI parsing, 90%+ accuracy)
5. ✅ Purchase history tracking (cost analytics)
6. ✅ Multi-platform recipe extraction (YouTube/IG/TikTok/Web)
7. ✅ Hybrid extraction ladder (L1→L2→L3)
8. ✅ Pantry match intelligence (canonical matching)
9. ✅ Personalized recommendation engine
10. ✅ Meal history tracking with ratings
11. ✅ "Your Recipes" vs "Discover New" toggle

### 🚧 In Progress (Phase 4)
12. 🚧 Enhanced analytics dashboard
13. 🚧 Smart notifications for expiring items
14. 🚧 Recipe photos in cooking history

### 📋 Next Up (Phase 5+)
15. 📋 Weekly meal planning with drag-and-drop
16. 📋 Household sharing (collaborative pantry)
17. 📋 Embedded video player (in-app preview)
18. 📋 Curated playlists (top 20 hero recipes)
19. 📋 Freemium paywall (5 saves/mo free, $10/mo Pro)

## 🤝 Contributing

1. Create feature branch
2. Make changes
3. Test on both platforms
4. Submit PR with description

## 📄 License

Private project - All rights reserved

---

**Version**: 1.3.0 (Phase 3 Complete)
**Last Updated**: January 17, 2025
**Status**: Production Ready ✅
