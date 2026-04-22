"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemRoutes = systemRoutes;
const express_1 = require("express");
function systemRoutes(storage) {
    const router = (0, express_1.Router)();
    router.get("/status", async (_req, res, next) => {
        try {
            const status = await storage.systemStatus();
            return res.json({ ok: true, status });
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
