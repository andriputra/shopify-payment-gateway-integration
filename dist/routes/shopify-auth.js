"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopifyAuthRoutes = shopifyAuthRoutes;
const express_1 = require("express");
function normalizeQuery(query) {
    const out = {};
    for (const key of Object.keys(query)) {
        const value = query[key];
        if (typeof value === "string") {
            out[key] = value;
        }
        else if (Array.isArray(value) && typeof value[0] === "string") {
            out[key] = value[0];
        }
    }
    return out;
}
function shopifyAuthRoutes(service, tokenRepo) {
    const router = (0, express_1.Router)();
    // router.get("/shopify", (req, res) => {
    //   const shop = String(req.query.shop ?? "");
    //   if (!service.validateShop(shop)) {
    //     return res.status(400).json({ ok: false, message: "Invalid shop domain" });
    //   }
    //   const installUrl = service.buildInstallUrl(shop);
    //   return res.redirect(installUrl);
    // });
    router.get("/shopify", (req, res) => {
        let shop = String(req.query.shop ?? "").trim().toLowerCase();
        // 🔥 AUTO FIX kalau user cuma masukin subdomain
        if (shop && !shop.endsWith(".myshopify.com")) {
            shop = `${shop}.myshopify.com`;
        }
        if (!service.validateShop(shop)) {
            return res.status(400).json({ ok: false, message: "Invalid shop domain" });
        }
        const installUrl = service.startOAuth(shop);
        console.log("FIXED SHOP:", shop);
        console.log("INSTALL URL:", installUrl);
        return res.redirect(installUrl);
    });
    router.get("/shopify/callback", async (req, res, next) => {
        try {
            const data = normalizeQuery(req.query);
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
        }
        catch (error) {
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
