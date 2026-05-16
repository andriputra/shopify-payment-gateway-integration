"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopFromSessionDest = shopFromSessionDest;
/** Extract `shop.myshopify.com` from App Bridge session token `dest` (admin URL). */
function shopFromSessionDest(dest) {
    if (!dest || typeof dest !== "string") {
        return undefined;
    }
    try {
        const host = new URL(dest).hostname.toLowerCase();
        if (host.endsWith(".myshopify.com")) {
            return host;
        }
    }
    catch {
        // ignore invalid URL
    }
    return undefined;
}
