# Shopify Payment Gateway Integration
<img width="1920" height="919" alt="screencapture-admin-shopify-store-dynostore-ev8cih63-apps-id-o2o-multi-payment-gateway-app-2026-05-09-11_30_52" src="https://github.com/user-attachments/assets/3803a366-b392-4c83-aac9-ea93f0588054" />
<img width="1920" height="1742" alt="FireShot Capture 207 - Shopify Payment Gateway Config -  dynapp store" src="https://github.com/user-attachments/assets/66cb83bd-2579-4ded-a701-bfa3942eb84d" />

A starter backend + frontend for integrating payment gateways with Shopify using this flow:

1. Merchant enters provider credentials (API key/secret)
2. Merchant saves webhook URL + redirect URL after successful payment
3. Checkout is created through the bridge endpoint
4. Provider sends payment status webhooks
5. Bridge returns a redirect URL to the Shopify success page

Built-in providers: `xendit`, `midtrans`, `swipe`, and `sandbox` (no provider account required). The architecture is pluggable so additional providers can be added quickly.

**Full flow diagrams:** see [`docs/APPLICATION-FLOWS.md`](docs/APPLICATION-FLOWS.md)

## Configuration UI

After the server is running, open:

`http://localhost:3000`

The page provides a form to:

- Enter shop domain
- Select provider (Xendit / Midtrans / Swipe / Sandbox / Custom)
- Enter API key / API secret
- Enter redirect URL after successful payment
- Enter webhook URL
- Trigger Shopify OAuth install

### Demo presentation (no gateway account)

1. Select provider `sandbox` in the UI.
2. Save merchant configuration.
3. Click **Create Test Checkout**.
4. A simulator tab opens — click **Pay Success** or **Pay Failed**.
5. Payment status is shown and, on success, redirects to the success URL.

## Tech stack

- Node.js + Express
- TypeScript
- Zod validation
- Flexible storage driver: JSON for dev, MySQL for production

## Run the project

```bash
npm install
cp .env.example .env
npm run dev
```

Additional production templates for cPanel:

- `.env.cpanel.production.example`
- [`DEPLOY-CPANEL.md`](DEPLOY-CPANEL.md)
- `database/mysql-schema.sql`

## Environment variables

```env
PORT=3000
HOST=http://localhost:3000
STORAGE_DRIVER=json
DATA_DIR=./data
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=secret
MYSQL_DATABASE=shopify_gateway
MYSQL_CONNECTION_LIMIT=10
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
APP_SHARED_SECRET=replace_with_random_secret
SHOPIFY_SCOPES=read_orders,write_payment_sessions
SHOPIFY_REDIRECT_PATH=/auth/callback
SHOPIFY_APP_UI_PATH=/app
```

Or use a single DSN:

```env
MYSQL_URL=mysql://user:password@host:3306/database
```

## Shopify integration baseline

This project includes a Shopify integration foundation:

- OAuth install: `GET /auth/shopify?shop=<shop-domain>`
- OAuth callback: `GET /auth/callback` (legacy alias: `GET /auth/shopify/callback`)
- Check install/token status: `GET /auth/shopify/status/:shop`
- Post-install redirect to dashboard: `GET /app`
- Payment session style endpoints (sandbox redirect):
  - `POST /api/shopify/payment-sessions`
  - `POST /api/shopify/payment-sessions/:id/resolve`
  - `POST /api/shopify/payment-sessions/:id/reject`
- Shopify webhook HMAC verification:
  - `POST /webhooks/shopify/orders-paid`
  - `POST /webhooks/shopify/orders-create`
  - `POST /webhooks/shopify/customers/data_request`
  - `POST /webhooks/shopify/customers/redact`
  - `POST /webhooks/shopify/shop/redact`

OAuth tokens are stored locally in:

- `data/shopify-tokens.json`
- Compliance webhook audit: `data/compliance-requests.json`

When `STORAGE_DRIVER=mysql`, main data is stored in MySQL tables:

- `store_configs`
- `shopify_tokens`
- `payment_session_contexts`
- `compliance_requests`
- `payment_redirects`

## Mandatory Shopify app URLs

For Shopify review / app approval, configure these URLs:

