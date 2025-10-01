-- Pantry Pal Initial Schema for Supabase
-- Phase 1: Core tables with relaxed constraints for migration
-- Compatible with existing Expo app data structures

-- ============================================
-- EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text matching
CREATE EXTENSION IF NOT EXISTS "unaccent"; -- For text normalization

-- ============================================
-- CORE USER & HOUSEHOLD TABLES
-- ============================================

-- User profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text UNIQUE,
    display_name text,
    avatar_url text,
    phone text,
    timezone text DEFAULT 'UTC',
    locale text DEFAULT 'en-US',
    onboarding_completed boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- User preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    measurement_system text DEFAULT 'imperial',
    default_location text DEFAULT 'pantry',
    currency text DEFAULT 'USD',
    expiry_warning_days int DEFAULT 7,
    low_stock_threshold int DEFAULT 2,
    enable_notifications boolean DEFAULT true,
    dietary_restrictions jsonb DEFAULT '{"allergens": [], "diets": [], "dislikes": []}'::jsonb,
    updated_at timestamptz DEFAULT now()
);

-- Households
CREATE TABLE IF NOT EXISTS households (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL DEFAULT 'My Household',
    type text DEFAULT 'family',
    created_by uuid REFERENCES profiles(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Household members
CREATE TABLE IF NOT EXISTS household_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid REFERENCES households(id) ON DELETE CASCADE,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    role text DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    can_edit_inventory boolean DEFAULT true,
    can_edit_shopping boolean DEFAULT true,
    joined_at timestamptz DEFAULT now(),
    UNIQUE(household_id, user_id)
);

-- ============================================
-- INVENTORY MANAGEMENT (App-Compatible)
-- ============================================

-- Main inventory items table (relaxed for migration)
CREATE TABLE IF NOT EXISTS pantry_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid REFERENCES households(id) ON DELETE CASCADE,

    -- Basic info (matching app structure)
    name text NOT NULL,
    normalized_name text GENERATED ALWAYS AS (lower(regexp_replace(name, '[^a-z0-9]+', '', 'gi'))) STORED,
    normalized text GENERATED ALWAYS AS (lower(regexp_replace(name, '[^a-z0-9]+', '', 'gi'))) STORED, -- Alias for app compatibility

    -- Quantities & units (relaxed - no enum constraint)
    quantity numeric NOT NULL DEFAULT 1,
    unit text NOT NULL DEFAULT 'piece',

    -- Location & storage
    location text NOT NULL DEFAULT 'pantry' CHECK (location IN ('fridge', 'freezer', 'pantry')),

    -- Categories & organization
    category text,
    notes text, -- For emoji storage (app compatibility)

    -- Dates
    expiry_date date,
    expiration_date date GENERATED ALWAYS AS (expiry_date) STORED, -- Alias for app
    purchase_date date DEFAULT CURRENT_DATE,

    -- Status
    status text DEFAULT 'active',

    -- Metadata
    added_by uuid REFERENCES profiles(id),
    source text DEFAULT 'manual',

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Track inventory changes
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid REFERENCES households(id) ON DELETE CASCADE,
    pantry_item_id uuid REFERENCES pantry_items(id) ON DELETE CASCADE,
    user_id uuid REFERENCES profiles(id),

    transaction_type text NOT NULL,
    quantity_change numeric NOT NULL,
    quantity_before numeric,
    quantity_after numeric,

    reason text,

    created_at timestamptz DEFAULT now()
);

-- ============================================
-- SHOPPING LISTS (Simplified for Phase 1)
-- ============================================

