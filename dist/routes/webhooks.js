"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookRoutes = webhookRoutes;
const express_1 = require("express");
const swipe_transaction_log_1 = require("../services/swipe-transaction-log");
const webhook_order_ref_1 = require("../utils/webhook-order-ref");
function webhookRoutes(service, deps) {
    const router = (0, express_1.Router)();
    const { sessionContextRepo, paymentResolve, paymentRedirectRepo, orderService } = deps ?? {};
    const handlePaymentWebhook = async (provider, decodedShop, body, res) => {
        const result = await service.handleWebhook(decodedShop, provider, body);
        const orderRef = (0, webhook_order_ref_1.webhookOrderReference)(provider, body);
        let shopifyPaymentSession = {
            attempted: false
        };
        if (result.paid && sessionContextRepo && paymentResolve) {
            if (orderRef) {
                const ctx = await sessionContextRepo.get(orderRef);
                if (ctx && ctx.shop === decodedShop) {
                    shopifyPaymentSession.attempted = true;
                    const resolved = await paymentResolve.resolvePaymentSession(ctx.shop, ctx.paymentSessionId);
                    shopifyPaymentSession.ok = resolved.ok;
                    shopifyPaymentSession.message = resolved.message;
                    if (resolved.ok) {
                        await sessionContextRepo.delete(orderRef);
                    }
                }
            }
        }
        // Manual payment method flow: resolve Shopify Order as paid when provider callback says paid.
        if (result.paid && paymentRedirectRepo && orderService) {
            if (orderRef) {
                const record = await paymentRedirectRepo.get(decodedShop, orderRef);
                if (record) {
                    await paymentRedirectRepo.markStatus(decodedShop, orderRef, "paid");
                    if (record.shopifyOrderId) {
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
        }
        if (provider === "swipe") {
            let sessionContextMatched;
            if (orderRef && sessionContextRepo) {
                const ctx = await sessionContextRepo.get(orderRef);
                sessionContextMatched = Boolean(ctx && ctx.shop === decodedShop);
            }
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
