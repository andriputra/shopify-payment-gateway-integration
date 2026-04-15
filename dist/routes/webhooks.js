"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookRoutes = webhookRoutes;
const express_1 = require("express");
function webhookRoutes(service) {
    const router = (0, express_1.Router)();
    router.post("/payment/:provider/:shop", (req, res, next) => {
        try {
            const { provider, shop } = req.params;
            const result = service.handleWebhook(shop, provider, req.body ?? {});
            res.json({ ok: true, ...result });
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
