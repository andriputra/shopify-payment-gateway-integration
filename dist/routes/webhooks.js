"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookRoutes = webhookRoutes;
const express_1 = require("express");
const webhook_order_ref_1 = require("../utils/webhook-order-ref");
function webhookRoutes(service, deps) {
    const router = (0, express_1.Router)();
    const { sessionContextRepo, paymentRedirectRepo, paymentResolve } = deps ?? {};
    router.post("/payment/:provider/:shop", async (req, res, next) => {
        try {
            const { provider, shop } = req.params;
            const decodedShop = decodeURIComponent(shop);
            const body = (req.body ?? {});
            const result = await service.handleWebhook(decodedShop, provider, body);
            let shopifyPaymentSession = {
                attempted: false
            };
            if (result.paid && sessionContextRepo && paymentResolve) {
                const orderRef = (0, webhook_order_ref_1.webhookOrderReference)(provider, body);
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
            const orderRef = (0, webhook_order_ref_1.webhookOrderReference)(provider, body);
            if (orderRef && paymentRedirectRepo) {
                await paymentRedirectRepo.markStatus(decodedShop, orderRef, result.paid ? "paid" : "failed");
            }
            res.json({ ok: true, ...result, shopifyPaymentSession });
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
