import { Router } from "express";
import { z } from "zod";
import { ShopifyComplianceService } from "../services/shopify-compliance-service";

const listQuerySchema = z.object({
  shop: z.string().optional(),
  topic: z.enum(["customers/data_request", "customers/redact", "shop/redact"]).optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

export function complianceRoutes(service: ShopifyComplianceService): Router {
  const router = Router();

  router.get("/requests", async (req, res, next) => {
    try {
      const query = listQuerySchema.parse(req.query);
      const records = await service.listRequests(query);
      return res.json({ ok: true, records });
    } catch (error) {
      next(error);
    }
  });

  router.get("/requests/:id", async (req, res, next) => {
    try {
      const record = await service.getRequest(req.params.id);
      if (!record) {
        return res.status(404).json({ ok: false, message: "Compliance request not found" });
      }

      return res.json({ ok: true, record });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
