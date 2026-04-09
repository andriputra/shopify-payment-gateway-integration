export type SupportedProvider = "xendit" | "midtrans" | "sandbox" | "custom";

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
};

export type CreateCheckoutResult = {
  paymentUrl: string;
  providerReference: string;
};
