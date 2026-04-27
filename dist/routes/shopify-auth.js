"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopifyAuthRoutes = shopifyAuthRoutes;
const express_1 = require("express");
function encodeHostParam(shop) {
    const raw = `${shop}/admin`;
    return Buffer.from(raw, "utf8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}
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
    router.get("/shopify", (req, res) => {
        let shop = String(req.query.shop ?? "").trim().toLowerCase();
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
    const handleCallback = async (req, res, next) => {
        const data = normalizeQuery(req.query);
        const rawQueryString = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?") + 1) : "";
        const shop = data.shop ?? "";
        const host = data.host ?? "";
        try {
            const code = data.code ?? "";
            const hmac = data.hmac ?? "";
            const state = data.state ?? "";
            if (!shop || !code || !hmac || !state) {
                return res.redirect(service.buildAppRedirectUrl({
                    shop,
                    host,
                    installed: false,
                    error: "Missing callback parameters"
                }));
            }
            const saved = await service.handleOAuthCallback({
                shop,
                code,
                hmac,
                state,
                query: data,
                rawQueryString
            });
            const resolvedHost = host || encodeHostParam(saved.shop);
            return res.redirect(service.buildAppRedirectUrl({
                shop: saved.shop,
                host: resolvedHost,
                installed: true
            }));
        }
        catch (error) {
            if (shop) {
                const message = error instanceof Error ? error.message : "Shopify install failed";
                return res.redirect(service.buildAppRedirectUrl({
                    shop,
                    host,
                    installed: false,
                    error: message
                }));
            }
            return next(error);
        }
    };
    router.get("/callback", handleCallback);
    router.get("/shopify/callback", handleCallback);
    router.get("/shopify/status/:shop", async (req, res, next) => {
        try {
            const shop = req.params.shop;
            const token = await tokenRepo.get(shop);
            if (!token) {
                return res.status(404).json({ ok: false, message: "App not installed on this shop" });
            }
            return res.json({
                ok: true,
                shop: token.shop,
                scope: token.scope,
                installedAt: token.installedAt
            });
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
