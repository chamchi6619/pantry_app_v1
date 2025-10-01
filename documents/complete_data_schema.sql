-- PantryPal Complete Data Schema v2.0
-- Target: Supabase/PostgreSQL
-- Comprehensive schema supporting all PRD features + future scalability

-- ============================================
-- CORE USER & HOUSEHOLD TABLES
-- ============================================

-- User profiles (extends Supabase auth.users)
CREATE TABLE profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id),
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

-- User preferences and settings
CREATE TABLE user_preferences (
    user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    measurement_system text DEFAULT 'imperial' CHECK (measurement_system IN ('metric', 'imperial')),
    default_location text DEFAULT 'pantry' CHECK (default_location IN ('fridge', 'freezer', 'pantry')),
    currency text DEFAULT 'USD',
    expiry_warning_days int DEFAULT 7,
    low_stock_threshold int DEFAULT 2,
    enable_notifications boolean DEFAULT true,
    enable_barcode_scan boolean DEFAULT true,
    enable_smart_suggestions boolean DEFAULT true,
    shopping_day text[], -- ['monday', 'thursday']
    monthly_budget numeric(12,2),
    dietary_restrictions jsonb DEFAULT '{"allergens": [], "diets": [], "dislikes": []}'::jsonb,
    updated_at timestamptz DEFAULT now()
);

-- Households for shared inventory
CREATE TABLE households (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL DEFAULT 'My Household',
    type text DEFAULT 'family' CHECK (type IN ('family', 'shared', 'commercial')),
    timezone text DEFAULT 'UTC',
    currency text DEFAULT 'USD',
    subscription_tier text DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium', 'business')),
    member_limit int DEFAULT 10,
    storage_limit_mb int DEFAULT 500,
    created_by uuid REFERENCES profiles(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Household members with roles
CREATE TABLE household_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid REFERENCES households(id) ON DELETE CASCADE,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    role text DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    nickname text, -- Display name within household
    color text, -- For UI differentiation
    can_edit_inventory boolean DEFAULT true,
    can_edit_shopping boolean DEFAULT true,
    can_view_receipts boolean DEFAULT true,
    joined_at timestamptz DEFAULT now(),
    last_active_at timestamptz DEFAULT now(),
    UNIQUE(household_id, user_id)
);

-- Household invitations
CREATE TABLE household_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid REFERENCES households(id) ON DELETE CASCADE,
    email text NOT NULL,
    role text DEFAULT 'member',
    invited_by uuid REFERENCES profiles(id),
    token text UNIQUE DEFAULT gen_random_uuid(),
    accepted boolean DEFAULT false,
    expires_at timestamptz DEFAULT (now() + interval '7 days'),
    created_at timestamptz DEFAULT now()
);

-- ============================================
-- INVENTORY MANAGEMENT
-- ============================================

-- Main inventory items table
CREATE TABLE pantry_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid REFERENCES households(id) ON DELETE CASCADE,

    -- Basic info
    name text NOT NULL,
    normalized_name text GENERATED ALWAYS AS (lower(regexp_replace(name, '[^a-z0-9]+', '', 'gi'))) STORED,
    brand text,
    description text,

    -- Visual & identification
    icon_emoji text,
    image_url text,
    barcode text,
    product_id uuid REFERENCES products(id), -- Link to product database

    -- Quantities & units
    quantity numeric NOT NULL DEFAULT 1,
    unit text NOT NULL DEFAULT 'piece',
    serving_size numeric,
    serving_unit text,

    -- Location & storage
    location text NOT NULL CHECK (location IN ('fridge', 'freezer', 'pantry')),
    specific_location text, -- "Top shelf", "Drawer 2"
    container_type text, -- "Original", "Tupperware", "Ziploc"

    -- Dates
    purchase_date date DEFAULT CURRENT_DATE,
    expiry_date date,
    opened_date date,
    best_by_date date,
    use_within_days int, -- Days to use after opening

    -- Categories & organization
    category text,
    subcategory text,
    tags text[],
    is_staple boolean DEFAULT false,

    -- Tracking & automation
    min_quantity numeric DEFAULT 0, -- Auto-add to shopping when below
    max_quantity numeric, -- Don't overbuy
    reorder_point numeric, -- Trigger reorder
    usual_price numeric(12,2),
    last_price numeric(12,2),

    -- Status
    status text DEFAULT 'active' CHECK (status IN ('active', 'low', 'expired', 'consumed')),
    is_opened boolean DEFAULT false,
    is_favorite boolean DEFAULT false,

    -- Metadata
    added_by uuid REFERENCES profiles(id),
    last_modified_by uuid REFERENCES profiles(id),
    source text CHECK (source IN ('manual', 'receipt', 'barcode', 'recipe', 'shared')),
    confidence_score numeric DEFAULT 1.0,
    notes text,

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Track all inventory changes for analytics
CREATE TABLE inventory_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid REFERENCES households(id) ON DELETE CASCADE,
    pantry_item_id uuid REFERENCES pantry_items(id) ON DELETE CASCADE,
    user_id uuid REFERENCES profiles(id),

    transaction_type text NOT NULL CHECK (transaction_type IN (
        'add', 'consume', 'waste', 'expire', 'adjust', 'move', 'share'
    )),

    quantity_change numeric NOT NULL,
    quantity_before numeric,
    quantity_after numeric,
    unit text,

    location_from text,
    location_to text,

    reason text,
    recipe_id uuid REFERENCES recipes(id),
    receipt_id uuid REFERENCES receipts(id),

    cost numeric(12,2),

    created_at timestamptz DEFAULT now()
);

