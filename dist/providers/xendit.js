"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.xenditProvider = void 0;
const base_1 = require("./base");
function fakeXenditLink(input, apiKey) {
    const token = Buffer.from(`${input.orderId}:${apiKey}`).toString("base64url");
    return {
        paymentUrl: `https://checkout.xendit.co/web/${token}`,
        providerReference: `xnd_${input.orderId}`
    };
}
exports.xenditProvider = {
    id: "xendit",
    async createCheckout(store, input) {
        const apiKey = (0, base_1.ensureApiKey)(store.credentials);
        return fakeXenditLink(input, apiKey);
    },
    parseWebhook(_store, payload) {
        const status = String(payload.status ?? "");
        return {
            paid: status.toUpperCase() === "PAID",
            providerReference: String(payload.id ?? "")
        };
    }
};
