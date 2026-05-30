export type SupportedProvider = "xendit" | "midtrans" | "swipe" | "sandbox" | "custom";

export type ProviderCredential = {
  apiKey: string;
  apiSecret?: string;
  extra?: Record<string, string>;
};

export type StoreConfig = {
  shop: string;
  redirectUrlAfterPaid: string;
  webhookUrlAfterPaid?: string;
  provider: SupportedProvider;
  credentials: ProviderCredential;
  updatedAt: string;
};

export type CreateCheckoutInput = {
  shop: string;
  provider: SupportedProvider;
  amount: number;
  currency: string;
  orderId: string;
  customerEmail?: string;
  returnUrl?: string;
  /**
   * Swipe-only: sent as `payment_method` on create. When set, overrides
   * `credentials.extra.paymentMethod` (store default). Example: `CDCP`, `QRIS`.
   */
  swipePaymentMethod?: string;
  /**
   * Swipe-only: sent as `device_user` on create. When set, overrides
   * `credentials.extra.deviceUser` (store default). Recorded as registered store ID at Swipe.
   */
  swipeDeviceUser?: string;
  /**
   * After this app processes Swipe/provider webhook, POST a normalized JSON copy here (your backend).
   * Not the same as `returnUrl` (browser). Swipe still callbacks to this app first.
   */
  forwardWebhookUrl?: string;
  /** Optional Bearer sent to `forwardWebhookUrl`. */
  forwardWebhookSecret?: string;
};

export type CreateCheckoutResult = {
  paymentUrl: string;
  providerReference: string;
  /** Browser redirect after paid (from request `returnUrl` or store config). Swipe: stored + echoed; sent to Swipe as `return_url` when provided. */
  returnUrlAfterPaid?: string;
  /** Your backend webhook — notified after provider callback is processed by this app. */
  forwardWebhookUrl?: string;
};
