import { Router } from "express";
import { z } from "zod";
import { StoreConfigStore } from "../storage/contracts";
import { SupportedProvider } from "../types";
import { normalizeMerchantShopKey } from "../utils/shop-domain";

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

export function configRoutes(storeRepo: StoreConfigStore): Router {
  const router = Router();

  router.post("/", async (req, res, next) => {
    try {
      const body = saveConfigSchema.parse(req.body);
      const shopKey = normalizeMerchantShopKey(body.shop);
      if (!shopKey || !shopKey.includes(".")) {
        return res.status(400).json({ ok: false, message: "Invalid shop identifier." });
      }
      const config = await storeRepo.upsert({
        ...body,
        shop: shopKey,
        provider: body.provider as SupportedProvider,
        updatedAt: new Date().toISOString()
      });
      res.json({ ok: true, config });
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const shopRaw = String(req.query.shop ?? "").trim();
      if (!shopRaw) {
        return res.status(400).json({ ok: false, message: "Missing shop query parameter" });
      }
      const normalizedShop = normalizeMerchantShopKey(shopRaw);
      const config = await storeRepo.get(normalizedShop);
      if (!config) {
        return res.status(404).json({ ok: false, message: "Store config not found" });
      }
      return res.json({ ok: true, config });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:shop", async (req, res, next) => {
    try {
      const shopKey = normalizeMerchantShopKey(req.params.shop);
      const config = await storeRepo.get(shopKey);
      if (!config) {
        return res.status(404).json({ ok: false, message: "Store config not found" });
      }
      return res.json({ ok: true, config });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
