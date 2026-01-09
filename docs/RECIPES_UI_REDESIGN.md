# Recipes UI Redesign - 5 Variants

**Created:** 2025-01-25
**Purpose:** Redesign recipes section for better UX/UI cohesion with app design system
**Status:** Specification - Awaiting Selection

---

## 📊 Current State Analysis

### Existing Design System Elements (Extracted from Codebase)

#### Color System
```typescript
Primary Brand: #1F7A3B (Kitchen Stories inspired green)
Surface: #F6FBF8 (light green tint)
Background: #FFFFFF
Border: #E5E7EB
Text High: #111111
Text Low: #6B7280
Text Light: #9CA3AF
Success: #10B981
Error: #EF4444
```

#### Typography Scale
```
H1: 28px / 700 weight / 36px line-height
H2: 24px / 600 weight / 32px line-height
H3: 20px / 600 weight / 28px line-height
Body: 16px / 400 weight / 24px line-height
Caption: 12px / 400 weight / 16px line-height
Button: 16px / 600 weight / 24px line-height
```

#### Spacing System
```
xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 32px, xxl: 48px
```

#### Border Radius
```
sm: 4px, md: 8px, lg: 12px, xl: 16px, full: 9999px
```

#### Common UI Patterns Found

**1. Swipe-to-Delete Actions** (Inventory & Shopping List)
- Left swipe reveals red "Delete" button (80px wide)
- Smooth spring animation (tension: 70, friction: 10)
- 30px threshold to trigger
- Always close other swipes before opening new one

**2. Inline Editing Pattern** (Shopping List)
- Long press (500ms) enters edit mode
- TextInput replaces item text
- Submit on Enter or Blur
- Prevents duplicate edits within 300ms

**3. Quantity Controls**
- Horizontal layout: [−] value [+]
- Buttons: 28x28px circles, surface background
- Font size: 18px for +/−, 16px for value
- Min width: 40px for value display

**4. Category Pills** (Inventory)
- Horizontal scroll
- Active pill: brand color background + border
- Inactive: #F0F0F0 background
- Height: 36px, borderRadius: 20px, padding: 8-14px
- Show count badge on right

**5. Empty States**
- Large emoji icon (48px)
- H3 title + caption subtitle
- Action buttons below
- Centered with generous padding (96px+ vertical)

**6. Section Headers** (Inventory)
- Collapsible with chevron (►/▼)
- Icon + Title + Count
- Bold divider line (3px)
- Padding: 12px top, 8px bottom

**7. Filter Tabs** (Shopping List)
- Pill-shaped buttons in horizontal row
- Active: primary color fill + white text
- Inactive: surface background + text-light color
- Group related actions (All/To Buy/Done)

**8. FAB (Floating Action Button)**
- Position: bottom-right (20px margins)
- Size: 56x56px circle
- Primary color background
- Shadow elevation: 8
- Simple "+" icon (28px, weight 300)

**9. Header Layout**
- Title (H2) on left
- Action buttons on right
- Horizontal padding: 16px
- Vertical padding: 8px
- Bottom border: 1px solid border color

**10. Stats Bar** (Shopping List)
- Below header
- Caption typography
- Text-light color
- Shows counts: "X items • Y completed"

---

## 🎯 Current Recipes Screens Analysis

### ExploreRecipesScreenSupabase.tsx Issues

**Problems:**
1. ❌ **Overwhelming information density** - Too much text per recipe card
2. ❌ **Inconsistent card sizes** - Full-width cards break grid pattern
3. ❌ **Poor hierarchy** - Match percentage dominates more than recipe image
4. ❌ **Missing swipe actions** - No quick delete/favorite gestures like other screens
5. ❌ **Mode toggle confusion** - "Explore" vs "From Your Pantry" + "Your Recipes" vs "Discover New" is too nested
6. ❌ **Badge overload** - Match %, expiry badge, ingredient counts all competing
7. ❌ **Inconsistent empty states** - Doesn't match inventory/shopping list pattern
8. ❌ **FAB not cohesive** - "Paste Link" FAB doesn't match app's standard FAB pattern

### SavedRecipesScreen.tsx Issues

