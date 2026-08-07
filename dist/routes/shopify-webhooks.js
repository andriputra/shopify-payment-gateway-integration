"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopifyWebhookRoutes = shopifyWebhookRoutes;
const express_1 = require("express");
const swipe_1 = require("../providers/swipe");
function shopifyWebhookRoutes(authService, complianceService, deps) {
    const router = (0, express_1.Router)();
    const storeRepo = deps?.storeRepo;
    const paymentService = deps?.paymentService;
    const paymentRedirectRepo = deps?.paymentRedirectRepo;
    function parseVerifiedWebhook(req, expectedTopic) {
        const hmac = String(req.get("x-shopify-hmac-sha256") ?? "");
        const rawBody = req.rawBody ?? Buffer.from("");
        const topic = String(req.get("x-shopify-topic") ?? expectedTopic ?? "");
        const shop = String(req.get("x-shopify-shop-domain") ?? "").trim().toLowerCase();
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
        if (!shop || !shop.includes(".myshopify.com")) {
            return {
                ok: false,
                status: 400,
                body: { ok: false, message: "Missing x-shopify-shop-domain header" }
            };
        }
        return {
            ok: true,
            topic,
            shop,
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
    // Manual payment method: order sudah dibuat (financial_status pending). Trigger provider createCheckout di server.
    router.post("/shopify/orders-create", async (req, res, next) => {
        try {
            const verified = parseVerifiedWebhook(req, "orders/create");
            if (!verified.ok) {
                return res.status(verified.status).json(verified.body);
            }
            if (!storeRepo || !paymentService || !paymentRedirectRepo) {
                return res.status(500).json({ ok: false, message: "Manual payment webhook deps not configured" });
            }
            const payload = verified.payload;
            const orderIdNumber = payload.id ? String(payload.id) : "";
            const currency = payload.currency ? String(payload.currency) : "IDR";
            const totalPrice = payload.total_price ? Number(payload.total_price) : NaN;
            const financialStatus = payload.financial_status ? String(payload.financial_status) : "";
            // Hanya proses order manual/pending.
            if (financialStatus && financialStatus.toLowerCase() !== "pending") {
                return res.json({ ok: true, skipped: true, reason: `financial_status=${financialStatus}` });
            }
            if (!orderIdNumber || !Number.isFinite(totalPrice)) {
                return res.status(400).json({ ok: false, message: "Invalid order payload (id/total_price missing)" });
            }
            const shop = verified.shop;
            const store = await storeRepo.get(shop);
            if (!store) {
                return res.status(404).json({ ok: false, message: `Store config not found for shop: ${shop}` });
            }
            if (store.provider !== "swipe") {
                return res.json({ ok: true, skipped: true, reason: `provider=${store.provider}` });
            }
            const orderRef = `order_${orderIdNumber}`;
            const orderGid = `gid://shopify/Order/${orderIdNumber}`;
            const swipeOrderReference = (0, swipe_1.swipeInvoiceNumberForOrder)(orderRef);
            const swipePaymentMethod = (0, swipe_1.swipePaymentMethodFromOrderNoteAttributes)(payload);
            const result = await paymentService.createCheckout({
                shop,
                provider: "swipe",
                amount: totalPrice,
                currency,
                orderId: orderRef,
                swipePaymentMethod
            });
            const now = new Date().toISOString();
            await paymentRedirectRepo.upsert({
                shop,
                orderReference: swipeOrderReference,
                provider: "swipe",
                paymentUrl: result.paymentUrl,
                providerReference: result.providerReference,
                shopifyOrderId: orderGid,
                amount: totalPrice,
                currency,
                status: "pending",
                createdAt: now,
                updatedAt: now,
                swipeRequestId: result.requestId?.trim() || undefined
            });
            return res.json({ ok: true, shop, orderRef, swipeOrderReference, paymentUrl: result.paymentUrl });
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
