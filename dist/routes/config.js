"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configRoutes = configRoutes;
const express_1 = require("express");
const zod_1 = require("zod");
const providerEnum = zod_1.z.enum(["xendit", "midtrans", "sandbox", "custom"]);
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
    router.post("/", (req, res) => {
        const body = saveConfigSchema.parse(req.body);
        const config = storeRepo.upsert({
            ...body,
            provider: body.provider,
            updatedAt: new Date().toISOString()
        });
        res.json({ ok: true, config });
    });
    router.get("/:shop", (req, res) => {
        const config = storeRepo.get(req.params.shop);
        if (!config) {
            return res.status(404).json({ ok: false, message: "Store config not found" });
        }
        return res.json({ ok: true, config });
    });
    return router;
}
