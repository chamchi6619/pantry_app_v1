-- SQLite Schema for Pantry Pal Backend
-- Compatible with future Supabase migration

-- Users table (mock auth)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT,
    password_hash TEXT NOT NULL,
    household_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (household_id) REFERENCES households(id)
);

-- Households table
CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recipes table
CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE,
    title TEXT NOT NULL,
    title_en TEXT,
    summary TEXT,
    instructions TEXT,
    instructions_en TEXT,
    total_time_min INTEGER,
    prep_time_min INTEGER,
    cook_time_min INTEGER,
    yields TEXT,
    servings INTEGER,
    image_url TEXT,
    ingredients_vec TEXT,  -- CSV of ingredient IDs for fast matching
    required_count INTEGER, -- Precomputed ingredient count

    -- Attribution fields (mandatory)
    source_id TEXT NOT NULL,
    source_url TEXT NOT NULL,
    license_code TEXT NOT NULL,
    license_url TEXT,
    attribution_text TEXT NOT NULL,
    instructions_allowed INTEGER DEFAULT 1,
    share_alike_required INTEGER DEFAULT 0,
    takedown INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES sources(id)
);

-- Ingredients table
CREATE TABLE IF NOT EXISTS ingredients (
    id TEXT PRIMARY KEY,
    canonical_name TEXT UNIQUE NOT NULL,
    display_name TEXT,
    aliases TEXT,  -- JSON array of alternative names
    category TEXT,
    fdc_id TEXT,  -- USDA Food Data Central ID
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recipe ingredients junction
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL,
    ingredient_id TEXT,
    qty_value REAL,
    qty_unit TEXT,
    prep_note TEXT,
    raw_text TEXT NOT NULL,
    display_order INTEGER,
    optional INTEGER DEFAULT 0,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
);

-- Nutrition table
CREATE TABLE IF NOT EXISTS nutrition (
    recipe_id TEXT PRIMARY KEY,
    calories INTEGER,
    protein_g REAL,
    fat_g REAL,
    saturated_fat_g REAL,
    carbs_g REAL,
    fiber_g REAL,
    sugar_g REAL,
    sodium_mg REAL,
    cholesterol_mg REAL,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    type TEXT, -- diet|meal|cuisine|technique|difficulty
    description TEXT
);

-- Recipe tags junction
CREATE TABLE IF NOT EXISTS recipe_tags (
    recipe_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (recipe_id, tag_id),
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id)
);

-- Sources table
CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    territory TEXT,
    license_code TEXT NOT NULL,
    license_url TEXT,
    tos_notes TEXT,
    base_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Staples table (for pantry matching)
CREATE TABLE IF NOT EXISTS staples (
    ingredient_id TEXT PRIMARY KEY,
    penalty_weight REAL DEFAULT 0.1,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
);

-- Receipts table (OCR results)
CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    store_name TEXT,
    store_location TEXT,
    date TEXT,
    total_amount REAL,
    subtotal_amount REAL,
    tax_amount REAL,
    discount_amount REAL,
    payment_method TEXT,
    image_path TEXT,
    raw_ocr_text TEXT,
    parsed_data TEXT,  -- JSON of parsed structure
    confidence_score REAL,
    status TEXT DEFAULT 'pending',  -- pending|needs_review|reviewed|processed
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (household_id) REFERENCES households(id)
);

-- Receipt items table (parsed items from receipts)
CREATE TABLE IF NOT EXISTS receipt_items (
    id TEXT PRIMARY KEY,
    receipt_id TEXT NOT NULL,
    raw_text TEXT,
    parsed_name TEXT,
    quantity REAL DEFAULT 1,
    unit TEXT DEFAULT 'item',
    price REAL,
    total_price REAL,
    category TEXT,
    matched_ingredient_id TEXT,
    confidence REAL,
    needs_review INTEGER DEFAULT 0,
    reviewed INTEGER DEFAULT 0,
    display_order INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE,
    FOREIGN KEY (matched_ingredient_id) REFERENCES ingredients(id)
);

-- Refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_recipes_time ON recipes(total_time_min);
CREATE INDEX IF NOT EXISTS idx_recipes_takedown ON recipes(takedown);
CREATE INDEX IF NOT EXISTS idx_recipes_source ON recipes(source_id);
CREATE INDEX IF NOT EXISTS idx_ri_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_ri_ingredient ON recipe_ingredients(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_rt_recipe ON recipe_tags(recipe_id);
CREATE INDEX IF NOT EXISTS idx_rt_tag ON recipe_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_receipts_household ON receipts(household_id);
CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt ON receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_review ON receipt_items(needs_review);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_household ON users(household_id);

-- FTS5 Virtual Table for recipe search
CREATE VIRTUAL TABLE IF NOT EXISTS recipes_fts USING fts5(
    title,
    ingredients_flat,
    content=recipes,
    tokenize='unicode61'
);

-- Trigger to update timestamps
CREATE TRIGGER IF NOT EXISTS update_recipes_timestamp
AFTER UPDATE ON recipes
BEGIN
    UPDATE recipes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_users_timestamp
AFTER UPDATE ON users
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_receipts_timestamp
AFTER UPDATE ON receipts
BEGIN
    UPDATE receipts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;