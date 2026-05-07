import http from "node:http";
import https from "node:https";
import { env } from "../config/env";
import { CreateCheckoutInput, CreateCheckoutResult, StoreConfig } from "../types";
import { PaymentProvider, ProviderWebhookPayload, ensureApiKey } from "./base";

/** Shown in debug when edge returns HTML (e.g. 403) — often not a Swipe JSON rejection. */
const SWIPE_EGRESS_HINT =
  "HTML/WAF 403: often blocked by proxy/CDN before Swipe API logic. Test the same curl from the same host as the deployed app (same egress IP), not from your laptop; match headers with successful Postman requests (including User-Agent); request egress IP whitelisting from Swipe if laptop works but server fails.";

function swipeBaseUrl(store: StoreConfig): string {
  const fromExtra = store.credentials.extra?.apiBaseUrl?.trim();
  if (fromExtra) {
    return fromExtra.replace(/\/$/, "");
  }
  throw new Error(
    "Swipe: set credentials.extra.apiBaseUrl (Swipe API URL from onboarding docs). Example: https://api.example.swipe.co.id"
  );
}

function swipeCreatePath(store: StoreConfig): string {
  const path = store.credentials.extra?.createPath?.trim();
  if (!path) {
    throw new Error(
      "Swipe: set credentials.extra.createPath (create payment path from Swipe docs, e.g. /v1/payments or the path used in Postman)."
    );
  }
  return path.startsWith("/") ? path : `/${path}`;
}

function swipeEndpointUrl(store: StoreConfig): string {
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

function requiredSwipeExtra(store: StoreConfig, key: string, label: string): string {
  const value = store.credentials.extra?.[key]?.trim();
  if (!value) {
    throw new Error(`Swipe: set credentials.extra.${key} (${label}).`);
  }
  return value;
}

function numberFromExtra(store: StoreConfig, key: string): number {
  const value = store.credentials.extra?.[key];
  if (!value || !value.trim()) {
    return 0;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`Swipe: credentials.extra.${key} must be a number.`);
  }
  return num;
}

function minimumAmount(store: StoreConfig): number {
  const raw = store.credentials.extra?.minimumAmount?.trim();
  if (!raw) {
    return 10;
  }
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error("Swipe: credentials.extra.minimumAmount must be a number >= 0.");
  }
  return num;
}

