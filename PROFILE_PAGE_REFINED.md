# Profile Page - Mobile-Optimized Design

## Design Principles
- **Profile = Dashboard summary, not inbox**
- **Actionable insights over guilt-inducing metrics**
- **Quick first paint** (defer heavy queries to detail screens)
- **Empty states with CTAs** (guide new users)
- **Platform-native patterns** (Material Design / HIG)

---

## Structure

```
Profile Screen
├── [Header] User + Household (large, always visible)
├── [Card 1] Spending This Month (3-4 stats + sparkline)
├── [Card 2] Waste Tracker (3 KPIs + actionable suggestion)
├── [Card 3] Quick Overview (3-column stats)
├── [Section] Settings (grouped, platform language)
└── [Footer] Privacy/Terms + Version
```

---

## 1. Header: User + Household

**Layout**: Large, top of screen, establishes context

```
┌────────────────────────────────────┐
│  Profile                      [⋯] │
├────────────────────────────────────┤
│                                    │
│        👤 JD                       │
│    John Doe                        │
│  john@example.com                  │
│                                    │
│  🏠 Smith Family Household         │
│  Owner • 3 members                 │
│  [Switch Household →]              │
│                                    │
└────────────────────────────────────┘
```

**Data Source**: Auth context + Supabase
```typescript
const { user, householdId } = useAuth();
const { data: household } = useQuery(['household', householdId], () =>
  supabase
    .from('households')
    .select('name')
    .eq('id', householdId)
    .single()
);
const { data: memberCount } = useQuery(['members', householdId], () =>
  supabase
    .from('household_members')
    .select('count', { count: 'exact', head: true })
    .eq('household_id', householdId)
);
```

---

## 2. Card 1: Spending This Month

**Goal**: At-a-glance spending, one sparkline, clear trend

```
┌────────────────────────────────────┐
│  💰 Spending This Month            │
│                                    │
│  ┌─────────┬─────────┬──────────┐ │
│  │ $284.50 │ 12 trips│ 142 items│ │
│  │ Total   │ Shopped │ Purchased│ │
│  └─────────┴─────────┴──────────┘ │
│                                    │
│  ↓ 12% vs last month               │
│  [Sparkline: ▁▂▃▅▃▄▃]              │
│                                    │
│  [View Details →]                  │
└────────────────────────────────────┘
```

**Empty State** (no receipts yet):
```
┌────────────────────────────────────┐
│  💰 Spending This Month            │
│                                    │
│       📸                           │
│  Scan your first receipt           │
│  to track spending                 │
│                                    │
│  [Start Scanning →]                │
└────────────────────────────────────┘
```

**Stats** (3 max, loaded from lightweight query):
- **Total**: Sum of receipts this month
- **Trips**: Count of unique receipts
- **Items**: Count of purchased items

**Trend**: Simple % change vs last month (green ↓ = saved, red ↑ = spent more)

**Sparkline**: Last 7 days of spending (visual pattern, not detailed)

**"View Details →"**: Links to `PurchaseHistoryScreen` with:
- Month/year filter
- Store breakdown
- Category breakdown
- Daily/weekly charts

**Data Source** (fast query, no joins):
```typescript
// Keep profile query FAST - simple aggregates only
const { data: spending } = useQuery(['spending', householdId, currentMonth], () =>
  supabase.rpc('get_monthly_spending_summary', {
    p_household_id: householdId,
    p_month: currentMonth
  })
);

// SQL function (server-side)
CREATE OR REPLACE FUNCTION get_monthly_spending_summary(
  p_household_id uuid,
  p_month date
) RETURNS TABLE(
  total_cents bigint,
  trip_count bigint,
  item_count bigint,
  trend_pct numeric,
  daily_totals int[]  -- For sparkline
) AS $$
BEGIN
  RETURN QUERY
  WITH current_month AS (
    SELECT
      SUM(total_price_cents) as total,
      COUNT(DISTINCT receipt_id) as trips,
      COUNT(*) as items
    FROM purchase_history
    WHERE household_id = p_household_id
      AND purchase_date >= date_trunc('month', p_month)
      AND purchase_date < date_trunc('month', p_month) + interval '1 month'
  ),
  last_month AS (
    SELECT SUM(total_price_cents) as total
    FROM purchase_history
    WHERE household_id = p_household_id
      AND purchase_date >= date_trunc('month', p_month) - interval '1 month'
      AND purchase_date < date_trunc('month', p_month)
  ),
  daily AS (
    SELECT array_agg(daily_total ORDER BY day) as totals
    FROM (
      SELECT
        date_trunc('day', purchase_date) as day,
        SUM(total_price_cents)::int as daily_total
      FROM purchase_history
      WHERE household_id = p_household_id
        AND purchase_date >= CURRENT_DATE - interval '7 days'
      GROUP BY 1
      ORDER BY 1
    ) d
  )
  SELECT
    cm.total,
    cm.trips,
    cm.items,
    ROUND(((cm.total - lm.total) * 100.0 / NULLIF(lm.total, 0))::numeric, 1) as trend,
    d.totals
  FROM current_month cm, last_month lm, daily d;
END;
$$ LANGUAGE plpgsql;
```

