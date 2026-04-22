"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.complianceRoutes = complianceRoutes;
const express_1 = require("express");
const zod_1 = require("zod");
const listQuerySchema = zod_1.z.object({
    shop: zod_1.z.string().optional(),
    topic: zod_1.z.enum(["customers/data_request", "customers/redact", "shop/redact"]).optional(),
    limit: zod_1.z.coerce.number().int().positive().max(100).optional()
});
function complianceRoutes(service) {
    const router = (0, express_1.Router)();
    router.get("/requests", async (req, res, next) => {
        try {
            const query = listQuerySchema.parse(req.query);
            const records = await service.listRequests(query);
            return res.json({ ok: true, records });
        }
        catch (error) {
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
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
