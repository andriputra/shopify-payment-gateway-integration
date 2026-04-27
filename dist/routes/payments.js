"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentRoutes = paymentRoutes;
const express_1 = require("express");
const zod_1 = require("zod");
const createCheckoutSchema = zod_1.z.object({
    shop: zod_1.z.string().min(3),
    provider: zod_1.z.enum(["xendit", "midtrans", "swipe", "sandbox", "custom"]),
    amount: zod_1.z.number().positive(),
    currency: zod_1.z.string().length(3),
    orderId: zod_1.z.string().min(1),
    customerEmail: zod_1.z.string().email().optional(),
    returnUrl: zod_1.z.string().url().optional()
});
function paymentRoutes(service, paymentRedirectRepo) {
    const router = (0, express_1.Router)();
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
    router.get("/links/:shop/:orderReference", async (req, res, next) => {
        try {
            if (!paymentRedirectRepo) {
                return res.status(503).json({ ok: false, message: "Payment redirect repository not configured" });
            }
            const record = await paymentRedirectRepo.get(req.params.shop, req.params.orderReference);
            if (!record) {
                return res.status(404).json({ ok: false, message: "Payment link not found" });
            }
            return res.json({ ok: true, record });
        }
        catch (error) {
            next(error);
        }
    });
    router.get("/links/:shop", async (req, res, next) => {
        try {
            if (!paymentRedirectRepo) {
                return res.status(503).json({ ok: false, message: "Payment redirect repository not configured" });
            }
            const limit = Number(req.query.limit ?? 20);
            const records = await paymentRedirectRepo.listByShop(req.params.shop, limit);
            return res.json({ ok: true, records });
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
