# Data Model Rationale - Feature Connection Analysis

## Overview
This document explains how each table and field in the PantryPal data schema connects to specific features, business requirements, and user experiences.

## Feature-to-Table Mapping

### 1. **User Authentication & Profiles**
**Tables:** `profiles`, `user_preferences`
**Features Enabled:**
- User registration and login
- Personalized settings (units, currency, dietary restrictions)
- Multi-device sync
- Push notification preferences

**Key Connections:**
- `profiles.id` → Links all user-specific data
- `user_preferences.dietary_restrictions` → Filters recipes, alerts for allergens
- `user_preferences.measurement_system` → Displays quantities in preferred units
- `user_preferences.expiry_warning_days` → Customizable notification timing

### 2. **Household Management**
**Tables:** `households`, `household_members`, `household_invites`
**Features Enabled:**
- Shared inventory among family/roommates
- Role-based permissions (owner, admin, member, viewer)
- Invitation system for adding members
- Household-specific settings

**Key Connections:**
- `household_members.role` → Controls edit permissions
- `household_members.can_edit_inventory` → Granular permission control
- `household_members.color` → Visual differentiation in UI
- `household_invites.token` → Secure invitation links

### 3. **Inventory Management**
**Tables:** `pantry_items`, `inventory_transactions`
**Features Enabled:**
- Track items in fridge/freezer/pantry
- Expiration date monitoring
- Quantity tracking with units
- Consumption pattern analysis
- Smart reordering
- Barcode scanning

**Key Design Decisions:**
- `pantry_items.normalized_name` → Enables fuzzy matching and deduplication
- `pantry_items.icon_emoji` → Visual identification (fixes current notes hack)
- `pantry_items.barcode` → Enables barcode scanning feature
- `pantry_items.min_quantity` → Automatic shopping list generation
- `pantry_items.opened_date` + `use_within_days` → Track freshness after opening
- `pantry_items.specific_location` → "Top shelf", "Drawer 2" for better organization
- `inventory_transactions` → Complete history for analytics and insights

### 4. **Shopping Lists**
**Tables:** `shopping_lists`, `shopping_list_items`
**Features Enabled:**
- Multiple lists per user/household
- Priority-based shopping
- Store-specific lists
- Recipe-generated items
- Recurring purchases
- Budget tracking

**Key Connections:**
- `shopping_list_items.pantry_item_id` → Link to inventory for easy restocking
- `shopping_list_items.recipe_id` → Track items added from recipes
- `shopping_list_items.assigned_to` → Delegate shopping tasks
- `shopping_list_items.is_recurring` → Automated list generation
- `shopping_list_items.priority` → Urgent items first
- `shopping_lists.budget` vs `actual_total` → Budget management

### 5. **Recipe Management**
**Tables:** `recipes`, `recipe_ingredients`, `user_recipes`
**Features Enabled:**
- Recipe discovery and search
- Cookability checking against inventory
- Personal recipe modifications
- Cooking history tracking
- Meal planning integration
- Dietary filtering

**Key Connections:**
- `recipe_ingredients.normalized_name` → Match against pantry items
- `user_recipes.modifications` → Store personal tweaks
- `user_recipes.times_cooked` → Track favorites automatically
- `recipes.dietary_tags` → Filter for dietary restrictions
- `recipes.total_time_minutes` → Quick meal suggestions
- Recipe → Shopping List → Inventory flow

### 6. **Receipt OCR & Processing**
**Tables:** `receipts`, `receipt_items`
**Features Enabled:**
- Receipt scanning and parsing
- Automatic inventory updates
- Price tracking
- Expense analysis
- Store preference learning

**Key Connections:**
- `receipt_items.pantry_item_id` → Direct inventory update
- `receipt_items.product_id` → Link to product database
- `receipt_items.confidence_score` → Fix queue for low-confidence items
- `receipts.store_id` → Track shopping patterns
- `receipts.savings_amount` → Track deals effectiveness

### 7. **Product Database & Barcodes**
**Tables:** `products`, `product_prices`
**Features Enabled:**
- Barcode scanning
- Price comparison across stores
- Nutritional information
- Allergen alerts
- Brand preferences

**Key Connections:**
- `products.barcode` → Instant product identification
- `product_prices.store_id` → Store-specific pricing
- `products.allergens` → Safety alerts
- `products.nutritional_info` → Dietary tracking
- `product_prices.sale_price` → Deal notifications

### 8. **Stores & Shopping**
**Tables:** `stores`, `user_stores`
**Features Enabled:**
- Store locator
- Hours and availability
- Curbside/delivery options
- Price tracking by store
- Personalized store lists

**Key Connections:**
- `user_stores.is_primary` → Default shopping location
- `stores.hours` → Shopping reminders
- `stores.supports_delivery` → Shopping options
- `product_prices` → Best price recommendations

### 9. **Meal Planning**
**Tables:** `meal_plans`, `meal_plan_items`
**Features Enabled:**
- Weekly meal scheduling
- Recipe rotation
- Shopping list generation from meal plans
- Family meal assignments

**Key Connections:**
- `meal_plan_items.recipe_id` → Inventory checking
- `meal_plan_items.assigned_cook` → Task delegation
- `meal_plan_items.servings` → Quantity planning
- Meal Plan → Recipe → Shopping List → Inventory flow

### 10. **Notifications & Alerts**
**Tables:** `notifications`
**Features Enabled:**
- Expiration warnings
- Low stock alerts
- Price drop notifications
- Shopping reminders
- Meal reminders

