"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopifyWebhookRoutes = shopifyWebhookRoutes;
const express_1 = require("express");
function shopifyWebhookRoutes(authService, complianceService, deps) {
    const router = (0, express_1.Router)();
    const { paymentService, paymentRedirectRepo } = deps ?? {};
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
                return handleComplianceTopic(req, res, next, expectedTopic);
            }
            catch (error) {
                next(error);
            }
        };
    }
    async function handleComplianceTopic(req, res, next, expectedTopic) {
        try {
            const verified = parseVerifiedWebhook(req, expectedTopic);
            if (!verified.ok) {
                return res.status(verified.status).json(verified.body);
            }
            if (verified.topic !== "customers/data_request" &&
                verified.topic !== "customers/redact" &&
                verified.topic !== "shop/redact") {
                return res.status(400).json({
                    ok: false,
                    message: `Unhandled Shopify topic: ${verified.topic}`
                });
            }
            const record = verified.topic === "customers/data_request"
                ? await complianceService.handleCustomersDataRequest(verified.payload)
                : verified.topic === "customers/redact"
                    ? await complianceService.handleCustomersRedact(verified.payload)
                    : await complianceService.handleShopRedact(verified.payload);
            console.log(`Compliance webhook received: ${verified.topic}`, {
                requestId: record.id,
                shop: record.shop
            });
            return res.status(200).json({
                ok: true,
                message: "Compliance webhook verified",
                topic: verified.topic,
                requestId: record.id
            });
        }
        catch (error) {
            next(error);
        }
    }
    router.post("/", (req, res, next) => {
        void handleComplianceTopic(req, res, next);
    });
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
    router.post("/shopify/orders/create", async (req, res, next) => {
        try {
            const verified = parseVerifiedWebhook(req, "orders/create");
            if (!verified.ok) {
                return res.status(verified.status).json(verified.body);
            }
            if (!paymentService || !paymentRedirectRepo) {
                return res.status(503).json({
                    ok: false,
                    message: "Auto payment link service not configured"
                });
            }
            const shop = String(req.get("x-shopify-shop-domain") ?? "").trim().toLowerCase();
            if (!shop) {
                return res.status(400).json({ ok: false, message: "Missing x-shopify-shop-domain header" });
            }
            const payload = verified.payload;
            const orderIdRaw = payload.id ?? payload.admin_graphql_api_id ?? payload.name;
            const orderReference = String(orderIdRaw ?? "").trim();
            if (!orderReference) {
                return res.status(400).json({ ok: false, message: "Order payload missing id/name" });
            }
            const amount = Number(payload.current_total_price ?? payload.total_price ?? 0);
            if (!Number.isFinite(amount) || amount <= 0) {
                return res.status(200).json({
                    ok: true,
                    skipped: true,
                    reason: "Order total is zero/non-positive"
                });
            }
            const currency = String(payload.presentment_currency ?? payload.currency ?? "IDR").toUpperCase();
            const customerEmail = String(payload.contact_email ?? payload.email ?? "").trim() || undefined;
            const created = await paymentService.createCheckoutForConfiguredProvider({
                shop,
                amount,
                currency,
                orderId: orderReference,
                customerEmail
            });
            const now = new Date().toISOString();
            await paymentRedirectRepo.upsert({
                shop,
                orderReference,
                provider: created.provider,
                paymentUrl: created.paymentUrl,
                providerReference: created.providerReference,
                amount,
                currency,
                status: "pending",
                createdAt: now,
                updatedAt: now
            });
            return res.status(200).json({
                ok: true,
                topic: verified.topic,
                shop,
                orderReference,
                provider: created.provider,
                paymentUrl: created.paymentUrl
            });
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
