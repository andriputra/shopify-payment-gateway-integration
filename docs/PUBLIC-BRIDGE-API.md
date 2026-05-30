# Public and bridge-facing API endpoints

**Rendered HTML:** open `{BASE}/docs/bridge` on your host (e.g. `https://dynapp.store/docs/bridge`). Requires the `docs/` folder on the server at deploy root.

This document lists HTTP endpoints that **external systems** (other backends, payment providers, WordPress, custom storefronts) can use to integrate with this app as a **payment bridge**. It complements the main [README](../README.md).

Replace **`{BASE}`** with your app origin (for example `https://dynapp.store` or `http://localhost:3000`).

---

## Legend

| Auth type | Meaning |
|-----------|---------|
| **None** | No `Authorization` header required (may still use redirects, HMAC, or query params). |
| **Shared secret** | Caller proves identity with the same secret configured in server `.env` (see each section). |
| **Shopify HMAC** | Shopify signs the body; this app verifies `X-Shopify-Hmac-Sha256`. |
| **Shopify session JWT** | `Authorization: Bearer <session token>` from App Bridge (embedded admin only) — **not** for arbitrary public clients. |

---

## 1. Shared secret — recommended for server-to-server bridges

These endpoints are intended for **your own backends** or trusted partners. Never expose the secret in mobile apps or public frontends.

### 1.1 Payment redirect status

| Method | Path | Auth |
|--------|------|------|
| `GET` | `{BASE}/api/payment-status` | **Shared secret** |

**Secret used (first non-empty):** `PAYMENT_STATUS_API_SECRET`, then `APP_SHARED_SECRET`.

**Accepted auth (any one):**

- Header `Authorization: Bearer <secret>`
- Header `X-Payment-Status-Secret: <secret>`
- Query `?secret=<secret>`

**Query parameters (typical):**

- `shop` — bare Shopify subdomain, full `*.myshopify.com` host, or **custom domain** hostname (e.g. `pay.brand.co.id`). Must match the `shop` saved in store config and used in checkout / webhook URLs.
- One of: `orderReference` (for Swipe, use the same key as Swipe `invoice_number`, usually `INV-…` from `swipeInvoiceNumberForOrder(yourOrderId)`), or `shopifyOrderId` / `orderId` (numeric or `gid://shopify/Order/...`)

**When a row appears:** after a **successful** `createCheckout` (embedded `POST /api/payments/checkout/create`, `POST /api/bridge/checkout/create`, payment-sessions, or the `orders/create` manual flow), the server **upserts** a `pending` row. Provider webhooks then `mergeUpdate` status (`paid` / `failed`). If you only call Swipe from elsewhere and never hit this app’s `createCheckout`, no row exists for `/api/payment-status`.

**Response:** JSON with `ok`, store payment record fields (`status`, `amount`, Swipe codes if present), etc. Returns `401` if secret missing/wrong, `404` if no record.

### 1.2 Swipe response code book

| Method | Path | Auth |
|--------|------|------|
| `GET` | `{BASE}/api/payment-status/swipe-response-codes` | **Shared secret** (same as §1.1) |

Returns reference map of Swipe response codes.

### 1.4 Create checkout (general bridge — no Shopify session JWT)

| Method | Path | Auth |
|--------|------|------|
| `POST` | `{BASE}/api/bridge/checkout/create` | **Shared secret** |

Same business logic as embedded `POST /api/payments/checkout/create`, but for **trusted backends** (microservices, cron, etc.) that cannot obtain a Shopify session token.

**Secret used (first non-empty):** `BRIDGE_CHECKOUT_API_SECRET`, then `PAYMENT_STATUS_API_SECRET`, then `APP_SHARED_SECRET`.

**Accepted auth (any one):**

- Header `Authorization: Bearer <secret>`
- Header `X-Bridge-Checkout-Secret: <secret>`
- Query `?secret=<secret>` (less ideal — may appear in logs)
- JSON field `secret` in the POST body (stripped before validation; prefer headers in production)

**JSON body (same shape as embedded checkout create):**

| Field | Required | Description |
|-------|----------|-------------|
| `shop` | Yes | Store identifier (e.g. `example.myshopify.com`) |
| `provider` | Yes | `xendit` \| `midtrans` \| `swipe` \| `sandbox` \| `custom` |
| `amount` | Yes | Payment amount (≥ 0) |
| `currency` | Yes | 3-letter code (e.g. `IDR`) |
| `orderId` | Yes | Internal order reference |
| `customerEmail` | No | Buyer email |
| `returnUrl` | No | Browser thank-you page after payment — **not** a webhook URL |
| `forwardWebhookUrl` | No | Your backend receives a **POST** copy after this app processes the provider callback |
| `forwardWebhookSecret` | No | Bearer / header secret sent to `forwardWebhookUrl` (min 8 chars) |
| `swipePaymentMethod` | No | **Swipe only.** Sent as `payment_method` on Swipe create (e.g. `CDCP`, `QRIS`). Overrides `credentials.extra.paymentMethod` from store config. |
| `swipeDeviceUser` | No | **Swipe only.** Sent as `device_user` on Swipe create — registered store ID at Swipe. Overrides `credentials.extra.deviceUser` from store config. |
| `device_user` | No | **Swipe only.** Alias for `swipeDeviceUser` (same field as Swipe API). If both are sent, `swipeDeviceUser` wins. |

