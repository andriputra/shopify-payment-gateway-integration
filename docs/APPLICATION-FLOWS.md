# Application Flow Diagrams

This document summarizes **all major flows** of the **ID O2O Multi Payment Gateway** app — from Shopify installation and merchant configuration through checkout creation, payment callbacks, and compliance.

**Related documents:**

- [README](../README.md) — setup, env, endpoint overview
- [PUBLIC-BRIDGE-API.md](./PUBLIC-BRIDGE-API.md) — server-to-server integration (bridge, InvStatus, payment-status)
- [SHOPIFY-PARTNER-TESTING.md](./SHOPIFY-PARTNER-TESTING.md) — credentials for App Store review

---

## Table of contents

1. [High-level architecture](#1-high-level-architecture)
2. [Shopify installation & OAuth](#2-shopify-installation--oauth)
3. [Merchant configuration (gateway credentials)](#3-merchant-configuration-gateway-credentials)
4. [Checkout creation entry points](#4-checkout-creation-entry-points)
5. [Checkout flow by provider](#5-checkout-flow-by-provider)
6. [Swipe (EDC) flow — detail](#6-swipe-edc-flow--detail)
7. [Payment provider webhooks](#7-payment-provider-webhooks)
8. [Shopify payment session (Payments Apps API)](#8-shopify-payment-session-payments-apps-api)
9. [Manual payment — orders/create webhook](#9-manual-payment--orderscreate-webhook)
10. [Bridge API (server-to-server)](#10-bridge-api-server-to-server)
11. [Status polling & payload audit](#11-status-polling--payload-audit)
12. [Shopify compliance webhooks (GDPR)](#12-shopify-compliance-webhooks-gdpr)
13. [Data storage](#13-data-storage)
14. [Endpoint summary by flow](#14-endpoint-summary-by-flow)

---

## 1. High-level architecture

```mermaid
flowchart TB
  subgraph Shopify["Shopify"]
    Admin["Shopify Admin\n(embedded app)"]
    Checkout["Shopify Checkout / Order"]
    ShopifyWH["Shopify Webhooks\n(compliance, orders)"]
  end

  subgraph App["Payment Gateway Bridge App"]
    UI["Dashboard UI\n/ , /app"]
    API["Express API\n/api/*"]
    Auth["OAuth + Session JWT"]
    PSvc["PaymentService"]
    Providers["Providers\nxendit | midtrans | swipe | sandbox"]
    Storage["Storage\nJSON dev / MySQL prod"]
  end

  subgraph External["Third parties"]
    PG["Payment Gateway API\n(Xendit, Midtrans, Swipe)"]
    MerchantBE["Merchant backend\n(bridge client)"]
  end

  Admin --> UI
  UI --> Auth
  Auth --> API
  Checkout --> API
  API --> PSvc
  PSvc --> Providers
  Providers --> PG
  PG -->|callback| API
  MerchantBE -->|shared secret| API
  API --> Storage
  ShopifyWH -->|HMAC| API
  PSvc -->|GraphQL| Shopify
```



**Key roles:**


| Component                | Purpose                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------- |
| **Embedded UI** (`/app`) | Merchant enters gateway credentials, OAuth, demo checkout                               |
| **PaymentService**       | Orchestrates checkout creation + webhook handling                                       |
| **Providers**            | Adapters for Xendit, Midtrans, Swipe, Sandbox                                           |
| **Storage**              | Store config, OAuth tokens, payment session context, redirect records, compliance audit |


---

## 2. Shopify installation & OAuth

```mermaid
sequenceDiagram
  autonumber
  actor Merchant
  participant UI as App UI /app
  participant Auth as GET /auth/shopify
  participant Shopify as Shopify OAuth
  participant CB as GET /auth/callback
  participant DB as shopify_tokens

  Merchant->>UI: Open app (embedded) with ?shop=...&host=...
  alt No OAuth token yet
    UI->>Auth: Connect Shopify (redirect)
    Auth->>Shopify: /admin/oauth/authorize?client_id&scope&redirect_uri&state
    Shopify->>Merchant: Approve permissions
    Shopify->>CB: code, hmac, state, shop, host
    CB->>CB: Verify HMAC + state
    CB->>Shopify: Exchange code → access_token
    CB->>DB: Save token + scope
    CB->>UI: Redirect /app?installed=1&shop=...&host=...
  else Already installed
    UI->>UI: Render dashboard (App Bridge session token)
  end
```



**Notes:**

- Tokens are stored per shop (`shopify_tokens`).
- Embedded APIs are protected with `**Authorization: Bearer <session JWT>`** (App Bridge), verified using `SHOPIFY_API_SECRET`.
- Check install status: `GET /auth/shopify/status/:shop`.

---

## 3. Merchant configuration (gateway credentials)

```mermaid
sequenceDiagram
  autonumber
  actor Merchant
  participant UI as Dashboard /app
  participant API as POST /api/config
  participant DB as store_configs

  Merchant->>UI: Enter shop, provider, API key, redirect URL, webhook URL
  Note over UI: Swipe: extra clientId, deviceUser, apiBaseUrl, createPath, ...
  UI->>API: Bearer session JWT + JSON body
  API->>API: Zod validation (shop, provider, credentials, ...)
  API->>DB: upsert store_configs
  API->>UI: { ok: true, config }
```



**Data stored per store:**


| Field                  | Description                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `shop`                 | Merchant domain                                                                    |
| `provider`             | `xendit` | `midtrans` | `swipe` | `sandbox` | `custom`                             |
| `credentials.apiKey`   | Provider API key / merchant ID                                                     |
| `credentials.extra.`*  | Swipe: `clientId`, `deviceUser`, `apiBaseUrl`, `createPath`, `paymentMethod`, etc. |
| `redirectUrlAfterPaid` | Browser URL after successful payment                                               |
| `webhookUrlAfterPaid`  | Optional override for provider callback URL                                        |


**Endpoints:** `POST /api/config` (JWT) · `GET /api/config/:shop` (JWT)

---

## 4. Checkout creation entry points

A single checkout transaction can be **started** from several paths:

```mermaid
flowchart LR
  subgraph Embedded["Embedded app (JWT)"]
    A1["POST /api/payments/checkout/create"]
    A2["POST /api/payments/swipe/test-request"]
  end

  subgraph Bridge["Server-to-server (shared secret)"]
    B1["POST /api/bridge/checkout/create"]
  end

  subgraph ShopifyAPI["Shopify-style (no JWT)"]
    C1["POST /api/shopify/payment-sessions"]
  end

  subgraph ShopifyWH["Shopify webhook HMAC"]
    D1["POST /webhooks/shopify/orders-create"]
  end

  subgraph Demo["Demo / UAT"]
    E1["POST /checkout/like/swipe/create"]
    E2["Sandbox UI /uat/checkout"]
  end

  A1 --> PSvc["PaymentService.createCheckout"]
  A2 --> PSvc
  B1 --> PSvc
  C1 --> PSvc
  D1 --> PSvc
  E1 --> PSvc
```



All paths above (except the pure sandbox UI) eventually call `**PaymentService.createCheckout**`, which:

1. Loads `store_configs` for the shop
2. Calls the matching provider
3. Saves a `**payment_redirects**` record (status `pending`) for status polling

---

## 5. Checkout flow by provider

```mermaid
flowchart TB
  Start(["createCheckout"]) --> LoadConfig["Load store_configs"]
  LoadConfig --> Provider{provider?}

  Provider -->|xendit| X["POST Xendit /v2/invoices"]
  Provider -->|midtrans| M["POST Midtrans /v2/snap"]
  Provider -->|swipe| S["POST Swipe create API\n(EDC / terminal)"]
  Provider -->|sandbox| SB["Redirect to /uat/checkout"]

  X --> XUrl["paymentUrl = invoice_url"]
  M --> MUrl["paymentUrl = redirect_url"]
  S --> SUrl["paymentUrl = EDC pending page\nor URL from Swipe response"]
  SB --> SBUrl["paymentUrl = UAT simulator"]

  XUrl --> Save["Upsert payment_redirects\nstatus: pending"]
  MUrl --> Save
  SUrl --> Save
  SBUrl --> Save

  Save --> Return["Response: paymentUrl,\nproviderReference,\nreturnUrlAfterPaid"]
```




| Provider     | `paymentUrl` behavior                     | Webhook callback                        |
| ------------ | ----------------------------------------- | --------------------------------------- |
| **Xendit**   | Xendit invoice page                       | `POST /webhooks/payment/xendit/:shop`   |
| **Midtrans** | Snap redirect                             | `POST /webhooks/payment/midtrans/:shop` |
| **Swipe**    | EDC pending page or terminal instructions | `POST /webhooks/payment/swipe?shop=...` |
| **Sandbox**  | Local simulator                           | `POST /webhooks/payment/sandbox/:shop`  |


---

## 6. Swipe (EDC) flow — detail

`device_user`, `client_id`, and other Swipe credentials come from the **initial configuration** (`credentials.extra`). On create, the app sends this body to the Swipe API:

```json
{
  "pos_request_type": "Postman",
  "request_id": "ReqId-...",
  "client_id": "<from config>",
  "device_user": "<from config>",
  "payment_method": "CDCP",
  "invoice_number": "INV-<orderId>",
  "amount": 30,
  "callback_url": "https://{HOST}/webhooks/payment/swipe?shop=...",
  "additional_param": { "fee_agent_amount": 0, ... }
}
```

```mermaid
sequenceDiagram
  autonumber
  participant App
  participant Swipe as Swipe API
  participant EDC as EDC Terminal
  participant WH as POST /webhooks/payment/swipe
  participant Shopify as Shopify GraphQL

  App->>Swipe: create (invoice_number, amount, callback_url, device_user, ...)
  Swipe->>EDC: Payment instruction on terminal
  Note over EDC: Customer tap / insert card
  EDC->>Swipe: Settlement
  Swipe->>WH: Callback JSON (response_code 0020, status OK, invoice_number, ...)
  WH->>WH: parseWebhook → paid = true
  WH->>WH: Update payment_redirects → paid
  alt Payment session context exists
    WH->>Shopify: paymentSessionResolve (Payments API)
  end
  alt Manual payment (shopifyOrderId stored)
    WH->>Shopify: orderMarkAsPaid (Admin GraphQL)
  end
  opt forwardWebhookUrl set at create
    WH->>WH: POST forward to merchant backend
  end
```



**Swipe success criteria (`paid`):**

- `response_code` = `00`, `000`, or `0020`
- `status` = `OK`
- `message` contains `APPROVED`

**Order matching:** the `invoice_number` key (e.g. `INV-order6687782928520`) must match the value sent at create time.

---

## 7. Payment provider webhooks

```mermaid
flowchart TB
  WH(["POST /webhooks/payment/:provider/:shop\nor /payment/:provider?shop=..."]) --> Parse["PaymentService.handleWebhook\n→ provider.parseWebhook"]
  Parse --> Paid{paid?}

  Paid -->|Yes| Update["mergeUpdate payment_redirects\nstatus: paid"]
  Paid -->|No| Fail["status: failed / pending"]

  Update --> Ctx{Session context\nfor orderRef?}
  Ctx -->|Yes| Resolve["paymentSessionResolve\n(Payments Apps GraphQL)"]
  Ctx -->|No| Skip1[skip]

  Update --> Manual{shopifyOrderId\nin payment_redirects?}
  Manual -->|Yes| MarkPaid["orderMarkAsPaid\n(Admin GraphQL)"]
  Manual -->|No| Skip2[skip]

  Update --> Fwd{forwardWebhookUrl?}
  Fwd -->|Yes| Forward["POST payment.updated\nto merchant backend"]
  Fwd -->|No| Skip3[skip]

  Update --> Log["Log Swipe transaction\n(if provider=swipe)"]
  Log --> Resp["JSON response\nok, paid, redirectUrl, ..."]
```



**Example Swipe callback (after EDC payment):**

```json
{
  "response_code": "0020",
  "status": "OK",
  "message": "SALE APPROVED.",
  "invoice_number": "INV-order6687782928520",
  "payment_method": "CDCP",
  "device_user": "merchanttest02",
  "approval_code": "R33769",
  "masked_pan": "542640****1588"
}
```

---

## 8. Shopify payment session (Payments Apps API)

This flow mirrors the **Payments Apps API** — Shopify (or an integrator) creates a payment session; the app returns a redirect URL to the gateway.

```mermaid
sequenceDiagram
  autonumber
  participant Shopify
  participant API as POST /api/shopify/payment-sessions
  participant PSvc as PaymentService
  participant DB as payment_session_contexts

  Shopify->>API: { shop, amount, currency, id/gid, orderId?, swipePaymentMethod? }
  API->>API: Load store_configs
  API->>DB: Save paymentSessionId ↔ orderRef context
  API->>PSvc: createCheckout (provider from config)
  PSvc->>API: paymentUrl
  API->>Shopify: 201 { payment_session: { state: pending, next_action: { redirect_url } } }

  Note over Shopify: Buyer pays at provider

  Shopify->>API: Provider webhook → paid
  API->>Shopify: paymentSessionResolve
  API->>DB: Delete session context
```



**Related endpoints:**


| Method | Path                                        | Description               |
| ------ | ------------------------------------------- | ------------------------- |
| `POST` | `/api/shopify/payment-sessions`             | Create session + checkout |
| `POST` | `/api/shopify/payment-sessions/:id/resolve` | Stub resolve (testing)    |
| `POST` | `/api/shopify/payment-sessions/:id/reject`  | Stub reject (testing)     |


Production resolve is actually triggered from the **provider webhook** via `ShopifyPaymentResolveService`.

---

## 9. Manual payment — orders/create webhook

For manual payment methods in Shopify (order `financial_status: pending`), the app can automatically trigger Swipe create when an order is created.

```mermaid
sequenceDiagram
  autonumber
  participant Shopify
  participant WH as POST /webhooks/shopify/orders-create
  participant PSvc as PaymentService
  participant DB as payment_redirects

  Shopify->>WH: orders/create (HMAC verified)
  WH->>WH: Skip if financial_status ≠ pending
  WH->>WH: Skip if provider ≠ swipe
  WH->>WH: Read note_attributes → swipePaymentMethod (optional)
  WH->>PSvc: createCheckout (orderRef = order_{id})
  PSvc->>WH: paymentUrl
  WH->>DB: Save shopifyOrderId + pending
  WH->>Shopify: 200 OK

  Note over Shopify: After Swipe callback paid
  WH->>Shopify: orderMarkAsPaid
```



---

## 10. Bridge API (server-to-server)

For merchant backends **without** a Shopify session JWT — see [PUBLIC-BRIDGE-API.md](./PUBLIC-BRIDGE-API.md) for details.

```mermaid
sequenceDiagram
  autonumber
  actor Backend as Merchant backend
  participant Bridge as POST /api/bridge/checkout/create
  participant PSvc as PaymentService
  participant Swipe
  participant WH as App webhook
  participant Backend2 as forwardWebhookUrl

  Backend->>Bridge: shared secret + checkout body\n(+ optional forwardWebhookUrl)
  Bridge->>PSvc: createCheckout
  PSvc->>Swipe: create payment
  Bridge->>Backend: { paymentUrl, providerReference }

  Swipe->>WH: callback paid
  WH->>Backend2: POST payment.updated (if forwardWebhookUrl is set)
  Backend->>Bridge: GET /api/payment-status?secret=...&shop=...&orderReference=...
  Bridge->>Backend: { status: paid, ... }
```



**Two-URL pattern (recommended for Swipe):**

1. **Swipe → app:** `{HOST}/webhooks/payment/swipe?shop=...` (required; updates internal status)
2. **App → merchant backend:** `forwardWebhookUrl` (optional; ERP/WP notification)

---

## 11. Status polling & payload audit

```mermaid
flowchart LR
  subgraph Poll["Polling (shared secret)"]
    P1["GET /api/payment-status"]
    P2["GET /api/payment-status/swipe-response-codes"]
    P3["GET|POST /InvStatus"]
  end

  subgraph Data["Data sources"]
    R["payment_redirects\nstatus, amount, swipe codes"]
    L["swipe_payload_records\nraw create + webhook body"]
  end

  P1 --> R
  P3 --> L
```




| Endpoint                  | Auth                                              | Purpose                                    |
| ------------------------- | ------------------------------------------------- | ------------------------------------------ |
| `GET /api/payment-status` | `APP_SHARED_SECRET` / `PAYMENT_STATUS_API_SECRET` | Check `pending` / `paid` / `failed` status |
| `GET /InvStatus`          | `INV_STATUS_API_SECRET` / shared secret           | Audit raw Swipe payload per invoice        |


The embedded app also exposes `GET /api/payments/swipe/transaction-log` (JWT) for Swipe transaction logs per shop.

---

## 12. Shopify compliance webhooks (GDPR)

All Shopify webhooks are verified with `**X-Shopify-Hmac-Sha256**`.

```mermaid
flowchart TB
  Shopify["Shopify compliance webhook"] --> HMAC{"HMAC valid?"}
  HMAC -->|No| E401["401 Invalid HMAC"]
  HMAC -->|Yes| Topic{topic?}

  Topic -->|customers/data_request| DR["Record audit\n(no customer PII stored)"]
  Topic -->|customers/redact| CR["Record audit\n(PII no-op)"]
  Topic -->|shop/redact| SR["Delete store_configs,\nshopify_tokens,\npayment_session_contexts\n+ record audit"]

  DR --> Audit["compliance_requests"]
  CR --> Audit
  SR --> Audit

  Audit --> OK["200 OK"]
```



**URLs:**

- `POST /webhooks/shopify/customers/data_request`
- `POST /webhooks/shopify/customers/redact`
- `POST /webhooks/shopify/shop/redact`
- `POST /webhooks` (generic compliance router)

Audit records are available at `GET /api/compliance/requests` (JWT).

---

## 13. Data storage

```mermaid
erDiagram
  store_configs ||--o{ payment_redirects : "shop"
  shopify_tokens ||--o{ payment_redirects : "shop"
  payment_session_contexts }o--|| payment_redirects : "orderReference"
  compliance_requests }o--|| store_configs : "shop audit"

  store_configs {
    string shop PK
    string provider
    json credentials
    string redirect_url_after_paid
  }

  shopify_tokens {
    string shop PK
    string access_token
    string scope
  }

  payment_redirects {
    string shop
    string order_reference
    string status
    string payment_url
    string shopify_order_id
  }

  payment_session_contexts {
    string order_reference PK
    string payment_session_id
  }

  compliance_requests {
    string id PK
    string topic
    string shop
  }
```




| Driver           | Env                    | Location                              |
| ---------------- | ---------------------- | ------------------------------------- |
| **JSON** (dev)   | `STORAGE_DRIVER=json`  | `./data/*.json`                       |
| **MySQL** (prod) | `STORAGE_DRIVER=mysql` | Tables in `database/mysql-schema.sql` |


Init: `npm run db:init` · JSON→MySQL migration: `npm run migrate:mysql`

---

## 14. Endpoint summary by flow

### Installation & admin (embedded JWT)


| Flow             | Method | Path                            |
| ---------------- | ------ | ------------------------------- |
| OAuth start      | `GET`  | `/auth/shopify?shop=`           |
| OAuth callback   | `GET`  | `/auth/callback`                |
| Save config      | `POST` | `/api/config`                   |
| Create checkout  | `POST` | `/api/payments/checkout/create` |
| System status    | `GET`  | `/api/system/status`            |
| Compliance audit | `GET`  | `/api/compliance/requests`      |


### Payments & webhooks


| Flow                       | Method | Path                                |
| -------------------------- | ------ | ----------------------------------- |
| Payment session            | `POST` | `/api/shopify/payment-sessions`     |
| Provider webhook           | `POST` | `/webhooks/payment/:provider/:shop` |
| Swipe webhook (query shop) | `POST` | `/webhooks/payment/swipe?shop=`     |
| Order paid (Shopify)       | `POST` | `/webhooks/shopify/orders-paid`     |
| Order create → Swipe       | `POST` | `/webhooks/shopify/orders-create`   |


### Bridge & polling (shared secret)


| Flow                | Method       | Path                          |
| ------------------- | ------------ | ----------------------------- |
| Bridge checkout     | `POST`       | `/api/bridge/checkout/create` |
| Payment status      | `GET`        | `/api/payment-status`         |
| Swipe payload audit | `GET`/`POST` | `/InvStatus`                  |


### Demo / UAT


| Flow                  | Method | Path             |
| --------------------- | ------ | ---------------- |
| Sandbox simulator     | `GET`  | `/uat/checkout`  |
| Checkout like Shopify | `GET`  | `/checkout/like` |
| Bridge docs HTML      | `GET`  | `/docs/bridge`   |


---

## End-to-end diagram (Swipe + Shopify happy path)

```mermaid
sequenceDiagram
  autonumber
  actor Merchant
  actor Buyer
  participant Shopify
  participant App
  participant Swipe
  participant EDC

  Merchant->>App: Install OAuth + POST /api/config (Swipe credentials)
  Buyer->>Shopify: Checkout / place order (pending)
  Shopify->>App: orders/create webhook OR payment-sessions OR checkout/create
  App->>Swipe: create (invoice_number, device_user from config, callback_url)
  Swipe->>EDC: Charge
  Buyer->>EDC: Pay
  EDC->>Swipe: Approved
  Swipe->>App: webhook (0020, OK, invoice_number)
  App->>App: payment_redirects = paid
  App->>Shopify: paymentSessionResolve / orderMarkAsPaid
  Buyer->>Shopify: Order confirmed / thank you
```



---

*Last updated 30-05-2026*