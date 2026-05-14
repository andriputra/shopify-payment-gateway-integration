import crypto from "node:crypto";
import { Request, Response, Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { PaymentService } from "../services/payment-service";
import { SupportedProvider } from "../types";

const createCheckoutSchema = z.object({
  shop: z.string().min(3),
  provider: z.enum(["xendit", "midtrans", "swipe", "sandbox", "custom"] as const),
  amount: z.coerce.number().min(0),
  currency: z.string().length(3),
  orderId: z.string().min(1),
  customerEmail: z.string().email().optional(),
  returnUrl: z.string().url().optional(),
  swipePaymentMethod: z.string().max(64).optional(),
  /** Optional auth duplicate for clients that cannot set headers. Prefer Bearer or X-Bridge-Checkout-Secret. */
  secret: z.string().optional()
});

function bridgeCheckoutSecret(): string {
  return (env.bridgeCheckoutApiSecret || env.paymentStatusApiSecret || env.appSharedSecret).trim();
}

function safeEqualSecret(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

function bridgeCheckoutAuthOk(req: Request): boolean {
  const configured = bridgeCheckoutSecret();
  if (!configured) {
    return false;
  }
  const bearer = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const headerSecret = (req.get("x-bridge-checkout-secret") ?? "").trim();
  const qSecret = typeof req.query.secret === "string" ? req.query.secret.trim() : "";
  const body = (req.body ?? {}) as Record<string, unknown>;
  const bodySecret = typeof body.secret === "string" ? body.secret.trim() : "";
  for (const candidate of [bearer, headerSecret, qSecret, bodySecret]) {
    if (candidate && safeEqualSecret(candidate, configured)) {
      return true;
    }
  }
  return false;
}

/**
 * Server-to-server checkout creation (same payload as embedded `POST /api/payments/checkout/create`)
 * without Shopify session JWT. Protect with shared secret only — call from trusted backends.
 */
export function bridgeCheckoutRoutes(service: PaymentService): Router {
  const router = Router();

  router.post("/checkout/create", async (req: Request, res: Response, next) => {
    try {
      if (!bridgeCheckoutAuthOk(req)) {
        return res.status(401).json({
          ok: false,
          message:
            "Unauthorized. Send Authorization: Bearer <secret>, X-Bridge-Checkout-Secret, ?secret=, or JSON body.secret (BRIDGE_CHECKOUT_API_SECRET, PAYMENT_STATUS_API_SECRET, or APP_SHARED_SECRET)."
        });
      }

      const raw = createCheckoutSchema.parse(req.body);
      const { secret: _omit, ...checkoutBody } = raw;
      const result = await service.createCheckout({
        ...checkoutBody,
        provider: checkoutBody.provider as SupportedProvider
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