**Key Connections:**
- `notifications.data` → Links to relevant items/recipes
- `notifications.channels` → Multi-channel delivery
- `notifications.action_type` → Quick actions from notifications
- `notifications.scheduled_for` → Timed notifications

### 11. **Analytics & Insights**
**Tables:** `household_analytics`, `inventory_transactions`, `activity_logs`
**Features Enabled:**
- Waste tracking and reduction
- Spending analysis
- Consumption patterns
- Shopping frequency optimization
- Seasonal trends

**Key Connections:**
- `inventory_transactions` → Complete audit trail
- `household_analytics` → Pre-aggregated metrics
- `activity_logs` → User behavior analysis
- `household_analytics.waste_percentage` → Sustainability metrics

## Data Flow Examples

### Flow 1: Recipe to Dinner
1. User browses `recipes` filtered by `dietary_tags`
2. System checks `recipe_ingredients` against `pantry_items`
3. Missing items added to `shopping_list_items` with `recipe_id`
4. After shopping, `receipt_items` update `pantry_items`
5. Recipe added to `meal_plan_items`
6. After cooking, `inventory_transactions` records consumption
7. `user_recipes.times_cooked` incremented

### Flow 2: Smart Reordering
1. `pantry_items.quantity` falls below `min_quantity`
2. System checks `product_prices` for best deals
3. Item added to `shopping_list_items` with `priority='high'`
4. `notifications` sent for low stock
5. Historical data from `inventory_transactions` predicts usage

### Flow 3: Expiration Management
1. Daily job checks `pantry_items.expiry_date`
2. Items expiring within `user_preferences.expiry_warning_days` flagged
3. `notifications` created with suggestions
4. Recipes suggested that use expiring items
5. Expired items tracked in `inventory_transactions` as waste

### Flow 4: Barcode Scanning
1. User scans barcode
2. Lookup in `products.barcode`
3. If not found, external API called and saved
4. Product details shown with `nutritional_info`
5. Item added to `pantry_items` with `product_id`
6. `product_prices` checked for current store

## Performance Optimizations

### Normalized Fields
- `normalized_name` fields enable fast fuzzy matching
- Generated columns reduce computation
- Proper indexes on foreign keys and common queries

### Denormalization Trade-offs
- `household_analytics` pre-aggregates for dashboard performance
- `pantry_items.last_price` caches recent price
- `recipes.times_cooked` denormalizes from `user_recipes`

### Scalability Considerations
- UUID primary keys for distributed systems
- JSONB fields for flexible schema evolution
- Separate read/write concerns with analytics tables
- Row-level security for multi-tenancy

## Migration Path from Current State

### Phase 1: Core Tables
1. Migrate `InventoryItem` → `pantry_items`
   - Map `expirationDate` → `expiry_date`
   - Extract emoji from notes → `icon_emoji`
   - Add missing fields with defaults
2. Migrate `ShoppingItem` → `shopping_list_items`
   - Create default `shopping_lists` entry
   - Map fields appropriately
3. Create user accounts and households

### Phase 2: Relationships
1. Link shopping items to pantry items
2. Connect recipes to ingredients
3. Establish household memberships

### Phase 3: Enhanced Features
1. Add transaction logging
2. Enable notifications
3. Implement analytics
4. Add product database

### Phase 4: Advanced Features
1. Product database population
2. Store integration
3. Meal planning
4. ML predictions

## Key Improvements Over Original data-model.md

### Added Critical Fields:
- `pantry_items.icon_emoji` - Solves current emoji hack
- `pantry_items.barcode` - Enables scanning feature
- `pantry_items.opened_date` - Track freshness
- `pantry_items.min_quantity` - Auto-reordering
- `shopping_list_items.priority` - Urgent items
- `shopping_list_items.notes` - User context

### New Essential Tables:
- `inventory_transactions` - Audit trail
- `user_preferences` - Personalization
- `household_invites` - Invitation system
- `products` & `product_prices` - Barcode support
- `stores` - Shopping locations
- `meal_plans` - Meal planning
- `notifications` - Alert system
- `household_analytics` - Insights

### Enhanced Relationships:
- Proper household member roles
- Shopping → Pantry item linking
- Recipe → Shopping → Inventory flow
- Receipt → Product → Inventory flow

## Security Considerations

### Row Level Security
- Users only see their household's data
- Role-based permissions within households
- Private shopping lists with sharing

### Data Privacy
- Dietary restrictions encrypted
- Activity logs for audit
- Soft deletes for recovery

### Multi-tenancy
- Household isolation
- User preference isolation
- Performance isolation with indexes

## Future Extensibility

### ML Integration Points
- Consumption prediction from `inventory_transactions`
- Recipe recommendations from `user_recipes`
- Price predictions from `product_prices`
- Waste reduction from `household_analytics`

### Store Integration
- Real-time inventory from stores
- Automated price updates
- Curbside pickup scheduling
- Loyalty program integration

### Social Features
- Recipe sharing
- Shopping list collaboration
- Household competitions
- Community insights

## Conclusion
This comprehensive schema provides:
- **Complete feature support** for all PRD requirements
- **Data integrity** through proper relationships
- **Performance** through strategic indexing and denormalization
- **Scalability** through UUID keys and JSONB flexibility
- **Security** through RLS and audit trails
- **Future-proofing** through extensible design

The schema balances normalization for data integrity with strategic denormalization for performance, ensuring the app can scale from MVP to millions of users while maintaining sub-second response times for all critical operations.