import { CreateCheckoutInput, CreateCheckoutResult, ProviderCredential, StoreConfig, SupportedProvider } from "../types";

export type ProviderWebhookPayload = Record<string, unknown>;

export type ProviderWebhookResult = {
  paid: boolean;
  providerReference?: string;
};

export interface PaymentProvider {
  readonly id: SupportedProvider;
  createCheckout(
    store: StoreConfig,
    input: CreateCheckoutInput
  ): Promise<CreateCheckoutResult>;
  parseWebhook(
    store: StoreConfig,
    payload: ProviderWebhookPayload
  ): ProviderWebhookResult;
}

export function ensureApiKey(credentials: ProviderCredential): string {
  if (!credentials.apiKey) {
    throw new Error("Missing provider apiKey");
  }
  return credentials.apiKey;
}
