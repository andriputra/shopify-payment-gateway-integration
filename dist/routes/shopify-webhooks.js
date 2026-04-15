"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopifyWebhookRoutes = shopifyWebhookRoutes;
const express_1 = require("express");
function shopifyWebhookRoutes(authService) {
    const router = (0, express_1.Router)();
    router.post("/shopify/orders-paid", (req, res) => {
        const hmac = String(req.get("x-shopify-hmac-sha256") ?? "");
        const rawBody = req.rawBody ?? Buffer.from("");
        if (!hmac || !authService.verifyWebhookHmac(rawBody, hmac)) {
            return res.status(401).json({ ok: false, message: "Invalid Shopify webhook HMAC" });
        }
        return res.json({
            ok: true,
            message: "Shopify webhook verified",
            topic: req.get("x-shopify-topic") ?? "unknown"
        });
    });
    return router;
}
