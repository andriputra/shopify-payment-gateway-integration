"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appEmbeddedRoutes = appEmbeddedRoutes;
const express_1 = require("express");
const shop_from_session_1 = require("../utils/shop-from-session");
/** Lightweight check that App Bridge session JWT is valid; returns shop from token `dest`. */
function appEmbeddedRoutes() {
    const router = (0, express_1.Router)();
    router.get("/embedded-session", (req, res) => {
        const session = res.locals.shopifySession;
        const shop = (0, shop_from_session_1.shopFromSessionDest)(session?.dest);
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
