"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.swipeProvider = void 0;
exports.swipeTestPaymentRequest = swipeTestPaymentRequest;
const node_http_1 = __importDefault(require("node:http"));
const node_https_1 = __importDefault(require("node:https"));
const env_1 = require("../config/env");
const base_1 = require("./base");
/** Ditampilkan di debug saat edge mengembalikan HTML (mis. 403) — sering bukan rejection JSON Swipe. */
const SWIPE_EGRESS_HINT = "HTML/WAF 403: sering diblokir proxy/CDN sebelum logic API Swipe. Uji curl yang sama dari host yang sama dengan app deploy (IP egress sama), bukan dari laptop; samakan header dengan Postman yang sukses (termasuk User-Agent); minta whitelist IP egress ke Swipe jika laptop OK tapi server gagal.";
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
function minimumAmount(store) {
    const raw = store.credentials.extra?.minimumAmount?.trim();
    if (!raw) {
        return 10;
    }
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) {
        throw new Error("Swipe: credentials.extra.minimumAmount harus angka ≥ 0.");
    }
    return num;
}
/** Respons Swipe kadang mengisi `url` dengan URL endpoint POST (path sama) — bukan redirect customer; GET ke sana = 404. */
function shouldIgnoreEchoApiUrl(candidate, createEndpointUrl) {
    try {
        const c = new URL(candidate);
        const e = new URL(createEndpointUrl);
        const pathMatch = c.origin === e.origin &&
            c.pathname.replace(/\/$/, "") === e.pathname.replace(/\/$/, "");
        if (!pathMatch) {
            return false;
        }
        if (c.searchParams.has("ws_token") || c.searchParams.has("token")) {
            return false;
        }
        return true;
    }
    catch {
        return false;
    }
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
/** Root + nested shapes yang dipakai beberapa gateway (data / result). */
function swipeResponseLayers(body) {
    const layers = [body];
    for (const key of ["data", "result"]) {
        const nested = body[key];
        if (nested && typeof nested === "object" && !Array.isArray(nested)) {
            layers.push(nested);
        }
    }
    return layers;
}
function pickPaymentUrl(body, store, createEndpointUrl) {
    const layers = swipeResponseLayers(body);
    const keys = [
        "payment_url",
        "paymentUrl",
        "checkout_url",
        "checkoutUrl",
        "redirect_url",
        "redirectUrl",
        "url",
        "link"
    ];
    for (const layer of layers) {
        for (const k of keys) {
            const c = layer[k];
            if (typeof c === "string" && c.startsWith("http")) {
                if (!shouldIgnoreEchoApiUrl(c, createEndpointUrl)) {
                    return c;
                }
            }
        }
    }
    let wsToken;
    for (const layer of layers) {
        const t = layer.ws_token ?? layer.wsToken;
        if (typeof t === "string" && t.length > 0) {
            wsToken = t;
            break;
        }
    }
    if (wsToken) {
        const template = store.credentials.extra?.paymentBrowserUrl?.trim() ||
            store.credentials.extra?.paymentUrlTemplate?.trim();
        if (template) {
            const encoded = encodeURIComponent(wsToken);
            return template
                .replace(/\{ws_token\}/gi, encoded)
                .replace(/\{token\}/gi, encoded)
                .replace(/\{ws_token_raw\}/gi, wsToken)
                .replace(/\{token_raw\}/gi, wsToken);
        }
        throw new Error("Swipe: API mengembalikan ws_token (SwingWireless), bukan URL pembayaran langsung. Isi credentials.extra.paymentBrowserUrl dengan URL halaman/hosted payment dari dokumentasi Swipe; sisipkan placeholder {ws_token} (query). Untuk path tanpa encoding gunakan {ws_token_raw}.");
    }
    throw new Error("Swipe: response tidak berisi URL pembayaran yang dikenali (payment_url / checkout_url / redirect_url / url) atau ws_token. Sesuaikan mapping di provider jika field API lain.");
}
function pickProviderReference(body, fallback) {
    const layers = swipeResponseLayers(body);
    for (const layer of layers) {
        const id = layer.transaction_id ??
            layer.transactionId ??
            layer.ws_token ??
            layer.wsToken ??
            layer.id ??
            layer.payment_id ??
            layer.paymentId ??
            layer.reference_id ??
            layer.referenceId;
        if (typeof id === "string" || typeof id === "number") {
            return String(id);
        }
    }
    return fallback;
}
function buildFallbackPaymentUrl(store, input) {
    const base = env_1.env.host.replace(/\/$/, "");
    const params = new URLSearchParams({
        shop: store.shop,
        orderId: input.orderId,
        amount: String(input.amount),
        currency: input.currency
    });
    return `${base}/sandbox/pay?${params.toString()}`;
}
function tryParseJsonObject(text) {
    if (!text || !text.trim()) {
        return null;
    }
    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
        return null;
    }
    catch {
        return null;
    }
}
function createSwipeRequestId() {
    return `ReqId-${Date.now()}`;
}
function createSwipeInvoiceNumber(orderId) {
    const sanitized = orderId.replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
    return sanitized ? `INV-${sanitized}` : `INV-${Date.now()}`;
}
/** Headers mendekati Postman; beberapa WAF menolak UA khas bot atau request “telanjang”.
 * Pakai process.env langsung supaya kompatibel dengan deploy yang env.ts-nya belum ada field swipeOutboundUserAgent.
 */
