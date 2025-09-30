# Pantry App - React Native Mobile Application

## 📱 Overview
Smart pantry inventory management app with OCR receipt scanning, shopping lists, and recipe discovery.

## 📁 Project Structure

```
pantry-app/
├── src/                      # Source code
│   ├── components/          # Reusable components
│   ├── contexts/           # React contexts (Auth, etc.)
│   ├── core/              # Core utilities and constants
│   ├── features/          # Feature modules
│   │   ├── auth/         # Authentication
│   │   ├── inventory/    # Inventory management
│   │   ├── profile/      # User profile
│   │   ├── receipt/      # Receipt OCR
│   │   ├── recipes/      # Recipe features
│   │   └── shopping/     # Shopping lists
│   ├── lib/              # External library configs
│   ├── navigation/       # App navigation
│   ├── screens/          # Screen components
│   ├── services/         # API and services
│   └── stores/           # State management
├── documents/            # Documentation
│   ├── RECEIPT_OCR_PLAN.md      # OCR architecture
│   ├── PROJECT_STATUS.md        # Current status
│   └── ...                      # Other docs
├── scripts/              # Utility scripts
│   ├── verify_user.js           # User verification
│   ├── check_*.js               # Database checks
│   └── cleanup_*.js             # Cleanup utilities
├── assets/               # Images, fonts, etc.
├── android/             # Android-specific code
├── ios/                 # iOS-specific code
└── supabase/           # Supabase functions & migrations
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
- **Profile Management**: User settings and preferences
- **Sync System**: Smart sync with offline support

### 🚧 In Progress
- **Receipt OCR**: On-device ML Kit + Gemini parsing
- **Purchase History**: Track spending and patterns
- **Smart Analytics**: Price tracking and predictions

### 📋 Planned
- **Recipe Management**: Save and organize recipes
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
1. On-device text extraction (ML Kit - FREE)
2. Edge Function parsing (Gemini 2.5 Flash)
3. Fix Queue for review
4. Purchase history tracking

## 📊 Database Schema

See `complete_data_schema.sql` for full schema. Key tables:
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
- Ensure ML Kit packages are installed
- Check Gemini API key in Edge Function
- Verify `receipt_fix_queue` table name

## 📚 Documentation

- [Receipt OCR Architecture](documents/RECEIPT_OCR_PLAN.md)
- [Project Status](documents/PROJECT_STATUS.md)
- [Integration Guide](documents/INTEGRATION_COMPLETE.md)

## 🤝 Contributing

1. Create feature branch
2. Make changes
3. Test on both platforms
4. Submit PR with description

## 📄 License

Private project - All rights reserved

---

**Last Updated**: December 2024
**Version**: 1.0.0-beta