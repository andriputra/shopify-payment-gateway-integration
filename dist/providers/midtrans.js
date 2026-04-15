"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.midtransProvider = void 0;
const base_1 = require("./base");
function fakeMidtransLink(input, apiKey) {
    const token = Buffer.from(`${apiKey}:${input.orderId}`).toString("base64url");
    return {
        paymentUrl: `https://app.midtrans.com/snap/v2/vtweb/${token}`,
        providerReference: `mdt_${input.orderId}`
    };
}
exports.midtransProvider = {
    id: "midtrans",
    async createCheckout(store, input) {
        const apiKey = (0, base_1.ensureApiKey)(store.credentials);
        return fakeMidtransLink(input, apiKey);
    },
    parseWebhook(_store, payload) {
        const transactionStatus = String(payload.transaction_status ?? "");
        return {
            paid: ["settlement", "capture"].includes(transactionStatus),
            providerReference: String(payload.transaction_id ?? "")
        };
    }
};
