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
};

export type CreateCheckoutResult = {
  paymentUrl: string;
  providerReference: string;
  /** Browser redirect after paid (from request `returnUrl` or store config). Swipe: stored + echoed; sent to Swipe as `return_url` when provided. */
  returnUrlAfterPaid?: string;
};
