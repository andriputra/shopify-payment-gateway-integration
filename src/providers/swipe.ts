import http from "node:http";
import https from "node:https";
import { env } from "../config/env";
import {
  logSwipeTransaction,
  type SwipePaymentSurface
} from "../services/swipe-transaction-log";
import { CreateCheckoutInput, CreateCheckoutResult, StoreConfig } from "../types";
import { persistSwipePayload } from "../services/swipe-payload-persist";
import { isSwipeApprovedResponseCode, lookupSwipeResponseMessage, normalizeSwipeResponseCode } from "../data/swipe-response-codes";
import {
  PaymentProvider,
  PaymentWebhookOutcome,
  ProviderWebhookPayload,
  ensureApiKey
} from "./base";

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

/** Per-request override (checkout / webhook) wins over store `credentials.extra.paymentMethod`, then CDCP. */
export function effectiveSwipePaymentMethod(
  store: StoreConfig,
  perRequest?: string | null
): string {
  const fromRequest = typeof perRequest === "string" ? perRequest.trim() : "";
  if (fromRequest) {
    return fromRequest.slice(0, 64);
  }
  return store.credentials.extra?.paymentMethod?.trim() || "CDCP";
}

/** Per-request override wins over store `credentials.extra.deviceUser`. */
export function effectiveSwipeDeviceUser(
  store: StoreConfig,
  perRequest?: string | null
): string {
  const fromRequest = typeof perRequest === "string" ? perRequest.trim() : "";
  if (fromRequest) {
    return fromRequest.slice(0, 128);
  }
  return requiredSwipeExtra(store, "deviceUser", "Device User from Swipe");
}

/**
 * Shopify order `note_attributes` (from cart / checkout attributes) for per-order Swipe `payment_method`.
 * Matched attribute names (case-insensitive): `swipe_payment_method`, `Swipe Payment Method`.
 */
export function swipePaymentMethodFromOrderNoteAttributes(
  payload: Record<string, unknown>
): string | undefined {
  const attrs = payload.note_attributes;
  if (!Array.isArray(attrs)) {
    return undefined;
  }
  const wanted = new Set(["swipe_payment_method", "swipe payment method"]);
  for (const entry of attrs) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const name = String(rec.name ?? "").trim().toLowerCase();
    const value = String(rec.value ?? "").trim();
    if (!value) continue;
    if (wanted.has(name)) {
      return value.slice(0, 64);
    }
  }
  return undefined;
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