**Swipe `device_user` behavior:**

- **Default (recommended):** omit `swipeDeviceUser` / `device_user` in the checkout body. The app uses `credentials.extra.deviceUser` saved during initial store configuration (`POST /api/config`).
- **Per-request override:** pass `swipeDeviceUser` or `device_user` when a trusted backend needs a different registered store ID for a single transaction (uncommon; most integrations rely on config only).
- On Swipe create, the value is sent in the outbound JSON as `"device_user": "<value>"` together with `client_id`, `payment_method`, `invoice_number`, `callback_url`, etc.

**Example — Swipe checkout (uses `device_user` from store config):**

```json
{
  "shop": "example.myshopify.com",
  "provider": "swipe",
  "amount": 30,
  "currency": "IDR",
  "orderId": "order6687782928520",
  "swipePaymentMethod": "CDCP"
}
```

**Example — Swipe checkout with explicit `device_user` override:**

```json
{
  "shop": "example.myshopify.com",
  "provider": "swipe",
  "amount": 30,
  "currency": "IDR",
  "orderId": "order6687782928520",
  "swipePaymentMethod": "CDCP",
  "device_user": "merchanttest02"
}
```

The Swipe callback webhook may echo the same `device_user` in its payload (e.g. alongside `response_code`, `invoice_number`, `status`).

**Two-URL pattern (recommended):**

1. Swipe → `{HOST}/webhooks/payment/swipe?shop=...` (always; updates status + `/api/payment-status`)
2. This app → `forwardWebhookUrl` (your ERP/WP/ngrok) with JSON `{ "event": "payment.updated", ... }`

**Response:** `{ "ok": true, "paymentUrl": "...", "providerReference": "..." }` on success.

**Requirements:** Store config for `shop` must already exist (saved via embedded app or your own process). `provider` in the body should match how the store is configured, or provider plugins may error.

**Security:** Treat the secret like a root API key. Rotate `BRIDGE_CHECKOUT_API_SECRET` separately from `APP_SHARED_SECRET` if you want least privilege (only checkout creation).

### 1.5 Invoice / Swipe payload mirror (`InvStatus`)

| Method | Path | Auth |
|--------|------|------|
| `GET` | `{BASE}/InvStatus` | **Shared secret** |
| `GET` | `{BASE}/InvStatus/` | **Shared secret** (trailing slash supported) |
| `POST` | `{BASE}/InvStatus` | **Shared secret** |
| `POST` | `{BASE}/InvStatus/` | **Shared secret** |

**Secret used (first non-empty):** `INV_STATUS_API_SECRET`, then `PAYMENT_STATUS_API_SECRET`, then `APP_SHARED_SECRET`.

**Accepted auth (any one):**

- Header `Authorization: Bearer <secret>`
- Header `X-Inv-Status-Secret: <secret>`
- Query or JSON body field `secret` (for `POST`, in JSON body)

**Parameters:** `shop`, and invoice / order reference (`invoice_number`, `orderReference`, or `merchant_reference`). Optional `limit` (default 50, max 500).

See inline API comment in `src/routes/inv-status.ts` for the full contract.

---

## 2. Webhooks — called by payment providers or Shopify

### 2.1 Provider payment webhooks (callback to this app)

| Method | Path | Auth |
|--------|------|------|
| `POST` | `{BASE}/webhooks/payment/:provider/:shop` | Provider payload (URL-encoded `:shop`) |
| `POST` | `{BASE}/webhooks/payment/:provider` | Same; `shop` in query string or JSON body |

Examples: `:provider` = `swipe`, `xendit`, `midtrans`, etc. Your payment provider must be configured to POST to these URLs.

### 2.2 Shopify mandatory / optional webhooks

| Method | Path | Auth |
|--------|------|------|
| `POST` | `{BASE}/webhooks/shopify/customers/data_request` | **Shopify HMAC** |
| `POST` | `{BASE}/webhooks/shopify/customers/redact` | **Shopify HMAC** |
| `POST` | `{BASE}/webhooks/shopify/shop/redact` | **Shopify HMAC** |
| `POST` | `{BASE}/webhooks/shopify/orders-paid` | **Shopify HMAC** |
| `POST` | `{BASE}/webhooks/shopify/orders-create` | **Shopify HMAC** |
| `POST` | `{BASE}/webhooks/` | **Shopify HMAC** (generic compliance path; topic from headers) |

Register these URLs in the Shopify Partner Dashboard where required. Verification uses `X-Shopify-Hmac-Sha256` and `SHOPIFY_API_SECRET`.

---

## 3. No Shopify session JWT — payment session bridge (security note)

Prefer **`POST /api/bridge/checkout/create`** (§1.4) when you need a **general** checkout URL with **shared-secret** auth. The routes below have **no** shared-secret check in code today.

