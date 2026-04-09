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
- Pilih provider (Xendit/Midtrans/Custom)
- Input API key / API secret
- Input redirect URL setelah pembayaran sukses
- Input webhook URL

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
- JSON file storage (`data/store-configs.json`)

## Jalankan Project

```bash
npm install
cp .env.example .env
npm run dev
```

## Environment Variables

```env
PORT=3000
HOST=http://localhost:3000
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
APP_SHARED_SECRET=replace_with_random_secret
```

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
