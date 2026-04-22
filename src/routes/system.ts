import { Router } from "express";
import { StorageBundle } from "../storage/contracts";

export function systemRoutes(storage: StorageBundle): Router {
  const router = Router();

  router.get("/status", async (_req, res, next) => {
    try {
      const status = await storage.systemStatus();
      return res.json({ ok: true, status });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

