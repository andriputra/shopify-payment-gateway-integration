import { Router } from "express";
import { env } from "../config/env";
import { ShopifyOrderService } from "../services/shopify-order-service";
import { PaymentRedirectStore } from "../storage/contracts";

function normalizeShop(domain: string): string {
  const s = domain.trim().toLowerCase();
  return s.endsWith(".myshopify.com") ? s : `${s}.myshopify.com`;
}

function pickFirstString(body: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = body[key];
    if (value === undefined || value === null) continue;
    const s = String(value).trim();
    if (s) return s;
  }
  return "";
}

export function accurateWebhookRoutes(deps: {
  paymentRedirectRepo: PaymentRedirectStore;
  orderService: ShopifyOrderService;
}): Router {
  const router = Router();
  const { paymentRedirectRepo, orderService } = deps;

  router.post("/payment-paid", async (req, res, next) => {
    try {
      const expected = env.accurateWebhookSecret;
      if (!expected) {
        return res.status(500).json({ ok: false, message: "ACCURATE_WEBHOOK_SECRET is not set" });
      }
      const incoming =
        String(req.get("x-accurate-webhook-secret") ?? "").trim() ||
        String(req.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      if (!incoming || incoming !== expected) {
        return res.status(401).json({ ok: false, message: "Invalid Accurate webhook secret" });
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const shopRaw = pickFirstString(body, ["shop", "shop_domain", "shopDomain", "store", "store_domain"]);
      const orderRefRaw = pickFirstString(body, [
        "orderReference",
        "order_reference",
        "merchant_reference",
        "invoice_number",
        "invoice_no",
        "invoiceNo",
        "reference"
      ]);
      const orderIdRaw = pickFirstString(body, ["orderId", "order_id", "shopifyOrderId", "shopify_order_id"]);
      const providerRefRaw = pickFirstString(body, ["providerReference", "provider_reference", "ws_token", "token"]);
      const statusRaw = pickFirstString(body, ["status", "payment_status", "transaction_status"]) || "paid";
      const normalizedStatus = statusRaw.trim().toLowerCase();
      if (!shopRaw) {
        return res.status(400).json({ ok: false, message: "Missing shop" });
      }
      if (!orderRefRaw && !orderIdRaw && !providerRefRaw) {
        return res.status(400).json({ ok: false, message: "Missing order reference (orderReference/orderId/providerReference)" });
      }
      if (!["paid", "success", "completed", "settlement", "approved"].includes(normalizedStatus)) {
        return res.json({ ok: true, skipped: true, reason: `status=${normalizedStatus}` });
      }

      const shop = normalizeShop(shopRaw);
      let orderReference = orderRefRaw || (orderIdRaw ? `order_${orderIdRaw}` : "");
      let record = orderReference ? await paymentRedirectRepo.get(shop, orderReference) : undefined;

      if (!record) {
        const records = await paymentRedirectRepo.listByShop(shop, 200);
        record = records.find((r) => {
          if (orderIdRaw) {
            const gidTail = r.shopifyOrderId?.split("/").pop() ?? "";
            if (gidTail === orderIdRaw) return true;
          }
          if (providerRefRaw && r.providerReference === providerRefRaw) return true;
          if (orderRefRaw && r.orderReference === orderRefRaw) return true;
          return false;
        });
        if (record) {
          orderReference = record.orderReference;
        }
      }

      if (!record) {
        return res.status(404).json({
          ok: false,
          message: `Order mapping not found for shop: ${shop}`,
          hint: "Kirim orderReference=order_<shopify_order_id> atau orderId/providerReference yang match."
        });
      }

      await paymentRedirectRepo.markStatus(shop, orderReference, "paid");
      if (!record.shopifyOrderId) {
        return res.json({ ok: true, marked: true, orderReference, note: "shopifyOrderId missing" });
      }

      const marked = await orderService.markOrderPaid(shop, record.shopifyOrderId);
      return res.json({
        ok: true,
        marked: marked.ok,
        orderReference,
        shopifyOrderId: record.shopifyOrderId,
        message: marked.message
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

