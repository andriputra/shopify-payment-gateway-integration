import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { swipeInvoiceNumberForOrder } from "../providers/swipe";
import { PaymentService } from "../services/payment-service";
import { PaymentSessionContextStore, StoreConfigStore } from "../storage/contracts";
import { SupportedProvider } from "../types";
import { normalizeMerchantShopKey } from "../utils/shop-domain";

const swipeMethodSchema = z.string().trim().min(1).max(64).optional();
const swipeDeviceUserSchema = z.string().trim().min(1).max(128).optional();

const createSessionSchema = z.object({
  id: z.string().optional(),
  gid: z.string().optional(),
  shop: z.string().min(3),
  amount: z.coerce.number().positive(),
  currency: z.string().min(3).max(3).transform((c) => c.toUpperCase()),
  orderId: z.string().min(1).optional(),
  /** Swipe create body `payment_method` for this session (e.g. CDCP, QRIS). Overrides store default. */
  swipePaymentMethod: swipeMethodSchema,
  /** Swipe create body `device_user` — registered store ID at Swipe. Overrides store default. */
  swipeDeviceUser: swipeDeviceUserSchema,
  customer: z
    .object({
      email: z.string().email().optional()
    })
    .optional()
});

export function shopifyPaymentSessionRoutes(deps: {
  paymentService: PaymentService;
  storeRepo: StoreConfigStore;
  sessionContextRepo: PaymentSessionContextStore;
}): Router {
  const router = Router();
  const { paymentService, storeRepo, sessionContextRepo } = deps;

  router.post("/shopify/payment-sessions", async (req, res, next) => {
    try {
      const raw = createSessionSchema.parse(req.body);
      const shop = normalizeMerchantShopKey(raw.shop);
      const store = await storeRepo.get(shop);
      if (!store) {
        return res.status(400).json({
          ok: false,
          message: `No configuration found for ${shop}. Save merchant configuration (provider + credentials) in the app admin page first.`
        });
      }

      const paymentSessionGid = String(raw.id ?? raw.gid ?? "").trim();
      const orderRef =
        raw.orderId?.trim() ||
        (paymentSessionGid
          ? `ps_${crypto.createHash("sha256").update(paymentSessionGid).digest("hex").slice(0, 24)}`
          : `ps_${Date.now()}`);

      if (paymentSessionGid) {
        const ctx = {
          shop,
          paymentSessionId: paymentSessionGid,
          createdAt: new Date().toISOString()
        };
        await sessionContextRepo.save(orderRef, ctx);
        /** Swipe webhook returns `invoice_number`, not internal orderRef — store both keys. */
        await sessionContextRepo.save(swipeInvoiceNumberForOrder(orderRef), ctx);
      }

      const result = await paymentService.createCheckout({
        shop,
        provider: store.provider as SupportedProvider,
        amount: raw.amount,
        currency: raw.currency,
        orderId: orderRef,
        customerEmail: raw.customer?.email,
        returnUrl: store.redirectUrlAfterPaid,
        swipePaymentMethod: raw.swipePaymentMethod,
        swipeDeviceUser: raw.swipeDeviceUser
      });

      const sessionId = raw.id ?? `ps_${Date.now()}`;

      return res.status(201).json({
        payment_session: {
          id: sessionId,
          state: "pending",
          next_action: {
            redirect_url: result.paymentUrl
          }
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/shopify/payment-sessions/:id/resolve", (req, res) => {
    return res.json({
      payment_session: {
        id: req.params.id,
        state: "resolved"
      },
      detail: req.body ?? {}
    });
  });

  router.post("/shopify/payment-sessions/:id/reject", (req, res) => {
    return res.json({
      payment_session: {
        id: req.params.id,
        state: "rejected"
      },
      detail: req.body ?? {}
    });
  });

  return router;
}
