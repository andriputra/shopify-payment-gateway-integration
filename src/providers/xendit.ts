import { PaymentProvider, ProviderWebhookPayload, ensureApiKey } from "./base";
import { CreateCheckoutInput, CreateCheckoutResult, StoreConfig } from "../types";

function fakeXenditLink(input: CreateCheckoutInput, apiKey: string): CreateCheckoutResult {
  const token = Buffer.from(`${input.orderId}:${apiKey}`).toString("base64url");
  return {
    paymentUrl: `https://checkout.xendit.co/web/${token}`,
    providerReference: `xnd_${input.orderId}`
  };
}

export const xenditProvider: PaymentProvider = {
  id: "xendit",
  async createCheckout(store: StoreConfig, input: CreateCheckoutInput) {
    const apiKey = ensureApiKey(store.credentials);
    return fakeXenditLink(input, apiKey);
  },
  parseWebhook(_store: StoreConfig, payload: ProviderWebhookPayload) {
    const status = String(payload.status ?? "");
    return {
      paid: status.toUpperCase() === "PAID",
      providerReference: String(payload.id ?? "")
    };
  }
};
