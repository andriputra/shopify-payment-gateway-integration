"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopifyPaymentSessionRoutes = shopifyPaymentSessionRoutes;
const express_1 = require("express");
const zod_1 = require("zod");
const env_1 = require("../config/env");
const createSessionSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    shop: zod_1.z.string().min(3),
    amount: zod_1.z.number().positive(),
    currency: zod_1.z.string().length(3),
    orderId: zod_1.z.string().min(1)
});
function shopifyPaymentSessionRoutes() {
    const router = (0, express_1.Router)();
    router.post("/shopify/payment-sessions", (req, res) => {
        const input = createSessionSchema.parse(req.body);
        const sessionId = input.id ?? `ps_${Date.now()}`;
        const params = new URLSearchParams({
            shop: input.shop,
            orderId: input.orderId,
            amount: String(input.amount),
            currency: input.currency,
            sessionId
        });
        return res.status(201).json({
            id: sessionId,
            status: "pending",
            next_action: {
                redirect_url: `${env_1.env.host}/sandbox/pay?${params.toString()}`
            }
        });
    });
    router.post("/shopify/payment-sessions/:id/resolve", (req, res) => {
        return res.json({
            id: req.params.id,
            status: "resolved",
            detail: req.body ?? {}
        });
    });
    router.post("/shopify/payment-sessions/:id/reject", (req, res) => {
        return res.json({
            id: req.params.id,
            status: "rejected",
            detail: req.body ?? {}
        });
    });
    return router;
}
