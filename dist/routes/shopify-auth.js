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
/**
 * Parse OAuth callback params for HMAC verification.
 * Use URLSearchParams on the raw query string — Express `req.query` / `qs` can coerce types
 * (e.g. numeric timestamp) or omit keys, which breaks Shopify's signed message.
 */
function parseOAuthCallbackQuery(req) {
    const extract = (full) => {
        const i = full.indexOf("?");
        return i >= 0 ? full.slice(i + 1) : "";
    };
    const raw = extract(req.originalUrl ?? "") ||
        extract(req.url ?? "");
    const data = {};
    if (!raw) {
        return data;
    }
    const params = new URLSearchParams(raw);
    params.forEach((value, key) => {
        data[key] = value;
    });
    return data;
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
        return res.redirect(installUrl);
    });
    const handleCallback = async (req, res, next) => {
        const data = parseOAuthCallbackQuery(req);
        const shop = (data.shop ?? "").trim().toLowerCase();
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
                query: data
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
    const getInstallStatus = async (req, res, next) => {
        try {
            const shopParam = String(req.params.shop ?? req.query.shop ?? "").trim().toLowerCase();
            if (!shopParam) {
                return res.status(400).json({ ok: false, message: "Missing shop parameter" });
            }
            const shop = shopParam.endsWith(".myshopify.com") ? shopParam : `${shopParam}.myshopify.com`;
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
    };
    router.get("/shopify/status", getInstallStatus);
    router.get("/shopify/status/:shop", getInstallStatus);
    return router;
}