**Why This Works**:
- ✅ Scannable (3 stats, not 10)
- ✅ One visual (sparkline for pattern recognition)
- ✅ Actionable (trend tells you if you're spending more/less)
- ✅ Fast (single RPC call, no client-side joins)
- ✅ Deep dive available ("View Details" for power users)

---

## 3. Card 2: Waste Tracker

**Goal**: Actionable insights, not guilt. Show KPIs + concrete next action.

```
┌────────────────────────────────────┐
│  🗑️ Waste This Month                │
│                                    │
│  ┌─────────┬─────────┬──────────┐ │
│  │ 3 items │ ~$12.50 │  2.4 lbs │ │
│  │ Expired │ Wasted  │  Weight  │ │
│  └─────────┴─────────┴──────────┘ │
│                                    │
│  💡 Spinach wasted twice           │
│  [Show in Pantry →]                │
│                                    │
└────────────────────────────────────┘
```

**Empty State** (no waste):
```
┌────────────────────────────────────┐
│  🗑️ Waste This Month                │
│                                    │
│       ✨                           │
│  No waste this month!              │
│  You're doing great.               │
│                                    │
└────────────────────────────────────┘
```

**Stats** (3-column KPI trio):
- **Items**: Count of expired items deleted
- **Cost**: Estimated total waste (based on purchase history)
- **Weight**: Sum of quantity × unit conversion (approx)

**Actionable Suggestion** (one line, specific):
- "Spinach wasted twice" (item wasted 2+ times)
- "Milk expires in 2 days" (predictive, prevent waste)
- "Buy smaller portions" (if item always wasted)

**One-Tap Action**:
- **"Show in Pantry →"**: Opens InventoryScreen filtered to that item
  - Example: If "Spinach" is the issue, filter pantry to `category=produce` and highlight spinach
  - Allows user to immediately use/consume before it expires

**Data Source**:
```typescript
// Waste tracking (requires waste_log table)
const { data: waste } = useQuery(['waste', householdId, currentMonth], () =>
  supabase.rpc('get_monthly_waste_with_action', {
    p_household_id: householdId,
    p_month: currentMonth
  })
);

// SQL function
CREATE OR REPLACE FUNCTION get_monthly_waste_with_action(
  p_household_id uuid,
  p_month date
) RETURNS TABLE(
  items_wasted bigint,
  cost_cents bigint,
  weight_lbs numeric,
  top_wasted_item text,
  top_wasted_count int,
  action_suggestion text
) AS $$
BEGIN
  RETURN QUERY
  WITH waste_stats AS (
    SELECT
      COUNT(*) as items,
      SUM(estimated_cost_cents) as cost,
      SUM(quantity *
        CASE unit
          WHEN 'lb' THEN 1
          WHEN 'oz' THEN 0.0625
          WHEN 'kg' THEN 2.2046
          WHEN 'g' THEN 0.0022046
          ELSE 0.5  -- Estimate for count items
        END
      ) as weight,
      item_name,
      COUNT(*) OVER (PARTITION BY item_name) as waste_count
    FROM waste_log
    WHERE household_id = p_household_id
      AND deleted_at >= date_trunc('month', p_month)
      AND deleted_at < date_trunc('month', p_month) + interval '1 month'
  ),
  most_wasted AS (
    SELECT item_name, waste_count
    FROM waste_stats
    ORDER BY waste_count DESC, cost DESC
    LIMIT 1
  )
  SELECT
    ws.items::bigint,
    ws.cost::bigint,
    ROUND(ws.weight::numeric, 1),
    mw.item_name,
    mw.waste_count,
    CASE
      WHEN mw.waste_count > 1 THEN mw.item_name || ' wasted ' || mw.waste_count || ' times'
      ELSE 'Consider buying smaller portions'
    END as suggestion
  FROM waste_stats ws, most_wasted mw
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
```

**Waste Tracking Implementation** (when user deletes expired item):
```typescript
// In InventoryScreen, when user deletes item with expiry_date < today
const handleDeleteExpiredItem = async (item: InventoryItem) => {
  if (item.expirationDate && new Date(item.expirationDate) < new Date()) {
    // Log to waste_log
    await supabase.from('waste_log').insert({
      household_id: householdId,
      item_name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      estimated_cost_cents: await estimateCost(item.name, householdId),
      expired_date: item.expirationDate,
    });
  }

  // Then delete from pantry
  await inventoryStore.deleteItem(item.id);
};

// Estimate cost from purchase history
async function estimateCost(itemName: string, householdId: string): Promise<number> {
  const { data } = await supabase
    .from('purchase_history')
    .select('unit_price_cents')
    .eq('household_id', householdId)
    .ilike('product_name', `%${itemName}%`)
    .order('purchase_date', { ascending: false })
    .limit(1)
    .single();

  return data?.unit_price_cents || 0;
}
```

**Why This Works**:
- ✅ Not guilt-inducing (framed as optimization, not failure)
- ✅ Concrete suggestion (specific item, not generic advice)
- ✅ Immediate action (one tap to filter pantry)
- ✅ Unique feature (most pantry apps don't track waste)

---

## 4. Card 3: Quick Overview

**Goal**: At-a-glance status of inventory, shopping, expiring

```
┌────────────────────────────────────┐
│  📦 Overview                       │
│                                    │
│  ┌─────────┬─────────┬──────────┐ │
│  │   42    │    8    │     5    │ │
│  │  Items  │Shopping │ Expiring │ │
│  │in Stock │  List   │   Soon   │ │
│  └─────────┴─────────┴──────────┘ │
│                                    │
└────────────────────────────────────┘
```

**Stats** (consistent 3-column format):
- **Items in Stock**: Total active inventory
- **Shopping List**: Items on active shopping list
- **Expiring Soon**: Items expiring in next 3 days (clickable → filters inventory)

**Data Source** (fast, simple counts):
```typescript
const { data: overview } = useQuery(['overview', householdId], () =>
  Promise.all([
    // Inventory count
    supabase
      .from('pantry_items')
      .select('count', { count: 'exact', head: true })
      .eq('household_id', householdId)
      .eq('status', 'active'),

    // Shopping list count
    supabase
      .from('shopping_list_items')
      .select('count', { count: 'exact', head: true })
      .in('list_id', (await getActiveShoppingListIds(householdId))),

    // Expiring soon count (next 3 days)
    supabase
      .from('pantry_items')
      .select('count', { count: 'exact', head: true })
      .eq('household_id', householdId)
      .gte('expiry_date', new Date().toISOString())
      .lte('expiry_date', addDays(new Date(), 3).toISOString())
  ])
);
```

**Tappable**:
- **Expiring Soon**: Opens InventoryScreen with filter `expiryFilter: 'expiring'`

---

## 5. Settings Section

**Goal**: Platform-native language, grouped by context, toggles for booleans

```
┌────────────────────────────────────┐
│  ⚙️ Settings                        │
│                                    │
│  ACCOUNT                           │
│  • Manage Household                │
│  • Change Password                 │
│  • Delete Account                  │
│                                    │
│  PREFERENCES                       │
│  • Appearance          [System ▾]  │
│  • Default Location    [Fridge ▾]  │
│  • Units               [Imperial▾] │
│  • Notifications           [Toggle]│
│                                    │
│  DATA                              │
│  • Export Data                     │
│    CSV (household data)            │
│  • Clear All Data                  │
│                                    │
│  SUPPORT                           │
│  • Help & FAQ                      │
│  • Contact Support                 │
│  • About                           │
│                                    │
└────────────────────────────────────┘
```

**Grouping**:
1. **ACCOUNT**: User identity & security
2. **PREFERENCES**: App behavior & display
3. **DATA**: Export, delete, portability
4. **SUPPORT**: Help & info

**Platform Language** (follow HIG/Material):
- "Appearance" not "Theme" (iOS HIG)
- "System" / "Light" / "Dark" (standard options)
- Use toggles for boolean prefs (Material pattern)
- Use dropdowns/pickers for multi-option

**Data Export** (GDPR-friendly):
```
┌────────────────────────────────────┐
│  Export Data                       │
│                                    │
│  Download your data in CSV format  │
│  (machine-readable, portable)      │
│                                    │
│  Scope:                            │
│  ○ My purchases only               │
│  ● Household data (all members)    │
│                                    │
│  [Download CSV]                    │
│                                    │
│  Files exported:                   │
│  • purchase_history.csv            │
│  • pantry_items.csv                │
│  • shopping_list.csv               │
│                                    │
└────────────────────────────────────┘
```

**Implementation**:
```typescript
const handleExport = async (scope: 'user' | 'household') => {
  const tables = ['purchase_history', 'pantry_items', 'shopping_list_items'];
  const zip = new JSZip();

  for (const table of tables) {
    const { data } = await supabase
      .from(table)
      .select('*')
      .eq(scope === 'user' ? 'user_id' : 'household_id',
          scope === 'user' ? userId : householdId);

    const csv = convertToCSV(data);
    zip.file(`${table}.csv`, csv);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadFile(blob, `pantry_export_${new Date().toISOString()}.zip`);
};
```

---

## 6. Footer

**Goal**: Trust signals, legal compliance, version info

```
┌────────────────────────────────────┐
│                                    │
│  [Sign Out]                        │
│                                    │
│  ────────────────────────────────  │
│                                    │
│  Privacy Policy • Terms of Service │
│  Version 1.0.0 (Build 42)          │
│                                    │
└────────────────────────────────────┘
```

**Links**:
- **Privacy Policy**: Opens WebView or external browser
- **Terms of Service**: Opens WebView or external browser

**GDPR Compliance Note** (in Privacy Policy):
> "You can download your data in a structured, commonly used, machine-readable format (CSV) at any time from Settings → Export Data."

---

## Performance Strategy

### Profile Screen (Fast First Paint)
**Query Strategy**: Lightweight aggregates only, no joins

```typescript
// ✅ FAST - Simple counts, server-side aggregates
const profileData = await Promise.all([
  supabase.rpc('get_monthly_spending_summary', { p_household_id, p_month }),
  supabase.rpc('get_monthly_waste_with_action', { p_household_id, p_month }),
  supabase.from('pantry_items').select('count', { count: 'exact', head: true }),
  supabase.from('shopping_list_items').select('count', { count: 'exact', head: true }),
]);

// ❌ SLOW - Avoid on profile screen
// Don't do: Fetch all receipts, group by store, calculate percentages
// Don't do: Fetch all pantry items, calculate waste by category
// Don't do: Join receipts with stores with items
```

### Detail Screens (Defer Heavy Queries)
**Purchase History Screen**: This is where heavy queries belong

```typescript
// PurchaseHistoryScreen.tsx
const { data: detailedSpending } = useQuery(['spending-details', month], () =>
  supabase.rpc('get_detailed_spending', {
    p_household_id: householdId,
    p_month: month
  })
);

// SQL function (runs ONLY when user opens detail screen)
CREATE OR REPLACE FUNCTION get_detailed_spending(
  p_household_id uuid,
  p_month date
) RETURNS TABLE(
  by_store jsonb,
  by_category jsonb,
  by_day jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- By store
    jsonb_object_agg(store_name, total) as by_store,
    -- By category
    jsonb_object_agg(category, total) as by_category,
    -- By day
    jsonb_object_agg(day, total) as by_day
  FROM (
    SELECT
      s.name as store_name,
      ph.category,
      date_trunc('day', ph.purchase_date) as day,
      SUM(ph.total_price_cents) as total
    FROM purchase_history ph
    JOIN receipts r ON r.id = ph.receipt_id
    LEFT JOIN stores s ON s.id = r.store_id
    WHERE ph.household_id = p_household_id
      AND ph.purchase_date >= date_trunc('month', p_month)
      AND ph.purchase_date < date_trunc('month', p_month) + interval '1 month'
    GROUP BY GROUPING SETS (
      (s.name),
      (ph.category),
      (date_trunc('day', ph.purchase_date))
    )
  ) aggregated;
END;
$$ LANGUAGE plpgsql;
```

**Why This Works**:
- ✅ Profile loads instantly (< 500ms)
- ✅ Heavy queries only run when user needs them
- ✅ Server-side aggregation (efficient)
- ✅ Follows NN/g mobile performance guidance

---

## Empty States

### No Receipts Yet
```
┌────────────────────────────────────┐
│  💰 Spending This Month            │
│                                    │
│       📸                           │
│  Scan your first receipt           │
│  to start tracking spending        │
│                                    │
│  [Start Scanning]                  │
└────────────────────────────────────┘
```

### No Waste (Positive Reinforcement)
```
┌────────────────────────────────────┐
│  🗑️ Waste This Month                │
│                                    │
│       ✨                           │
│  No waste this month!              │
│  Keep it up!                       │
│                                    │
└────────────────────────────────────┘
```

### No Inventory
```
┌────────────────────────────────────┐
│  📦 Overview                       │
│                                    │
│       📦                           │
│  Your pantry is empty              │
│  Add items to get started          │
│                                    │
│  [Add Items]                       │
└────────────────────────────────────┘
```

**Why Empty States Matter**:
- ✅ Guides new users to first action
- ✅ Prevents "blank screen" confusion
- ✅ Increases engagement (clear CTA)
- ✅ Mobile UX best practice (NN/g)

---

## Navigation Flow

```
Profile Screen
│
├─ [View Details →]
│  └─ PurchaseHistoryScreen
│     ├─ Filter by month
│     ├─ Filter by store
│     ├─ Breakdown charts
│     └─ [Back to Profile]
│
├─ [Show in Pantry →]
│  └─ InventoryScreen (filtered)
│     └─ [Back to Profile]
│
├─ [Manage Household]
│  └─ HouseholdSettingsScreen
│     ├─ Edit name
│     ├─ Invite members
│     ├─ View members
│     └─ [Back to Profile]
│
├─ [Export Data]
│  └─ ExportDataModal
│     ├─ Select scope
│     ├─ Download CSV
│     └─ [Close]
│
└─ [Sign Out]
   └─ SignInScreen
```

---

## Implementation Checklist

### Phase 1: Fix Current Issues ✅
- [ ] Remove "Recent Receipts" list from profile
- [ ] Remove fake settings buttons (Notifications, Appearance placeholders)
- [ ] Change data sources from local stores to Supabase
- [ ] Add household info to header

### Phase 2: Core Cards 💰
- [ ] Implement Spending card with 3 stats + sparkline
- [ ] Create `get_monthly_spending_summary` RPC function
- [ ] Add empty state for no receipts
- [ ] Link "View Details" to PurchaseHistoryScreen (create screen)

### Phase 3: Waste Tracking 🗑️
- [ ] Create `waste_log` table
- [ ] Track expired items on delete
- [ ] Create `get_monthly_waste_with_action` RPC function
- [ ] Add "Show in Pantry" action
- [ ] Add positive empty state (no waste)

### Phase 4: Overview Card 📦
- [ ] Fetch inventory/shopping/expiring counts
- [ ] Make "Expiring Soon" clickable
- [ ] Add empty state for no inventory

### Phase 5: Settings ⚙️
- [ ] Group settings (Account, Preferences, Data, Support)
- [ ] Implement appearance toggle (light/dark/system)
- [ ] Implement export data (household vs user scope)
- [ ] Add Privacy/Terms links to footer

---

## Success Metrics

**Engagement**:
- % of users who tap "View Details" → measure interest in spending
- % of users who use "Show in Pantry" → measure waste action
- Avg time on profile (should be low - quick dashboard)

**Performance**:
- Profile load time < 500ms (target)
- Time to interactive < 1s

**Feature Adoption**:
- % of users with receipts scanned (spending card populated)
- % of users tracking waste (waste card populated)
- % of users exporting data (trust signal)

**Retention**:
- Users who return to profile weekly (dashboard habit)
- Users who act on waste suggestions (actionable insights)

---

## Summary

**What Changed**:
1. ✅ Spending card: 3 stats + sparkline (no dense tables)
2. ✅ Waste tracking: KPIs + actionable suggestion + one-tap filter
3. ✅ Receipts moved to PurchaseHistoryScreen (profile = summary)
4. ✅ Settings: Platform language, grouped, toggles for booleans
5. ✅ Compliance: Export with scope, Privacy/Terms in footer
6. ✅ Hierarchy: User+Household → 3 cards → Settings
7. ✅ Empty states: Illustrations + CTAs
8. ✅ Performance: Lightweight queries, defer heavy to detail screens

**Result**: Fast, scannable, actionable mobile dashboard following Material Design / HIG best practices.
