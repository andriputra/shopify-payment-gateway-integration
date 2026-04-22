# Deploy cPanel

Panduan ini diasumsikan untuk cPanel dengan `Application Manager`, `Node.js`, dan `MySQL/MariaDB` aktif.

## 1. Persiapan cPanel

1. Buat subdomain khusus, misalnya `shopify-gateway.domainanda.com`.
2. Di cPanel `Manage My Databases`, buat database dan user MySQL, lalu assign semua privilege.
3. Pastikan fitur ini tersedia:
   - `Application Manager`
   - `Git Version Control` atau akses upload file/SSH
   - `ea-apache24-mod_env`
   - salah satu `ea-nodejs16/18/20/22`

Referensi resmi:
- cPanel Application Manager: https://docs.cpanel.net/cpanel/software/application-manager/132/
- cPanel Node.js app install: https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/
- cPanel Manage My Databases: https://docs.cpanel.net/cpanel/databases/manage-my-databases/

## 2. Upload code

Pilih salah satu:

- Clone repo via cPanel `Git Version Control`
- Upload ZIP project lalu extract ke folder app, misalnya `~/shopify-payment-gateway-integration`

Direktori app sebaiknya berisi file root ini:

- `package.json`
- `app.js`
- `src/`
- `public/`

## 3. Install dependency dan build

Masuk via SSH atau Terminal cPanel lalu jalankan:

```bash
cd ~/shopify-payment-gateway-integration
npm install
npm run build
```

## 4. Siapkan env production

Salin template:

```bash
cp .env.cpanel.production.example .env
```

Isi minimal:

```env
HOST=https://shopify-gateway.domainanda.com
NODE_ENV=production
STORAGE_DRIVER=mysql
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=cpaneluser_shopify_gateway
MYSQL_USER=cpaneluser_shopify_user
MYSQL_PASSWORD=******
SHOPIFY_API_KEY=******
SHOPIFY_API_SECRET=******
APP_SHARED_SECRET=******
SHOPIFY_REDIRECT_PATH=/auth/callback
SHOPIFY_APP_UI_PATH=/app
```

Catatan:

- Jika cPanel Anda mendukung environment variables di `Application Manager`, Anda bisa isi di UI.
- Jika tidak, file `.env` ini tetap dibaca oleh app karena project memakai `dotenv`.

## 5. Init schema database

Jalankan:

```bash
npm run db:init
```

Jika sebelumnya ada data JSON lama, jalankan:

```bash
npm run migrate:mysql
```

## 6. Register app di Application Manager

Di cPanel `Application Manager`, isi:

- `Application Name`: `shopify-payment-gateway`
- `Deployment Domain`: subdomain khusus Anda, misalnya `shopify-gateway.domainanda.com`
- `Base Application URL`: `/`
- `Application Path`: `shopify-payment-gateway-integration`
- `Deployment Environment`: `Production`

Lalu tambahkan environment variables di UI jika fitur ini aktif. cPanel mendokumentasikan bahwa field ini dipakai saat register/edit app dan membutuhkan `ea-apache24-mod_env`.

Saran variable yang diisi di UI:

- `HOST`
- `NODE_ENV`
- `STORAGE_DRIVER`
- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `APP_SHARED_SECRET`
- `SHOPIFY_REDIRECT_PATH`
- `SHOPIFY_APP_UI_PATH`
- `SHOPIFY_SCOPES`
- `SHOPIFY_PAYMENTS_API_VERSION`

## 7. Enable dependency / deploy ulang

Sesudah register:

1. Klik `Enable Dependencies`
2. Jika ada tombol `Deploy`, jalankan `Deploy`
3. Jika app tidak refresh, buat file restart:

```bash
mkdir -p tmp
touch tmp/restart.txt
```

cPanel dan docs Passenger menjelaskan bahwa `restart.txt` dipakai untuk memicu restart app setelah perubahan.

## 8. URL Shopify Partner Dashboard

Isi URL ini di Shopify:

- App URL: `https://shopify-gateway.domainanda.com/app`
- Allowed redirection URL: `https://shopify-gateway.domainanda.com/auth/callback`
- Compliance webhook `customers/data_request`: `https://shopify-gateway.domainanda.com/webhooks/shopify/customers/data_request`
- Compliance webhook `customers/redact`: `https://shopify-gateway.domainanda.com/webhooks/shopify/customers/redact`
- Compliance webhook `shop/redact`: `https://shopify-gateway.domainanda.com/webhooks/shopify/shop/redact`

## 9. Test setelah deploy

1. Buka:

```text
https://shopify-gateway.domainanda.com/app
```

2. Klik install Shopify dari UI.
3. Pastikan setelah OAuth Anda kembali ke:

```text
/app?installed=1&shop=...
```

4. Verifikasi install:

```text
GET https://shopify-gateway.domainanda.com/auth/shopify/status/<shop-domain>
```

5. Verifikasi compliance audit:

```text
GET https://shopify-gateway.domainanda.com/api/compliance/requests
```

## 10. Troubleshooting

- Log aplikasi Node.js di cPanel menurut dokumentasi Application Manager ada di folder `logs/` dalam direktori aplikasi.
- Jika app update tapi belum aktif, jalankan:

```bash
touch tmp/restart.txt
```

- Jika MySQL tidak bisa diakses dari app:
  - cek nama database/user cPanel yang sudah terprefix
  - cek password
  - cek `MYSQL_HOST` biasanya `localhost`

- Jika Application Manager tidak menampilkan env var:
  - host mungkin belum mengaktifkan `ea-apache24-mod_env`

- Jika app terpasang di path selain `/`, route Shopify Anda harus disesuaikan. Untuk approval Shopify, paling aman pakai subdomain khusus dengan base URL `/`.
