import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";

const createSessionSchema = z.object({
  id: z.string().optional(),
  shop: z.string().min(3),
  amount: z.number().positive(),
  currency: z.string().length(3),
  orderId: z.string().min(1)
});

export function shopifyPaymentSessionRoutes(): Router {
  const router = Router();

  router.post("/shopify/payment-sessions", (req, res) => {
    const input = createSessionSchema.parse(req.body);
    const sessionId = input.id ?? `ps_${Date.now()}`;
    const params = new URLSearchParams({
      shop: input.shop,
      orderId: input.orderId,
      amount: String(input.amount),
      currency: input.currency,
      sessionId
    });

    return res.status(201).json({
      id: sessionId,
      status: "pending",
      next_action: {
        redirect_url: `${env.host}/sandbox/pay?${params.toString()}`
      }
    });
  });

  router.post("/shopify/payment-sessions/:id/resolve", (req, res) => {
    return res.json({
      id: req.params.id,
      status: "resolved",
      detail: req.body ?? {}
    });
  });

  router.post("/shopify/payment-sessions/:id/reject", (req, res) => {
    return res.json({
      id: req.params.id,
      status: "rejected",
      detail: req.body ?? {}
    });
  });

  return router;
}