-- ============================================
-- SHOPPING LISTS
-- ============================================

-- Shopping lists (multiple per user/household)
CREATE TABLE shopping_lists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    household_id uuid REFERENCES households(id) ON DELETE SET NULL,

    title text NOT NULL DEFAULT 'Shopping List',
    description text,

    type text DEFAULT 'grocery' CHECK (type IN ('grocery', 'hardware', 'pharmacy', 'other')),
    visibility text DEFAULT 'private' CHECK (visibility IN ('private', 'household', 'shared')),

    is_active boolean DEFAULT true, -- Primary list
    is_template boolean DEFAULT false, -- Reusable template

    store_id uuid REFERENCES stores(id),
    planned_date date,

    budget numeric(12,2),
    estimated_total numeric(12,2),
    actual_total numeric(12,2),

    shared_with uuid[], -- User IDs for shared lists

    completed_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Items in shopping lists
CREATE TABLE shopping_list_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id uuid REFERENCES shopping_lists(id) ON DELETE CASCADE,

    -- Item details
    name text NOT NULL,
    normalized_name text,
    brand_preference text,

    -- Links
    pantry_item_id uuid REFERENCES pantry_items(id) ON DELETE SET NULL,
    product_id uuid REFERENCES products(id),
    recipe_id uuid REFERENCES recipes(id),

    -- Quantities
    quantity numeric DEFAULT 1,
    unit text,

    -- Organization
    category text,
    aisle text,
    priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

    -- Assignment & status
    assigned_to uuid REFERENCES profiles(id),
    checked boolean DEFAULT false,
    checked_by uuid REFERENCES profiles(id),
    checked_at timestamptz,

    -- Pricing
    estimated_price numeric(12,2),
    actual_price numeric(12,2),
    on_sale boolean DEFAULT false,
    coupon_available boolean DEFAULT false,

    -- Metadata
    notes text,
    image_url text,

    -- Recurrence
    is_recurring boolean DEFAULT false,
    recurrence_pattern text, -- 'weekly', 'biweekly', 'monthly'
    last_purchased date,

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ============================================
-- PRODUCTS & BARCODES
-- ============================================

-- Global product database
CREATE TABLE products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    barcode text UNIQUE,
    name text NOT NULL,
    brand text,
    manufacturer text,

    category text,
    subcategory text,

    size numeric,
    size_unit text,
    serving_size numeric,
    serving_unit text,
    servings_per_container numeric,

    ingredients text[],
    allergens text[],

    image_url text,
    thumbnail_url text,

    avg_price numeric(12,2),
    price_currency text DEFAULT 'USD',

    nutritional_info jsonb,

    verified boolean DEFAULT false,
    source text, -- 'user', 'api', 'official'
    external_id text, -- ID from external API

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Store-specific product prices
CREATE TABLE product_prices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid REFERENCES products(id) ON DELETE CASCADE,
    store_id uuid REFERENCES stores(id) ON DELETE CASCADE,

    price numeric(12,2) NOT NULL,
    sale_price numeric(12,2),

    currency text DEFAULT 'USD',

    in_stock boolean DEFAULT true,
    last_seen timestamptz DEFAULT now(),

    created_at timestamptz DEFAULT now()
);

-- ============================================
-- STORES
-- ============================================

-- Store information
CREATE TABLE stores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    chain_name text,

    address text,
    city text,
    state text,
    zip text,
    country text DEFAULT 'US',

    latitude numeric,
    longitude numeric,

    phone text,
    website text,

    hours jsonb, -- {"monday": {"open": "08:00", "close": "22:00"}}

    has_pharmacy boolean DEFAULT false,
    has_bakery boolean DEFAULT false,
    has_deli boolean DEFAULT false,

    supports_curbside boolean DEFAULT false,
    supports_delivery boolean DEFAULT false,

    created_at timestamptz DEFAULT now()
);