-- Shopping lists
CREATE TABLE IF NOT EXISTS shopping_lists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid REFERENCES households(id) ON DELETE CASCADE,

    title text NOT NULL DEFAULT 'Shopping List',
    is_active boolean DEFAULT true,

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Shopping list items (app-compatible)
CREATE TABLE IF NOT EXISTS shopping_list_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id uuid REFERENCES shopping_lists(id) ON DELETE CASCADE,

    -- Item details (matching app structure)
    name text NOT NULL,
    quantity numeric DEFAULT 1,
    unit text,
    category text,

    -- Status
    checked boolean DEFAULT false,
    status text GENERATED ALWAYS AS (
        CASE WHEN checked THEN 'done' ELSE 'pending' END
    ) STORED,

    -- Links
    pantry_item_id uuid REFERENCES pantry_items(id) ON DELETE SET NULL,

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_pantry_household_location ON pantry_items(household_id, location);
CREATE INDEX IF NOT EXISTS idx_pantry_expiry ON pantry_items(household_id, expiry_date)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_pantry_normalized ON pantry_items(household_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_shopping_list_household ON shopping_lists(household_id, is_active);
CREATE INDEX IF NOT EXISTS idx_shopping_items_list ON shopping_list_items(list_id, checked);
CREATE INDEX IF NOT EXISTS idx_transactions_item ON inventory_transactions(pantry_item_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Check if user is household member
CREATE OR REPLACE FUNCTION is_household_member(h_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = h_id
    AND user_id = auth.uid()
  );
$$;

-- Get user's active household (or create default)
CREATE OR REPLACE FUNCTION get_or_create_household()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  household_uuid uuid;
BEGIN
  -- Try to get existing household
  SELECT hm.household_id INTO household_uuid
  FROM household_members hm
  WHERE hm.user_id = auth.uid()
  LIMIT 1;

  -- If no household, create one
  IF household_uuid IS NULL THEN
    INSERT INTO households (name, created_by)
    VALUES ('My Household', auth.uid())
    RETURNING id INTO household_uuid;

    -- Add user as owner
    INSERT INTO household_members (household_id, user_id, role)
    VALUES (household_uuid, auth.uid(), 'owner');
  END IF;

  RETURN household_uuid;
END;
$$;

-- ============================================
-- TRIGGERS
-- ============================================

-- Updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_households_updated_at BEFORE UPDATE ON households
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pantry_items_updated_at BEFORE UPDATE ON pantry_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shopping_lists_updated_at BEFORE UPDATE ON shopping_lists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shopping_items_updated_at BEFORE UPDATE ON shopping_list_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  household_uuid uuid;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  -- Create user preferences with defaults
  INSERT INTO public.user_preferences (user_id)
  VALUES (new.id);

  -- Create default household
  INSERT INTO public.households (name, created_by)
  VALUES ('My Household', new.id)
  RETURNING id INTO household_uuid;

  -- Add user as owner of household
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (household_uuid, new.id, 'owner');

  -- Create default shopping list
  INSERT INTO public.shopping_lists (household_id, title, is_active)
  VALUES (household_uuid, 'Shopping List', true);

  RETURN new;
END;
$$;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- ROW LEVEL SECURITY (Start Permissive)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read/update own profile
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- User preferences: Same as profile
CREATE POLICY "Users can view own preferences" ON user_preferences
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" ON user_preferences
    FOR ALL USING (auth.uid() = user_id);

-- Households: Members can view
CREATE POLICY "Members can view household" ON households
    FOR SELECT USING (
        id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid()
        )
    );

-- Household members: Members can view
CREATE POLICY "Members can view household members" ON household_members
    FOR SELECT USING (is_household_member(household_id));

-- Pantry items: Household members full access (Phase 1 - permissive)
CREATE POLICY "Members can manage pantry items" ON pantry_items
    FOR ALL USING (is_household_member(household_id));

-- Transactions: Household members can view and create
CREATE POLICY "Members can view transactions" ON inventory_transactions
    FOR SELECT USING (is_household_member(household_id));

CREATE POLICY "Members can create transactions" ON inventory_transactions
    FOR INSERT WITH CHECK (is_household_member(household_id));

-- Shopping lists: Household members full access
CREATE POLICY "Members can manage shopping lists" ON shopping_lists
    FOR ALL USING (is_household_member(household_id));

-- Shopping list items: Through list ownership
CREATE POLICY "Members can manage shopping items" ON shopping_list_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM shopping_lists
            WHERE shopping_lists.id = shopping_list_items.list_id
            AND is_household_member(shopping_lists.household_id)
        )
    );

-- ============================================
-- INITIAL DATA & GRANTS
-- ============================================

-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;