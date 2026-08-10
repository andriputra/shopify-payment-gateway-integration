import { Response, Router } from "express";
import { PaymentService } from "../services/payment-service";
import { persistSwipePayload } from "../services/swipe-payload-persist";
import { ShopifyOrderService } from "../services/shopify-order-service";
import { ShopifyPaymentResolveService } from "../services/shopify-payment-resolve-service";
import { logSwipeTransaction, sanitizeSwipePayloadForLog } from "../services/swipe-transaction-log";
import {
  PaymentRedirectRecord,
  PaymentRedirectStore,
  PaymentSessionContext,
  PaymentSessionContextStore
} from "../storage/contracts";
import { forwardPaymentWebhook } from "../services/payment-forward-webhook";
import { isSwipeApprovedResponseCode } from "../data/swipe-response-codes";
import { isSwipeCancelledResponseCode, isSwipeUserCancelMessage } from "../providers/swipe";
import { webhookOrderReference, webhookSwipeRequestId } from "../utils/webhook-order-ref";
import { normalizeMerchantShopKey } from "../utils/shop-domain";

export type WebhookRoutesDeps = {
  sessionContextRepo?: PaymentSessionContextStore;
  paymentRedirectRepo?: PaymentRedirectStore;
  paymentResolve?: ShopifyPaymentResolveService;
  orderService?: ShopifyOrderService;
};

/**
 * Resolve the stored payment-redirect key for a Swipe callback.
 * QRIS often replaces `invoice_number` with a terminal slip number — fall back to `request_id`.
 */
async function resolveSwipeOrderReference(
  paymentRedirectRepo: PaymentRedirectStore | undefined,
  shopKey: string,
  body: Record<string, unknown>,
  parsedRequestId?: string
): Promise<{ orderRef: string | undefined; matchedVia: "invoice" | "request_id" | "none" }> {
  const invoiceRef = webhookOrderReference("swipe", body);
  if (invoiceRef && paymentRedirectRepo) {
    const byInvoice = await paymentRedirectRepo.get(shopKey, invoiceRef);
    if (byInvoice) {
      return { orderRef: byInvoice.orderReference, matchedVia: "invoice" };
    }
  }

  const requestId = (parsedRequestId || webhookSwipeRequestId(body) || "").trim();
  if (requestId && paymentRedirectRepo) {
    const byRequest = await paymentRedirectRepo.getBySwipeRequestId(shopKey, requestId);
    if (byRequest) {
      return { orderRef: byRequest.orderReference, matchedVia: "request_id" };
    }
  }

  /** No stored redirect matched — keep callback invoice for logging only. */
  return { orderRef: invoiceRef, matchedVia: "none" };
}

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
        webhookSwipeRequestId(body) ||
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

    let orderRef =
      provider === "swipe"
        ? undefined
        : webhookOrderReference(provider, body);
    let matchedVia: "invoice" | "request_id" | "none" | "other" =
      provider === "swipe" ? "none" : "other";

    if (provider === "swipe") {
      const resolved = await resolveSwipeOrderReference(
        paymentRedirectRepo,
        shopKey,
        body,
        result.requestId
      );
      orderRef = resolved.orderRef;
      matchedVia = resolved.matchedVia;

      /** When matched via request_id, also mirror under create invoice for InvStatus lookups. */
      const callbackInvoice = webhookOrderReference(provider, body);
      if (matchedVia === "request_id" && orderRef && orderRef !== callbackInvoice) {
        await persistSwipePayload({
          shop: shopKey,
          orderReference: orderRef,
          source: "swipe_webhook",
          httpStatus: null,
          bodyText: JSON.stringify(body)
        });
      }
    }

    let paidRedirectRecord: PaymentRedirectRecord | undefined;

    if (orderRef && paymentRedirectRepo) {
      const record = await paymentRedirectRepo.get(shopKey, orderRef);
      paidRedirectRecord = record;
      if (record) {
        const swipeExtras =
          provider === "swipe"
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
        } else if (
          result.outcome === "failed" ||
          result.outcome === "cancelled" ||
          result.outcome === "timeout"
        ) {
          nextStatus = "failed";
        } else if (
          provider === "swipe" &&
          (isSwipeApprovedResponseCode(swipeExtras.swipeResponseCode) ||
            ["OK", "PROCESSED"].includes(String(swipeExtras.lastSwipeStatusRaw ?? "").toUpperCase()) ||
            /APPROVED|ALREADY\s+PAID|PAYMENT\s+ALREADY\s+PAID/i.test(
              String(swipeExtras.swipeResponseMessage ?? "")
            ))
        ) {
          nextStatus = "paid";
        } else if (
          provider === "swipe" &&
          (isSwipeUserCancelMessage(swipeExtras.swipeResponseMessage) ||
            isSwipeCancelledResponseCode(swipeExtras.swipeResponseCode))
        ) {
          nextStatus = "failed";
        }
        await paymentRedirectRepo.mergeUpdate(shopKey, orderRef, { status: nextStatus, ...swipeExtras });
        paidRedirectRecord = { ...record, status: nextStatus, ...swipeExtras };
      }
    }

    let ctxAtCallback: PaymentSessionContext | undefined;
    if (orderRef && sessionContextRepo) {
      ctxAtCallback = await sessionContextRepo.get(orderRef);
      /** Also try request_id key (saved at payment-session create). */
      if (!ctxAtCallback && result.requestId) {
        ctxAtCallback = await sessionContextRepo.get(result.requestId);
      }
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
        note:
          matchedVia === "request_id"
            ? "Matched via request_id (QRIS invoice_number may differ from create)."
            : orderRef
              ? "HTTP callback received from Swipe (EDC settlement path); compare outcome vs Shopify resolve."
              : "Callback missing invoice_number / request_id match — cannot match stored payment session context."
      });
    }

    const redirectUrl =
      result.paid && paidRedirectRecord?.returnUrlAfterPaid?.trim()
        ? paidRedirectRecord.returnUrlAfterPaid.trim()
        : result.redirectUrl;

    let forwardWebhook: { attempted: boolean; ok?: boolean; url?: string; error?: string } = {
      attempted: false
    };
    const forwardUrl = paidRedirectRecord?.forwardWebhookUrl?.trim();
    if (forwardUrl && orderRef) {
      forwardWebhook.attempted = true;
      forwardWebhook.url = forwardUrl;
      const fwd = await forwardPaymentWebhook(
        forwardUrl,
        {
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
        },
        { secret: paidRedirectRecord?.forwardWebhookSecret }
      );
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
