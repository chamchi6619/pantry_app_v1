# 🚀 Web-to-React Native Porting Plan
## Pantry Pal - Performance & Scalability Focused

---

## 📊 Executive Summary

Converting a React web prototype with 46+ shadcn/ui components into a high-performance React Native app requires systematic component mapping, architecture redesign, and performance-first implementation strategies.

**Key Metrics Target:**
- 60fps scrolling on lists with 1000+ items
- <2s cold start
- <150MB memory usage
- p50 ≤2.0s, p95 ≤3.5s for critical operations

---

## 🏗️ Recommended Tech Stack (Performance & Scalability)

### Core Architecture
```
Platform:        React Native 0.81.4 + Expo SDK 54
Navigation:      React Navigation 6 (proven, performant)
State:           Zustand 4.5+ (lightweight, 8KB vs Redux 60KB)
Local Storage:   MMKV (30x faster than AsyncStorage)
Backend:         Supabase (PostgreSQL, real-time, edge functions)
Styling:         StyleSheet + Themed constants (native performance)
Lists:           FlashList v2 (5x faster than FlatList)
Forms:           React Hook Form (minimal re-renders)
Testing:         Jest + React Native Testing Library + Maestro (E2E)
```

### Performance Justifications:
- **Zustand**: Less boilerplate, better tree-shaking, faster updates
- **MMKV**: Synchronous operations, encryption support, 30x faster
- **FlashList v2**: Cell recycling, automatic size calculation, 90% less JS thread usage
- **StyleSheet**: Native optimizations, better than runtime styling
- **React Hook Form**: Uncontrolled components = fewer re-renders

---

## 🔄 Component Mapping Strategy

### Web → React Native Component Map

| Web Component (shadcn/ui) | React Native Equivalent | Performance Notes |
|---------------------------|------------------------|-------------------|
| `<div>` | `<View>` | Use Flexbox by default |
| `<span>`, `<p>` | `<Text>` | Text must be in Text component |
| `<img>` | `<Image>` or `<FastImage>` | Use FastImage for caching |
| `<button>` | `<Pressable>` | Better than TouchableOpacity |
| `<input>` | `<TextInput>` | Controlled with debouncing |
| `Button` (shadcn) | Custom `Button` component | Pressable + haptic feedback |
| `Card` | Custom `Card` with View | Shadow via elevation (Android) |
| `Badge` | Custom `Badge` with View/Text | Memoized component |
| `Tabs` | `createMaterialTopTabNavigator` | Native tab performance |
| `Dialog/Modal` | React Native `Modal` | Use native modal |
| `Select/Dropdown` | `ActionSheetIOS` / Custom | Platform-specific |
| `Switch` | React Native `Switch` | Native component |
| `Progress` | Custom or `react-native-progress` | Animated.Value for smooth |
| `Separator` | View with borderBottom | Simple styling |
| Lucide Icons | `react-native-vector-icons` | Icon fonts, cached |

### Critical Performance Components

```typescript
// High-Performance List Component
import { FlashList } from "@shopify/flash-list";

const InventoryList = memo(({ items, location }) => {
  const renderItem = useCallback(({ item }) => (
    <ItemRow item={item} />
  ), []);

  return (
    <FlashList
      data={items}
      renderItem={renderItem}
      estimatedItemSize={80}
      keyExtractor={(item) => item.id}
      removeClippedSubviews
      maxToRenderPerBatch={10}
      windowSize={10}
      initialNumToRender={10}
      getItemType={(item) => item.location} // For better recycling
    />
  );
});
```

---

## 📁 Scalable Project Structure

```
pantry-app/
├── src/
│   ├── features/                 # Feature-first architecture
│   │   ├── inventory/
│   │   │   ├── components/
│   │   │   │   ├── ItemRow.tsx         # Memoized row component
│   │   │   │   ├── LocationTabs.tsx    # Tab selector
│   │   │   │   └── QuantityControl.tsx # +/- buttons
│   │   │   ├── screens/
│   │   │   │   ├── InventoryScreen.tsx
│   │   │   │   └── ItemEditorScreen.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useInventory.ts
│   │   │   │   └── useItemMutations.ts
│   │   │   ├── services/
│   │   │   │   └── inventoryApi.ts
│   │   │   └── store/
│   │   │       └── inventorySlice.ts
│   │   ├── shopping/
│   │   ├── auth/
│   │   └── scanner/
│   ├── core/                     # Shared infrastructure
│   │   ├── components/
│   │   │   ├── ui/              # Base UI components
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Badge.tsx
│   │   │   │   └── Input.tsx
│   │   │   └── layout/
│   │   │       └── ScreenContainer.tsx
│   │   ├── hooks/               # Global hooks
│   │   │   ├── useDebounce.ts
│   │   │   └── useKeyboard.ts
│   │   ├── services/            # Core services
│   │   │   ├── storage.ts       # MMKV wrapper
│   │   │   ├── api.ts          # API client
│   │   │   └── analytics.ts
│   │   └── utils/
│   │       ├── performance.ts   # Performance monitoring
│   │       └── theme.ts        # Theme constants
│   ├── navigation/
│   │   ├── RootNavigator.tsx
│   │   ├── TabNavigator.tsx
│   │   └── types.ts
│   └── store/
│       ├── index.ts             # Zustand store setup
│       └── persist.ts           # MMKV persistence
├── assets/
└── __tests__/
```

