# Pantry App - React Native Mobile Application

## 📱 Overview
Smart pantry inventory management app with OCR receipt scanning, shopping lists, and recipe discovery.

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
├── documents/         # Project documentation
└── archive/           # Archived code and prototypes
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

### ✅ Implemented
- **Authentication**: Email/password with Supabase Auth
- **Inventory Management**: Track items by location (fridge/freezer/pantry)
- **Shopping Lists**: Create and manage shopping lists
- **Receipt OCR**: Scan receipts with Gemini AI parsing
- **Profile Management**: User settings and preferences
- **Sync System**: Smart sync with offline support

### 🚧 In Progress
- **Purchase History**: Track spending and patterns
- **Smart Analytics**: Price tracking and predictions

### 📋 Planned
- **Recipe Management**: Enhanced recipe features
- **Meal Planning**: Weekly meal planning
- **Barcode Scanning**: Quick item addition
- **Multi-household**: Support for multiple households

## 🏗️ Architecture

### State Management
- Zustand for local state
- Supabase for remote sync
- AsyncStorage for persistence

### Sync Strategy
- **Lite Mode**: 5-minute periodic sync
- **Smart Mode**: Real-time when co-shopping
- **Offline Queue**: Actions queued when offline

### OCR Pipeline
1. On-device text extraction (Google Cloud Vision)
2. Edge Function parsing (Gemini 2.0 Flash)
3. Fix Queue for review
4. Purchase history tracking

## 📊 Database Schema

See `documents/complete_data_schema.sql` for full schema. Key tables:
- `profiles` - User profiles
- `households` - Household groups
- `pantry_items` - Inventory items
- `shopping_lists` & `shopping_list_items`
- `receipts` & `receipt_fix_queue`
- `purchase_history` - Analytics

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
- **State**: Zustand + AsyncStorage
- **Auth**: Supabase Auth

## 📚 Documentation

Key documents in `documents/`:
- [CLAUDE.md](documents/CLAUDE.md) - AI assistant instructions
- [complete_data_schema.sql](documents/complete_data_schema.sql) - Database schema
- [data-model.md](documents/data-model.md) - Data model documentation
- [deprecated/](documents/deprecated/) - Archived documentation

## 📈 Roadmap

1. ✅ Core inventory management
2. ✅ Authentication & profiles
3. ✅ Shopping lists
4. ✅ Receipt OCR with purchase history
5. 🚧 Smart analytics & predictions
6. 📋 Enhanced recipe management
7. 📋 Meal planning

## 🤝 Contributing

1. Create feature branch
2. Make changes
3. Test on both platforms
4. Submit PR with description

## 📄 License

Private project - All rights reserved

---

**Version**: 1.0.0-beta
**Last Updated**: January 2025
