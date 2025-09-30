# Pantry Pal - React Native Mobile App

## 🚨 CRITICAL: Current State
- We have a WEB PROTOTYPE in /src (React + Vite) - DO NOT MODIFY, reference only
- The ACTUAL APP is in /pantry-app (React Native + Expo)
- Web prototype demonstrates UI/UX but we're building React Native from scratch
- Currently: Basic Expo setup complete, no features implemented yet

## 📱 Project Overview
Smart pantry inventory management app with OCR receipt scanning, shopping lists, and recipe discovery.
- **Target Platforms**: iOS & Android via React Native/Expo
- **PRD Version**: v1.1 (MVP-Aligned) - Sep 18, 2025
- **North Star Metric**: % weekly active households with up-to-date inventory (≤7 days) AND ≥1 action

## 🏗️ Architecture Decisions

### ✅ Decided:
- **Platform**: React Native with Expo SDK 54
- **TypeScript**: Strict mode enabled
- **Package Manager**: npm

### 🔄 To Be Decided (Discuss before implementing):
- **Navigation**: [TBD - React Navigation vs Expo Router]
- **State Management**: [TBD - Redux Toolkit vs Zustand vs Context]
- **Backend**: [TBD - Supabase vs Firebase vs Custom API]
- **Local Storage**: [TBD - AsyncStorage vs MMKV vs SQLite]
- **Styling**: [TBD - NativeWind vs Styled Components vs StyleSheet]
- **Forms**: [TBD - React Hook Form vs Formik]
- **Testing**: [TBD - Jest + RTL, Detox vs Maestro for E2E]

## 🎯 MVP Features Priority (from PRD v1.1)

### Phase 1 - Core Inventory
1. Storage location views (All/Fridge/Freezer/Pantry tabs)
2. Section headers with counts and emoji indicators
3. Item line layout with categories and expiry indicators
4. Quantity controls (+/- buttons with units)
5. Tap-to-edit item functionality

### Phase 2 - Data Management
1. Item Editor with location selector
2. Category management (chips + suggestions)
3. Measurements system (lb, oz, fl oz, g, ml, pieces, bunch, pack)
4. Data persistence (local first, sync later)

### Phase 3 - Shopping & Scanning
1. Shopping List with category grouping
2. Status filters (Not purchased/Completed/All)
3. Fix Queue for OCR scan results
4. Receipt scanning integration

### Phase 4 - Auth & Polish
1. Email/password authentication
2. Social login (Google, Facebook, Apple)
3. Performance optimization (p50 ≤2.0s, p95 ≤3.5s)
4. Polish and animations

## ⚡ Commands

```bash
# Navigation
cd pantry-app                # Navigate to React Native app

# Development
npm start                     # Start Expo development server
npm run ios                   # iOS simulator (Mac only)
npm run android              # Android emulator
npm run web                  # Web browser (development only)

# Code Quality (when configured)
npm run lint                 # Run ESLint
npm run lint:fix            # Fix ESLint issues
npm run typecheck           # TypeScript type checking
npm test                    # Run tests
npm run test:coverage       # Test coverage report

# Building (when configured)
eas build --platform ios    # iOS build
eas build --platform android # Android build
```

## 🚫 DO NOT (Critical)

1. **DO NOT** modify the web prototype in /src - it's UI reference only
2. **DO NOT** use web-specific packages (react-router-dom, react-dom, vite)
3. **DO NOT** implement features not specified in PRD v1.1
4. **DO NOT** use CSS files - use React Native StyleSheet or chosen styling solution
5. **DO NOT** commit without running lint and tests (once configured)
6. **DO NOT** use absolute positioning as primary layout method
7. **DO NOT** add complex animations before core functionality
8. **DO NOT** hardcode colors/dimensions - use theme constants
9. **DO NOT** fetch data in components - use services/hooks
10. **DO NOT** store sensitive data in AsyncStorage unencrypted

## ✅ ALWAYS

1. **ALWAYS** check PRD v1.1 before implementing any feature
2. **ALWAYS** use TypeScript with proper types (no 'any')
3. **ALWAYS** handle loading, error, and empty states
4. **ALWAYS** test on both iOS and Android before marking complete
5. **ALWAYS** use the measurement units from PRD (lb, oz, fl oz, pieces)
6. **ALWAYS** follow React Native best practices for performance
7. **ALWAYS** use Flexbox for layouts
8. **ALWAYS** implement accessibility (labels, hints, roles)
9. **ALWAYS** validate user input and show clear error messages
10. **ALWAYS** follow the established color scheme for locations

## 📁 Recommended Project Structure

