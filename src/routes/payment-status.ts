import { Request, Response, Router } from "express";
import { env } from "../config/env";
import { lookupSwipeResponseMessage, SWIPE_RESPONSE_CODES } from "../data/swipe-response-codes";
import { swipeInvoiceNumberForOrder } from "../providers/swipe";
import { PaymentRedirectRecord, PaymentRedirectStore } from "../storage/contracts";
import { normalizeMerchantShopKey, normalizeShopifyOrderGid } from "../utils/shop-domain";

function paymentStatusSecret(): string {
  return (env.paymentStatusApiSecret || env.appSharedSecret).trim();
}

function paymentStatusAuthOk(req: Request): boolean {
  const configured = paymentStatusSecret();
  const bearer = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const headerSecret = (req.get("x-payment-status-secret") ?? "").trim();
  const qSecret = typeof req.query.secret === "string" ? req.query.secret.trim() : "";
  return bearer === configured || headerSecret === configured || qSecret === configured;
}

async function getPaymentRedirectByOrderReference(
  repo: PaymentRedirectStore,
  shopKey: string,
  orderRef: string
): Promise<{ record: PaymentRedirectRecord; matchedReference: string } | undefined> {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const t = s.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      candidates.push(t);
    }
  };
  push(orderRef);
  /** Internal order id e.g. ORDER-002 → stored key INV-ORDER002 (hyphens stripped inside Swipe invoice). */
  if (orderRef && !/^INV-/i.test(orderRef)) {
    push(swipeInvoiceNumberForOrder(orderRef));
  }
  /** User typed INV-ORDER-002; stored key is INV-ORDER002 — derive from suffix after INV-. */
  if (/^INV-/i.test(orderRef)) {
    const rest = orderRef.replace(/^INV-/i, "").trim();
    if (rest) {
      push(swipeInvoiceNumberForOrder(rest));
    }
  }
  for (const ref of candidates) {
    const record = await repo.get(shopKey, ref);
    if (record) {
      return { record, matchedReference: ref };
    }
  }
  return undefined;
}

export function paymentStatusRoutes(paymentRedirectRepo: PaymentRedirectStore): Router {
  const router = Router();

  router.get("/payment-status", async (req: Request, res: Response) => {
    if (!paymentStatusAuthOk(req)) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized. Send Authorization: Bearer <secret>, X-Payment-Status-Secret, or ?secret= (APP_SHARED_SECRET or PAYMENT_STATUS_API_SECRET)."
      });
    }

    const shopKey = normalizeMerchantShopKey(String(req.query.shop ?? ""));
    if (!shopKey || !shopKey.includes(".")) {
      return res.status(400).json({
        ok: false,
        message: "Provide a valid shop identifier: bare Shopify subdomain, *.myshopify.com host, or custom domain hostname (must match saved store config)."
      });
    }

    const orderRef = String(req.query.orderReference ?? "").trim();
    const orderIdQuery = String(req.query.shopifyOrderId ?? req.query.orderId ?? "").trim();
    if (!orderRef && !orderIdQuery) {
      return res.status(400).json({
        ok: false,
        message: "Provide orderReference (Swipe invoice_number key) or shopifyOrderId (numeric id or gid://shopify/Order/...)."
      });
    }

    let record: PaymentRedirectRecord | undefined;
    let matchedOrderReference: string | undefined;

    if (orderRef) {
      const found = await getPaymentRedirectByOrderReference(paymentRedirectRepo, shopKey, orderRef);
      if (found) {
        record = found.record;
        matchedOrderReference = found.matchedReference;
      }
      if (!record) {
        record = await paymentRedirectRepo.getBySwipeRequestId(shopKey, orderRef);
        if (record) {
          matchedOrderReference = record.orderReference;
        }
      }
    }
    if (!record && orderIdQuery) {
      record = await paymentRedirectRepo.getByShopifyOrderId(shopKey, normalizeShopifyOrderGid(orderIdQuery));
    }

    if (!record) {
      return res.status(404).json({
        ok: false,
        message: "No payment record for this shop and order reference."
      });
    }

    const codeBook =
      record.swipeResponseCode != null ? lookupSwipeResponseMessage(record.swipeResponseCode) : undefined;

    return res.json({
      ok: true,
      matchedOrderReference: matchedOrderReference ?? record.orderReference,
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
      swipeRequestId: record.swipeRequestId ?? null,
      wsSessionId: record.wsSessionId ?? null,
      returnUrlAfterPaid: record.returnUrlAfterPaid ?? null,
      forwardWebhookUrl: record.forwardWebhookUrl ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    });
  });

  router.get("/payment-status/swipe-response-codes", (req: Request, res: Response) => {
    if (!paymentStatusAuthOk(req)) {
      return res.status(401).json({ ok: false, message: "Unauthorized." });
    }
    return res.json({
      ok: true,
      count: Object.keys(SWIPE_RESPONSE_CODES).length,
      codes: SWIPE_RESPONSE_CODES
    });
  });

  return router;
}