These routes are **not** protected by `verifyShopifySessionToken` in `src/app.ts`. They are suitable for **server-side** orchestration (e.g. Payments Apps flow calling your backend), but **must not** be exposed to the open internet without your own layer (API key, HMAC, IP allowlist, or private network).

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `{BASE}/api/shopify/payment-sessions` | Create a payment session and return `next_action.redirect_url` to the provider checkout. Requires store config already saved for `shop`. |
| `POST` | `{BASE}/api/shopify/payment-sessions/:id/resolve` | Mark session resolved (stub-style response in current implementation). |
| `POST` | `{BASE}/api/shopify/payment-sessions/:id/reject` | Mark session rejected (stub-style response). |

**Body (create):** JSON with `shop`, `amount`, `currency`; optional `id` / `gid` (payment session GID), `orderId`, `customer.email`, `swipePaymentMethod`, `swipeDeviceUser` / `device_user` (Swipe only — same semantics as §1.4; defaults to store config when omitted).

### 3.1 Demo-only Swipe checkout helper

| Method | Path | Auth |
|--------|------|------|
| `POST` | `{BASE}/checkout/like/swipe/create` | **None** in current code |

Creates a Swipe checkout for a configured store. **Treat as demo / internal** unless you add authentication in front of it.

---

## 4. Open read-only / OAuth / static UI (not payment APIs)

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `{BASE}/api/system/status` | Server and storage metadata (read-only JSON). |
| `GET` | `{BASE}/auth/shopify?shop=<shop>.myshopify.com` | Starts Shopify OAuth install (redirect). |
| `GET` | `{BASE}/auth/callback` | OAuth callback. |
| `GET` | `{BASE}/auth/shopify/callback` | OAuth callback (alias). |
| `GET` | `{BASE}/auth/shopify/status` | Install status (also `.../status/:shop`). |
| `GET` | `{BASE}/` | Config UI HTML. |
| `GET` | `{BASE}/app` | Same UI (embedded app entry). |
| `GET` | `{BASE}/sandbox/pay` | Redirects to UAT checkout simulator. |
| `GET` | `{BASE}/uat/checkout` | UAT checkout page. |
| `GET` | `{BASE}/checkout/like` | Demo checkout-like page. |
| `GET` | `{BASE}/pay/edc-pending` | EDC pending info page (query params for display). |

Static assets under `{BASE}/` are served from the `public/` directory.

---

## 5. Not for arbitrary public clients (Shopify session JWT required)

These require **`Authorization: Bearer <Shopify session token>`** (App Bridge). Use from the embedded app or from tooling that can obtain that JWT — **not** as a generic public payment API.

| Prefix | Examples |
|--------|----------|
| `{BASE}/api/config` | `POST /`, `GET /`, `GET /:shop` |
| `{BASE}/api/payments` | `POST /checkout/create`, `POST /swipe/test-request`, `GET /swipe/transaction-log` |

Embedded `POST /api/payments/checkout/create` accepts the same checkout body fields as §1.4 (including optional `swipePaymentMethod`, `swipeDeviceUser`, and `device_user` for Swipe). It does **not** support `forwardWebhookUrl` / `forwardWebhookSecret` — use the bridge endpoint (§1.4) for server-to-server forward webhooks.
| `{BASE}/api/compliance` | `GET /requests`, `GET /requests/:id` |

---

## Suggested integration pattern (external “method” → this app)

1. **Configure store (once):** save Swipe credentials via embedded `POST /api/config`, including `credentials.extra.deviceUser`, `clientId`, `apiBaseUrl`, `createPath`, etc.
2. **Start payment (recommended for non-embedded backends):** `POST {BASE}/api/bridge/checkout/create` with shared secret (§1.4). Same result shape as embedded checkout create (`paymentUrl`, `providerReference`). For Swipe, omit `device_user` in the body unless you need a per-request override.
3. **Alternative (Shopify payment session shape):** `POST {BASE}/api/shopify/payment-sessions` — add your own auth in front if exposed publicly (§3).
4. **Provider notifies result:** Provider POSTs to `{BASE}/webhooks/payment/<provider>/<shop>` (Swipe: `{BASE}/webhooks/payment/swipe?shop=...`).
5. **Your server checks status:** `GET {BASE}/api/payment-status` with shared secret + `shop` + `orderReference` (or Shopify order id).
6. **Deep audit of Swipe payloads:** `GET` or `POST {BASE}/InvStatus` with the InvStatus secret.

---

## Environment variables (quick reference)

| Variable | Used by |
|----------|---------|
| `APP_SHARED_SECRET` | Fallback for payment status, InvStatus, and bridge checkout; required for app bootstrap in `env.ts`. |
| `PAYMENT_STATUS_API_SECRET` | Overrides secret for `/api/payment-status` when set; also used as fallback for bridge checkout and InvStatus when their dedicated vars are unset. |
| `INV_STATUS_API_SECRET` | Overrides secret for `/InvStatus` when set. |
| `BRIDGE_CHECKOUT_API_SECRET` | Overrides secret for `POST /api/bridge/checkout/create` when set. |
| `SHOPIFY_API_SECRET` | Webhook HMAC verification (not the same as bridge Bearer secrets). |

See `.env.example` and `src/config/env.ts` for the full list.
