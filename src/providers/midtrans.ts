import { PaymentProvider, ProviderWebhookPayload, ensureApiKey } from "./base";
import { CreateCheckoutInput, CreateCheckoutResult, StoreConfig } from "../types";

const MIDTRANS_API_BASE = "https://app.midtrans.com";

async function callMidtransApi(serverKey: string, endpoint: string, method: string, body?: object) {
  const auth = Buffer.from(`${serverKey}:`).toString("base64");
  const response = await fetch(`${MIDTRANS_API_BASE}${endpoint}`, {
    method,
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    const error = await response.text().catch(() => "Unknown error");
    throw new Error(`Midtrans API error: ${response.status} - ${error}`);
  }
  return response.json();
}

export const midtransProvider: PaymentProvider = {
  id: "midtrans",
  async createCheckout(store: StoreConfig, input: CreateCheckoutInput) {
    const serverKey = ensureApiKey(store.credentials);
    
    const response = await callMidtransApi(serverKey, "/v2/snap", "POST", {
      transaction_details: {
        order_id: input.orderId,
        gross_amount: input.amount
      },
      credit_card: {
        secure: true
      },
      customer_details: input.customerEmail ? {
        email: input.customerEmail
      } : undefined
    });

    return {
      paymentUrl: response.redirect_url,
      providerReference: response.token
    };
  },
  parseWebhook(_store: StoreConfig, payload: ProviderWebhookPayload) {
    const transactionStatus = String(payload.transaction_status ?? "");
    return {
      paid: ["settlement", "capture"].includes(transactionStatus),
      providerReference: String(payload.transaction_id ?? "")
    };
  }
};
