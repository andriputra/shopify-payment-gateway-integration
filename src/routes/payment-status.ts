import { Request, Response, Router } from "express";
import { env } from "../config/env";
import { lookupSwipeResponseMessage, SWIPE_RESPONSE_CODES } from "../data/swipe-response-codes";
import { PaymentRedirectStore } from "../storage/contracts";
import { normalizeShopifyShopDomain } from "../utils/shop-domain";
import { normalizeShopifyOrderGid } from "../utils/shopify-order-id";

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

export function paymentStatusRoutes(paymentRedirectRepo: PaymentRedirectStore): Router {
  const router = Router();

  router.get("/payment-status", async (req: Request, res: Response) => {
    if (!paymentStatusAuthOk(req)) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized. Send Authorization: Bearer <secret>, X-Payment-Status-Secret, or ?secret= (APP_SHARED_SECRET or PAYMENT_STATUS_API_SECRET)."
      });
    }

    const shopKey = normalizeShopifyShopDomain(String(req.query.shop ?? ""));
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
