"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopifyPaymentSessionRoutes = shopifyPaymentSessionRoutes;
const node_crypto_1 = __importDefault(require("node:crypto"));
const express_1 = require("express");
const zod_1 = require("zod");
const swipe_1 = require("../providers/swipe");
const createSessionSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    gid: zod_1.z.string().optional(),
    shop: zod_1.z.string().min(3),
    amount: zod_1.z.coerce.number().positive(),
    currency: zod_1.z.string().min(3).max(3).transform((c) => c.toUpperCase()),
    orderId: zod_1.z.string().min(1).optional(),
    customer: zod_1.z
        .object({
        email: zod_1.z.string().email().optional()
    })
        .optional()
});
function normalizeShop(domain) {
    let s = domain.trim().toLowerCase();
    if (s && !s.endsWith(".myshopify.com")) {
        s = `${s}.myshopify.com`;
    }
    return s;
}
function shopifyPaymentSessionRoutes(deps) {
    const router = (0, express_1.Router)();
    const { paymentService, storeRepo, sessionContextRepo } = deps;
    router.post("/shopify/payment-sessions", async (req, res, next) => {
        try {
            const raw = createSessionSchema.parse(req.body);
            const shop = normalizeShop(raw.shop);
            const store = await storeRepo.get(shop);
            if (!store) {
                return res.status(400).json({
                    ok: false,
                    message: `No configuration found for ${shop}. Save merchant configuration (provider + credentials) in the app admin page first.`
                });
            }
            const paymentSessionGid = String(raw.id ?? raw.gid ?? "").trim();
            const orderRef = raw.orderId?.trim() ||
                (paymentSessionGid
                    ? `ps_${node_crypto_1.default.createHash("sha256").update(paymentSessionGid).digest("hex").slice(0, 24)}`
                    : `ps_${Date.now()}`);
            if (paymentSessionGid) {
                const ctx = {
                    shop,
                    paymentSessionId: paymentSessionGid,
                    createdAt: new Date().toISOString()
                };
                await sessionContextRepo.save(orderRef, ctx);
                /** Swipe webhook returns `invoice_number`, not internal orderRef — store both keys. */
                await sessionContextRepo.save((0, swipe_1.swipeInvoiceNumberForOrder)(orderRef), ctx);
            }
            const result = await paymentService.createCheckout({
                shop,
                provider: store.provider,
                amount: raw.amount,
                currency: raw.currency,
                orderId: orderRef,
                customerEmail: raw.customer?.email,
                returnUrl: store.redirectUrlAfterPaid
            });
            const sessionId = raw.id ?? `ps_${Date.now()}`;
            return res.status(201).json({
                payment_session: {
                    id: sessionId,
                    state: "pending",
                    next_action: {
                        redirect_url: result.paymentUrl
                    }
                }
            });
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/shopify/payment-sessions/:id/resolve", (req, res) => {
        return res.json({
            payment_session: {
                id: req.params.id,
                state: "resolved"
            },
            detail: req.body ?? {}
        });
    });
    router.post("/shopify/payment-sessions/:id/reject", (req, res) => {
        return res.json({
            payment_session: {
                id: req.params.id,
                state: "rejected"
            },
            detail: req.body ?? {}
        });
    });
    return router;
}