-- User's favorite stores
CREATE TABLE user_stores (
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
    is_primary boolean DEFAULT false,
    nickname text,
    PRIMARY KEY (user_id, store_id)
);

-- ============================================
-- RECIPES
-- ============================================

-- Recipe collection
CREATE TABLE recipes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Basic info
    title text NOT NULL,
    slug text UNIQUE,
    description text,
    difficulty text CHECK (difficulty IN ('easy', 'medium', 'hard')),

    -- Instructions
    instructions text,
    instructions_json jsonb, -- Structured steps
    video_url text,

    -- Timing
    prep_time_minutes int,
    cook_time_minutes int,
    total_time_minutes int,

    -- Yield
    servings int,
    yield_amount numeric,
    yield_unit text,

    -- Categories
    cuisine text[],
    meal_type text[], -- breakfast, lunch, dinner, snack
    course text[], -- appetizer, main, dessert
    season text[], -- spring, summer, fall, winter
    occasion text[], -- holiday, party, weeknight

    -- Dietary
    dietary_tags text[], -- vegan, gluten-free, keto
    allergen_info text[],

    -- Media
    image_url text,
    thumbnail_url text,

    -- Attribution
    source text,
    source_url text,
    author text,
    license text,

    -- Analytics
    times_cooked int DEFAULT 0,
    avg_rating numeric(2,1),
    total_ratings int DEFAULT 0,
    favorites_count int DEFAULT 0,

    -- Metadata
    is_public boolean DEFAULT true,
    created_by uuid REFERENCES profiles(id),

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Recipe ingredients with quantities
CREATE TABLE recipe_ingredients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id uuid REFERENCES recipes(id) ON DELETE CASCADE,

    ingredient_name text NOT NULL,
    normalized_name text,
    product_id uuid REFERENCES products(id),

    amount numeric,
    unit text,

    preparation text, -- "diced", "minced"
    notes text, -- "or substitute with..."

    is_optional boolean DEFAULT false,
    ingredient_group text, -- "For the sauce", "For the marinade"

    sort_order int,

    created_at timestamptz DEFAULT now()
);

-- User's interaction with recipes
CREATE TABLE user_recipes (
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    recipe_id uuid REFERENCES recipes(id) ON DELETE CASCADE,

    is_favorite boolean DEFAULT false,
    rating int CHECK (rating >= 1 AND rating <= 5),
    notes text,

    times_cooked int DEFAULT 0,
    last_cooked_at timestamptz,

    modifications jsonb, -- Personal tweaks

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    PRIMARY KEY (user_id, recipe_id)
);

-- ============================================
-- RECEIPTS & OCR
-- ============================================

-- Scanned receipts
CREATE TABLE receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid REFERENCES households(id) ON DELETE CASCADE,
    uploaded_by uuid REFERENCES profiles(id),

    -- Store info
    store_name text,
    store_id uuid REFERENCES stores(id),
    store_address text,

    -- Receipt details
    receipt_date timestamptz,
    receipt_number text,

    -- Amounts
    subtotal numeric(12,2),
    tax_amount numeric(12,2),
    total_amount numeric(12,2),
    savings_amount numeric(12,2),

    payment_method text,

    -- OCR data
    image_url text,
    raw_ocr_text text,
    ocr_confidence numeric,

    -- Processing status
    status text DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'needs_review', 'completed', 'failed'
    )),

    processed_at timestamptz,
    reviewed_by uuid REFERENCES profiles(id),

    notes text,

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Items extracted from receipts
CREATE TABLE receipt_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id uuid REFERENCES receipts(id) ON DELETE CASCADE,

    -- Extracted text
    raw_text text,
    line_number int,

    -- Parsed data
    product_name text,
    normalized_name text,
    brand text,

    -- Matching
    product_id uuid REFERENCES products(id),
    pantry_item_id uuid REFERENCES pantry_items(id),

    -- Quantities & price
    quantity numeric DEFAULT 1,
    unit text,
    unit_price numeric(12,2),
    total_price numeric(12,2),

    -- Review status
    confidence_score numeric,
    needs_review boolean DEFAULT false,
    reviewed boolean DEFAULT false,

    -- Category mapping
    category text,

    created_at timestamptz DEFAULT now()
);

-- ============================================
-- MEAL PLANNING
-- ============================================

-- Meal plans
CREATE TABLE meal_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid REFERENCES households(id) ON DELETE CASCADE,

    name text,
    start_date date NOT NULL,
    end_date date NOT NULL,

    is_active boolean DEFAULT true,

    created_by uuid REFERENCES profiles(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Scheduled meals
CREATE TABLE meal_plan_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_plan_id uuid REFERENCES meal_plans(id) ON DELETE CASCADE,

    date date NOT NULL,
    meal_type text CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),

    recipe_id uuid REFERENCES recipes(id),
    custom_meal_name text, -- For non-recipe meals

    servings int DEFAULT 1,
    assigned_cook uuid REFERENCES profiles(id),

    notes text,
    completed boolean DEFAULT false,

    created_at timestamptz DEFAULT now()
);

