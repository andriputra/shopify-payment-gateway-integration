"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bridgeCheckoutRoutes = bridgeCheckoutRoutes;
const node_crypto_1 = __importDefault(require("node:crypto"));
const express_1 = require("express");
const zod_1 = require("zod");
const env_1 = require("../config/env");
const createCheckoutSchema = zod_1.z.object({
    shop: zod_1.z.string().min(3),
    provider: zod_1.z.enum(["xendit", "midtrans", "swipe", "sandbox", "custom"]),
    amount: zod_1.z.coerce.number().min(0),
    currency: zod_1.z.string().length(3),
    orderId: zod_1.z.string().min(1),
    customerEmail: zod_1.z.string().email().optional(),
    returnUrl: zod_1.z.string().url().optional(),
    swipePaymentMethod: zod_1.z.string().max(64).optional(),
    /** Optional auth duplicate for clients that cannot set headers. Prefer Bearer or X-Bridge-Checkout-Secret. */
    secret: zod_1.z.string().optional()
});
function bridgeCheckoutSecret() {
    return (env_1.env.bridgeCheckoutApiSecret || env_1.env.paymentStatusApiSecret || env_1.env.appSharedSecret).trim();
}
function safeEqualSecret(a, b) {
    try {
        return node_crypto_1.default.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
    }
    catch {
        return false;
    }
}
function bridgeCheckoutAuthOk(req) {
    const configured = bridgeCheckoutSecret();
    if (!configured) {
        return false;
    }
    const bearer = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const headerSecret = (req.get("x-bridge-checkout-secret") ?? "").trim();
    const qSecret = typeof req.query.secret === "string" ? req.query.secret.trim() : "";
    const body = (req.body ?? {});
    const bodySecret = typeof body.secret === "string" ? body.secret.trim() : "";
    for (const candidate of [bearer, headerSecret, qSecret, bodySecret]) {
        if (candidate && safeEqualSecret(candidate, configured)) {
            return true;
        }
    }
    return false;
}
/**
 * Server-to-server checkout creation (same payload as embedded `POST /api/payments/checkout/create`)
 * without Shopify session JWT. Protect with shared secret only — call from trusted backends.
 */
function bridgeCheckoutRoutes(service) {
    const router = (0, express_1.Router)();
    router.post("/checkout/create", async (req, res, next) => {
        try {
            if (!bridgeCheckoutAuthOk(req)) {
                return res.status(401).json({
                    ok: false,
                    message: "Unauthorized. Send Authorization: Bearer <secret>, X-Bridge-Checkout-Secret, ?secret=, or JSON body.secret (BRIDGE_CHECKOUT_API_SECRET, PAYMENT_STATUS_API_SECRET, or APP_SHARED_SECRET)."
                });
            }
            const raw = createCheckoutSchema.parse(req.body);
            const { secret: _omit, ...checkoutBody } = raw;
            const result = await service.createCheckout({
                ...checkoutBody,
                provider: checkoutBody.provider
            });
            return res.json({ ok: true, ...result });
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
