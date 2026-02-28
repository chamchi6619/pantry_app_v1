/**
 * Purchase Service - RevenueCat IAP wrapper
 *
 * Products:
 * - pantrypal_monthly: $4.99/mo
 * - pantrypal_annual: $47.99/yr ($3.99/mo)
 * - pantrypal_lifetime: one-time purchase
 *
 * Uses RevenueCat native paywalls (dashboard-configured, A/B testable).
 */

import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { Platform } from 'react-native';
import { trackEvent } from './analyticsService';

export { PAYWALL_RESULT };

const REVENUECAT_API_KEY = Platform.select({
  ios: 'test_rusgSweOdjuzokWeuIxSWSanurF',
  android: '',
}) || '';

const ENTITLEMENT_ID = 'tbd Pro';

let isConfigured = false;

/**
 * Initialize RevenueCat. Call once at app startup after auth.
 */
export async function configurePurchases(userId?: string): Promise<void> {
  if (isConfigured || !REVENUECAT_API_KEY) {
    if (!REVENUECAT_API_KEY) {
      console.warn('[Purchases] No RevenueCat API key configured');
    }
    return;
  }

  try {
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    Purchases.configure({ apiKey: REVENUECAT_API_KEY });

    if (userId) {
      await Purchases.logIn(userId);
    }

    isConfigured = true;
    console.log('[Purchases] Configured successfully');
  } catch (error) {
    console.error('[Purchases] Configuration error:', error);
  }
}

/**
 * Set RevenueCat user ID (call after auth).
 */
export async function identifyUser(userId: string): Promise<void> {
  try {
    if (!isConfigured) return;
    await Purchases.logIn(userId);
  } catch (error) {
    console.error('[Purchases] Identify error:', error);
  }
}

/**
 * Check if user has active pro entitlement.
 */
export async function isPremium(): Promise<boolean> {
  try {
    if (!isConfigured) return false;
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

/**
 * Get available packages for purchase.
 */
export async function getOfferings(): Promise<{
  monthly?: PurchasesPackage;
  annual?: PurchasesPackage;
  lifetime?: PurchasesPackage;
} | null> {
  try {
    if (!isConfigured) return null;
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;

    if (!current) return null;

    return {
      monthly: current.monthly ?? undefined,
      annual: current.annual ?? undefined,
      lifetime: current.lifetime ?? undefined,
    };
  } catch (error) {
    console.error('[Purchases] Get offerings error:', error);
    return null;
  }
}

/**
 * Purchase a subscription package.
 * Returns customer info on success, null on cancel/error.
 */
export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<CustomerInfo | null> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);

    if (customerInfo.entitlements.active[ENTITLEMENT_ID]) {
      trackEvent('subscription_started', {
        product_id: pkg.product.identifier,
        price: pkg.product.price,
      });
    }

    return customerInfo;
  } catch (error: any) {
    if (error.userCancelled) {
      console.log('[Purchases] User cancelled');
      return null;
    }
    console.error('[Purchases] Purchase error:', error);
    throw error;
  }
}

/**
 * Purchase by plan type (convenience wrapper).
 */
export async function subscribe(plan: 'monthly' | 'annual' | 'lifetime'): Promise<boolean> {
  try {
    const offerings = await getOfferings();
    if (!offerings) {
      console.warn('[Purchases] No offerings available');
      return false;
    }

    const pkg = offerings[plan];
    if (!pkg) {
      console.warn(`[Purchases] No ${plan} package available`);
      return false;
    }

    const result = await purchasePackage(pkg);
    return result !== null && result.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

/**
 * Present the native RevenueCat paywall (always shows).
 * Returns the PAYWALL_RESULT indicating what happened.
 */
export async function presentPaywall(): Promise<PAYWALL_RESULT> {
  try {
    const result = await RevenueCatUI.presentPaywall();
    console.log('[Purchases] Paywall result:', result);
    return result;
  } catch (error) {
    console.error('[Purchases] Present paywall error:', error);
    return PAYWALL_RESULT.ERROR;
  }
}

/**
 * Present the native RevenueCat paywall only if user doesn't have the entitlement.
 * Returns the PAYWALL_RESULT indicating what happened.
 */
export async function presentPaywallIfNeeded(): Promise<PAYWALL_RESULT> {
  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: ENTITLEMENT_ID,
    });
    console.log('[Purchases] PaywallIfNeeded result:', result);
    return result;
  } catch (error) {
    console.error('[Purchases] Present paywall error:', error);
    return PAYWALL_RESULT.ERROR;
  }
}

/**
 * Restore purchases (for "Restore Purchases" button).
 */
export async function restorePurchases(): Promise<boolean> {
  try {
    if (!isConfigured) return false;
    const customerInfo = await Purchases.restorePurchases();
    return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch (error) {
    console.error('[Purchases] Restore error:', error);
    return false;
  }
}

/**
 * Log out from RevenueCat (call on sign-out).
 */
export async function logOutPurchases(): Promise<void> {
  try {
    if (!isConfigured) return;
    await Purchases.logOut();
    console.log('[Purchases] Logged out');
  } catch (error) {
    console.error('[Purchases] Logout error:', error);
  }
}
