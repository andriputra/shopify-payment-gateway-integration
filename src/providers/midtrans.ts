import { PaymentProvider, ProviderWebhookPayload, ensureApiKey } from "./base";
import { CreateCheckoutInput, CreateCheckoutResult, StoreConfig } from "../types";

function fakeMidtransLink(input: CreateCheckoutInput, apiKey: string): CreateCheckoutResult {
  const token = Buffer.from(`${apiKey}:${input.orderId}`).toString("base64url");
  return {
    paymentUrl: `https://app.midtrans.com/snap/v2/vtweb/${token}`,
    providerReference: `mdt_${input.orderId}`
  };
}

export const midtransProvider: PaymentProvider = {
  id: "midtrans",
  async createCheckout(store: StoreConfig, input: CreateCheckoutInput) {
    const apiKey = ensureApiKey(store.credentials);
    return fakeMidtransLink(input, apiKey);
  },
  parseWebhook(_store: StoreConfig, payload: ProviderWebhookPayload) {
    const transactionStatus = String(payload.transaction_status ?? "");
    return {
      paid: ["settlement", "capture"].includes(transactionStatus),
      providerReference: String(payload.transaction_id ?? "")
    };
  }
};