**Problems:**
1. ❌ **2-column grid is cramped** - Images too small, text truncates heavily
2. ❌ **Selection mode is clunky** - Requires tapping "Select" button instead of long-press
3. ❌ **No swipe actions** - Should allow swipe-to-delete like other screens
4. ❌ **Multi-select bottom bar** - Good pattern but not discoverable
5. ❌ **Platform badges conflict** - Circle badges in corner cover image content
6. ❌ **Missing quick actions** - Can't add single recipe to shopping list quickly

### CookCardScreen.tsx Issues

**Problems:**
1. ❌ **Ingredient list too dense** - Lacks breathing room
2. ❌ **Pantry match UI is boxed** - Doesn't integrate with ingredients visually
3. ❌ **Button stack overload** - 3-4 buttons in vertical stack is overwhelming
4. ❌ **Missing batch cooking** - No way to adjust servings
5. ❌ **Confidence banner too prominent** - Amber banner screams too loud

---

## 🎨 Design Principles for Redesign

1. **Consistency** - Match swipe actions, FABs, pills from Inventory/Shopping screens
2. **Scanability** - Large images, clear text, color-coded badges
3. **Efficiency** - Quick actions via swipe/long-press, no nested menus
4. **Clarity** - One primary CTA per screen, reduce information overload
5. **Delight** - Smooth animations, thoughtful microinteractions

---

## 🔥 5 UI Variants

---

## Variant 1: "Tinder for Recipes" - Swipe-First Discovery

**Concept:** Prioritize speed and decision-making with gesture-based interactions

### Recipes Home Screen

**Layout:**
```
┌──────────────────────────────┐
│  Recipes        🔍 📚       │ ← Header (H2 title + search + saved count badge)
├──────────────────────────────┤
│  [🍳 From Pantry] [🌎 Explore] │ ← Segmented Control (2 options only)
├──────────────────────────────┤
│  ● All  🥗 Healthy  🍕 Quick │ ← Category Pills (horizontal scroll)
├──────────────────────────────┤
│                               │
│  ╔════════════════════════╗  │
│  ║                        ║  │
│  ║  [Recipe Image]        ║  │ ← Large card (90% screen width)
│  ║        280px           ║  │   Stacked vertically
│  ║                        ║  │   Swipe left: Skip
│  ╠════════════════════════╣  │   Swipe right: Save
│  ║  Chicken Stir Fry      ║  │   Tap: View details
│  ║  ✓ 7/10 ingredients    ║  │
│  ║  🔥 Uses expiring onions│  │
│  ║  ⏱ 25min | 👤 4 servings ║  │
│  ╚════════════════════════╝  │
│                               │
│  ╔════════════════════════╗  │ ← Next recipe preview
│  ║  [Blurred Preview]     ║  │   (20% visible)
│  ╚════════════════════════╝  │
│                               │
│              [+]              │ ← FAB: Paste Link
└──────────────────────────────┘
```

**Gestures:**
- **Swipe Right** → Save to collection + Add "❤️ Saved" toast
- **Swipe Left** → Skip (remove from feed temporarily)
- **Swipe Up** → Add missing ingredients to shopping list + Navigate to Shopping tab
- **Tap Card** → Navigate to CookCard detail view
- **Long Press** → Show quick actions menu (Share, Hide, Report)

**Features:**
- Infinite scroll (load 5 more on reaching bottom)
- Match percentage shown as circular progress ring (outer border)
- Expiring badge as floating chip (top-left, red accent)
- Smooth card exit animations (fade + scale)

**Pros:**
- ✅ Fast decision-making (swipe vs tap-tap-tap)
- ✅ Mobile-first gesture language
- ✅ Clear visual hierarchy (image dominates)
- ✅ Fun, engaging interaction model

**Cons:**
- ❌ Can't compare multiple recipes side-by-side
- ❌ May feel too casual for serious meal planning
- ❌ Requires good gesture discoverability (tutorial?)

---

## Variant 2: "Instagram Feed" - Scrollable Card Feed

**Concept:** Social media-inspired endless scroll with inline actions

### Recipes Home Screen