function swipeOutboundHeaders(apiKey) {
    const userAgent = process.env.SWIPE_OUTBOUND_USER_AGENT?.trim() || "PostmanRuntime/7.36.0";
    return {
        ApiKey: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": userAgent
    };
}
function postJsonHttp1(endpointUrl, headers, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpointUrl);
        const payload = JSON.stringify(body);
        const isHttps = url.protocol === "https:";
        const requestLib = isHttps ? node_https_1.default : node_http_1.default;
        const requestHeaders = {
            ...headers,
            "Content-Length": Buffer.byteLength(payload).toString()
        };
        const req = requestLib.request({
            hostname: url.hostname,
            port: url.port ? Number(url.port) : undefined,
            path: `${url.pathname}${url.search}`,
            method: "POST",
            headers: requestHeaders,
            // Force HTTP/1.1 via ALPN (jangan kirim option `protocol`; bukan opsi standar ClientRequest).
            ...(isHttps ? { ALPNProtocols: ["http/1.1"] } : {})
        }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });
            res.on("end", () => {
                const bodyText = Buffer.concat(chunks).toString("utf8");
                const status = res.statusCode ?? 0;
                resolve({ ok: status >= 200 && status < 300, status, bodyText });
            });
        });
        req.on("error", reject);
        req.write(payload);
        req.end();
    });
}
exports.swipeProvider = {
    id: "swipe",
    async createCheckout(store, input) {
        const merchantId = (0, base_1.ensureApiKey)(store.credentials);
        const endpointUrl = swipeEndpointUrl(store);
        const defaultNotifyUrl = `${env_1.env.host.replace(/\/$/, "")}/webhooks/payment/swipe?shop=${encodeURIComponent(store.shop)}`;
        const notifyUrl = store.webhookUrlAfterPaid?.trim() || defaultNotifyUrl;
        const clientId = requiredSwipeExtra(store, "clientId", "Client ID dari Swipe");
        const deviceUser = requiredSwipeExtra(store, "deviceUser", "Device User dari Swipe");
        const posRequestType = store.credentials.extra?.posRequestType?.trim() || "Postman";
        const paymentMethod = store.credentials.extra?.paymentMethod?.trim() || "CDCP";
        const feeAgentAmount = numberFromExtra(store, "feeAgentAmount");
        const feeDistributorAmount = numberFromExtra(store, "feeDistributorAmount");
        const feePromotorAmount = numberFromExtra(store, "feePromotorAmount");
        const minAmount = minimumAmount(store);
        if (input.amount < minAmount) {
            throw new Error(`Swipe: nominal checkout minimal ${minAmount}. Nominal saat ini ${input.amount}.`);
        }
        const requestBody = {
            pos_request_type: posRequestType,
            request_id: createSwipeRequestId(),
            client_id: clientId,
            device_user: deviceUser,
            payment_method: paymentMethod,
            invoice_number: createSwipeInvoiceNumber(input.orderId),
            amount: input.amount,
            callback_url: notifyUrl,
            additional_param: {
                fee_agent_amount: feeAgentAmount,
                fee_distributor_amount: feeDistributorAmount,
                fee_promotor_amount: feePromotorAmount
            }
        };
        const outboundHeaders = swipeOutboundHeaders(merchantId);
        if (env_1.env.swipeDebugFingerprint) {
            console.info("[SWIPE DEBUG FINGERPRINT] outbound request", {
                endpointUrl,
                request: requestBody,
                headers: {
                    ...outboundHeaders,
                    ApiKey: maskSecret(merchantId)
                }
            });
        }
        const response = await postJsonHttp1(endpointUrl, outboundHeaders, requestBody);
        if (!response.ok) {
            const errText = response.bodyText || "Unknown error";
            const looksLikeHtmlOr403 = response.status === 403 || /<\s*html/i.test(errText);
            const debugInfo = {
                endpointUrl,
                request: {
                    pos_request_type: requestBody.pos_request_type,
                    request_id: requestBody.request_id,
                    client_id: clientId,
                    device_user: deviceUser,
                    payment_method: paymentMethod,
                    invoice_number: requestBody.invoice_number,
                    amount: requestBody.amount,
                    callback_url: requestBody.callback_url,
                    additional_param: requestBody.additional_param
                },
                headers: swipeOutboundHeaders(maskSecret(merchantId)),
                ...(looksLikeHtmlOr403 ? { egressHint: SWIPE_EGRESS_HINT } : {})
            };
            console.error("Swipe create payment failed", {
                status: response.status,
                error: errText,
                debugInfo
            });
            if (response.status === 403 && env_1.env.swipeFallbackOn403) {
                const fallbackUrl = buildFallbackPaymentUrl(store, input);
                console.warn("[SWIPE FALLBACK] 403 detected, using sandbox redirect", {
                    orderId: input.orderId,
                    shop: store.shop,
                    fallbackUrl
                });
                return {
                    paymentUrl: fallbackUrl,
                    providerReference: `swipe-fallback-${input.orderId}`
                };
            }
            throw new Error(`Swipe API error: ${response.status} — ${errText} | debug=${JSON.stringify(debugInfo)}`);
        }
        const body = tryParseJsonObject(response.bodyText);
        if (!body) {
            const bodySnippet = (response.bodyText || "").replace(/\s+/g, " ").slice(0, 240);
            throw new Error(`Swipe API returned non-JSON success response (${response.status}). Body=${bodySnippet || "EMPTY"}`);
        }
        const paymentUrl = pickPaymentUrl(body, store, endpointUrl);
        console.info("[SWIPE LIVE] payment URL created", {
            orderId: input.orderId,
            shop: store.shop,
            endpointUrl
        });
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
/** POST ke Swipe seperti create checkout, mengembalikan body mentah + percobaan resolve paymentUrl (untuk uji dari admin). */
async function swipeTestPaymentRequest(store, options) {
    const merchantId = (0, base_1.ensureApiKey)(store.credentials);
    const endpointUrl = swipeEndpointUrl(store);
    const defaultNotifyUrl = `${env_1.env.host.replace(/\/$/, "")}/webhooks/payment/swipe?shop=${encodeURIComponent(store.shop)}`;
    const notifyUrl = store.webhookUrlAfterPaid?.trim() || defaultNotifyUrl;
    const clientId = requiredSwipeExtra(store, "clientId", "Client ID dari Swipe");
    const deviceUser = requiredSwipeExtra(store, "deviceUser", "Device User dari Swipe");
    const posRequestType = store.credentials.extra?.posRequestType?.trim() || "Postman";
    const paymentMethod = store.credentials.extra?.paymentMethod?.trim() || "CDCP";
    const feeAgentAmount = numberFromExtra(store, "feeAgentAmount");
    const feeDistributorAmount = numberFromExtra(store, "feeDistributorAmount");
    const feePromotorAmount = numberFromExtra(store, "feePromotorAmount");
    const minAmount = minimumAmount(store);
    if (options.amount < minAmount) {
        throw new Error(`Swipe: nominal minimal ${minAmount}. Saat ini ${options.amount}. Set credentials.extra.minimumAmount ke 0 untuk uji amount 0 seperti Postman.`);
    }
    const requestBody = {
        pos_request_type: posRequestType,
        request_id: createSwipeRequestId(),
        client_id: clientId,
        device_user: deviceUser,
        payment_method: paymentMethod,
        invoice_number: createSwipeInvoiceNumber(options.orderId),
        amount: options.amount,
        callback_url: notifyUrl,
        additional_param: {
            fee_agent_amount: feeAgentAmount,
            fee_distributor_amount: feeDistributorAmount,
            fee_promotor_amount: feePromotorAmount
        }
    };
    const outboundHeaders = swipeOutboundHeaders(merchantId);
    const response = await postJsonHttp1(endpointUrl, outboundHeaders, requestBody);
    const parsed = tryParseJsonObject(response.bodyText);
    let paymentUrl;
    let pickUrlError;
    if (parsed) {
        try {
            paymentUrl = pickPaymentUrl(parsed, store, endpointUrl);
        }
        catch (err) {
            pickUrlError = err instanceof Error ? err.message : String(err);
        }
    }
    return {
        endpointUrl,
        request: requestBody,
        status: response.status,
        httpOk: response.ok,
        rawBody: response.bodyText,
        parsed,
        paymentUrl,
        pickUrlError
    };
}