function truncateStr(s: string, max: number): string {
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max)}…`;
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

function classifySwipePaymentUrl(url: string): SwipePaymentSurface {
  if (url.includes("/pay/edc-pending")) {
    return "edc_pending_page";
  }
  if (url.includes("/sandbox/pay") || url.includes("/uat/checkout")) {
    return "sandbox_fallback";
  }
  return "external_redirect";
}

function swipePrimaryStatus(payload: ProviderWebhookPayload): string {
  return String(
    payload.status ??
      payload.payment_status ??
      payload.transaction_status ??
      payload.state ??
      payload.transactionStatus ??
      payload.paymentStatus ??
      ""
  ).trim();
}

/**
 * QRIS callbacks often nest settlement fields inside `additional_param` as a JSON string:
 * `{"response_code":"0011","ws_session_id":"...","message":"PAYMENT ALREADY PAID.",...}`
 */
export function parseSwipeAdditionalParam(payload: Record<string, unknown>): Record<string, unknown> {
  const raw = payload.additional_param ?? payload.additionalParam;
  if (raw == null) {
    return {};
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* leave empty — not JSON */
    }
  }
  return {};
}

function swipeCallbackFieldLayers(payload: ProviderWebhookPayload): Record<string, unknown>[] {
  const nested = parseSwipeAdditionalParam(payload);
  return Object.keys(nested).length > 0 ? [payload, nested] : [payload];
}

function firstNonEmptyString(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const s = String(c).trim();
    if (s !== "") {
      return s;
    }
  }
  return undefined;
}

function extractSwipeEdcResponseCode(payload: ProviderWebhookPayload): string | undefined {
  for (const layer of swipeCallbackFieldLayers(payload)) {
    const found = firstNonEmptyString(
      layer.response_code,
      layer.responseCode,
      layer.error_code,
      layer.errorCode,
      layer.rc,
      layer.result_code,
      layer.resultCode,
      layer.edc_response_code,
      layer.edcResponseCode,
      layer.swipe_response_code,
      layer.swipeResponseCode
    );
    if (found) {
      return found;
    }
  }
  return undefined;
}

function extractSwipeWsSessionId(payload: ProviderWebhookPayload): string | undefined {
  for (const layer of swipeCallbackFieldLayers(payload)) {
    const found = firstNonEmptyString(layer.ws_session_id, layer.wsSessionId);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function extractSwipeRequestId(payload: ProviderWebhookPayload): string | undefined {
  return firstNonEmptyString(payload.request_id, payload.requestId);
}

function swipeCallbackMessageFromPayloadOrDictionary(
  payload: ProviderWebhookPayload,
  code: string | undefined
): string | undefined {
  for (const layer of swipeCallbackFieldLayers(payload)) {
    const fromPayload = firstNonEmptyString(
      layer.response_message,
      layer.responseMessage,
      layer.error_message,
      layer.errorMessage,
      layer.message
    );
    if (fromPayload) {
      return fromPayload;
    }
  }
  if (code) {
    const fromDict = lookupSwipeResponseMessage(code);
    if (fromDict) {
      return fromDict;
    }
  }
  return undefined;
}

function classifySwipeGatewayOutcome(normalizedStatus: string): {
  paid: boolean;
  outcome: PaymentWebhookOutcome;
} {
  const u = normalizedStatus.trim().toUpperCase();
  if (!u) {
    return { paid: false, outcome: "unknown" };
  }

  const PAID = new Set([
    "SUCCESS",
    "PAID",
    "COMPLETED",
    "APPROVED",
    "SETTLEMENT",
    "CAPTURED",
    "SUCCEEDED",
    /** QRIS / SwingWireless push callback */
    "PROCESSED",
    "OK"
  ]);
  const TIMEOUT = new Set(["TIMEOUT", "EXPIRED", "EXPIRE", "SESSION_TIMEOUT"]);
  const CANCELLED = new Set(["CANCELLED", "CANCELED", "VOID", "ABORTED"]);
  const FAILED = new Set(["FAILED", "DECLINED", "DECLINE", "REJECTED", "FAILURE", "ERROR", "DENIED"]);
  const PENDING = new Set(["PENDING", "PROCESSING", "WAITING", "OPEN", "IN_PROGRESS"]);

  if (PAID.has(u)) {
    return { paid: true, outcome: "paid" };
  }
  if (TIMEOUT.has(u) || /\b(TIMEOUT|EXPIRED)\b/.test(u)) {
    return { paid: false, outcome: "timeout" };
  }
  if (CANCELLED.has(u)) {
    return { paid: false, outcome: "cancelled" };
  }
  if (FAILED.has(u)) {
    return { paid: false, outcome: "failed" };
  }
  if (PENDING.has(u)) {
    return { paid: false, outcome: "pending" };
  }

  return { paid: false, outcome: "unknown" };
}

function effectiveReturnUrlAfterPaid(store: StoreConfig, input: CreateCheckoutInput): string | undefined {
  const fromRequest = input.returnUrl?.trim();
  if (fromRequest) {
    return fromRequest;
  }
  const fromStore = store.redirectUrlAfterPaid?.trim();
  return fromStore || undefined;
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
  const returnUrl = effectiveReturnUrlAfterPaid(store, input);
  if (returnUrl) {
    params.set("returnUrl", returnUrl);
  }
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
    const deviceUser = effectiveSwipeDeviceUser(store, input.swipeDeviceUser);
    const posRequestType = store.credentials.extra?.posRequestType?.trim() || "Postman";
    const paymentMethod = effectiveSwipePaymentMethod(store, input.swipePaymentMethod);
    const feeAgentAmount = numberFromExtra(store, "feeAgentAmount");
    const feeDistributorAmount = numberFromExtra(store, "feeDistributorAmount");
    const feePromotorAmount = numberFromExtra(store, "feePromotorAmount");
    const minAmount = minimumAmount(store);

    if (input.amount < minAmount) {
      throw new Error(
        `Swipe: minimum checkout amount is ${minAmount}. Current amount is ${input.amount}.`
      );
    }

    const returnUrlAfterPaid = effectiveReturnUrlAfterPaid(store, input);
    const returnUrlField =
      store.credentials.extra?.returnUrlField?.trim() ||
      store.credentials.extra?.swipeReturnUrlField?.trim() ||
      "return_url";

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
    if (returnUrlAfterPaid) {
      requestBody[returnUrlField] = returnUrlAfterPaid;
    }

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

    let response: { ok: boolean; status: number; bodyText: string };
    try {
      response = await postJsonHttp1(endpointUrl, outboundHeaders, requestBody);
    } catch (netErr) {
      await persistSwipePayload({
        shop: store.shop,
        orderReference: String(requestBody.invoice_number),
        source: "swipe_api_create",
        httpStatus: null,
        bodyText: JSON.stringify({
          _error: "network",
          message: netErr instanceof Error ? netErr.message : String(netErr)
        })
      });
      logSwipeTransaction({
        phase: "create_network_error",
        shop: store.shop,
        orderId: input.orderId,
        invoiceNumber: String(requestBody.invoice_number),
        requestId: String(requestBody.request_id),
        errorMessage: netErr instanceof Error ? netErr.message : String(netErr),
        note: "No HTTP response (DNS/TLS/timeout/socket); EDC callback will not occur for this create."
      });
      throw netErr;
    }

    await persistSwipePayload({
      shop: store.shop,
      orderReference: String(requestBody.invoice_number),
      source: "swipe_api_create",
      httpStatus: response.status,
      bodyText: response.bodyText
    });

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

      logSwipeTransaction({
        phase: "create_api_error",
        shop: store.shop,
        orderId: input.orderId,
        invoiceNumber: String(requestBody.invoice_number),
        requestId: String(requestBody.request_id),
        httpStatus: response.status,
        errorMessage: truncateStr(errText, 400),
        note: looksLikeHtmlOr403 ? SWIPE_EGRESS_HINT : "Swipe create HTTP error"
      });

      if (response.status === 403 && env.swipeFallbackOn403) {
        const fallbackUrl = buildFallbackPaymentUrl(store, input);
        console.warn("[SWIPE FALLBACK] 403 detected, using sandbox redirect", {
          orderId: input.orderId,
          shop: store.shop,
          fallbackUrl
        });
        logSwipeTransaction({
          phase: "create_success",
          shop: store.shop,
          orderId: input.orderId,
          invoiceNumber: String(requestBody.invoice_number),
          requestId: String(requestBody.request_id),
          httpStatus: response.status,
          providerReference: `swipe-fallback-${input.orderId}`,
          paymentSurface: "sandbox_fallback",
          note: "SWIPE_FALLBACK_ON_403: returning sandbox/UAT URL; not a live Swipe EDC session."
        });
        return {
          paymentUrl: fallbackUrl,
          providerReference: `swipe-fallback-${input.orderId}`,
          requestId: String(requestBody.request_id),
          invoiceNumber: String(requestBody.invoice_number)
        };
      }

      throw new Error(
        `Swipe API error: ${response.status} — ${errText} | debug=${JSON.stringify(debugInfo)}`
      );
    }

    const body = tryParseJsonObject(response.bodyText);
    if (!body) {
      const bodySnippet = (response.bodyText || "").replace(/\s+/g, " ").slice(0, 240);
      logSwipeTransaction({
        phase: "create_api_error",
        shop: store.shop,
        orderId: input.orderId,
        invoiceNumber: String(requestBody.invoice_number),
        requestId: String(requestBody.request_id),
        httpStatus: response.status,
        errorMessage: `non-JSON body: ${bodySnippet || "EMPTY"}`,
        note: "Expected JSON from Swipe create endpoint."
      });
      throw new Error(
        `Swipe API returned non-JSON success response (${response.status}). Body=${bodySnippet || "EMPTY"}`
      );
    }

    const paymentUrl = pickPaymentUrl(body, store, endpointUrl, input);
    const paymentSurface = classifySwipePaymentUrl(paymentUrl);
    const providerReference = pickProviderReference(body, input.orderId);
    logSwipeTransaction({
      phase: "create_success",
      shop: store.shop,
      orderId: input.orderId,
      invoiceNumber: String(requestBody.invoice_number),
      requestId: String(requestBody.request_id),
      httpStatus: response.status,
      providerReference,
      paymentSurface,
      amount: input.amount,
      currency: input.currency,
      callbackUrl: String(requestBody.callback_url),
      note:
        paymentSurface === "edc_pending_page"
          ? "Awaiting EDC + Swipe server callback to callback_url (edc_callback phase)."
          : paymentSurface === "sandbox_fallback"
            ? "Sandbox redirect; not production EDC."
            : "Redirect/hop URL from Swipe response; confirm terminal flow with Swipe docs."
    });
    console.info("[SWIPE LIVE] payment URL created", {
      orderId: input.orderId,
      shop: store.shop,
      endpointUrl
    });
    return {
      paymentUrl,
      providerReference,
      returnUrlAfterPaid: returnUrlAfterPaid ?? undefined,
      requestId: String(requestBody.request_id),
      invoiceNumber: String(requestBody.invoice_number)
    };
  },
  parseWebhook(_store: StoreConfig, payload: ProviderWebhookPayload) {
    const statusRaw = swipePrimaryStatus(payload);
    const edcResponseCode = extractSwipeEdcResponseCode(payload);
    let edcResponseMessage = swipeCallbackMessageFromPayloadOrDictionary(payload, edcResponseCode);
    let { paid, outcome } = classifySwipeGatewayOutcome(statusRaw);
    const statusUpper = statusRaw.trim().toUpperCase();
    const requestId = extractSwipeRequestId(payload);
    const wsSessionId = extractSwipeWsSessionId(payload);

    /** Swipe EDC / QRIS: approved codes include 0020, 0011, temporary -10023 (see swipe-response-codes.ts). */
    if (!paid && isSwipeApprovedResponseCode(edcResponseCode)) {
      paid = true;
      outcome = "paid";
    }
    if (!paid && statusUpper === "OK") {
      paid = true;
      outcome = "paid";
    }
    if (
      !paid &&
      edcResponseMessage &&
      /APPROVED|ALREADY\s+PAID|PAYMENT\s+ALREADY\s+PAID/i.test(edcResponseMessage)
    ) {
      paid = true;
      outcome = "paid";
    }

    /** Normalize misleading vendor messages once mapped to paid. */
    if (paid) {
      const codeKey = normalizeSwipeResponseCode(edcResponseCode);
      if (codeKey === "-10023" || codeKey === "0011") {
        const bookMessage = lookupSwipeResponseMessage(codeKey);
        if (bookMessage) {
          edcResponseMessage = bookMessage;
        }
      }
    }

    const nested = parseSwipeAdditionalParam(payload);
    const providerReference = String(
      firstNonEmptyString(
        payload.transaction_id,
        payload.id,
        payload.payment_id,
        payload.reference,
        nested.rrn,
        nested.approval_code,
        wsSessionId,
        requestId
      ) ?? ""
    );

    return {
      paid,
      outcome,
      statusRaw: statusRaw || undefined,
      edcResponseCode,
      edcResponseMessage,
      requestId,
      wsSessionId,
      providerReference
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
  options: {
    amount: number;
    orderId: string;
    currency?: string;
    swipePaymentMethod?: string;
    swipeDeviceUser?: string;
  }
): Promise<SwipeTestPaymentResult> {
  const merchantId = ensureApiKey(store.credentials);
  const endpointUrl = swipeEndpointUrl(store);
  const defaultNotifyUrl = `${env.host.replace(/\/$/, "")}/webhooks/payment/swipe?shop=${encodeURIComponent(store.shop)}`;
  const notifyUrl = store.webhookUrlAfterPaid?.trim() || defaultNotifyUrl;
  const clientId = requiredSwipeExtra(store, "clientId", "Client ID from Swipe");
  const deviceUser = effectiveSwipeDeviceUser(store, options.swipeDeviceUser);
  const posRequestType = store.credentials.extra?.posRequestType?.trim() || "Postman";
  const paymentMethod = effectiveSwipePaymentMethod(store, options.swipePaymentMethod);
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
  await persistSwipePayload({
    shop: store.shop,
    orderReference: String(requestBody.invoice_number),
    source: "swipe_api_create",
    httpStatus: response.status,
    bodyText: response.bodyText
  });
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