**Layout:**
```
┌──────────────────────────────┐
│  Recipes                🔍  │ ← Header
├──────────────────────────────┤
│  [From Pantry] [Explore]     │ ← Segmented Control
├──────────────────────────────┤
│  ● All  🍕 Quick  🥗 Healthy │ ← Category Pills
├──────────────────────────────┤
│                               │
│  ┌─────────────────────────┐ │
│  │ 🔥 85% Match            │ │ ← Card (full width)
│  ├─────────────────────────┤ │
│  │                         │ │
│  │  [Recipe Image 220px]   │ │
│  │                         │ │
│  ├─────────────────────────┤ │
│  │ Chicken Stir Fry        │ │
│  │ by @halfbakedharvest    │ │
│  │ ✓ 7/10 • Missing: soy,  │ │
│  │   ginger, garlic        │ │
│  │ ⏱ 25min | 👤 4 servings  │ │
│  ├─────────────────────────┤ │
│  │ ❤️ Save  🛒 Add  👁 View │ │ ← Action bar
│  └─────────────────────────┘ │
│                               │
│  ┌─────────────────────────┐ │ ← Next card
│  │ 🔥 92% Match            │ │
│  │ ...                     │ │
│                               │
│              [+]              │ ← FAB
└──────────────────────────────┘
```

**Interaction:**
- **Swipe Left on Card** → Delete/Hide recipe
- **Swipe Right on Card** → No action (use buttons)
- **Tap Card Image/Title** → Navigate to detail
- **Tap "❤️ Save"** → Save to collection + Button changes to "✓ Saved" (green)
- **Tap "🛒 Add"** → Add missing ingredients to shopping list + Show toast
- **Tap "👁 View"** → Navigate to CookCard detail
- **Long Press Card** → Show quick menu (Share, Hide, Report)

**Features:**
- Match percentage as colored banner (top of card)
- Expiring badge integrated into card header
- Inline action buttons (no need to open card)
- Creator attribution (matches CookCard schema)

**Pros:**
- ✅ Familiar Instagram/TikTok interaction model
- ✅ Quick actions without navigation
- ✅ Good information density
- ✅ Easy to scan while scrolling

**Cons:**
- ❌ Action buttons may cause accidental taps
- ❌ Harder to compare recipes visually
- ❌ May feel cramped on small screens

---

## Variant 3: "Pinterest Grid" - Visual Discovery Grid

**Concept:** Maximize visual appeal with masonry-style grid layout

### Recipes Home Screen

**Layout:**
```
┌──────────────────────────────┐
│  Recipes                🔍  │ ← Header
├──────────────────────────────┤
│  [From Pantry] [Explore]     │ ← Segmented Control
├──────────────────────────────┤
│  🥬 25 items • 15 recipes    │ ← Stats bar
├──────────────────────────────┤
│  ● All  🍕 Quick  🥗 Healthy │ ← Category Pills
├──────────────────────────────┤
│  ┌────────┬────────┬────────┐│
│  │        │        │        ││ ← Masonry grid
│  │ Recipe │ Recipe │ Recipe ││   (Pinterest-style)
│  │  Card  │  Card  │  Card  ││   Variable heights
│  │ 180px  │ 220px  │ 200px  ││
│  │        │        │        ││
│  │  85%   │  92%   │  78%   ││ ← Match badge
│  │  🔥     │        │  🔥    ││   (corner overlay)
│  ├────────┼────────┼────────┤│
│  │        │        │        ││
│  │ Recipe │ Recipe │ Recipe ││
│  │  Card  │  Card  │  Card  ││
│  │        │        │        ││
│              [+]              │ ← FAB
└──────────────────────────────┘
```

**Card Design:**
- Image fills entire card (variable aspect ratio based on source)
- Match % badge: top-right corner (circular, 40px)
- Expiring badge: top-left corner (🔥 emoji only, 32px)
- Title overlay: bottom gradient (black → transparent)
- On tap: Zoom transition to detail view

**Interaction:**
- **Tap Card** → Navigate to detail with zoom animation
- **Long Press** → Multi-select mode (checkboxes appear)
- **In Multi-Select:**
  - Tap to toggle selection
  - Bottom action bar appears: "Add X to Shopping List"
  - Cancel button in header