---

## 🎯 Porting Phases

### Phase 1: Foundation (Week 1)
```typescript
// 1. Set up navigation structure
// 2. Create theme system
// 3. Configure Zustand + MMKV
// 4. Build core UI components

// Example: Theme setup
export const theme = {
  colors: {
    primary: '#10B981',
    fridge: '#3B82F6',
    freezer: '#06B6D4',
    pantry: '#F59E0B',
  },
  spacing: {
    xs: 4, sm: 8, md: 16, lg: 24, xl: 32
  },
  typography: {
    h1: { fontSize: 24, fontWeight: '600' },
    body: { fontSize: 16, fontWeight: '400' }
  }
} as const;
```

### Phase 2: Core Features (Week 2-3)
```typescript
// 1. Inventory list with FlashList
// 2. Location tabs (All/Fridge/Freezer/Pantry)
// 3. Item components with quantity controls
// 4. Search and filters

// Example: Performant Inventory Store
import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();

interface InventoryStore {
  items: Item[];
  filters: FilterState;
  // Actions
  setItems: (items: Item[]) => void;
  updateQuantity: (id: string, delta: number) => void;
  // Computed
  getFilteredItems: (location?: string) => Item[];
}

export const useInventoryStore = create<InventoryStore>((set, get) => ({
  items: JSON.parse(storage.getString('items') || '[]'),
  filters: { location: 'all', category: null },

  setItems: (items) => {
    set({ items });
    storage.set('items', JSON.stringify(items));
  },

  updateQuantity: (id, delta) => {
    set((state) => ({
      items: state.items.map(item =>
        item.id === id
          ? { ...item, qty_numeric: Math.max(0, item.qty_numeric + delta) }
          : item
      )
    }));
  },

  getFilteredItems: (location) => {
    const { items } = get();
    if (!location || location === 'all') return items;
    return items.filter(i => i.location === location);
  }
}));
```

### Phase 3: Interactive Features (Week 4)
```typescript
// 1. Item Editor with optimistic updates
// 2. Shopping list with drag-to-reorder
// 3. Category management
// 4. Add/remove animations

// Example: Optimistic Update Pattern
const useUpdateItem = () => {
  const updateLocal = useInventoryStore(s => s.updateItem);

  return useMutation({
    mutationFn: async (item: Item) => {
      // Optimistic update
      updateLocal(item);
      // API call
      return await api.updateItem(item);
    },
    onError: (error, variables, context) => {
      // Rollback on error
      updateLocal(context.previousItem);
    }
  });
};
```

### Phase 4: Advanced Features (Week 5-6)
- Receipt scanning with OCR
- Fix Queue implementation
- Real-time sync with Supabase
- Push notifications
- Analytics integration

---

## ⚡ Performance Optimizations

### 1. List Performance
```typescript
// Use FlashList v2 with proper configuration
<FlashList
  data={items}
  renderItem={renderItem}
  estimatedItemSize={80}
  removeClippedSubviews
  drawDistance={200}
  recycleItems
  keyExtractor={keyExtractor}
/>
```

### 2. Image Optimization
```typescript
// Use FastImage for caching
import FastImage from 'react-native-fast-image';

<FastImage
  source={{ uri: item.image, priority: FastImage.priority.normal }}
  style={styles.image}
  resizeMode={FastImage.resizeMode.cover}
/>
```

### 3. Memoization Strategy
```typescript
// Memoize expensive computations
const ItemRow = memo(({ item, onPress, onQuantityChange }) => {
  return (
    <Pressable onPress={() => onPress(item.id)}>
      {/* Component JSX */}
    </Pressable>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return prevProps.item.id === nextProps.item.id &&
         prevProps.item.qty_numeric === nextProps.item.qty_numeric;
});
```

### 4. Navigation Optimization
```typescript
// Lazy load screens
const InventoryStack = lazy(() => import('./features/inventory'));

// Use React.lazy with Suspense
<Suspense fallback={<LoadingScreen />}>
  <InventoryStack />
</Suspense>
```

### 5. State Updates
```typescript
// Batch state updates
import { unstable_batchedUpdates } from 'react-native';

const handleMultipleUpdates = () => {
  unstable_batchedUpdates(() => {
    updateItem1();
    updateItem2();
    updateFilter();
  });
};
```

