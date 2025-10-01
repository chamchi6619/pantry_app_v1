# Pantry App v1 - Full Stack Project

## 📂 Project Structure

```
pantry_app_v1/
├── pantry-app/          # React Native mobile app (main application)
├── backend/             # Python FastAPI backend (for OCR and other services)
├── src/                 # Web prototype (React + Vite) - reference only
├── supabase/            # Supabase configuration and migrations
├── documents/           # Project documentation
└── complete_data_schema.sql  # Complete database schema
```

## 🚀 Quick Start

### Mobile App (Main Application)
```bash
cd pantry-app
npm install
npm start
```
See [pantry-app/README.md](pantry-app/README.md) for detailed setup.

### Backend (Optional - for OCR)
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

## 📱 Current Status

- ✅ **Mobile App**: React Native with Expo
- ✅ **Authentication**: Supabase Auth integrated
- ✅ **Database**: Supabase PostgreSQL
- ✅ **Sync System**: Smart sync with offline support
- 🚧 **OCR System**: Migrating to Supabase Edge Functions
- 📋 **Purchase History**: Architecture complete, implementation pending

## 📚 Documentation

Key documents in `documents/`:
- [CLAUDE.md](documents/CLAUDE.md) - AI assistant instructions
- [IMPLEMENTATION_OVERVIEW.md](documents/IMPLEMENTATION_OVERVIEW.md) - Technical overview
- [SUPABASE_MIGRATION_STATUS.md](documents/SUPABASE_MIGRATION_STATUS.md) - Migration progress
- [BACKEND_TESTING_CHECKLIST.md](documents/BACKEND_TESTING_CHECKLIST.md) - Testing guide

## 🔑 Environment Variables

Create `.env` files in:
- `pantry-app/.env` - Mobile app configuration
- `backend/.env` - Backend configuration (if using)

## 🧪 Test Accounts

- test1@pantry.app / test1234
- test2@pantry.app / test1234
- test3@pantry.app / test1234

## 🛠️ Technology Stack

- **Frontend**: React Native + Expo
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **OCR**: ML Kit (on-device) + Gemini 2.5 Flash
- **State**: Zustand + AsyncStorage
- **Auth**: Supabase Auth

## 📈 Roadmap

1. ✅ Core inventory management
2. ✅ Authentication & profiles
3. ✅ Shopping lists
4. 🚧 Receipt OCR with purchase history
5. 📋 Smart analytics & predictions
6. 📋 Recipe management
7. 📋 Meal planning

---

**Version**: 1.0.0-beta
**Last Updated**: December 2024