- App URL / dashboard: `https://your-domain.com/app`
- Allowed redirection URL: `https://your-domain.com/auth/callback`
- Compliance webhook `customers/data_request`: `https://your-domain.com/webhooks/shopify/customers/data_request`
- Compliance webhook `customers/redact`: `https://your-domain.com/webhooks/shopify/customers/redact`
- Compliance webhook `shop/redact`: `https://your-domain.com/webhooks/shopify/shop/redact`

All Shopify webhooks in this project are verified using the `X-Shopify-Hmac-Sha256` header.
Audit / test results are available at:

- `GET /api/compliance/requests`
- `GET /api/compliance/requests/:id`

For **server-to-server** integration (without embedded Shopify Admin), see **`docs/PUBLIC-BRIDGE-API.md`** — including `POST /api/bridge/checkout/create` (shared secret, same checkout logic as the embedded endpoint). Browser HTML version: **`/docs/bridge`** (e.g. `https://your-domain.com/docs/bridge`).

## App Store testing credentials (Partner Dashboard)

When submitting for review, fill in **App testing information** with a **development store** login (not a separate app login).

Full guide (copy/paste for Username / Password / Account description):

**[`docs/SHOPIFY-PARTNER-TESTING.md`](docs/SHOPIFY-PARTNER-TESTING.md)**

In short: create a staff account on the dev store (no 2FA / no Google SSO), install the app, provide that staff email + password, and direct reviewers to **Admin → Apps → ID O2O Multi Payment Gateway**.

## API endpoints

### 1) Save store configuration

`POST /api/config`

```json
{
  "shop": "example-shop.myshopify.com",
  "provider": "xendit",
  "redirectUrlAfterPaid": "https://example-shop.myshopify.com/thank-you",
  "webhookUrlAfterPaid": "https://yourapp.com/webhooks/payment/xendit/example-shop.myshopify.com",
  "credentials": {
    "apiKey": "xnd_development_key",
    "apiSecret": "optional_secret"
  }
}
```

### 2) Get store configuration

`GET /api/config/:shop`

### 3) Create checkout / payment link

`POST /api/payments/checkout/create`

```json
{
  "shop": "example-shop.myshopify.com",
  "provider": "xendit",
  "amount": 125000,
  "currency": "IDR",
  "orderId": "ORDER-1001",
  "customerEmail": "buyer@example.com",
  "returnUrl": "https://example-shop.myshopify.com/orders/1001"
}
```

For Swipe, `device_user` and other Swipe fields come from the initial store configuration (`credentials.extra`). Optional per-request override: `swipePaymentMethod` (e.g. `CDCP`, `QRIS`).

If `provider = "sandbox"`, the response `paymentUrl` points to the simulation page:

`/sandbox/pay?shop=...&orderId=...`

That page has **Pay Success** and **Pay Failed** buttons to test webhooks + redirect URL.

Response:

```json
{
  "ok": true,
  "paymentUrl": "https://checkout.xendit.co/web/...",
  "providerReference": "xnd_ORDER-1001"
}
```

### 4) Payment webhook

`POST /webhooks/payment/:provider/:shop`

Example:

`POST /webhooks/payment/xendit/example-shop.myshopify.com`

Response on success:

```json
{
  "ok": true,
  "paid": true,
  "providerReference": "inv-123",
  "redirectUrl": "https://example-shop.myshopify.com/thank-you"
}
```

## Add a new provider

1. Create a new provider file in `src/providers/` (e.g. `doku.ts`)
2. Implement the `PaymentProvider` interface:
   - `createCheckout(...)`
   - `parseWebhook(...)`
3. Register the provider in `src/providers/index.ts`

This structure lets Xendit, Midtrans, Swipe, and other providers plug in without changing the main flow.

## Local test flow

1. Run the app:

```bash
npm install
npm run dev
```

2. Open the app UI at:

`http://localhost:3000/app`

3. Expose the local server to the internet, e.g. with ngrok:

```bash
ngrok http 3000
```

4. In Shopify Partner Dashboard / App Setup, configure:

