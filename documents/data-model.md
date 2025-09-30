# PantryPal Data Model (MVPUpdated)

Target: Supabase / Postgres

Scope: Auth, Pantry CRUD (manual + OCR), Shopping Lists, Receipts, Recipes

---

## 1. profiles
**Purpose**: Stores user account–level metadata, preferences, and dietary restrictions. One-to-one with Auth user.

**Fields**:
- `id uuid pk` — same as Auth user id
- `email text unique null` — user email, may be null if social login
- `display_name text`
- `avatar_url text`
- `dietary_restrictions jsonb` — e.g., `{ "allergens": ["peanut"], "diets": ["vegetarian"] }`
- `created_at timestamptz default now()`

---

## 2. households
**Purpose**: Shared space for members, pantry, and shopping lists.

**Fields**:
- `id uuid pk`
- `name text default 'My household'`
- `created_at timestamptz default now()`

**Behavior**: Household is deleted if it has no members.

---

## 3. household_members
**Purpose**: Connects users to households.

**Fields**:
- `household_id uuid fk → households.id`
- `user_id uuid fk → profiles.id`
- `joined_at timestamptz default now()`

**PK**: (`household_id`, `user_id`)

**Notes**: No `role`. Any member can invite/leave. If last member leaves, household is deleted.

---

## 4. pantry_items
**Purpose**: Household inventory.

**Fields**:
- `id uuid pk`
- `household_id uuid fk → households.id`
- `name text`
- `normalized_name text generated always as (...) stored`
- `canonical_id uuid fk → canonical_items.id null`
- `image_url text null`
- `quantity numeric default 0`
- `unit text` — controlled set: pcs, g, kg, ml, l, tbsp, tsp, etc.
- `expiry_date date null`
- `category text null`
- `location text check (location in ('fridge','freezer','pantry'))`
- `status text default 'active' check (status in ('active','consumed','expired'))`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

**Indexes**:
- `(household_id, normalized_name)`
- `(household_id, expiry_date)`

---

## 5. shopping_lists
**Purpose**: A single, private shopping list per user (not shared in household). Future possibility: allow multiple lists with visibility (private vs household-shared).


**Fields**:
- `id uuid pk`
- `user_id uuid fk → profiles.id`
- `title text`
- `created_at timestamptz default now()`


**Constraints/Indexes**:
- `unique(user_id)` — enforce one shopping list per user for now.


**Notes**: When we introduce multiple lists, we'll drop `unique(user_id)` and add `visibility enum('private','household')` plus optional `household_id`.

---

## 6. shopping_list_items
**Purpose**: Items under a shopping list.

**Fields**:
- `id uuid pk`
- `list_id uuid fk → shopping_lists.id`
- `name text`
- `normalized_name text`
- `canonical_id uuid fk → canonical_items.id null`
- `quantity numeric default 1`
- `unit text`
- `checked boolean default false`
- `matched_pantry_item_id uuid fk → pantry_items.id null`
- `created_at timestamptz default now()`

**Indexes**:
- `(list_id, checked)`

**Behavior**:
- Checking an item does **not** add it to pantry.
- User must explicitly trigger “Add checked to pantry”.
- On add: transaction creates/merges pantry_items and deletes shopping_list_items that were moved.

---

## 7. receipts
**Purpose**: Uploaded receipts (OCR input).

**Fields**:
- `id uuid pk`
- `household_id uuid fk → households.id`
- `file_url text`
- `status text check (status in ('processing','done','failed'))`
- `raw_text text`
- `vendor text null`
- `purchased_at timestamptz null`
- `created_at timestamptz default now()`

---

## 8. receipt_items
**Purpose**: Parsed line items from receipts.

**Fields**:
- `id uuid pk`
- `receipt_id uuid fk → receipts.id`
- `name text`
- `normalized_name text`
- `canonical_id uuid fk → canonical_items.id null`
- `quantity numeric`
- `unit text`
- `confidence numeric`
- `mapped_pantry_item_id uuid fk → pantry_items.id null`
- `price numeric(12,2) null`
- `currency text null`
- `total numeric(12,2) null`
- `upc text null`
- `created_at timestamptz default now()`

---

## 9. recipes
**Purpose**: Global recipe library for browsing and cookability check.

**Fields**:
- `id uuid pk`
- `title text`
- `ingredients jsonb` — array of `{ name, quantity, unit }`
- `instructions text`
- `cooking_method text null`
- `diet_tags jsonb`
- `time_minutes int`
- `image_url text null`
- `created_at timestamptz default now()`

**Indexes**:
- `(title)`

**Cookability logic**:
- Filter recipes against `profiles.dietary_restrictions`.
- Match `ingredients[*].name` → `pantry_items.normalized_name/canonical_id`.
- Compute coverage ratio; generate missing items list.

---

## 10. canonical_items (supporting table)
**Purpose**: Normalize synonyms and variants into canonical concepts.

**Fields**:
- `id uuid pk`
- `canonical_name text`
- `aliases jsonb[]`
- `category text`
- `created_at timestamptz default now()`

---

## RLS Policies
- All household-scoped tables (pantry_items, shopping_lists, shopping_list_items, receipts, receipt_items) use `is_member(household_id)`.
- profiles: only self can read/write.
- recipes: read-only.

---
