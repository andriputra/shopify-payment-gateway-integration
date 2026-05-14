import { Response, Router } from "express";
import { PaymentService } from "../services/payment-service";
import { persistSwipePayload } from "../services/swipe-payload-persist";
import { ShopifyOrderService } from "../services/shopify-order-service";
import { ShopifyPaymentResolveService } from "../services/shopify-payment-resolve-service";
import { logSwipeTransaction, sanitizeSwipePayloadForLog } from "../services/swipe-transaction-log";
import {
  PaymentRedirectStore,
  PaymentSessionContext,
  PaymentSessionContextStore
} from "../storage/contracts";
import { webhookOrderReference } from "../utils/webhook-order-ref";
import { normalizeMerchantShopKey } from "../utils/shop-domain";

export type WebhookRoutesDeps = {
  sessionContextRepo?: PaymentSessionContextStore;
  paymentRedirectRepo?: PaymentRedirectStore;
  paymentResolve?: ShopifyPaymentResolveService;
  orderService?: ShopifyOrderService;
};

export function webhookRoutes(service: PaymentService, deps?: WebhookRoutesDeps): Router {
  const router = Router();
  const { sessionContextRepo, paymentResolve, paymentRedirectRepo, orderService } = deps ?? {};

  const handlePaymentWebhook = async (
    provider: string,
    decodedShop: string,
    body: Record<string, unknown>,
    res: Response
  ) => {
    const shopKey = normalizeMerchantShopKey(decodedShop);
    if (provider === "swipe") {
      const earlyRef =
        webhookOrderReference(provider, body) ||
        String(body.invoice_number ?? body.merchant_reference ?? body.order_id ?? "__unknown__").trim();
      await persistSwipePayload({
        shop: shopKey,
        orderReference: earlyRef,
        source: "swipe_webhook",
        httpStatus: null,
        bodyText: JSON.stringify(body)
      });
    }

    const result = await service.handleWebhook(shopKey, provider, body);
    const orderRef = webhookOrderReference(provider, body);

    if (orderRef && paymentRedirectRepo) {
      const record = await paymentRedirectRepo.get(shopKey, orderRef);
      if (record) {
        const swipeExtras =
          provider === "swipe"
            ? {
                swipeResponseCode: result.edcResponseCode,
                swipeResponseMessage: result.edcResponseMessage,
                lastSwipeStatusRaw: result.statusRaw
              }
            : {};
        let nextStatus = record.status;
        if (result.paid) {
          nextStatus = "paid";
        } else if (
          result.outcome === "failed" ||
          result.outcome === "cancelled" ||
          result.outcome === "timeout"
        ) {
          nextStatus = "failed";
        }
        await paymentRedirectRepo.mergeUpdate(shopKey, orderRef, { status: nextStatus, ...swipeExtras });
      }
    }

    let ctxAtCallback: PaymentSessionContext | undefined;
    if (orderRef && sessionContextRepo) {
      ctxAtCallback = await sessionContextRepo.get(orderRef);
    }
    const sessionContextMatched = Boolean(ctxAtCallback && ctxAtCallback.shop === shopKey);

    let shopifyPaymentSession: { attempted: boolean; ok?: boolean; message?: string } = {
      attempted: false
    };

    if (result.paid && sessionContextRepo && paymentResolve) {
      if (orderRef && ctxAtCallback && ctxAtCallback.shop === shopKey) {
        shopifyPaymentSession.attempted = true;
        const resolved = await paymentResolve.resolvePaymentSession(
          ctxAtCallback.shop,
          ctxAtCallback.paymentSessionId
        );
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
      logSwipeTransaction({
        phase: "edc_callback",
        shop: shopKey,
        orderId: orderRef ?? "(unresolved)",
        orderRefFromPayload: orderRef,
        paid: result.paid,
        outcome:
          result.outcome ??
          (result.paid ? "paid" : "unknown"),
        statusRaw: result.statusRaw,
        providerReference: result.providerReference,
        edcCallbackReceived: true,
        sessionContextMatched,
        shopifyPaymentResolve: shopifyPaymentSession,
        payloadPreview: sanitizeSwipePayloadForLog(body),
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
