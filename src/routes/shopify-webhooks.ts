import { Request, Router } from "express";
import { ShopifyAuthService } from "../services/shopify-auth-service";

export function shopifyWebhookRoutes(authService: ShopifyAuthService): Router {
  const router = Router();

  router.post("/shopify/orders-paid", (req, res) => {
    const hmac = String(req.get("x-shopify-hmac-sha256") ?? "");
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from("");

    if (!hmac || !authService.verifyWebhookHmac(rawBody, hmac)) {
      return res.status(401).json({ ok: false, message: "Invalid Shopify webhook HMAC" });
    }

    return res.json({
      ok: true,
      message: "Shopify webhook verified",
      topic: req.get("x-shopify-topic") ?? "unknown"
    });
  });

  return router;
}
