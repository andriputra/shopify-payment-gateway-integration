import { Response, Router } from "express";
import { PaymentService } from "../services/payment-service";
import { ShopifyPaymentResolveService } from "../services/shopify-payment-resolve-service";
import { PaymentSessionContextStore } from "../storage/contracts";
import { webhookOrderReference } from "../utils/webhook-order-ref";

export type WebhookRoutesDeps = {
  sessionContextRepo?: PaymentSessionContextStore;
  paymentResolve?: ShopifyPaymentResolveService;
};

export function webhookRoutes(service: PaymentService, deps?: WebhookRoutesDeps): Router {
  const router = Router();
  const { sessionContextRepo, paymentResolve } = deps ?? {};

  const handlePaymentWebhook = async (
    provider: string,
    decodedShop: string,
    body: Record<string, unknown>,
    res: Response
  ) => {
    const result = await service.handleWebhook(decodedShop, provider, body);

    let shopifyPaymentSession: { attempted: boolean; ok?: boolean; message?: string } = {
      attempted: false
    };

    if (result.paid && sessionContextRepo && paymentResolve) {
      const orderRef = webhookOrderReference(provider, body);
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

    res.json({ ok: true, ...result, shopifyPaymentSession });
  };

  router.post("/payment/:provider/:shop", async (req, res, next) => {
    try {
      const { provider, shop } = req.params;
      const decodedShop = decodeURIComponent(shop);
      const body = (req.body ?? {}) as Record<string, unknown>;
      await handlePaymentWebhook(provider, decodedShop, body, res);
    } catch (error) {
      next(error);
    }
  });

  router.post("/payment/:provider", async (req, res, next) => {
    try {
      const { provider } = req.params;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const shopFromQuery = typeof req.query.shop === "string" ? req.query.shop : "";
      const shopFromBody = typeof body.shop === "string" ? body.shop : "";
      const shop = decodeURIComponent((shopFromQuery || shopFromBody || "").trim().toLowerCase());
      if (!shop) {
        return res.status(400).json({ ok: false, message: "Missing shop for payment webhook" });
      }
      await handlePaymentWebhook(provider, shop, body, res);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
