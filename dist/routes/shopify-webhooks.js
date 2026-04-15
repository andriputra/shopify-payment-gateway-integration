"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopifyWebhookRoutes = shopifyWebhookRoutes;
const express_1 = require("express");
function shopifyWebhookRoutes(authService) {
    const router = (0, express_1.Router)();
    router.post("/shopify/orders-paid", (req, res) => {
        const hmac = String(req.get("x-shopify-hmac-sha256") ?? "");
        const rawBody = req.rawBody ?? Buffer.from("");
        const topic = req.get("x-shopify-topic");
        if (!hmac || !authService.verifyWebhookHmac(rawBody, hmac)) {
            return res.status(401).json({ ok: false, message: "Invalid Shopify webhook HMAC" });
        }
        const payload = JSON.parse(rawBody.toString());
        switch (topic) {
            case "orders/paid":
                console.log("Order paid:", payload.id);
                // Stok / committed inventory di Shopify sudah diurus platform setelah order status paid
                // (termasuk setelah Payment Apps memanggil paymentSessionResolve). Webhook ini berguna
                // untuk audit, CRM, atau job async tambahan jika diperlukan.
                break;
            default:
                console.log("Unhandled topic:", topic);
        }
        return res.json({
            ok: true,
            message: "Shopify webhook verified",
            topic
        });
    });
    return router;
}
