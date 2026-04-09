import { Router } from "express";
import { PaymentService } from "../services/payment-service";

export function webhookRoutes(service: PaymentService): Router {
  const router = Router();

  router.post("/payment/:provider/:shop", (req, res, next) => {
    try {
      const { provider, shop } = req.params;
      const result = service.handleWebhook(shop, provider, req.body ?? {});
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