- App URL: `https://xxxx.ngrok-free.app/app`
- Allowed redirection URL: `https://xxxx.ngrok-free.app/auth/callback`
- Compliance webhook `customers/data_request`: `https://xxxx.ngrok-free.app/webhooks/shopify/customers/data_request`
- Compliance webhook `customers/redact`: `https://xxxx.ngrok-free.app/webhooks/shopify/customers/redact`
- Compliance webhook `shop/redact`: `https://xxxx.ngrok-free.app/webhooks/shopify/shop/redact`

5. Install from the UI:

- Open `https://xxxx.ngrok-free.app/app`
- Enter `shop.myshopify.com`
- Click **Connect Shopify (OAuth)**
- Expected flow: install → OAuth → callback → redirect to `/app?installed=1&shop=...`

6. Verify install token:

- Open `GET https://xxxx.ngrok-free.app/auth/shopify/status/<shop-domain>`
- Or check the success banner in the dashboard

7. Test compliance webhook manually from local:

PowerShell to generate HMAC and send the request:

```powershell
$secret = "YOUR_SHOPIFY_API_SECRET"
$body = '{"shop_id":42,"shop_domain":"demo-shop.myshopify.com","customer":{"id":777,"email":"buyer@example.com"},"orders_requested":[1001]}'
$hmac = [Convert]::ToBase64String(
  [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret)).ComputeHash([Text.Encoding]::UTF8.GetBytes($body))
)

Invoke-RestMethod `
  -Method Post `
  -Uri "https://xxxx.ngrok-free.app/webhooks/shopify/customers/data_request" `
  -ContentType "application/json" `
  -Headers @{
    "X-Shopify-Topic" = "customers/data_request"
    "X-Shopify-Hmac-Sha256" = $hmac
  } `
  -Body $body
```

8. Check audit results:

- `GET https://xxxx.ngrok-free.app/api/compliance/requests`
- For `shop/redact`, also check local data files such as `data/store-configs.json`, `data/shopify-tokens.json`, and `data/payment-session-contexts.json`

## Production test flow

1. Deploy the app to a public domain.
2. Set production environment variables:

- `HOST=https://your-app-domain.com`
- `STORAGE_DRIVER=mysql`
- `MYSQL_HOST=...`
- `MYSQL_PORT=3306`
- `MYSQL_USER=...`
- `MYSQL_PASSWORD=...`
- `MYSQL_DATABASE=...`
- `SHOPIFY_REDIRECT_PATH=/auth/callback`
- `SHOPIFY_APP_UI_PATH=/app`

3. Initialize MySQL schema:

```bash
npm run db:init
```

4. If you previously used JSON files, migrate the data:

```bash
npm run migrate:mysql
```

5. Build and run:

```bash
npm run build
npm start
```

6. Configure these URLs in Shopify Partner Dashboard:

- App URL: `https://your-app-domain.com/app`
- Allowed redirection URL: `https://your-app-domain.com/auth/callback`
- Compliance webhooks:
  - `https://your-app-domain.com/webhooks/shopify/customers/data_request`
  - `https://your-app-domain.com/webhooks/shopify/customers/redact`
  - `https://your-app-domain.com/webhooks/shopify/shop/redact`

7. Install the app on a development store / test merchant store.
8. After OAuth approval, confirm the browser returns to `/app` and the token is saved.
9. Test compliance webhooks:

- Trigger from Shopify Partner Dashboard if available in your environment.
- Or send a manually signed HMAC request to production as in the local example above.
- Verify `200 OK` response and audit at `GET /api/compliance/requests`.

## MySQL setup on cPanel

1. Create a new MySQL database in cPanel.
2. Create a MySQL user and assign full privileges to the database.
3. Enter host, port, database, username, and password in the app env.
4. Run `npm run db:init` from the app environment to create tables automatically.
5. For manual import, SQL schema is available at `database/mysql-schema.sql`.

See [`DEPLOY-CPANEL.md`](DEPLOY-CPANEL.md) for the full cPanel deployment guide.

## Current compliance behavior

- `customers/data_request`: records the request and summarizes local shop-related data without storing customer email/phone in the audit log.
- `customers/redact`: records the request; the app does not persist customer PII, so the result is a documented no-op.
- `shop/redact`: removes matching local shop data from `store-configs`, `shopify-tokens`, and `payment-session-contexts`, then logs the deletion result in the audit log.