```
pantry-app/
├── src/
│   ├── features/           # Feature-based modules
│   │   ├── inventory/
│   │   │   ├── components/
│   │   │   ├── screens/
│   │   │   ├── hooks/
│   │   │   └── types.ts
│   │   ├── shopping/
│   │   ├── auth/
│   │   ├── scanner/
│   │   └── recipes/
│   ├── components/         # Shared/common components
│   │   ├── ui/            # Base UI components
│   │   └── layout/        # Layout components
│   ├── navigation/        # Navigation configuration
│   ├── services/          # API and external services
│   ├── store/            # Global state management
│   ├── utils/            # Helper functions
│   ├── types/            # Global TypeScript types
│   └── constants/        # App constants and config
├── assets/               # Images, fonts, etc.
└── __tests__/           # Test files

```

## 🎨 Design System

### Colors
```typescript
const colors = {
  primary: '#10B981',      // Green-500 (Primary brand)
  fridge: '#3B82F6',       // Blue-500 with emoji ❄️
  freezer: '#06B6D4',      // Cyan-500 with emoji 🧊
  pantry: '#F59E0B',       // Amber-500 with emoji 🏺

  // Status colors
  expiringSoon: '#EF4444',  // Red-500 (≤7 days)
  expired: '#991B1B',       // Red-800
  fresh: '#10B981',         // Green-500

  // UI colors
  background: '#FFFFFF',
  surface: '#F9FAFB',
  border: '#E5E7EB',
  text: '#111827',
  textSecondary: '#6B7280'
}
```

### Spacing
Use multiples of 4: `4, 8, 12, 16, 20, 24, 32, 48, 64`

### Typography
- **Headings**: System font, semibold
- **Body**: System font, regular
- **Small**: 12px, Labels: 14px, Body: 16px, Title: 20px

## 📊 Performance Requirements (from PRD)

- **Scan→List Latency**: p50 ≤2.0s, p95 ≤3.5s
- **List Scroll**: Maintain 60fps
- **App Cold Start**: <2 seconds
- **Memory Usage**: <150MB typical
- **Offline Support**: Core features work offline

## 🧪 Testing Strategy

### Unit Tests
- Utils and helper functions
- Custom hooks
- Reducers/state logic

### Integration Tests
- API service methods
- State management flows
- Navigation flows

### Component Tests
- Critical UI components
- Form validations
- Interaction handlers

### E2E Tests (Key Flows)
- Complete onboarding
- Add/edit/delete inventory item
- Create shopping list from inventory
- Complete a purchase

## 📝 Data Models (from PRD)

```typescript
interface Item {
  id: string;
  household_id: string;
  location: 'fridge' | 'freezer' | 'pantry';
  name: string;
  categories: string;
  qty_numeric: number;
  unit: 'lb' | 'oz' | 'fl_oz' | 'g' | 'ml' | 'piece' | 'bunch' | 'pack' | 'other';
  expiry_date?: Date;
  status: string;
  confidence?: number;
  created_at: Date;
  updated_at: Date;
}

interface ShoppingListItem {
  id: string;
  household_id: string;
  label: string;
  qty_numeric: number;
  unit: string;
  category: string;
  status: 'pending' | 'done';
  linked_item_id?: string;
}

interface FixQueueEntry {
  id: string;
  raw_text: string;
  parsed_name: string;
  qty: number;
  unit: string;
  price?: number;
  categories: string;
  resolved: boolean;
  linked_item_id?: string;
}
```

## 🔄 Git Workflow

- **Branch naming**: `feature/[description]`, `fix/[description]`
- **Commit format**: `type(scope): message` (e.g., `feat(inventory): add item editor`)
- **PR required** for all changes to main
- **Types**: feat, fix, docs, style, refactor, test, chore

## 🐛 Known Issues & Blockers

- Node version warnings (requires 20.19.4+, have 18.19.1) - works but shows warnings
- No backend configured yet - using mock data
- [Add issues as discovered]

## 📚 Key References

- **PRD**: Review requirements before implementing any feature
- **Web Prototype**: `/src/App.tsx` - UI reference only, DO NOT MODIFY
- **Expo Docs**: https://docs.expo.dev/
- **React Native**: https://reactnative.dev/docs/getting-started

## 🚀 Deployment Checklist

- [ ] All tests passing
- [ ] No console errors/warnings
- [ ] Tested on real iOS device
- [ ] Tested on real Android device
- [ ] Performance metrics met
- [ ] Accessibility checked
- [ ] Assets optimized
- [ ] Environment variables configured
- [ ] Version number updated
- [ ] Release notes prepared

## 💡 Current Sprint Focus

**Sprint 1 (Current)**: Foundation Setup
- [x] Initialize Expo project
- [x] Set up TypeScript
- [x] Configure Git/GitHub
- [ ] Choose and configure navigation solution
- [ ] Choose and configure state management
- [ ] Create basic project structure
- [ ] Implement bottom tab navigation
- [ ] Create inventory screen shell

## 📈 Metrics to Track

- Time to first meaningful paint
- Inventory update latency
- Shopping list sync time
- Crash-free rate
- User session length
- Feature adoption rates

---

*Last Updated: Sep 18, 2025*
*PRD Version: v1.1 (MVP-Aligned)*