---

## 🧪 Testing Strategy

### Unit Tests
```typescript
// Test Zustand store
describe('InventoryStore', () => {
  it('filters items by location', () => {
    const { result } = renderHook(() => useInventoryStore());
    act(() => {
      result.current.setItems(mockItems);
    });
    const filtered = result.current.getFilteredItems('fridge');
    expect(filtered).toHaveLength(3);
  });
});
```

### Performance Tests
```typescript
// Measure render performance
import { measurePerformance } from '@shopify/react-native-performance';

measurePerformance.measure('InventoryList', () => {
  render(<InventoryList items={largeDataset} />);
});
```

---

## 📈 Performance Monitoring

```typescript
// Performance tracking utility
class PerformanceMonitor {
  private marks = new Map<string, number>();

  mark(name: string) {
    this.marks.set(name, performance.now());
  }

  measure(name: string, startMark: string, endMark?: string) {
    const start = this.marks.get(startMark);
    const end = endMark ? this.marks.get(endMark) : performance.now();

    const duration = end - start;

    // Send to analytics
    analytics.track('performance_metric', {
      name,
      duration,
      timestamp: Date.now()
    });

    // Check against SLOs
    if (name === 'scan_to_list' && duration > 2000) {
      console.warn(`Performance SLO violation: ${name} took ${duration}ms`);
    }

    return duration;
  }
}

export const perfMonitor = new PerformanceMonitor();
```

---

## 🚦 Migration Checklist

### Week 1
- [ ] Setup React Navigation structure
- [ ] Configure Zustand + MMKV
- [ ] Create base UI components
- [ ] Implement theme system
- [ ] Setup FlashList

### Week 2
- [ ] Port inventory screens
- [ ] Implement location tabs
- [ ] Create item components
- [ ] Add quantity controls
- [ ] Setup search/filter

### Week 3
- [ ] Port shopping list
- [ ] Implement item editor
- [ ] Add category management
- [ ] Create auth screens
- [ ] Setup form validation

### Week 4
- [ ] Add animations
- [ ] Implement optimistic updates
- [ ] Setup error handling
- [ ] Add loading states
- [ ] Performance optimization

### Week 5
- [ ] Integrate Supabase
- [ ] Setup real-time sync
- [ ] Add offline support
- [ ] Implement caching
- [ ] Setup analytics

### Week 6
- [ ] Testing (unit, integration, E2E)
- [ ] Performance profiling
- [ ] Bug fixes
- [ ] Polish UI/UX
- [ ] Prepare for release

---

## ⚠️ Critical Migration Gotchas

1. **No CSS Classes** - Use StyleSheet.create() or inline styles
2. **No div/span** - Everything must be View/Text
3. **Text requires Text parent** - Can't put text directly in View
4. **Platform differences** - Test iOS and Android separately
5. **No hover states** - Design for touch only
6. **Different shadows** - iOS uses shadow*, Android uses elevation
7. **Keyboard handling** - KeyboardAvoidingView is crucial
8. **Safe areas** - Use SafeAreaView or useSafeAreaInsets()
9. **Navigation state** - Managed differently than React Router
10. **Async storage** - All storage operations should be async

---

## 🎯 Success Metrics

- **Performance**: 60fps scrolling, <2s cold start
- **Memory**: <150MB average usage
- **Crashes**: <0.1% crash rate
- **User Actions**: p50 ≤2.0s, p95 ≤3.5s
- **Bundle Size**: <30MB APK/IPA
- **Code Coverage**: >80% for critical paths

---

## 📚 Key Dependencies

```json
{
  "dependencies": {
    "@react-navigation/native": "^6.1.18",
    "@react-navigation/bottom-tabs": "^6.6.1",
    "@react-navigation/stack": "^6.4.1",
    "@shopify/flash-list": "^1.7.1",
    "zustand": "^4.5.5",
    "react-native-mmkv": "^3.0.2",
    "@supabase/supabase-js": "^2.45.0",
    "react-hook-form": "^7.53.0",
    "react-native-fast-image": "^8.6.3",
    "react-native-vector-icons": "^10.2.0",
    "react-native-reanimated": "^3.16.1",
    "react-native-gesture-handler": "^2.20.2",
    "react-native-safe-area-context": "^4.14.0",
    "react-native-screens": "^3.35.0"
  }
}
```

---

## 🏁 Next Steps

1. **Review and approve tech stack choices**
2. **Set up development environment**
3. **Install core dependencies**
4. **Create foundation components**
5. **Begin Phase 1 implementation**

This plan prioritizes performance and scalability while maintaining code quality and developer experience. The phased approach ensures steady progress with measurable milestones.