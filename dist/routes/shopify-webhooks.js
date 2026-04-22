"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopifyWebhookRoutes = shopifyWebhookRoutes;
const express_1 = require("express");
function shopifyWebhookRoutes(authService, complianceService) {
    const router = (0, express_1.Router)();
    function parseVerifiedWebhook(req, expectedTopic) {
        const hmac = String(req.get("x-shopify-hmac-sha256") ?? "");
        const rawBody = req.rawBody ?? Buffer.from("");
        const topic = String(req.get("x-shopify-topic") ?? expectedTopic ?? "");
        if (!hmac || !authService.verifyWebhookHmac(rawBody, hmac)) {
            return {
                ok: false,
                status: 401,
                body: { ok: false, message: "Invalid Shopify webhook HMAC" }
            };
        }
        if (expectedTopic && topic !== expectedTopic) {
            return {
                ok: false,
                status: 400,
                body: { ok: false, message: `Unexpected Shopify topic: ${topic}` }
            };
        }
        return {
            ok: true,
            topic,
            payload: JSON.parse(rawBody.toString() || "{}")
        };
    }
    function handleComplianceWebhook(expectedTopic) {
        return async (req, res, next) => {
            try {
                const verified = parseVerifiedWebhook(req, expectedTopic);
                if (!verified.ok) {
                    return res.status(verified.status).json(verified.body);
                }
                const record = expectedTopic === "customers/data_request"
                    ? await complianceService.handleCustomersDataRequest(verified.payload)
                    : expectedTopic === "customers/redact"
                        ? await complianceService.handleCustomersRedact(verified.payload)
                        : await complianceService.handleShopRedact(verified.payload);
                console.log(`Compliance webhook received: ${expectedTopic}`, {
                    requestId: record.id,
                    shop: record.shop
                });
                return res.status(200).json({
                    ok: true,
                    message: "Compliance webhook verified",
                    topic: expectedTopic,
                    requestId: record.id
                });
            }
            catch (error) {
                next(error);
            }
        };
    }
    router.post("/shopify/customers/data_request", handleComplianceWebhook("customers/data_request"));
    router.post("/shopify/customers/redact", handleComplianceWebhook("customers/redact"));
    router.post("/shopify/shop/redact", handleComplianceWebhook("shop/redact"));
    router.post("/shopify/orders-paid", (req, res) => {
        const verified = parseVerifiedWebhook(req, "orders/paid");
        if (!verified.ok) {
            return res.status(verified.status).json(verified.body);
        }
        console.log("Order paid:", verified.payload.id);
        return res.json({
            ok: true,
            message: "Shopify webhook verified",
            topic: verified.topic
        });
    });
    return router;
}
