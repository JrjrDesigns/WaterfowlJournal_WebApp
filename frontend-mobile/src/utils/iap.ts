import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  getActiveSubscriptions,
  restorePurchases,
  purchaseUpdatedListener,
  purchaseErrorListener,
  deepLinkToSubscriptions,
  ErrorCode,
  type Purchase,
} from 'expo-iap';

import { verifyApplePurchase } from '@/utils/api';

/* StoreKit, via expo-iap.
 *
 * Apple requires In-App Purchase for digital subscriptions (guideline 3.1.1), so
 * this replaces the Stripe checkout sheet on iOS. Stripe stays in place for the
 * web app, which means the backend reconciles two sources of subscription truth
 * against one `subscription_status`. That reconciliation is unavoidable — the
 * web app already sells — so it is not a cost of choosing StoreKit.
 *
 * Prices live in App Store Connect, not here. One price everywhere: $8.99/month
 * and $49.99/year, matching web exactly.
 */
export const PRODUCT_IDS = {
  monthly: 'com.blindguideapp.mobile.pro.monthly',
  annual: 'com.blindguideapp.mobile.pro.annual',
} as const;

export type PlanKey = keyof typeof PRODUCT_IDS;

export const ALL_PRODUCT_IDS = [PRODUCT_IDS.monthly, PRODUCT_IDS.annual];

export const iapSupported = Platform.OS === 'ios' || Platform.OS === 'android';

export interface StoreProduct {
  id: string;
  /** Localised, store-formatted price — never build this string yourself. */
  displayPrice: string;
  title: string;
}

export const connect = async (): Promise<void> => {
  if (!iapSupported) return;
  await initConnection();
};

export const disconnect = async (): Promise<void> => {
  if (!iapSupported) return;
  try {
    await endConnection();
  } catch {
    // Tearing down a connection that is already gone is not worth surfacing.
  }
};

/* Always show the store's own price string. It is localised, carries the right
 * currency, and reflects any regional adjustment Apple has applied — a hardcoded
 * "$49.99" is wrong the moment someone buys from outside the US. */
export const loadProducts = async (): Promise<StoreProduct[]> => {
  if (!iapSupported) return [];
  const products = await fetchProducts({ skus: ALL_PRODUCT_IDS, type: 'subs' });
  return (products ?? []).map(p => ({
    id: p.id,
    displayPrice: p.displayPrice ?? '',
    title: p.title ?? '',
  }));
};

/* Kick off a purchase. Note what this does NOT do: it does not grant Pro.
 *
 * The result arrives asynchronously on the purchaseUpdatedListener, because a
 * purchase can also complete while the app is backgrounded, be restored on
 * another device, or renew a year later. Granting access from this call's return
 * value would miss all three. */
export const buy = async (plan: PlanKey): Promise<void> => {
  if (!iapSupported) throw new Error('In-app purchases are not available on this device.');
  await requestPurchase({
    type: 'subs',
    request: {
      apple: { sku: PRODUCT_IDS[plan], andDangerouslyFinishTransactionAutomatically: false },
      google: { skus: [PRODUCT_IDS[plan]] },
    },
  });
};

/* Apple requires a way to restore purchases — a customer who reinstalls, or
 * signs in on a second device, must be able to get their subscription back
 * without paying again. Missing this is a common rejection. */
export const restore = async (): Promise<void> => {
  if (!iapSupported) return;
  await restorePurchases();
};

/** Opens the system subscription-management screen, where Apple requires cancellation to live. */
export const openManageSubscriptions = async (): Promise<void> => {
  if (!iapSupported) return;
  await deepLinkToSubscriptions({ skuAndroid: PRODUCT_IDS.annual });
};

/* Ask the store what is actually active, then have the server confirm it.
 *
 * Called on app foreground and on the Profile screen. This is the self-healing
 * path: if a renewal notification ever arrives at the backend that it cannot map
 * to a user, or a purchase completed while the app was killed before it could
 * report in, this call repairs the record the next time the user opens the app.
 */
export const syncActiveSubscriptions = async (): Promise<boolean> => {
  if (!iapSupported) return false;
  const active = await getActiveSubscriptions(ALL_PRODUCT_IDS);
  if (!active || active.length === 0) return false;

  let verified = false;
  for (const sub of active) {
    const token = sub.purchaseToken;
    if (!token) continue;
    try {
      await verifyApplePurchase(token);
      verified = true;
    } catch {
      // A single bad token should not stop the others being checked.
    }
  }
  return verified;
};

/* Wire up the store's callbacks.
 *
 * `finishTransaction` is deliberately called only AFTER the server has verified
 * the signed transaction. An unfinished transaction is re-delivered by StoreKit
 * on next launch, which is what makes this safe: if verification fails or the
 * app dies mid-flow, Apple hands the purchase back rather than losing it.
 */
export const attachListeners = ({
  onGranted,
  onError,
}: {
  onGranted: () => void;
  onError: (message: string) => void;
}): (() => void) => {
  if (!iapSupported) return () => {};

  const updated = purchaseUpdatedListener(async (purchase: Purchase) => {
    const token = purchase.purchaseToken;
    if (!token) {
      onError('That purchase came back without a receipt. Try Restore Purchases.');
      return;
    }
    try {
      await verifyApplePurchase(token);
      // Only now is the transaction safe to finish.
      await finishTransaction({ purchase, isConsumable: false });
      onGranted();
    } catch (err: unknown) {
      /* Left unfinished on purpose — StoreKit will re-deliver it, so a customer
       * who has paid is never stranded by a failed verification call. */
      onError(
        err instanceof Error
          ? err.message
          : "Your purchase went through but we couldn't confirm it yet. It will finish on its own — reopen the app in a moment.",
      );
    }
  });

  /* The listener's error type carries an optional `code`, which is why this is
   * inferred rather than annotated — the exported PurchaseError type is the
   * stricter one and does not match here. */
  const failed = purchaseErrorListener(error => {
    // A deliberate cancel is not an error worth showing.
    if (error.code === ErrorCode.UserCancelled) return;
    onError(error.message || 'That purchase did not go through.');
  });

  return () => {
    updated.remove();
    failed.remove();
  };
};
