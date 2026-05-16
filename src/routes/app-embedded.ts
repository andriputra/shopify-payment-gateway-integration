import { Router } from "express";
import { shopFromSessionDest } from "../utils/shop-from-session";

/** Lightweight check that App Bridge session JWT is valid; returns shop from token `dest`. */
export function appEmbeddedRoutes(): Router {
  const router = Router();

  router.get("/embedded-session", (req, res) => {
    const session = res.locals.shopifySession as { dest?: string } | undefined;
    const shop = shopFromSessionDest(session?.dest);
    if (!shop) {
      return res.status(400).json({
        ok: false,
        message: "Could not resolve shop from session token"
      });
    }
    return res.json({
      ok: true,
      shop,
      sessionValid: true
    });
  });

  return router;
}
