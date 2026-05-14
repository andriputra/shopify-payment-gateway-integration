# Shopify Payment Gateway Integration

Starter backend + frontend sederhana untuk integrasi payment gateway di Shopify dengan flow:

1. Merchant memasukkan credential provider (API key/secret)
2. Merchant menyimpan URL webhook + redirect setelah pembayaran sukses
3. Checkout dibuat melalui endpoint bridge
4. Provider kirim webhook status pembayaran
5. Bridge kembalikan URL redirect ke halaman sukses Shopify

Saat ini provider bawaan: `xendit`, `midtrans`, dan `sandbox` (tanpa akun provider). Arsitekturnya pluggable sehingga provider lain bisa ditambahkan cepat.

## UI Konfigurasi

Setelah server jalan, buka:

`http://localhost:3000`

Halaman ini menyediakan form untuk:
- Input shop domain
- Pilih provider (Xendit/Midtrans/Sandbox/Custom)
- Input API key / API secret
- Input redirect URL setelah pembayaran sukses
- Input webhook URL
- Trigger OAuth install Shopify

### Demo Presentasi (tanpa akun gateway)

1. Pilih provider `sandbox` di UI.
2. Simpan konfigurasi merchant.
3. Klik tombol **Create Test Checkout**.
4. Tab simulator akan terbuka, klik **Pay Success** atau **Pay Failed**.
5. Hasil status pembayaran akan tampil dan jika sukses akan redirect ke URL sukses.

## Tech Stack

- Node.js + Express
- TypeScript
- Zod validation
- Storage driver fleksibel: JSON untuk dev, MySQL untuk production

## Jalankan Project

```bash
npm install
cp .env.example .env
npm run dev
```

Template tambahan untuk production cPanel tersedia di:

- `.env.cpanel.production.example`
- `DEPLOY-CPANEL.md`
- `database/mysql-schema.sql`

## Environment Variables

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

Atau gunakan 1 DSN:

```env
MYSQL_URL=mysql://user:password@host:3306/database
```

## Shopify Integration Baseline

Project ini sekarang sudah punya fondasi integrasi Shopify:

- OAuth install: `GET /auth/shopify?shop=<shop-domain>`
- OAuth callback: `GET /auth/callback` (alias lama `GET /auth/shopify/callback`)
- Cek status install/token: `GET /auth/shopify/status/:shop`
- Redirect post-install ke dashboard: `GET /app`
- Payment session style endpoint (sandbox redirect):
  - `POST /api/shopify/payment-sessions`
  - `POST /api/shopify/payment-sessions/:id/resolve`
  - `POST /api/shopify/payment-sessions/:id/reject`
- Shopify webhook HMAC verification:
  - `POST /webhooks/shopify/orders-paid`
  - `POST /webhooks/shopify/customers/data_request`
  - `POST /webhooks/shopify/customers/redact`
  - `POST /webhooks/shopify/shop/redact`

Token OAuth disimpan lokal di:

- `data/shopify-tokens.json`
- Audit compliance webhook disimpan lokal di: `data/compliance-requests.json`

Jika `STORAGE_DRIVER=mysql`, data utama akan disimpan di tabel MySQL:

- `store_configs`
- `shopify_tokens`
- `payment_session_contexts`
- `compliance_requests`

## Mandatory Shopify App URLs

Untuk review/app approval Shopify, siapkan URL berikut:

- App URL / dashboard: `https://domain-anda.com/app`
- Allowed redirection URL: `https://domain-anda.com/auth/callback`
- Compliance webhook `customers/data_request`: `https://domain-anda.com/webhooks/shopify/customers/data_request`
- Compliance webhook `customers/redact`: `https://domain-anda.com/webhooks/shopify/customers/redact`
- Compliance webhook `shop/redact`: `https://domain-anda.com/webhooks/shopify/shop/redact`

Semua webhook Shopify di project ini diverifikasi memakai header `X-Shopify-Hmac-Sha256`.
Audit/testing result bisa dilihat di:

- `GET /api/compliance/requests`
- `GET /api/compliance/requests/:id`

Untuk integrasi **server-to-server** (tanpa embed Shopify Admin), lihat **`docs/PUBLIC-BRIDGE-API.md`** — termasuk `POST /api/bridge/checkout/create` (shared secret, sama fungsi checkout seperti endpoint embedded). Versi HTML di browser: **`/docs/bridge`** (mis. `https://domain-anda.com/docs/bridge`).

## API Endpoints

### 1) Simpan Konfigurasi Toko

`POST /api/config`

```json
{
  "shop": "contoh-shop.myshopify.com",
  "provider": "xendit",
  "redirectUrlAfterPaid": "https://contoh-shop.myshopify.com/thank-you",
  "webhookUrlAfterPaid": "https://yourapp.com/webhooks/payment/xendit/contoh-shop.myshopify.com",
  "credentials": {
    "apiKey": "xnd_development_key",
    "apiSecret": "optional_secret"
  }
}
```

### 2) Ambil Konfigurasi Toko

`GET /api/config/:shop`

### 3) Buat Checkout / Payment Link

`POST /api/payments/checkout/create`

```json
{
  "shop": "contoh-shop.myshopify.com",
  "provider": "xendit",
  "amount": 125000,
  "currency": "IDR",
  "orderId": "ORDER-1001",
  "customerEmail": "buyer@example.com",
  "returnUrl": "https://contoh-shop.myshopify.com/orders/1001"
}
```

