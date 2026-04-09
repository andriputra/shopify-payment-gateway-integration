import { Router } from "express";
import { z } from "zod";
import { PaymentService } from "../services/payment-service";
import { SupportedProvider } from "../types";

const createCheckoutSchema = z.object({
  shop: z.string().min(3),
  provider: z.enum(["xendit", "midtrans", "sandbox", "custom"] as const),
  amount: z.number().positive(),
  currency: z.string().length(3),
  orderId: z.string().min(1),
  customerEmail: z.string().email().optional(),
  returnUrl: z.string().url().optional()
});

export function paymentRoutes(service: PaymentService): Router {
  const router = Router();

  router.post("/checkout/create", async (req, res, next) => {
    try {
      const input = createCheckoutSchema.parse(req.body);
      const result = await service.createCheckout({
        ...input,
        provider: input.provider as SupportedProvider
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
