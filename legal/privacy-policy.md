# Privacy Policy

**Last Updated: March 2, 2026**

Pantry Pal ("we," "our," or "us") is operated by Tae Young Park. This Privacy Policy explains how we collect, use, and protect your information when you use the Pantry Pal mobile application ("App").

## Information We Collect

### Account Information
When you create an account, we collect your email address and authentication credentials. Passwords are securely processed and stored using industry-standard protections (salted hashing) by our authentication provider. You may optionally provide a display name.

### Pantry & Household Data
We store the data you enter or generate through the App, including:
- Pantry inventory items (names, quantities, expiry dates, locations)
- Shopping lists
- Recipes and meal plans
- Household membership (if you share a household with other users)

### Receipt Data
When you scan a receipt, we temporarily process the photo to extract text via optical character recognition (OCR). The extracted text, store name, item names, prices, and totals are stored. Receipt images are processed locally on your device or sent to Google Cloud Vision API for text extraction, and are not permanently stored on our servers. Extracted text and itemized purchase data may persist temporarily in processing logs.

Receipts may contain personal information such as loyalty program identifiers or partial payment card numbers. We do not need this information for the App's core features, and we recommend avoiding scanning receipts that include sensitive details when possible.

### Usage & Analytics Data
We collect usage and diagnostics data to improve the App, such as:
- App opens and session information
- Feature usage (scans completed, recipes imported)
- Subscription events
- App version and platform (iOS/Android)

This data may be linked to your account or internal user ID so we can operate the service, enforce plan limits, and improve performance.

### Subscription & Purchase Data
If you subscribe to Pantry Pal Pro, your purchase is processed by Apple (App Store) through RevenueCat, our subscription management provider. We receive your subscription status and entitlement information. We do not directly process or store your payment card details.

### Advertising Data
For free-tier users, we display ads through Google AdMob. If you grant permission through the App Tracking Transparency prompt on iOS, your Identifier for Advertisers (IDFA) may be used by AdMob for personalized advertising. You can decline this permission, and ads will still be shown but will not be personalized. On some devices, advertising may use device identifiers and signals for ad delivery, frequency capping, and measurement.

### Device Permissions
The App may request the following permissions:
- **Camera**: To scan receipts
- **Photo Library**: To select receipt images from your library
- **Tracking (iOS)**: To enable personalized ads via IDFA

## How We Use Your Information

We use your information to:
- Provide and maintain the App's core features (pantry tracking, shopping lists, receipt scanning, recipe imports, meal planning)
- Process receipt images and extract item data using OCR
- Extract recipe ingredients using Google Gemini AI
- Manage your subscription and entitlements
- Display advertisements to free-tier users
- Analyze usage patterns to improve the App
- Enforce usage limits based on your subscription tier

## Third-Party Services

We use the following third-party service providers to operate the App:

| Service | Data Shared | Purpose |
|---------|-------------|---------|
| **Supabase** | All account and app data | Backend database, authentication, and hosting |
| **Google Cloud Vision API** | Receipt images (temporarily) | Optical character recognition |
| **Google Gemini API** | Recipe text content | Ingredient extraction from recipes |
| **Google AdMob** | IDFA (with permission), ad interaction data | Advertising for free-tier users |
| **RevenueCat** | User ID, subscription status | Subscription and purchase management |
| **Apple App Store** | Purchase transactions | Payment processing |

We do not sell your personal information to third parties. We do not share your data with data brokers.

## Data Storage & Security

Your data is stored on Supabase-hosted infrastructure. All data transmission between the App and our servers uses HTTPS encryption. We implement row-level security policies in our database designed to help ensure users can only access their own data (or data shared within their household).

## Data Retention & Deletion

We retain your data for as long as your account is active. You may delete your account at any time through the App (Profile > Delete My Account). When you delete your account, we delete or de-identify the personal data associated with your account from our active systems, including:
- Profile and preferences
- Pantry inventory and shopping lists
- Recipes and meal plans
- Receipt and purchase history
- Analytics data

We may retain limited information for legitimate purposes such as security, fraud prevention, dispute resolution, and compliance with legal obligations. Some data may persist temporarily in backups. Third-party services (such as the Apple App Store and RevenueCat) may retain their own records of transactions in accordance with their respective privacy policies.

## Children's Privacy

The App is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us with personal information, please contact us and we will delete it.

## Your Rights

You have the right to:
- Access the personal data we hold about you (visible within the App)
- Delete your account and all associated data from our active systems
- Decline tracking permissions for personalized advertising
- Manage or cancel your subscription through your device's app store settings

## Household Data Sharing

If you join or create a household within the App, pantry inventory, shopping lists, and receipt data are shared among household members. Each member can view and edit shared data based on their assigned role and permissions.

## Changes to This Policy

We may update this Privacy Policy from time to time. If we make material changes, we will provide notice through the App. Changes apply from the effective date shown above.

## Contact Us

If you have questions about this Privacy Policy, please contact us at:

**Email**: support@pantryapp.com
