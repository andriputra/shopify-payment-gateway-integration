"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookRoutes = webhookRoutes;
const express_1 = require("express");
const swipe_payload_persist_1 = require("../services/swipe-payload-persist");
const swipe_transaction_log_1 = require("../services/swipe-transaction-log");
const webhook_order_ref_1 = require("../utils/webhook-order-ref");
function webhookRoutes(service, deps) {
    const router = (0, express_1.Router)();
    const { sessionContextRepo, paymentResolve, paymentRedirectRepo, orderService } = deps ?? {};
    const handlePaymentWebhook = async (provider, decodedShop, body, res) => {
        if (provider === "swipe") {
            const earlyRef = (0, webhook_order_ref_1.webhookOrderReference)(provider, body) ||
                String(body.invoice_number ?? body.merchant_reference ?? body.order_id ?? "__unknown__").trim();
            await (0, swipe_payload_persist_1.persistSwipePayload)({
                shop: decodedShop,
                orderReference: earlyRef,
                source: "swipe_webhook",
                httpStatus: null,
                bodyText: JSON.stringify(body)
            });
        }
        const result = await service.handleWebhook(decodedShop, provider, body);
        const orderRef = (0, webhook_order_ref_1.webhookOrderReference)(provider, body);
        if (orderRef && paymentRedirectRepo) {
            const record = await paymentRedirectRepo.get(decodedShop, orderRef);
            if (record) {
                const swipeExtras = provider === "swipe"
                    ? {
                        swipeResponseCode: result.edcResponseCode,
                        swipeResponseMessage: result.edcResponseMessage,
                        lastSwipeStatusRaw: result.statusRaw
                    }
                    : {};
                let nextStatus = record.status;
                if (result.paid) {
                    nextStatus = "paid";
                }
                else if (result.outcome === "failed" ||
                    result.outcome === "cancelled" ||
                    result.outcome === "timeout") {
                    nextStatus = "failed";
                }
                await paymentRedirectRepo.mergeUpdate(decodedShop, orderRef, { status: nextStatus, ...swipeExtras });
            }
        }
        let ctxAtCallback;
        if (orderRef && sessionContextRepo) {
            ctxAtCallback = await sessionContextRepo.get(orderRef);
        }
        const sessionContextMatched = Boolean(ctxAtCallback && ctxAtCallback.shop === decodedShop);
        let shopifyPaymentSession = {
            attempted: false
        };
        if (result.paid && sessionContextRepo && paymentResolve) {
            if (orderRef && ctxAtCallback && ctxAtCallback.shop === decodedShop) {
                shopifyPaymentSession.attempted = true;
                const resolved = await paymentResolve.resolvePaymentSession(ctxAtCallback.shop, ctxAtCallback.paymentSessionId);
                shopifyPaymentSession.ok = resolved.ok;
                shopifyPaymentSession.message = resolved.message;
                if (resolved.ok) {
                    await sessionContextRepo.delete(orderRef);
                }
            }
        }
        // Manual payment method flow: resolve Shopify Order as paid when provider callback says paid.
        if (result.paid && paymentRedirectRepo && orderService) {
            if (orderRef) {
                const record = await paymentRedirectRepo.get(decodedShop, orderRef);
                if (record?.shopifyOrderId) {
                    const marked = await orderService.markOrderPaid(decodedShop, record.shopifyOrderId);
                    // Best-effort: do not fail webhook if Shopify mark paid fails.
                    if (!marked.ok) {
                        console.warn("[MANUAL PAYMENT] orderMarkAsPaid failed", {
                            shop: decodedShop,
                            orderRef,
                            orderId: record.shopifyOrderId,
                            message: marked.message
                        });
                    }
                }
            }
        }
        if (provider === "swipe") {
            (0, swipe_transaction_log_1.logSwipeTransaction)({
                phase: "edc_callback",
                shop: decodedShop,
                orderId: orderRef ?? "(unresolved)",
                orderRefFromPayload: orderRef,
                paid: result.paid,
                outcome: result.outcome ??
                    (result.paid ? "paid" : "unknown"),
                statusRaw: result.statusRaw,
                providerReference: result.providerReference,
                edcCallbackReceived: true,
                sessionContextMatched,
                shopifyPaymentResolve: shopifyPaymentSession,
                payloadPreview: (0, swipe_transaction_log_1.sanitizeSwipePayloadForLog)(body),
                note: orderRef
                    ? "HTTP callback received from Swipe (EDC settlement path); compare outcome vs Shopify resolve."
                    : "Callback missing invoice_number / merchant_reference — cannot match stored payment session context."
            });
        }
        res.json({ ok: true, ...result, shopifyPaymentSession });
    };
    router.post("/payment/:provider/:shop", async (req, res, next) => {
        try {
            const { provider, shop } = req.params;
            const decodedShop = decodeURIComponent(shop);
            const body = (req.body ?? {});
            await handlePaymentWebhook(provider, decodedShop, body, res);
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/payment/:provider", async (req, res, next) => {
        try {
            const { provider } = req.params;
            const body = (req.body ?? {});
            const shopFromQuery = typeof req.query.shop === "string" ? req.query.shop : "";
            const shopFromBody = typeof body.shop === "string" ? body.shop : "";
            const shop = decodeURIComponent((shopFromQuery || shopFromBody || "").trim().toLowerCase());
            if (!shop) {
                return res.status(400).json({ ok: false, message: "Missing shop for payment webhook" });
            }
            await handlePaymentWebhook(provider, shop, body, res);
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
