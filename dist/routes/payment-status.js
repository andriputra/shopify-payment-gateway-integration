"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentStatusRoutes = paymentStatusRoutes;
const express_1 = require("express");
const env_1 = require("../config/env");
const swipe_response_codes_1 = require("../data/swipe-response-codes");
const shop_domain_1 = require("../utils/shop-domain");
const shop_domain_2 = require("../utils/shop-domain");
function paymentStatusSecret() {
    return (env_1.env.paymentStatusApiSecret || env_1.env.appSharedSecret).trim();
}
function paymentStatusAuthOk(req) {
    const configured = paymentStatusSecret();
    const bearer = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const headerSecret = (req.get("x-payment-status-secret") ?? "").trim();
    const qSecret = typeof req.query.secret === "string" ? req.query.secret.trim() : "";
    return bearer === configured || headerSecret === configured || qSecret === configured;
}
function paymentStatusRoutes(paymentRedirectRepo) {
    const router = (0, express_1.Router)();
    router.get("/payment-status", async (req, res) => {
        if (!paymentStatusAuthOk(req)) {
            return res.status(401).json({
                ok: false,
                message: "Unauthorized. Send Authorization: Bearer <secret>, X-Payment-Status-Secret, or ?secret= (APP_SHARED_SECRET or PAYMENT_STATUS_API_SECRET)."
            });
        }
        const shopKey = (0, shop_domain_1.normalizeShopifyShopDomain)(String(req.query.shop ?? ""));
        if (!shopKey.includes(".myshopify.com")) {
            return res.status(400).json({ ok: false, message: "Query shop must resolve to a *.myshopify.com domain." });
        }
        const orderRef = String(req.query.orderReference ?? "").trim();
        const orderIdQuery = String(req.query.shopifyOrderId ?? req.query.orderId ?? "").trim();
        if (!orderRef && !orderIdQuery) {
            return res.status(400).json({
                ok: false,
                message: "Provide orderReference (Swipe invoice_number key) or shopifyOrderId (numeric id or gid://shopify/Order/...)."
            });
        }
        let record = orderRef ? await paymentRedirectRepo.get(shopKey, orderRef) : undefined;
        if (!record && orderIdQuery) {
            record = await paymentRedirectRepo.getByShopifyOrderId(shopKey, (0, shop_domain_2.normalizeShopifyOrderGid)(orderIdQuery));
        }
        if (!record) {
            return res.status(404).json({
                ok: false,
                message: "No payment record for this shop and order reference."
            });
        }
        const codeBook = record.swipeResponseCode != null ? (0, swipe_response_codes_1.lookupSwipeResponseMessage)(record.swipeResponseCode) : undefined;
        return res.json({
            ok: true,
            shop: record.shop,
            shopifyOrderId: record.shopifyOrderId ?? null,
            orderReference: record.orderReference,
            provider: record.provider,
            status: record.status,
            amount: record.amount,
            currency: record.currency,
            providerReference: record.providerReference,
            swipeResponseCode: record.swipeResponseCode ?? null,
            swipeResponseMessage: record.swipeResponseMessage ?? null,
            swipeResponseCodeBookMessage: codeBook ?? null,
            lastSwipeStatusRaw: record.lastSwipeStatusRaw ?? null,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        });
    });
    router.get("/payment-status/swipe-response-codes", (req, res) => {
        if (!paymentStatusAuthOk(req)) {
            return res.status(401).json({ ok: false, message: "Unauthorized." });
        }
        return res.json({
            ok: true,
            count: Object.keys(swipe_response_codes_1.SWIPE_RESPONSE_CODES).length,
            codes: swipe_response_codes_1.SWIPE_RESPONSE_CODES
        });
    });
    return router;
}