**Features:**
- Waterfall layout (like Pinterest/Unsplash)
- Lazy image loading with blur-up effect
- Pull-to-refresh
- Infinite scroll

**Pros:**
- ✅ Gorgeous visual presentation
- ✅ Great for browsing/discovery
- ✅ Efficient use of screen space
- ✅ Familiar pattern (Pinterest/Instagram Explore)

**Cons:**
- ❌ Harder to see text info at a glance
- ❌ Complex layout calculations (performance)
- ❌ May not work well with missing images

---

## Variant 4: "Apple Health" - Clean Cards + Smart Filters

**Concept:** Minimalist, data-driven design with smart filtering

### Recipes Home Screen

**Layout:**
```
┌──────────────────────────────┐
│  ← Recipes            ⚙️ 🔔  │ ← Header (back + settings + notifications)
├──────────────────────────────┤
│  ╔══════════════════════════╗│
│  ║  Your Pantry Status      ║│ ← Smart summary card
│  ║  🥬 25 items              ║│   (collapsible)
│  ║  🔥 3 expiring soon       ║│
│  ║  ✅ 15 recipes you can    ║│
│  ║     make right now        ║│
│  ╚══════════════════════════╝│
├──────────────────────────────┤
│  ╭─ Quick Filters ───────────╮│
│  │ ⚡️ Make Now (15)          │ │ ← Expandable filters
│  │ 🔥 Use Soon (8)           │ │   Tap to expand/collapse
│  │ 💚 Healthy (12)           │ │
│  │ ⏱ Quick (<30min) (20)    │ │
│  ╰───────────────────────────╯│
├──────────────────────────────┤
│                               │
│  ┌─────────────────────────┐ │
│  │  [Image] 85%  ❤️        │ │ ← Clean card
│  │  Chicken Stir Fry       │ │   (horizontal layout)
│  │  Have 7/10 • 25min      │ │
│  │  Missing: soy, ginger   │ │
│  └─────────────────────────┘ │
│                               │
│  ┌─────────────────────────┐ │
│  │  [Image] 92%  ❤️        │ │
│  │  ...                    │ │
│                               │
│              [+]              │ ← FAB
└──────────────────────────────┘
```

**Card Design:**
- Horizontal layout: 100x100px image | text info | heart icon
- Match % as colored progress bar (bottom of image)
- Missing ingredients as pill chips (truncated to 2, expandable)
- Swipe right → Add to shopping list
- Swipe left → Remove/hide

**Smart Filters:**
- **Make Now** - 80%+ match
- **Use Soon** - Recipes using items expiring in 3 days
- **Healthy** - <500 cal, high protein (future)
- **Quick** - <30min total time
- **Favorites** - User saved recipes

**Interaction:**
- **Tap Card** → Navigate to detail
- **Tap Heart** → Save/unsave (inline)
- **Swipe Right** → Add missing to shopping list + Haptic + Toast
- **Swipe Left** → Hide recipe + Undo toast
- **Tap Filter** → Jump to that section in list
- **Long Press Card** → Quick actions menu

**Pros:**
- ✅ Clean, Apple-like aesthetic
- ✅ Smart filtering reduces cognitive load
- ✅ Horizontal cards show more info
- ✅ Swipe actions match app patterns

**Cons:**
- ❌ Smaller images (less visual appeal)
- ❌ Longer vertical scroll
- ❌ May feel too "medical/data-ish"

---

## Variant 5: "Notion Database" - List View with Inline Expand

**Concept:** Compact list with expand-in-place detail view

### Recipes Home Screen

