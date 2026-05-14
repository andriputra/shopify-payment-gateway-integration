"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configRoutes = configRoutes;
const express_1 = require("express");
const zod_1 = require("zod");
const shop_domain_1 = require("../utils/shop-domain");
const providerEnum = zod_1.z.enum(["xendit", "midtrans", "swipe", "sandbox", "custom"]);
const saveConfigSchema = zod_1.z.object({
    shop: zod_1.z.string().min(3),
    provider: providerEnum,
    redirectUrlAfterPaid: zod_1.z.string().url(),
    webhookUrlAfterPaid: zod_1.z.string().url().optional(),
    credentials: zod_1.z.object({
        apiKey: zod_1.z.string().min(1),
        apiSecret: zod_1.z.string().optional(),
        extra: zod_1.z.record(zod_1.z.string()).optional()
    })
});
function configRoutes(storeRepo) {
    const router = (0, express_1.Router)();
    router.post("/", async (req, res, next) => {
        try {
            const body = saveConfigSchema.parse(req.body);
            const shopKey = (0, shop_domain_1.normalizeMerchantShopKey)(body.shop);
            if (!shopKey || !shopKey.includes(".")) {
                return res.status(400).json({ ok: false, message: "Invalid shop identifier." });
            }
            const config = await storeRepo.upsert({
                ...body,
                shop: shopKey,
                provider: body.provider,
                updatedAt: new Date().toISOString()
            });
            res.json({ ok: true, config });
        }
        catch (error) {
            next(error);
        }
    });
    router.get("/", async (req, res, next) => {
        try {
            const shopRaw = String(req.query.shop ?? "").trim();
            if (!shopRaw) {
                return res.status(400).json({ ok: false, message: "Missing shop query parameter" });
            }
            const normalizedShop = (0, shop_domain_1.normalizeMerchantShopKey)(shopRaw);
            const config = await storeRepo.get(normalizedShop);
            if (!config) {
                return res.status(404).json({ ok: false, message: "Store config not found" });
            }
            return res.json({ ok: true, config });
        }
        catch (error) {
            next(error);
        }
    });
    router.get("/:shop", async (req, res, next) => {
        try {
            const shopKey = (0, shop_domain_1.normalizeMerchantShopKey)(req.params.shop);
            const config = await storeRepo.get(shopKey);
            if (!config) {
                return res.status(404).json({ ok: false, message: "Store config not found" });
            }
            return res.json({ ok: true, config });
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
