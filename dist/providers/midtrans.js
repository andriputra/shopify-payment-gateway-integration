"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.midtransProvider = void 0;
const base_1 = require("./base");
const MIDTRANS_API_BASE = "https://app.midtrans.com";
async function callMidtransApi(serverKey, endpoint, method, body) {
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
exports.midtransProvider = {
    id: "midtrans",
    async createCheckout(store, input) {
        const serverKey = (0, base_1.ensureApiKey)(store.credentials);
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
    parseWebhook(_store, payload) {
        const transactionStatus = String(payload.transaction_status ?? "");
        return {
            paid: ["settlement", "capture"].includes(transactionStatus),
            providerReference: String(payload.transaction_id ?? "")
        };
    }
};