/** Swipe response may populate `url` with POST endpoint URL (same path) — not a customer redirect; GET there = 404. */
function shouldIgnoreEchoApiUrl(candidate: string, createEndpointUrl: string): boolean {
  try {
    const c = new URL(candidate);
    const e = new URL(createEndpointUrl);
    const pathMatch =
      c.origin === e.origin &&
      c.pathname.replace(/\/$/, "") === e.pathname.replace(/\/$/, "");
    if (!pathMatch) {
      return false;
    }
    if (c.searchParams.has("ws_token") || c.searchParams.has("token")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function maskSecret(value: string): string {
  if (!value) {
    return "";
  }
  if (value.length <= 8) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

/** Root + nested shapes used by some gateways (data / result). */
function swipeResponseLayers(body: Record<string, unknown>): Record<string, unknown>[] {
  const layers: Record<string, unknown>[] = [body];
  for (const key of ["data", "result"] as const) {
    const nested = body[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      layers.push(nested as Record<string, unknown>);
    }
  }
  return layers;
}

/** Redirect Shopify to EDC instruction page — payment on terminal + Swipe callback. */
function buildEdcPendingPageUrl(store: StoreConfig, input: CreateCheckoutInput): string {
  const base = env.host.replace(/\/$/, "");
  const params = new URLSearchParams({
    shop: store.shop,
    orderId: input.orderId,
    amount: String(input.amount),
    currency: input.currency
  });
  return `${base}/pay/edc-pending?${params.toString()}`;
}

function pickPaymentUrl(
  body: Record<string, unknown>,
  store: StoreConfig,
  createEndpointUrl: string,
  redirectCtx: CreateCheckoutInput
): string {
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
  ] as const;

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

  let wsToken: string | undefined;
  for (const layer of layers) {
    const t = layer.ws_token ?? layer.wsToken;
    if (typeof t === "string" && t.length > 0) {
      wsToken = t;
      break;
    }
  }

  if (wsToken) {
    return buildEdcPendingPageUrl(store, redirectCtx);
  }

  throw new Error(
    "Swipe: response does not contain a recognized payment URL (payment_url / checkout_url / redirect_url / url) or ws_token. Adjust provider mapping if your API uses different fields."
  );
}

function pickProviderReference(body: Record<string, unknown>, fallback: string): string {
  const layers = swipeResponseLayers(body);
  for (const layer of layers) {
    const id =
      layer.transaction_id ??
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

function buildFallbackPaymentUrl(store: StoreConfig, input: CreateCheckoutInput): string {
  const base = env.host.replace(/\/$/, "");
  const params = new URLSearchParams({
    shop: store.shop,
    orderId: input.orderId,
    amount: String(input.amount),
    currency: input.currency
  });
  return `${base}/sandbox/pay?${params.toString()}`;
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  if (!text || !text.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function createSwipeRequestId(): string {
  return `ReqId-${Date.now()}`;
}

/** Same value as `invoice_number` sent to Swipe API; used as webhook ↔ payment session key. */
export function swipeInvoiceNumberForOrder(orderId: string): string {
  const sanitized = orderId.replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
  return sanitized ? `INV-${sanitized}` : `INV-${Date.now()}`;
}

/** Headers close to Postman; some WAFs reject bot-like UA or "bare" requests.
 * Uses process.env directly for compatibility with deployments where env.ts doesn't yet include swipeOutboundUserAgent.
 */
function swipeOutboundHeaders(apiKey: string): Record<string, string> {
  const userAgent =
    process.env.SWIPE_OUTBOUND_USER_AGENT?.trim() || "PostmanRuntime/7.36.0";
  return {
    ApiKey: apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": userAgent
  };
}

function postJsonHttp1(
  endpointUrl: string,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; bodyText: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpointUrl);
    const payload = JSON.stringify(body);
    const isHttps = url.protocol === "https:";
    const requestLib = isHttps ? https : http;
    const requestHeaders = {
      ...headers,
      "Content-Length": Buffer.byteLength(payload).toString()
    };

    const req = requestLib.request(
      {
        hostname: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: requestHeaders,
        // Force HTTP/1.1 via ALPN (do not send `protocol`; not a standard ClientRequest option).
        ...(isHttps ? { ALPNProtocols: ["http/1.1"] as const } : {})
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          const bodyText = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          resolve({ ok: status >= 200 && status < 300, status, bodyText });
        });
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export const swipeProvider: PaymentProvider = {
  id: "swipe",
  async createCheckout(store: StoreConfig, input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const merchantId = ensureApiKey(store.credentials);
    const endpointUrl = swipeEndpointUrl(store);
    const defaultNotifyUrl = `${env.host.replace(/\/$/, "")}/webhooks/payment/swipe?shop=${encodeURIComponent(store.shop)}`;
    const notifyUrl = store.webhookUrlAfterPaid?.trim() || defaultNotifyUrl;
    const clientId = requiredSwipeExtra(store, "clientId", "Client ID from Swipe");
    const deviceUser = requiredSwipeExtra(store, "deviceUser", "Device User from Swipe");
    const posRequestType = store.credentials.extra?.posRequestType?.trim() || "Postman";
    const paymentMethod = store.credentials.extra?.paymentMethod?.trim() || "CDCP";
    const feeAgentAmount = numberFromExtra(store, "feeAgentAmount");
    const feeDistributorAmount = numberFromExtra(store, "feeDistributorAmount");
    const feePromotorAmount = numberFromExtra(store, "feePromotorAmount");
    const minAmount = minimumAmount(store);

    if (input.amount < minAmount) {
      throw new Error(
        `Swipe: minimum checkout amount is ${minAmount}. Current amount is ${input.amount}.`
      );
    }

    const requestBody: Record<string, unknown> = {
      pos_request_type: posRequestType,
      request_id: createSwipeRequestId(),
      client_id: clientId,
      device_user: deviceUser,
      payment_method: paymentMethod,
      invoice_number: swipeInvoiceNumberForOrder(input.orderId),
      amount: input.amount,
      callback_url: notifyUrl,
      additional_param: {
        fee_agent_amount: feeAgentAmount,
        fee_distributor_amount: feeDistributorAmount,
        fee_promotor_amount: feePromotorAmount
      }
    };

    const outboundHeaders = swipeOutboundHeaders(merchantId);

    if (env.swipeDebugFingerprint) {
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
      const looksLikeHtmlOr403 =
        response.status === 403 || /<\s*html/i.test(errText);
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

      if (response.status === 403 && env.swipeFallbackOn403) {
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

      throw new Error(
        `Swipe API error: ${response.status} — ${errText} | debug=${JSON.stringify(debugInfo)}`
      );
    }

    const body = tryParseJsonObject(response.bodyText);
    if (!body) {
      const bodySnippet = (response.bodyText || "").replace(/\s+/g, " ").slice(0, 240);
      throw new Error(
        `Swipe API returned non-JSON success response (${response.status}). Body=${bodySnippet || "EMPTY"}`
      );
    }

    const paymentUrl = pickPaymentUrl(body, store, endpointUrl, input);
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
  parseWebhook(_store: StoreConfig, payload: ProviderWebhookPayload) {
    const status = String(
      payload.status ?? payload.payment_status ?? payload.transaction_status ?? payload.state ?? ""
    ).toUpperCase();
    const paid = ["SUCCESS", "PAID", "COMPLETED", "APPROVED", "SETTLEMENT", "CAPTURED"].includes(status);
    return {
      paid,
      providerReference: String(
        payload.transaction_id ?? payload.id ?? payload.payment_id ?? payload.reference ?? ""
      )
    };
  }
};

export type SwipeTestPaymentResult = {
  endpointUrl: string;
  request: Record<string, unknown>;
  status: number;
  httpOk: boolean;
  rawBody: string;
  parsed: Record<string, unknown> | null;
  paymentUrl?: string;
  pickUrlError?: string;
};

/** POST to Swipe like create checkout, returns raw body + paymentUrl resolution attempt (for admin testing). */
export async function swipeTestPaymentRequest(
  store: StoreConfig,
  options: { amount: number; orderId: string; currency?: string }
): Promise<SwipeTestPaymentResult> {
  const merchantId = ensureApiKey(store.credentials);
  const endpointUrl = swipeEndpointUrl(store);
  const defaultNotifyUrl = `${env.host.replace(/\/$/, "")}/webhooks/payment/swipe?shop=${encodeURIComponent(store.shop)}`;
  const notifyUrl = store.webhookUrlAfterPaid?.trim() || defaultNotifyUrl;
  const clientId = requiredSwipeExtra(store, "clientId", "Client ID from Swipe");
  const deviceUser = requiredSwipeExtra(store, "deviceUser", "Device User from Swipe");
  const posRequestType = store.credentials.extra?.posRequestType?.trim() || "Postman";
  const paymentMethod = store.credentials.extra?.paymentMethod?.trim() || "CDCP";
  const feeAgentAmount = numberFromExtra(store, "feeAgentAmount");
  const feeDistributorAmount = numberFromExtra(store, "feeDistributorAmount");
  const feePromotorAmount = numberFromExtra(store, "feePromotorAmount");
  const minAmount = minimumAmount(store);

  if (options.amount < minAmount) {
    throw new Error(
      `Swipe: minimum amount is ${minAmount}. Current amount is ${options.amount}. Set credentials.extra.minimumAmount to 0 to test amount 0 like Postman.`
    );
  }

  const requestBody: Record<string, unknown> = {
    pos_request_type: posRequestType,
    request_id: createSwipeRequestId(),
    client_id: clientId,
    device_user: deviceUser,
    payment_method: paymentMethod,
    invoice_number: swipeInvoiceNumberForOrder(options.orderId),
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

  let paymentUrl: string | undefined;
  let pickUrlError: string | undefined;
  if (parsed) {
    try {
      const currency = (options.currency ?? "IDR").trim().toUpperCase() || "IDR";
      paymentUrl = pickPaymentUrl(parsed, store, endpointUrl, {
        shop: store.shop,
        provider: "swipe" as const,
        amount: options.amount,
        currency,
        orderId: options.orderId
      });
    } catch (err) {
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
