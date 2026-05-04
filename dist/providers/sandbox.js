"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sandboxProvider = void 0;
const env_1 = require("../config/env");
exports.sandboxProvider = {
    id: "sandbox",
    async createCheckout(store, input) {
        const params = new URLSearchParams({
            shop: input.shop,
            orderId: input.orderId,
            amount: String(input.amount),
            currency: input.currency,
            provider: "sandbox"
        });
        return {
            paymentUrl: `${env_1.env.host}/uat/checkout?${params.toString()}`,
            providerReference: `sbox_${input.orderId}`
        };
    },
    parseWebhook(_store, payload) {
        const status = String(payload.status ?? "").toUpperCase();
        return {
            paid: ["PAID", "SETTLEMENT", "SUCCESS"].includes(status),
            providerReference: String(payload.id ?? payload.orderId ?? "")
        };
    }
};
