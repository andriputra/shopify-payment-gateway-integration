import http from "node:http";
import https from "node:https";
import { env } from "../config/env";
import { CreateCheckoutInput, CreateCheckoutResult, StoreConfig } from "../types";
import { PaymentProvider, ProviderWebhookPayload, ensureApiKey } from "./base";

function swipeBaseUrl(store: StoreConfig): string {
  const fromExtra = store.credentials.extra?.apiBaseUrl?.trim();
  if (fromExtra) {
    return fromExtra.replace(/\/$/, "");
  }
  throw new Error(
    "Swipe: isi credentials.extra.apiBaseUrl (URL API dari Swipe / dokumen onboarding). Contoh: https://api.example.swipe.co.id"
  );
}

function swipeCreatePath(store: StoreConfig): string {
  const path = store.credentials.extra?.createPath?.trim();
  if (!path) {
    throw new Error(
      "Swipe: isi credentials.extra.createPath (path create payment dari dokumentasi Swipe, mis. /v1/payments atau path dari Postman)."
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
    throw new Error(`Swipe: isi credentials.extra.${key} (${label}).`);
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
    throw new Error(`Swipe: credentials.extra.${key} harus angka.`);
  }
  return num;
}

function minimumAmount(store: StoreConfig): number {
  const raw = store.credentials.extra?.minimumAmount?.trim();
  if (!raw) {
    return 10;
  }
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error("Swipe: credentials.extra.minimumAmount harus angka positif.");
  }
  return num;
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

function pickPaymentUrl(body: Record<string, unknown>): string {
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
  throw new Error(
    "Swipe: response tidak berisi URL pembayaran yang dikenali (payment_url / checkout_url / redirect_url / url). Sesuaikan mapping di provider jika field API lain."
  );
}

function pickProviderReference(body: Record<string, unknown>, fallback: string): string {
  const id =
    body.transaction_id ??
    body.transactionId ??
    body.id ??
    body.payment_id ??
    body.paymentId ??
    body.reference_id ??
    body.referenceId;
  return typeof id === "string" || typeof id === "number" ? String(id) : fallback;
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
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: requestHeaders,
        // Keep transport to HTTP/1.1 for gateways that reject HTTP/2.
        ...(isHttps ? { ALPNProtocols: ["http/1.1"] } : {})
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
    const defaultNotifyUrl = `${env.host.replace(/\/$/, "")}/webhooks/payment/swipe/${encodeURIComponent(store.shop)}`;
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
      throw new Error(
        `Swipe: nominal checkout minimal ${minAmount}. Nominal saat ini ${input.amount}.`
      );
    }

    const requestBody: Record<string, unknown> = {
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

    const response = await postJsonHttp1(
      endpointUrl,
      {
        ApiKey: merchantId,
        "Content-Type": "application/json"
      },
      requestBody
    );

    if (!response.ok) {
      const errText = response.bodyText || "Unknown error";
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
          ApiKey: maskSecret(merchantId)
        }
      };
      console.error("Swipe create payment failed", {
        status: response.status,
        error: errText,
        debugInfo
      });
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

    const paymentUrl = pickPaymentUrl(body);
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
