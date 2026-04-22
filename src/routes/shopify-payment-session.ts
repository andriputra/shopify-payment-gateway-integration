import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { PaymentService } from "../services/payment-service";
import { PaymentSessionContextStore, StoreConfigStore } from "../storage/contracts";
import { SupportedProvider } from "../types";

const createSessionSchema = z.object({
  id: z.string().optional(),
  gid: z.string().optional(),
  shop: z.string().min(3),
  amount: z.coerce.number().positive(),
  currency: z.string().min(3).max(3).transform((c) => c.toUpperCase()),
  orderId: z.string().min(1).optional(),
  customer: z
    .object({
      email: z.string().email().optional()
    })
    .optional()
});

function normalizeShop(domain: string): string {
  let s = domain.trim().toLowerCase();
  if (s && !s.endsWith(".myshopify.com")) {
    s = `${s}.myshopify.com`;
  }
  return s;
}

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
      const shop = normalizeShop(raw.shop);
      const store = await storeRepo.get(shop);
      if (!store) {
        return res.status(400).json({
          ok: false,
          message: `Belum ada konfigurasi untuk ${shop}. Simpan konfigurasi merchant (provider + credential) di halaman admin app.`
        });
      }

      const paymentSessionGid = String(raw.id ?? raw.gid ?? "").trim();
      const orderRef =
        raw.orderId?.trim() ||
        (paymentSessionGid
          ? `ps_${crypto.createHash("sha256").update(paymentSessionGid).digest("hex").slice(0, 24)}`
          : `ps_${Date.now()}`);

      if (paymentSessionGid) {
        await sessionContextRepo.save(orderRef, {
          shop,
          paymentSessionId: paymentSessionGid,
          createdAt: new Date().toISOString()
        });
      }

      const result = await paymentService.createCheckout({
        shop,
        provider: store.provider as SupportedProvider,
        amount: raw.amount,
        currency: raw.currency,
        orderId: orderRef,
        customerEmail: raw.customer?.email,
        returnUrl: store.redirectUrlAfterPaid
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
