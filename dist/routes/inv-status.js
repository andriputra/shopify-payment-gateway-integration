"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invStatusRoutes = invStatusRoutes;
const express_1 = require("express");
const env_1 = require("../config/env");
const shop_domain_1 = require("../utils/shop-domain");
/**
 * Invoice / Swipe payload mirror for Shopify or internal callers.
 *
 * --- Request (choose one auth style) ---
 * GET or POST `${HOST}/InvStatus` (with or without trailing slash)
 *
 * Query or JSON body:
 * - `shop` (required): Shopify shop, e.g. `mystore` or `mystore.myshopify.com`
 * - `invoice_number` **or** `orderReference` **or** `merchant_reference` (required): same as Swipe `invoice_number` / webhook order ref
 * - `limit` (optional): history rows, default 50, max 500
 *
 * Auth (same pattern as `/api/payment-status`):
 * - Header `Authorization: Bearer <INV_STATUS_API_SECRET|PAYMENT_STATUS_API_SECRET|APP_SHARED_SECRET>`
 * - or header `X-Inv-Status-Secret: <secret>`
 * - or query/body `secret=<secret>`
 *
 * --- Response 200 ---
 * {
 *   "ok": true,
 *   "shop": "mystore.myshopify.com",
 *   "invoiceNumber": "INV-…",
 *   "count": 3,
 *   "latest": { "id": "…", "source": "swipe_webhook"|"swipe_api_create", "receivedAt": "ISO-8601", "httpStatus": 200|null, "payload": { … } },
 *   "history": [ … same shape as latest, newest first … ]
 * }
 *
 * `payload` is parsed JSON from Swipe. Non-JSON bodies are stored as `{ "_raw": "…" }`.
 */
function invStatusSecret() {
    return (env_1.env.invStatusApiSecret || env_1.env.paymentStatusApiSecret || env_1.env.appSharedSecret).trim();
}
function invStatusAuthOk(req) {
    const configured = invStatusSecret();
    const bearer = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const headerSecret = (req.get("x-inv-status-secret") ?? "").trim();
    const qSecret = typeof req.query.secret === "string" ? req.query.secret.trim() : "";
    const body = (req.body ?? {});
    const bodySecret = typeof body.secret === "string" ? body.secret.trim() : "";
    return bearer === configured || headerSecret === configured || qSecret === configured || bodySecret === configured;
}
function readInvoice(req) {
    const body = (req.body ?? {});
    const fromQuery = typeof req.query.invoice_number === "string"
        ? req.query.invoice_number
        : typeof req.query.orderReference === "string"
            ? req.query.orderReference
            : typeof req.query.merchant_reference === "string"
                ? req.query.merchant_reference
                : "";
    const fromBody = (typeof body.invoice_number === "string" && body.invoice_number) ||
        (typeof body.orderReference === "string" && body.orderReference) ||
        (typeof body.merchant_reference === "string" && body.merchant_reference) ||
        "";
    return String(fromQuery || fromBody).trim();
}
function readShop(req) {
    const body = (req.body ?? {});
    const q = typeof req.query.shop === "string" ? req.query.shop : "";
    const b = typeof body.shop === "string" ? body.shop : "";
    return String(q || b).trim();
}
function invStatusRoutes(repo) {
    const router = (0, express_1.Router)();
    const handle = async (req, res) => {
        if (!invStatusAuthOk(req)) {
            return res.status(401).json({
                ok: false,
                message: "Unauthorized. Send Authorization: Bearer <secret>, X-Inv-Status-Secret, or secret (INV_STATUS_API_SECRET, PAYMENT_STATUS_API_SECRET, or APP_SHARED_SECRET)."
            });
        }
        const shop = (0, shop_domain_1.normalizeShopifyShopDomain)(readShop(req));
        if (!shop.includes(".myshopify.com")) {
            return res.status(400).json({
                ok: false,
                message: "Provide shop as *.myshopify.com (or bare subdomain); query or JSON body."
            });
        }
        const invoice = readInvoice(req);
        if (!invoice) {
            return res.status(400).json({
                ok: false,
                message: "Provide invoice_number or orderReference or merchant_reference (query or JSON body)."
            });
        }
        const limitRaw = req.query.limit ?? req.body?.limit;
        const limitNum = typeof limitRaw === "string" && limitRaw.trim()
            ? Number(limitRaw)
            : typeof limitRaw === "number"
                ? limitRaw
                : NaN;
        const limit = Number.isFinite(limitNum) ? Math.min(500, Math.max(1, Math.floor(limitNum))) : 50;
        const rows = await repo.listByShopAndOrderReference(shop, invoice, limit);
        if (!rows.length) {
            return res.status(404).json({
                ok: false,
                message: "No stored Swipe payloads for this shop and invoice."
            });
        }
        const latest = rows[0];
        return res.json({
            ok: true,
            shop,
            invoiceNumber: invoice,
            count: rows.length,
            latest: {
                id: latest.id,
                source: latest.source,
                receivedAt: latest.createdAt,
                httpStatus: latest.httpStatus,
                payload: latest.payload
            },
            history: rows.map((r) => ({
                id: r.id,
                source: r.source,
                receivedAt: r.createdAt,
                httpStatus: r.httpStatus,
                payload: r.payload
            }))
        });
    };
    const registerInvStatus = (path) => {
        router.get(path, (req, res, next) => {
            handle(req, res).catch(next);
        });
        router.post(path, (req, res, next) => {
            handle(req, res).catch(next);
        });
    };
    registerInvStatus("/InvStatus");
    registerInvStatus("/InvStatus/");
    return router;
}