**Layout:**
```
┌──────────────────────────────┐
│  Recipes                ⋮   │ ← Header + menu
├──────────────────────────────┤
│  🔍 Search or filter...      │ ← Search bar (always visible)
├──────────────────────────────┤
│  ● All  🍕 Quick  🥗 Healthy │ ← Category Pills
├──────────────────────────────┤
│  Sort by: Match % ↓          │ ← Sort dropdown
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │ [40px] Chicken Stir    │  │ ← Collapsed row
│  │  img   Fry  85%  ❤️    │  │   (56px tall)
│  │        7/10 • 25min    │  │   Swipe for actions
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ [img]  Beef Tacos      │  │
│  │        92%  ❤️         │  │
│  ╞════════════════════════╡  │ ← Expanded row
│  │  [Recipe Image 200px]  │  │   (tapped to expand)
│  │                        │  │
│  ├────────────────────────┤  │
│  │  Have: chicken, onion  │  │
│  │  Need: soy, ginger (2) │  │
│  ├────────────────────────┤  │
│  │  [Add to List] [View]  │  │ ← Inline buttons
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ [img]  Pasta Carb...   │  │
│  │        78%  ❤️         │  │
│  └────────────────────────┘  │
│                               │
│              [+]              │ ← FAB
└──────────────────────────────┘
```

**Interaction:**
- **Tap Row** → Expand in-place (accordion style)
- **Tap Expanded Row** → Collapse
- **Tap "View"** → Navigate to full CookCard screen
- **Tap "Add to List"** → Add missing ingredients + Toast
- **Swipe Right** → Save to collection + Haptic
- **Swipe Left** → Delete/hide + Undo
- **Long Press** → Multi-select mode

**Expanded Row Shows:**
- Full recipe image (200px)
- Have/Need ingredient breakdown
- Time, servings, creator info
- Action buttons (Add to List, View Details)

**Pros:**
- ✅ Maximum information density
- ✅ Quick scan of many recipes
- ✅ Expand only what you need
- ✅ Great for power users

**Cons:**
- ❌ Less visually appealing
- ❌ Requires more taps to see details
- ❌ May feel too "enterprise-y"

---

## 📊 Comparison Matrix

| Feature | Variant 1 (Tinder) | Variant 2 (Feed) | Variant 3 (Grid) | Variant 4 (Health) | Variant 5 (List) |
|---------|-------------------|-----------------|-----------------|-------------------|-----------------|
| **Visual Appeal** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Information Density** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Speed** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Learnability** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Consistency with App** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Mobile-First** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Dev Complexity** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 🎯 Recommended Approach

### **Primary Recommendation: Variant 4 (Apple Health Style)**

**Why:**
1. ✅ Best balance of visual appeal + information density
2. ✅ Matches existing swipe patterns (Inventory/Shopping List)
3. ✅ Smart filters reduce decision fatigue
4. ✅ Horizontal cards work well on all screen sizes
5. ✅ Easiest to implement with existing components
6. ✅ Clean, professional aesthetic matches pantry management use case

### **Secondary Recommendation: Variant 2 (Instagram Feed)**

**Why:**
- ✅ Most familiar to users (Instagram/TikTok patterns)
- ✅ Inline actions reduce taps
- ✅ Good balance of visual + functional
- ⚠️ But may feel too casual for serious meal planning

### **For Future Consideration: Variant 1 (Tinder Swipe)**

**Why:**
- ✅ Most fun, engaging interaction
- ✅ Great for quick browsing sessions
- ✅ Could be a "discovery mode" toggle in Variant 4
- ⚠️ But requires tutorial/onboarding

---

## 🛠 Implementation Roadmap (Variant 4)

### Phase 1: Core Layout (Week 1)
- [ ] Implement horizontal card component
- [ ] Add swipe actions (right: add to list, left: hide)
- [ ] Integrate match % progress bar
- [ ] Add inline heart icon for save/unsave

### Phase 2: Smart Filters (Week 2)
- [ ] Build collapsible summary card
- [ ] Implement filter sections (Make Now, Use Soon, etc.)
- [ ] Add filter tap → scroll to section logic
- [ ] Store user filter preferences

### Phase 3: Polish (Week 3)
- [ ] Add smooth expand/collapse animations
- [ ] Implement haptic feedback on swipes
- [ ] Add toast notifications for actions
- [ ] Optimize image loading (blur-up, caching)

### Phase 4: Testing & Refinement (Week 4)
- [ ] A/B test with 100 users
- [ ] Measure: time to find recipe, add to list success rate
- [ ] Iterate based on feedback
- [ ] Ship to production

---

## 📐 Detailed Component Specs (Variant 4)

