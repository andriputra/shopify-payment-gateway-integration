"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookRoutes = webhookRoutes;
const express_1 = require("express");
const swipe_payload_persist_1 = require("../services/swipe-payload-persist");
const swipe_transaction_log_1 = require("../services/swipe-transaction-log");
const payment_forward_webhook_1 = require("../services/payment-forward-webhook");
const swipe_response_codes_1 = require("../data/swipe-response-codes");
const webhook_order_ref_1 = require("../utils/webhook-order-ref");
const shop_domain_1 = require("../utils/shop-domain");
/**
 * Resolve the stored payment-redirect key for a Swipe callback.
 * QRIS often replaces `invoice_number` with a terminal slip number — fall back to `request_id`.
 */
async function resolveSwipeOrderReference(paymentRedirectRepo, shopKey, body, parsedRequestId) {
    const invoiceRef = (0, webhook_order_ref_1.webhookOrderReference)("swipe", body);
    if (invoiceRef && paymentRedirectRepo) {
        const byInvoice = await paymentRedirectRepo.get(shopKey, invoiceRef);
        if (byInvoice) {
            return { orderRef: byInvoice.orderReference, matchedVia: "invoice" };
        }
    }
    const requestId = (parsedRequestId || (0, webhook_order_ref_1.webhookSwipeRequestId)(body) || "").trim();
    if (requestId && paymentRedirectRepo) {
        const byRequest = await paymentRedirectRepo.getBySwipeRequestId(shopKey, requestId);
        if (byRequest) {
            return { orderRef: byRequest.orderReference, matchedVia: "request_id" };
        }
    }
    /** No stored redirect matched — keep callback invoice for logging only. */
    return { orderRef: invoiceRef, matchedVia: "none" };
}
function webhookRoutes(service, deps) {
    const router = (0, express_1.Router)();
    const { sessionContextRepo, paymentResolve, paymentRedirectRepo, orderService } = deps ?? {};
    const handlePaymentWebhook = async (provider, decodedShop, body, res) => {
        const shopKey = (0, shop_domain_1.normalizeMerchantShopKey)(decodedShop);
        if (provider === "swipe") {
            const earlyRef = (0, webhook_order_ref_1.webhookOrderReference)(provider, body) ||
                (0, webhook_order_ref_1.webhookSwipeRequestId)(body) ||
                String(body.invoice_number ?? body.merchant_reference ?? body.order_id ?? "__unknown__").trim();
            await (0, swipe_payload_persist_1.persistSwipePayload)({
                shop: shopKey,
                orderReference: earlyRef,
                source: "swipe_webhook",
                httpStatus: null,
                bodyText: JSON.stringify(body)
            });
        }
        const result = await service.handleWebhook(shopKey, provider, body);
        let orderRef = provider === "swipe"
            ? undefined
            : (0, webhook_order_ref_1.webhookOrderReference)(provider, body);
        let matchedVia = provider === "swipe" ? "none" : "other";
        if (provider === "swipe") {
            const resolved = await resolveSwipeOrderReference(paymentRedirectRepo, shopKey, body, result.requestId);
            orderRef = resolved.orderRef;
            matchedVia = resolved.matchedVia;
            /** When matched via request_id, also mirror under create invoice for InvStatus lookups. */
            const callbackInvoice = (0, webhook_order_ref_1.webhookOrderReference)(provider, body);
            if (matchedVia === "request_id" && orderRef && orderRef !== callbackInvoice) {
                await (0, swipe_payload_persist_1.persistSwipePayload)({
                    shop: shopKey,
                    orderReference: orderRef,
                    source: "swipe_webhook",
                    httpStatus: null,
                    bodyText: JSON.stringify(body)
                });
            }
        }
        let paidRedirectRecord;
        if (orderRef && paymentRedirectRepo) {
            const record = await paymentRedirectRepo.get(shopKey, orderRef);
            paidRedirectRecord = record;
            if (record) {
                const swipeExtras = provider === "swipe"
                    ? {
                        swipeResponseCode: result.edcResponseCode,
                        swipeResponseMessage: result.edcResponseMessage,
                        lastSwipeStatusRaw: result.statusRaw,
                        swipeRequestId: result.requestId ?? record.swipeRequestId,
                        wsSessionId: result.wsSessionId ?? record.wsSessionId
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
                else if (provider === "swipe" &&
                    ((0, swipe_response_codes_1.isSwipeApprovedResponseCode)(swipeExtras.swipeResponseCode) ||
                        ["OK", "PROCESSED"].includes(String(swipeExtras.lastSwipeStatusRaw ?? "").toUpperCase()) ||
                        /APPROVED|ALREADY\s+PAID|PAYMENT\s+ALREADY\s+PAID/i.test(String(swipeExtras.swipeResponseMessage ?? "")))) {
                    nextStatus = "paid";
                }
                await paymentRedirectRepo.mergeUpdate(shopKey, orderRef, { status: nextStatus, ...swipeExtras });
                paidRedirectRecord = { ...record, status: nextStatus, ...swipeExtras };
            }
        }
        let ctxAtCallback;
        if (orderRef && sessionContextRepo) {
            ctxAtCallback = await sessionContextRepo.get(orderRef);
            /** Also try request_id key (saved at payment-session create). */
            if (!ctxAtCallback && result.requestId) {
                ctxAtCallback = await sessionContextRepo.get(result.requestId);
            }
        }
        const sessionContextMatched = Boolean(ctxAtCallback && ctxAtCallback.shop === shopKey);
        let shopifyPaymentSession = {
            attempted: false
        };
        if (result.paid && sessionContextRepo && paymentResolve) {
            if (orderRef && ctxAtCallback && ctxAtCallback.shop === shopKey) {
                shopifyPaymentSession.attempted = true;
                const resolved = await paymentResolve.resolvePaymentSession(ctxAtCallback.shop, ctxAtCallback.paymentSessionId);
                shopifyPaymentSession.ok = resolved.ok;
                shopifyPaymentSession.message = resolved.message;
                if (resolved.ok) {
                    await sessionContextRepo.delete(orderRef);
                    if (result.requestId) {
                        await sessionContextRepo.delete(result.requestId);
                    }
                }
            }
        }
        // Manual payment method flow: resolve Shopify Order as paid when provider callback says paid.
        if (result.paid && paymentRedirectRepo && orderService) {
            if (orderRef) {
                const record = await paymentRedirectRepo.get(shopKey, orderRef);
                if (record?.shopifyOrderId) {
                    const marked = await orderService.markOrderPaid(shopKey, record.shopifyOrderId);
                    // Best-effort: do not fail webhook if Shopify mark paid fails.
                    if (!marked.ok) {
                        console.warn("[MANUAL PAYMENT] orderMarkAsPaid failed", {
                            shop: shopKey,
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
                shop: shopKey,
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
                note: matchedVia === "request_id"
                    ? "Matched via request_id (QRIS invoice_number may differ from create)."
                    : orderRef
                        ? "HTTP callback received from Swipe (EDC settlement path); compare outcome vs Shopify resolve."
                        : "Callback missing invoice_number / request_id match — cannot match stored payment session context."
            });
        }
        const redirectUrl = result.paid && paidRedirectRecord?.returnUrlAfterPaid?.trim()
            ? paidRedirectRecord.returnUrlAfterPaid.trim()
            : result.redirectUrl;
        let forwardWebhook = {
            attempted: false
        };
        const forwardUrl = paidRedirectRecord?.forwardWebhookUrl?.trim();
        if (forwardUrl && orderRef) {
            forwardWebhook.attempted = true;
            forwardWebhook.url = forwardUrl;
            const fwd = await (0, payment_forward_webhook_1.forwardPaymentWebhook)(forwardUrl, {
                event: "payment.updated",
                shop: shopKey,
                provider,
                orderReference: orderRef,
                status: paidRedirectRecord?.status ?? (result.paid ? "paid" : "pending"),
                paid: result.paid,
                amount: paidRedirectRecord?.amount,
                currency: paidRedirectRecord?.currency,
                providerReference: paidRedirectRecord?.providerReference ?? result.providerReference,
                swipeResponseCode: paidRedirectRecord?.swipeResponseCode ?? result.edcResponseCode ?? null,
                swipeResponseMessage: paidRedirectRecord?.swipeResponseMessage ?? result.edcResponseMessage ?? null,
                swipeRequestId: paidRedirectRecord?.swipeRequestId ?? result.requestId ?? null,
                wsSessionId: paidRedirectRecord?.wsSessionId ?? result.wsSessionId ?? null,
                returnUrlAfterPaid: paidRedirectRecord?.returnUrlAfterPaid ?? null,
                providerPayload: body,
                receivedAt: new Date().toISOString()
            }, { secret: paidRedirectRecord?.forwardWebhookSecret });
            forwardWebhook.ok = fwd.ok;
            if (!fwd.ok) {
                forwardWebhook.error = fwd.error;
                console.warn("[payment-forward-webhook]", { shop: shopKey, orderRef, forwardUrl, error: fwd.error });
            }
        }
        res.json({
            ok: true,
            ...result,
            redirectUrl,
            forwardWebhook,
            shopifyPaymentSession,
            matchedOrderReference: orderRef ?? null,
            matchedVia
        });
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
