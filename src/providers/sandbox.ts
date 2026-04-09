import { env } from "../config/env";
import { CreateCheckoutInput, StoreConfig } from "../types";
import { PaymentProvider, ProviderWebhookPayload } from "./base";

export const sandboxProvider: PaymentProvider = {
  id: "sandbox",
  async createCheckout(store: StoreConfig, input: CreateCheckoutInput) {
    const params = new URLSearchParams({
      shop: input.shop,
      orderId: input.orderId,
      amount: String(input.amount),
      currency: input.currency,
      provider: "sandbox"
    });

    return {
      paymentUrl: `${env.host}/sandbox/pay?${params.toString()}`,
      providerReference: `sbox_${input.orderId}`
    };
  },
  parseWebhook(_store: StoreConfig, payload: ProviderWebhookPayload) {
    const status = String(payload.status ?? "").toUpperCase();
    return {
      paid: ["PAID", "SETTLEMENT", "SUCCESS"].includes(status),
      providerReference: String(payload.id ?? payload.orderId ?? "")
    };
  }
};
