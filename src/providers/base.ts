import { CreateCheckoutInput, CreateCheckoutResult, ProviderCredential, StoreConfig, SupportedProvider } from "../types";

export type ProviderWebhookPayload = Record<string, unknown>;

/** Normalized bucket for dashboards (Swipe EDC callback body varies by integration). */
export type PaymentWebhookOutcome =
  | "paid"
  | "failed"
  | "timeout"
  | "cancelled"
  | "pending"
  | "unknown";

export type ProviderWebhookResult = {
  paid: boolean;
  providerReference?: string;
  outcome?: PaymentWebhookOutcome;
  /** Raw status-like field from the gateway before mapping (uppercased when applicable). */
  statusRaw?: string;
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
