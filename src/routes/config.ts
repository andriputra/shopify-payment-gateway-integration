import { Router } from "express";
import { z } from "zod";
import { StoreConfigRepository } from "../storage/store-config-repo";
import { SupportedProvider } from "../types";

const providerEnum = z.enum(["xendit", "midtrans", "swipe", "sandbox", "custom"] as const);

const saveConfigSchema = z.object({
  shop: z.string().min(3),
  provider: providerEnum,
  redirectUrlAfterPaid: z.string().url(),
  webhookUrlAfterPaid: z.string().url().optional(),
  credentials: z.object({
    apiKey: z.string().min(1),
    apiSecret: z.string().optional(),
    extra: z.record(z.string()).optional()
  })
});

export function configRoutes(storeRepo: StoreConfigRepository): Router {
  const router = Router();

  router.post("/", (req, res) => {
    const body = saveConfigSchema.parse(req.body);
    const config = storeRepo.upsert({
      ...body,
      provider: body.provider as SupportedProvider,
      updatedAt: new Date().toISOString()
    });
    res.json({ ok: true, config });
  });

  router.get("/:shop", (req, res) => {
    const config = storeRepo.get(req.params.shop);
    if (!config) {
      return res.status(404).json({ ok: false, message: "Store config not found" });
    }
    return res.json({ ok: true, config });
  });

  return router;
}
