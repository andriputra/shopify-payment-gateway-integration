"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentRoutes = paymentRoutes;
const express_1 = require("express");
const zod_1 = require("zod");
const swipe_transaction_log_1 = require("../services/swipe-transaction-log");
const shop_domain_1 = require("../utils/shop-domain");
const swipeMethodSchema = zod_1.z.string().trim().min(1).max(64).optional();
const swipeDeviceUserSchema = zod_1.z.string().trim().min(1).max(128).optional();
const createCheckoutSchema = zod_1.z
    .object({
    shop: zod_1.z.string().min(3),
    provider: zod_1.z.enum(["xendit", "midtrans", "swipe", "sandbox", "custom"]),
    amount: zod_1.z.coerce.number().min(0),
    currency: zod_1.z.string().length(3),
    orderId: zod_1.z.string().min(1),
    customerEmail: zod_1.z.string().email().optional(),
    returnUrl: zod_1.z.string().url().optional(),
    swipePaymentMethod: swipeMethodSchema,
    swipeDeviceUser: swipeDeviceUserSchema,
    /** Alias Swipe API field name; same as `swipeDeviceUser`. */
    device_user: swipeDeviceUserSchema
})
    .transform(({ device_user, swipeDeviceUser, ...rest }) => ({
    ...rest,
    swipeDeviceUser: swipeDeviceUser ?? device_user
}));
const swipeTestRequestSchema = zod_1.z.object({
    shop: zod_1.z.string().min(3),
    amount: zod_1.z.coerce.number().min(0).optional().default(0),
    orderId: zod_1.z.string().min(1).optional(),
    swipePaymentMethod: swipeMethodSchema,
    swipeDeviceUser: swipeDeviceUserSchema
});
function paymentRoutes(service) {
    const router = (0, express_1.Router)();
    /** Requires `Authorization: Bearer <session token>` (embedded app). Filtered to JWT shop domain. */
    router.get("/swipe/transaction-log", (req, res, next) => {
        try {
            const session = res.locals.shopifySession;
            const dest = session?.dest?.trim();
            if (!dest) {
                return res.status(401).json({ ok: false, message: "Missing embedded session shop (dest)" });
            }
            const limitRaw = req.query.limit;
            const limitNum = typeof limitRaw === "string" && limitRaw.trim()
                ? Number(limitRaw)
                : typeof limitRaw === "number"
                    ? limitRaw
                    : NaN;
            const limit = Number.isFinite(limitNum)
                ? Math.min(500, Math.max(1, Math.floor(limitNum)))
                : 100;
            const log = (0, swipe_transaction_log_1.readSwipeTransactionLogForShop)(dest, limit);
            return res.json({
                ok: true,
                shop: (0, shop_domain_1.normalizeShopDomain)(dest),
                limit,
                ...log
            });
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/swipe/test-request", async (req, res, next) => {
        try {
            const raw = swipeTestRequestSchema.parse(req.body);
            const result = await service.swipeTestRequest(raw.shop, raw.amount, raw.orderId, raw.swipePaymentMethod, raw.swipeDeviceUser);
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