Jika `provider = "sandbox"`, response `paymentUrl` akan mengarah ke halaman simulasi:

`/sandbox/pay?shop=...&orderId=...`

Di halaman itu ada tombol **Pay Success** dan **Pay Failed** untuk mengetes webhook + redirect URL.

Response:

```json
{
  "ok": true,
  "paymentUrl": "https://checkout.xendit.co/web/...",
  "providerReference": "xnd_ORDER-1001"
}
```

### 4) Webhook Pembayaran

`POST /webhooks/payment/:provider/:shop`

Contoh:

`POST /webhooks/payment/xendit/contoh-shop.myshopify.com`

Response bila status sukses:

```json
{
  "ok": true,
  "paid": true,
  "providerReference": "inv-123",
  "redirectUrl": "https://contoh-shop.myshopify.com/thank-you"
}
```

## Tambah Provider Baru

1. Buat file provider baru di `src/providers/` (mis. `doku.ts`)
2. Implement interface `PaymentProvider`:
   - `createCheckout(...)`
   - `parseWebhook(...)`
3. Daftarkan provider di `src/providers/index.ts`

Struktur ini memungkinkan Xendit, Midtrans, dan provider lain masuk tanpa ubah flow utama.

## Flow Test Local

1. Jalankan app:

```bash
npm install
npm run dev
```

2. Buka app UI di:

`http://localhost:3000/app`

3. Expose local server ke internet, misalnya pakai ngrok:

```bash
ngrok http 3000
```

4. Di Shopify Partner Dashboard / App Setup, isi:

- App URL: `https://xxxx.ngrok-free.app/app`
- Allowed redirection URL: `https://xxxx.ngrok-free.app/auth/callback`
- Compliance webhook `customers/data_request`: `https://xxxx.ngrok-free.app/webhooks/shopify/customers/data_request`
- Compliance webhook `customers/redact`: `https://xxxx.ngrok-free.app/webhooks/shopify/customers/redact`
- Compliance webhook `shop/redact`: `https://xxxx.ngrok-free.app/webhooks/shopify/shop/redact`

5. Klik install dari UI:

- buka `https://xxxx.ngrok-free.app/app`
- isi `shop.myshopify.com`
- klik `Connect Shopify (OAuth)`
- flow yang diharapkan: install -> OAuth -> callback -> redirect ke `/app?installed=1&shop=...`

6. Verifikasi token install:

- buka `GET https://xxxx.ngrok-free.app/auth/shopify/status/<shop-domain>`
- atau cek banner sukses di dashboard

7. Test compliance webhook manual dari local:

PowerShell untuk generate HMAC dan kirim request:

```powershell
$secret = "SHOPIFY_API_SECRET_ANDA"
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

8. Cek audit result:

- `GET https://xxxx.ngrok-free.app/api/compliance/requests`
- untuk `shop/redact`, cek juga file data lokal seperti `data/store-configs.json`, `data/shopify-tokens.json`, dan `data/payment-session-contexts.json`

## Flow Test Production

1. Deploy app ke domain public.
2. Set environment variable production:

- `HOST=https://app-domain-anda.com`
- `STORAGE_DRIVER=mysql`
- `MYSQL_HOST=...`
- `MYSQL_PORT=3306`
- `MYSQL_USER=...`
- `MYSQL_PASSWORD=...`
- `MYSQL_DATABASE=...`
- `SHOPIFY_REDIRECT_PATH=/auth/callback`
- `SHOPIFY_APP_UI_PATH=/app`

3. Inisialisasi schema MySQL:

```bash
npm run db:init
```

4. Jika sebelumnya masih memakai file JSON, migrasikan datanya:

```bash
npm run migrate:mysql
```

5. Build dan run:

```bash
npm run build
npm start
```

6. Isi URL berikut di Shopify Partner Dashboard:

- App URL: `https://app-domain-anda.com/app`
- Allowed redirection URL: `https://app-domain-anda.com/auth/callback`
- Compliance webhooks:
  - `https://app-domain-anda.com/webhooks/shopify/customers/data_request`
  - `https://app-domain-anda.com/webhooks/shopify/customers/redact`
  - `https://app-domain-anda.com/webhooks/shopify/shop/redact`

7. Install app di development store / merchant store uji.
8. Pastikan sesudah approve OAuth, browser masuk lagi ke `/app` dan token tersimpan.
9. Uji compliance webhook:

- Trigger dari Shopify Partner Dashboard bila tersedia di environment Anda.
- Atau kirim manual request signed HMAC ke domain production seperti contoh local di atas.
- Verifikasi respons `200 OK` dan audit di `GET /api/compliance/requests`.

## Setup MySQL di cPanel

1. Buat database MySQL baru di cPanel.
2. Buat user MySQL lalu assign ke database dengan privilege penuh.
3. Masukkan host, port, database, username, dan password ke env app.
4. Jalankan `npm run db:init` dari environment app agar tabel dibuat otomatis.
5. Jika perlu impor manual, schema SQL tersedia di `database/mysql-schema.sql`.

## Perilaku Compliance Saat Ini

- `customers/data_request`: mencatat request dan merangkum data lokal yang terkait shop tanpa menyimpan email/phone customer di audit log.
- `customers/redact`: mencatat request; saat ini app belum menyimpan PII customer persisten, jadi hasilnya no-op yang terdokumentasi.
- `shop/redact`: menghapus data lokal shop yang cocok dari `store-configs`, `shopify-tokens`, dan `payment-session-contexts`, lalu mencatat hasil penghapusan ke audit log.
