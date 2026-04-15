"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.swipeProvider = void 0;
const env_1 = require("../config/env");
const base_1 = require("./base");
function swipeBaseUrl(store) {
    const fromExtra = store.credentials.extra?.apiBaseUrl?.trim();
    if (fromExtra) {
        return fromExtra.replace(/\/$/, "");
    }
    throw new Error("Swipe: isi credentials.extra.apiBaseUrl (URL API dari Swipe / dokumen onboarding). Contoh: https://api.example.swipe.co.id");
}
function swipeCreatePath(store) {
    const path = store.credentials.extra?.createPath?.trim();
    if (!path) {
        throw new Error("Swipe: isi credentials.extra.createPath (path create payment dari dokumentasi Swipe, mis. /v1/payments atau path dari Postman).");
    }
    return path.startsWith("/") ? path : `/${path}`;
}
function swipeEndpointUrl(store) {
    const base = swipeBaseUrl(store);
    const rawPath = swipeCreatePath(store).trim();
    const normalized = rawPath.startsWith("/http://") || rawPath.startsWith("/https://")
        ? rawPath.slice(1)
        : rawPath;
    if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
        return normalized;
    }
    return `${base}${normalized}`;
}
function requiredSwipeExtra(store, key, label) {
    const value = store.credentials.extra?.[key]?.trim();
    if (!value) {
        throw new Error(`Swipe: isi credentials.extra.${key} (${label}).`);
    }
    return value;
}
function numberFromExtra(store, key) {
    const value = store.credentials.extra?.[key];
    if (!value || !value.trim()) {
        return 0;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
        throw new Error(`Swipe: credentials.extra.${key} harus angka.`);
    }
    return num;
}
function maskSecret(value) {
    if (!value) {
        return "";
    }
    if (value.length <= 8) {
        return `${value.slice(0, 2)}***${value.slice(-2)}`;
    }
    return `${value.slice(0, 4)}***${value.slice(-4)}`;
}
function pickPaymentUrl(body) {
    const candidates = [
        body.payment_url,
        body.paymentUrl,
        body.checkout_url,
        body.checkoutUrl,
        body.redirect_url,
        body.redirectUrl,
        body.url,
        body.link
    ];
    for (const c of candidates) {
        if (typeof c === "string" && c.startsWith("http")) {
            return c;
        }
    }
    throw new Error("Swipe: response tidak berisi URL pembayaran yang dikenali (payment_url / checkout_url / redirect_url / url). Sesuaikan mapping di provider jika field API lain.");
}
function pickProviderReference(body, fallback) {
    const id = body.transaction_id ??
        body.transactionId ??
        body.id ??
        body.payment_id ??
        body.paymentId ??
        body.reference_id ??
        body.referenceId;
    return typeof id === "string" || typeof id === "number" ? String(id) : fallback;
}
exports.swipeProvider = {
    id: "swipe",
    async createCheckout(store, input) {
        const merchantId = (0, base_1.ensureApiKey)(store.credentials);
        const endpointUrl = swipeEndpointUrl(store);
        const defaultNotifyUrl = `${env_1.env.host.replace(/\/$/, "")}/webhooks/payment/swipe/${encodeURIComponent(store.shop)}`;
        const notifyUrl = store.webhookUrlAfterPaid?.trim() || defaultNotifyUrl;
        const clientId = requiredSwipeExtra(store, "clientId", "Client ID dari Swipe");
        const deviceUser = requiredSwipeExtra(store, "deviceUser", "Device User dari Swipe");
        const posRequestType = store.credentials.extra?.posRequestType?.trim() || "Postman";
        const paymentMethod = store.credentials.extra?.paymentMethod?.trim() || "CDCP";
        const feeAgentAmount = numberFromExtra(store, "feeAgentAmount");
        const feeDistributorAmount = numberFromExtra(store, "feeDistributorAmount");
        const feePromotorAmount = numberFromExtra(store, "feePromotorAmount");
        const requestBody = {
            pos_request_type: posRequestType,
            request_id: `ReqId-${input.orderId}`,
            client_id: clientId,
            device_user: deviceUser,
            payment_method: paymentMethod,
            invoice_number: input.orderId,
            amount: input.amount,
            callback_url: notifyUrl,
            additional_param: {
                fee_agent_amount: feeAgentAmount,
                fee_distributor_amount: feeDistributorAmount,
                fee_promotor_amount: feePromotorAmount
            }
        };
        const response = await fetch(endpointUrl, {
            method: "POST",
            headers: {
                Authorization: merchantId,
                ApiKey: merchantId,
                "X-API-Key": merchantId,
                "Content-Type": "application/json",
                ...(store.credentials.apiSecret ? { "X-API-Secret": store.credentials.apiSecret } : {})
            },
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            const errText = await response.text().catch(() => "Unknown error");
            const debugInfo = {
                endpointUrl,
                request: {
                    request_id: requestBody.request_id,
                    invoice_number: requestBody.invoice_number,
                    amount: requestBody.amount,
                    callback_url: requestBody.callback_url,
                    client_id: clientId,
                    device_user: deviceUser,
                    payment_method: paymentMethod
                },
                headers: {
                    Authorization: maskSecret(merchantId),
                    ApiKey: maskSecret(merchantId),
                    "X-API-Key": maskSecret(merchantId),
                    "X-API-Secret": store.credentials.apiSecret ? maskSecret(store.credentials.apiSecret) : undefined
                }
            };
            console.error("Swipe create payment failed", {
                status: response.status,
                error: errText,
                debugInfo
            });
            throw new Error(`Swipe API error: ${response.status} — ${errText} | debug=${JSON.stringify(debugInfo)}`);
        }
        const body = (await response.json());
        const paymentUrl = pickPaymentUrl(body);
        return {
            paymentUrl,
            providerReference: pickProviderReference(body, input.orderId)
        };
    },
    parseWebhook(_store, payload) {
        const status = String(payload.status ?? payload.payment_status ?? payload.transaction_status ?? payload.state ?? "").toUpperCase();
        const paid = ["SUCCESS", "PAID", "COMPLETED", "APPROVED", "SETTLEMENT", "CAPTURED"].includes(status);
        return {
            paid,
            providerReference: String(payload.transaction_id ?? payload.id ?? payload.payment_id ?? payload.reference ?? "")
        };
    }
};
