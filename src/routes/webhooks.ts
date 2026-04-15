import { Router } from "express";
import { PaymentService } from "../services/payment-service";
import { ShopifyPaymentResolveService } from "../services/shopify-payment-resolve-service";
import { PaymentSessionContextRepository } from "../storage/payment-session-context-repo";
import { webhookOrderReference } from "../utils/webhook-order-ref";

export type WebhookRoutesDeps = {
  sessionContextRepo?: PaymentSessionContextRepository;
  paymentResolve?: ShopifyPaymentResolveService;
};

export function webhookRoutes(service: PaymentService, deps?: WebhookRoutesDeps): Router {
  const router = Router();
  const { sessionContextRepo, paymentResolve } = deps ?? {};

  router.post("/payment/:provider/:shop", async (req, res, next) => {
    try {
      const { provider, shop } = req.params;
      const decodedShop = decodeURIComponent(shop);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = service.handleWebhook(decodedShop, provider, body);

      let shopifyPaymentSession: { attempted: boolean; ok?: boolean; message?: string } = {
        attempted: false
      };

      if (result.paid && sessionContextRepo && paymentResolve) {
        const orderRef = webhookOrderReference(provider, body);
        if (orderRef) {
          const ctx = sessionContextRepo.get(orderRef);
          if (ctx && ctx.shop === decodedShop) {
            shopifyPaymentSession.attempted = true;
            const resolved = await paymentResolve.resolvePaymentSession(ctx.shop, ctx.paymentSessionId);
            shopifyPaymentSession.ok = resolved.ok;
            shopifyPaymentSession.message = resolved.message;
            if (resolved.ok) {
              sessionContextRepo.delete(orderRef);
            }
          }
        }
      }

      res.json({ ok: true, ...result, shopifyPaymentSession });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
