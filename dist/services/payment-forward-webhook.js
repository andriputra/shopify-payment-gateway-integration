"use strict";
/**
 * Best-effort POST to a merchant/backend URL after this app processes a provider payment webhook.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.forwardPaymentWebhook = forwardPaymentWebhook;
async function forwardPaymentWebhook(targetUrl, payload, options) {
    const url = targetUrl.trim();
    if (!url) {
        return { ok: false, error: "empty forward URL" };
    }
    const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "shopify-payment-gateway-bridge/1.0"
    };
    const secret = options?.secret?.trim();
    if (secret) {
        headers.Authorization = `Bearer ${secret}`;
        headers["X-Bridge-Forward-Secret"] = secret;
    }
    try {
        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15_000)
        });
        if (!response.ok) {
            const text = (await response.text().catch(() => "")).slice(0, 500);
            return { ok: false, httpStatus: response.status, error: text || response.statusText };
        }
        return { ok: true, httpStatus: response.status };
    }
    catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
