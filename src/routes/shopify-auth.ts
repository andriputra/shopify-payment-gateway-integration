import { Router } from "express";
import { ShopifyAuthService } from "../services/shopify-auth-service";
import { ShopifyTokenRepository } from "../storage/shopify-token-repo";

function normalizeQuery(query: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(query)) {
    const value = query[key];
    if (typeof value === "string") {
      out[key] = value;
    } else if (Array.isArray(value) && typeof value[0] === "string") {
      out[key] = value[0];
    }
  }
  return out;
}

export function shopifyAuthRoutes(service: ShopifyAuthService, tokenRepo: ShopifyTokenRepository): Router {
  const router = Router();

  router.get("/shopify", (req, res) => {
    const shop = String(req.query.shop ?? "");
    if (!service.validateShop(shop)) {
      return res.status(400).json({ ok: false, message: "Invalid shop domain" });
    }

    const installUrl = service.buildInstallUrl(shop);
    return res.redirect(installUrl);
  });

  router.get("/shopify/callback", async (req, res, next) => {
    try {
      const data = normalizeQuery(req.query as Record<string, unknown>);
      const shop = data.shop ?? "";
      const code = data.code ?? "";
      const hmac = data.hmac ?? "";
      const state = data.state ?? "";

      if (!shop || !code || !hmac || !state) {
        return res.status(400).json({ ok: false, message: "Missing callback parameters" });
      }

      const saved = await service.handleOAuthCallback({
        shop,
        code,
        hmac,
        state,
        query: data
      });

      return res.json({
        ok: true,
        message: "Shopify app installed successfully",
        shop: saved.shop,
        scope: saved.scope,
        installedAt: saved.installedAt
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/shopify/status/:shop", (req, res) => {
    const shop = req.params.shop;
    const token = tokenRepo.get(shop);
    if (!token) {
      return res.status(404).json({ ok: false, message: "App not installed on this shop" });
    }
    return res.json({
      ok: true,
      shop: token.shop,
      scope: token.scope,
      installedAt: token.installedAt
    });
  });

  return router;
}
