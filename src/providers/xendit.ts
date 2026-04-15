import { PaymentProvider, ProviderWebhookPayload, ensureApiKey } from "./base";
import { CreateCheckoutInput, CreateCheckoutResult, StoreConfig } from "../types";

const XENDIT_API_BASE = "https://api.xendit.co";

async function callXenditApi(apiKey: string, endpoint: string, method: string, body?: object) {
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const response = await fetch(`${XENDIT_API_BASE}${endpoint}`, {
    method,
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    const error = await response.text().catch(() => "Unknown error");
    throw new Error(`Xendit API error: ${response.status} - ${error}`);
  }
  return response.json();
}

export const xenditProvider: PaymentProvider = {
  id: "xendit",
  async createCheckout(store: StoreConfig, input: CreateCheckoutInput) {
    const apiKey = ensureApiKey(store.credentials);
    
    const response = await callXenditApi(apiKey, "/v2/invoices", "POST", {
      external_id: input.orderId,
      amount: input.amount,
      currency: input.currency,
      redirect_url: input.returnUrl,
      customer: input.customerEmail ? { email: input.customerEmail } : undefined,
      description: `Order ${input.orderId} for ${store.shop}`
    });

    return {
      paymentUrl: response.invoice_url,
      providerReference: response.id
    };
  },
  parseWebhook(_store: StoreConfig, payload: ProviderWebhookPayload) {
    const status = String(payload.status ?? "");
    return {
      paid: status.toUpperCase() === "PAID",
      providerReference: String(payload.id ?? "")
    };
  }
};
