"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invStatusRoutes = invStatusRoutes;
const express_1 = require("express");
const env_1 = require("../config/env");
const swipe_1 = require("../providers/swipe");
const shop_domain_1 = require("../utils/shop-domain");
/**
 * Invoice / Swipe payload mirror for Shopify or internal callers.
 *
 * --- Request (choose one auth style) ---
 * GET or POST `${HOST}/InvStatus` (with or without trailing slash)
 *
 * Query or JSON body:
 * - `shop` (required): merchant shop key — bare Shopify subdomain, `*.myshopify.com`, or custom domain hostname (must match saved config and checkout calls)
 * - `invoice_number` **or** `orderReference` **or** `merchant_reference` (required): Swipe `invoice_number` as stored (often `INV-{alphanumericOrderId}`). If you pass an internal id like `ORDER-12346`, the handler also tries the derived Swipe invoice key `INV-ORDER12346`.
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
 *   "shop": "mystore.myshopify.com or custom.example.com",
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
async function listSwipePayloadRows(repo, shop, invoiceRef, limit) {
    let rows = await repo.listByShopAndOrderReference(shop, invoiceRef, limit);
    if (rows.length) {
        return { rows, matchedReference: invoiceRef };
    }
    /** Stored `order_reference` matches Swipe `invoice_number` from create/webhook — see `swipeInvoiceNumberForOrder`. */
    if (!/^INV-/i.test(invoiceRef)) {
        const derived = (0, swipe_1.swipeInvoiceNumberForOrder)(invoiceRef);
        if (derived !== invoiceRef) {
            rows = await repo.listByShopAndOrderReference(shop, derived, limit);
            if (rows.length) {
                return { rows, matchedReference: derived };
            }
        }
    }
    return { rows: [], matchedReference: invoiceRef };
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
        const shop = (0, shop_domain_1.normalizeMerchantShopKey)(readShop(req));
        if (!shop || !shop.includes(".")) {
            return res.status(400).json({
                ok: false,
                message: "Provide a valid shop identifier: bare Shopify subdomain, *.myshopify.com host, or custom domain (query or JSON body; must match saved store config)."
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
        const { rows, matchedReference } = await listSwipePayloadRows(repo, shop, invoice, limit);
        if (!rows.length) {
            return res.status(404).json({
                ok: false,
                message: "No stored Swipe payloads for this shop and invoice. Use the exact Swipe invoice_number stored with the payload (often INV-… derived from your order id), ensure this server received a Swipe API response or webhook for that shop, and check STORAGE_DRIVER / DB matches the environment where the payment ran."
            });
        }
        const latest = rows[0];
        return res.json({
            ok: true,
            shop,
            invoiceNumber: matchedReference,
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
