# Recipe Screen Design Proposal

## Problems with Current Design

1. **Tiny recipe images** - 180px carousel cards don't showcase food appealingly
2. **Complex scrolling** - Nested horizontal scrolls feel janky
3. **Hidden match feature** - Small badges don't highlight the powerful pantry matching
4. **Generic cards** - Look like every other recipe app
5. **Weak hierarchy** - Everything competes for attention
6. **No clear CTA** - Users don't know about "What can I make?"

## New Design Philosophy

Match the clean, elevated card style of ProfileScreen v4/v5:
- Large, impactful hero sections
- Clear stats with dividers
- Colorful icon containers
- White cards on light gray background
- Strong typography
- Obvious primary actions

## Proposed Layout

### 1. Header (Clean & Simple)
```
┌────────────────────────────────┐
│ 🍳  Recipes       [Filter icon]│
│ What's for dinner?             │
└────────────────────────────────┘
```
- Icon + title (like ProfileScreen v5)
- Subtitle: "What's for dinner?"
- Filter button (top right)

### 2. Pantry Match Summary Card (Hero)
```
┌────────────────────────────────┐
│  What You Can Make             │
│  ┌────────┬────────┬──────────┐│
│  │   24   │   8    │   100%   ││
│  │ Items  │Recipes │Best Match││
│  └────────┴────────┴──────────┘│
│  ● Based on your pantry items  │
└────────────────────────────────┘
```
- Elevated card (v4 summary pattern)
- 3-stat row with dividers
- Shows value of feature upfront

### 3. Quick Filter Chips (Not Segmented Control)
```
[ All ] [ High Match ] [ Quick ] [ Vegetarian ]
```
- Horizontal scroll of chips
- Green background for selected
- Simpler than segmented control

### 4. Recipe Cards (LARGE, Full Width)
```
┌────────────────────────────────┐
│                                │
│    [Large Recipe Image]        │
│    200px height, full width    │
│                                │
│  Creamy Tuscan Chicken         │
│  ⏱ 25 min  👥 4 servings       │
│                                │
│  ✓ 8/10 ingredients  [80%]     │
│  Missing: basil, cream         │
│  [+ Add to Shopping List]      │
└────────────────────────────────┘
```
- **Full width cards** (not tiny carousels)
- Large images (200px height minimum)
- Match percentage badge (colored: green/yellow/gray)
- **Missing ingredients** shown clearly
- **Quick action button** to add missing items
- More breathing room

### 5. Match Percentage Visual Language
- **90-100%** → Green badge + "Perfect Match!" text
- **70-89%** → Yellow badge + "Almost there" text
- **50-69%** → Gray badge + "Missing X items" text

### 6. Empty State (No Matches)
```
┌────────────────────────────────┐
│         [Large Icon]           │
│    No recipes found yet        │
│    Add items to your pantry    │
│    to discover recipes         │
│                                │
│    [Scan Receipt] [Add Items]  │
└────────────────────────────────┘
```
- Friendly, helpful message
- Clear actions to improve results

## Key Design Changes

### Typography
- **Headings:** 18-22px, #111827, bold
- **Body:** 14-16px, #374151, medium
- **Secondary:** 13-14px, #6B7280

### Colors
- **Background:** #F9FAFB (light gray)
- **Cards:** #FFFFFF (white)
- **Primary:** theme.colors.primary (green)
- **High match:** #10B981 (green)
- **Medium match:** #F59E0B (yellow)
- **Low match:** #9CA3AF (gray)

### Spacing
- **Card padding:** 16-20px
- **Section margins:** 24-28px
- **Border radius:** 12-16px
- **Shadows:** Subtle (0.05 opacity)

### Card Sizes
- **Recipe cards:** Full width minus 32px padding
- **Image height:** 200px (was 120px)
- **Icon containers:** 48-56px (with pastel backgrounds)

## Benefits

1. ✅ **Larger images** - Food looks more appetizing
2. ✅ **Clear value prop** - Hero card shows "What you can make"
3. ✅ **Match info prominent** - Big badges, missing ingredients visible
4. ✅ **Actionable** - Add to shopping list buttons
5. ✅ **Consistent** - Matches ProfileScreen v4/v5 aesthetic
6. ✅ **Simpler** - No nested horizontal scrolls
7. ✅ **Delightful** - Color-coded matches, friendly empty states

## Implementation Notes

- Remove horizontal FlatLists (use vertical ScrollView only)
- Use full-width cards instead of carousels
- Add match summary at top (similar to spending summary in Profile)
- Use filter chips instead of segmented control
- Color-code match percentages
- Show missing ingredients inline
- Add "Add to Shopping List" quick action