### Recipe Card Component

```typescript
interface RecipeCardProps {
  recipe: {
    id: string;
    title: string;
    imageUrl: string;
    matchPercentage: number;
    totalIngredients: number;
    matchedCount: number;
    missingCount: number;
    cookTime: number;
    missingIngredients: string[];
    isExpiring: boolean;
    isSaved: boolean;
  };
  onPress: () => void;
  onSave: () => void;
  onAddToShoppingList: () => void;
  onHide: () => void;
}
```

**Dimensions:**
- Height: 100px (collapsed)
- Image: 100x100px (square, left side)
- Text area: flexible width
- Heart icon: 32x32px touch target (right side)

**Layout:**
```
┌──────────────────────────────────────┐
│  ┌───────┐                          │
│  │       │  Chicken Stir Fry    ❤️  │ ← 100px tall
│  │ Image │  ████████░░ 85%          │
│  │100x100│  Have 7/10 • 25min       │
│  │       │  Missing: soy, ginger    │
│  └───────┘                          │
└──────────────────────────────────────┘
```

**Colors:**
- Match bar gradient:
  - 90-100%: #10B981 (success green)
  - 70-89%: #F59E0B (warning yellow)
  - 0-69%: #9CA3AF (gray)
- Background: #FFFFFF
- Border: 1px solid #E5E7EB
- Border radius: 12px

**States:**
- Default: border #E5E7EB
- Pressed: background #F6FBF8 (brand surface)
- Swiped: translateX animation + action reveal
- Saved: heart filled (red) + border #10B981

**Swipe Actions:**
- Right swipe (50px threshold):
  - Action: Add missing to shopping list
  - Background: #10B981 (green)
  - Icon: 🛒 (32px)
  - Haptic: impact medium
  - Toast: "Added 3 items to shopping list"

- Left swipe (50px threshold):
  - Action: Hide recipe
  - Background: #EF4444 (red)
  - Icon: 👁‍🗨 (eye-slash, 32px)
  - Haptic: impact light
  - Toast: "Hidden • Undo"

---

## 🎨 Style Tokens (Variant 4)

```typescript
const RecipeCardStyles = {
  card: {
    height: 100,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
  },
  image: {
    width: 100,
    height: 100,
  },
  content: {
    flex: 1,
    padding: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  title: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  matchBar: {
    height: 4,
    backgroundColor: theme.colors.borderLight,
    borderRadius: 2,
    marginBottom: 6,
  },
  matchBarFill: {
    height: '100%',
    borderRadius: 2,
    // color based on percentage
  },
  meta: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  missingChips: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  missingChip: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  missingChipText: {
    fontSize: 11,
    color: '#92400E',
  },
  heartIcon: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeAction: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeActionRight: {
    left: 0,
    backgroundColor: theme.colors.success,
  },
  swipeActionLeft: {
    right: 0,
    backgroundColor: theme.colors.error,
  },
};
```

---

## 🧪 A/B Test Plan

### Metrics to Track

**Primary:**
- Time to find desired recipe (avg seconds)
- Add to shopping list success rate (%)
- Recipe save rate (%)

**Secondary:**
- Scroll depth (how many recipes viewed)
- Swipe action usage vs button taps
- Filter engagement rate
- Session duration

**Success Criteria (Variant 4 vs Current):**
- ✅ 20% faster time to add ingredients
- ✅ 15% more recipes saved per session
- ✅ 30% more swipe actions used (vs current: 0%)
- ✅ 10% higher user satisfaction (NPS)

---

## 📝 Next Steps

1. **Review & Select Variant** - Stakeholder decision
2. **Create Figma Mockups** - Visual design in Figma (1 day)
3. **Build Component Library** - RecipeCard, SmartFilters, etc. (2 days)
4. **Implement Variant 4** - Full feature implementation (1-2 weeks)
5. **Internal Testing** - Dogfood with team (3 days)
6. **Beta Release** - 100 users A/B test (2 weeks)
7. **Iterate & Ship** - Based on data (1 week)

---

**Total Estimated Time: 4-5 weeks for full redesign + testing**

**Last Updated:** 2025-01-25
**Next Review:** After variant selection
