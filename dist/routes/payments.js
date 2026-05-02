"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentRoutes = paymentRoutes;
const express_1 = require("express");
const zod_1 = require("zod");
const createCheckoutSchema = zod_1.z.object({
    shop: zod_1.z.string().min(3),
    provider: zod_1.z.enum(["xendit", "midtrans", "swipe", "sandbox", "custom"]),
    amount: zod_1.z.coerce.number().min(0),
    currency: zod_1.z.string().length(3),
    orderId: zod_1.z.string().min(1),
    customerEmail: zod_1.z.string().email().optional(),
    returnUrl: zod_1.z.string().url().optional()
});
const swipeTestRequestSchema = zod_1.z.object({
    shop: zod_1.z.string().min(3),
    amount: zod_1.z.coerce.number().min(0).optional().default(0),
    orderId: zod_1.z.string().min(1).optional()
});
function paymentRoutes(service) {
    const router = (0, express_1.Router)();
    router.post("/swipe/test-request", async (req, res, next) => {
        try {
            const raw = swipeTestRequestSchema.parse(req.body);
            const result = await service.swipeTestRequest(raw.shop, raw.amount, raw.orderId);
            res.json({ ok: true, swipe: result });
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/checkout/create", async (req, res, next) => {
        try {
            const input = createCheckoutSchema.parse(req.body);
            const result = await service.createCheckout({
                ...input,
                provider: input.provider
            });
            res.json({ ok: true, ...result });
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