-- ============================================
-- NOTIFICATIONS & ALERTS
-- ============================================

-- Notification queue
CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,

    type text NOT NULL CHECK (type IN (
        'expiring_soon', 'expired', 'low_stock', 'price_drop',
        'shopping_reminder', 'meal_reminder', 'shared_list_update',
        'household_invite', 'recipe_suggestion'
    )),

    title text NOT NULL,
    message text,

    -- Related entities
    data jsonb, -- {pantry_item_id: '', days_until_expiry: 3}

    -- Delivery
    channels text[] DEFAULT '{in_app}', -- in_app, push, email

    -- Status
    read boolean DEFAULT false,
    read_at timestamptz,
    dismissed boolean DEFAULT false,

    -- Action
    action_type text, -- 'view_item', 'add_to_list'
    action_data jsonb,

    scheduled_for timestamptz DEFAULT now(),
    sent_at timestamptz,

    created_at timestamptz DEFAULT now()
);

-- ============================================
-- ANALYTICS & INSIGHTS
-- ============================================

-- Aggregated household statistics
CREATE TABLE household_analytics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid REFERENCES households(id) ON DELETE CASCADE,

    period_start date NOT NULL,
    period_end date NOT NULL,
    period_type text CHECK (period_type IN ('day', 'week', 'month', 'year')),

    -- Inventory metrics
    total_items int,
    items_added int,
    items_consumed int,
    items_wasted int,
    waste_percentage numeric(5,2),

    -- Financial metrics
    total_spent numeric(12,2),
    total_saved numeric(12,2),
    avg_item_cost numeric(12,2),

    -- Shopping metrics
    shopping_trips int,
    avg_trip_cost numeric(12,2),

    -- Category breakdown
    category_spending jsonb, -- {"Dairy": 45.50, "Produce": 120.30}

    -- Consumption patterns
    top_consumed_items jsonb,
    consumption_velocity jsonb, -- Items per day by category

    created_at timestamptz DEFAULT now()
);

-- ============================================
-- SUPPORT TABLES
-- ============================================

-- Canonical items for normalization
CREATE TABLE canonical_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name text UNIQUE NOT NULL,
    aliases text[],
    category text,
    typical_unit text,
    typical_location text,
    is_perishable boolean DEFAULT true,
    typical_shelf_life_days int,
    created_at timestamptz DEFAULT now()
);

-- System activity logs
CREATE TABLE activity_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES profiles(id),
    household_id uuid REFERENCES households(id),

    action text NOT NULL,
    entity_type text,
    entity_id uuid,

    details jsonb,
    ip_address inet,
    user_agent text,

    created_at timestamptz DEFAULT now()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Pantry items
CREATE INDEX idx_pantry_household_location ON pantry_items(household_id, location);
CREATE INDEX idx_pantry_expiry ON pantry_items(household_id, expiry_date)
    WHERE status = 'active';
CREATE INDEX idx_pantry_normalized ON pantry_items(household_id, normalized_name);
CREATE INDEX idx_pantry_barcode ON pantry_items(barcode) WHERE barcode IS NOT NULL;

-- Shopping lists
CREATE INDEX idx_shopping_list_user ON shopping_lists(user_id, is_active);
CREATE INDEX idx_shopping_items_list ON shopping_list_items(list_id, checked);
CREATE INDEX idx_shopping_items_recurring ON shopping_list_items(list_id)
    WHERE is_recurring = true;

-- Recipes
CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_ingredients_normalized ON recipe_ingredients(normalized_name);
CREATE INDEX idx_user_recipes_favorites ON user_recipes(user_id)
    WHERE is_favorite = true;

-- Transactions
CREATE INDEX idx_transactions_item ON inventory_transactions(pantry_item_id);
CREATE INDEX idx_transactions_date ON inventory_transactions(household_id, created_at);

-- Notifications
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read, scheduled_for);

-- Products
CREATE INDEX idx_product_barcode ON products(barcode);
CREATE INDEX idx_product_prices_store ON product_prices(store_id, product_id);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;

-- Example RLS policies
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Household members can view inventory" ON pantry_items
    FOR SELECT USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Household members can edit inventory" ON pantry_items
    FOR ALL USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid()
            AND can_edit_inventory = true
        )
    );

CREATE POLICY "Users can manage own shopping lists" ON shopping_lists
    FOR ALL USING (
        user_id = auth.uid()
        OR auth.uid() = ANY(shared_with)
    );