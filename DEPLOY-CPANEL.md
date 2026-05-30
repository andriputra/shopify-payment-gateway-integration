# Deploy on cPanel

This guide assumes cPanel with **Application Manager**, **Node.js**, and **MySQL/MariaDB** enabled.

## 1. cPanel preparation

1. Create a dedicated subdomain, e.g. `shopify-gateway.yourdomain.com`.
2. In cPanel **Manage My Databases**, create a MySQL database and user, then assign all privileges.
3. Ensure these features are available:
   - `Application Manager`
   - `Git Version Control` or file upload / SSH access
   - `ea-apache24-mod_env`
   - One of `ea-nodejs16/18/20/22`

Official references:

- cPanel Application Manager: https://docs.cpanel.net/cpanel/software/application-manager/132/
- cPanel Node.js app install: https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/
- cPanel Manage My Databases: https://docs.cpanel.net/cpanel/databases/manage-my-databases/

## 2. Upload code

Choose one:

- Clone the repo via cPanel **Git Version Control**
- Upload a ZIP of the project and extract to the app folder, e.g. `~/shopify-payment-gateway-integration`

The app directory should contain these root files:

- `package.json`
- `app.js`
- `src/`
- `public/`

## 3. Install dependencies and build

Connect via SSH or cPanel Terminal, then run:

```bash
cd ~/shopify-payment-gateway-integration
npm install
npm run build
```

## 4. Prepare production env

Copy the template:

```bash
cp .env.cpanel.production.example .env
```

Minimum required values:

```env
HOST=https://shopify-gateway.yourdomain.com
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

Notes:

- If your cPanel supports environment variables in **Application Manager**, you can set them in the UI.
- Otherwise, this `.env` file is still read by the app because the project uses `dotenv`.

## 5. Initialize database schema

Run:

```bash
npm run db:init
```

If you previously had JSON data, run:

```bash
npm run migrate:mysql
```

## 6. Register the app in Application Manager

In cPanel **Application Manager**, configure:

- **Application Name:** `shopify-payment-gateway`
- **Deployment Domain:** your dedicated subdomain, e.g. `shopify-gateway.yourdomain.com`
- **Base Application URL:** `/`
- **Application Path:** `shopify-payment-gateway-integration`
- **Deployment Environment:** `Production`

Then add environment variables in the UI if that feature is enabled. cPanel documents that these fields are used when registering/editing an app and require `ea-apache24-mod_env`.

Suggested variables to set in the UI:

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

## 7. Enable dependencies / redeploy

After registration:

1. Click **Enable Dependencies**
2. If a **Deploy** button is available, run **Deploy**
3. If the app does not refresh, create a restart file:

```bash
mkdir -p tmp
touch tmp/restart.txt
```

cPanel and Passenger docs explain that `restart.txt` triggers an app restart after changes.

## 8. Shopify Partner Dashboard URLs

Configure these URLs in Shopify:

- App URL: `https://shopify-gateway.yourdomain.com/app`
- Allowed redirection URL: `https://shopify-gateway.yourdomain.com/auth/callback`
- Compliance webhook `customers/data_request`: `https://shopify-gateway.yourdomain.com/webhooks/shopify/customers/data_request`
- Compliance webhook `customers/redact`: `https://shopify-gateway.yourdomain.com/webhooks/shopify/customers/redact`
- Compliance webhook `shop/redact`: `https://shopify-gateway.yourdomain.com/webhooks/shopify/shop/redact`

## 9. Post-deploy testing

1. Open:

```text
https://shopify-gateway.yourdomain.com/app
```

2. Click **Install Shopify** from the UI.
3. After OAuth, confirm you return to:

```text
/app?installed=1&shop=...
```

4. Verify install:

```text
GET https://shopify-gateway.yourdomain.com/auth/shopify/status/<shop-domain>
```

5. Verify compliance audit:

```text
GET https://shopify-gateway.yourdomain.com/api/compliance/requests
```

## 10. Troubleshooting

- Node.js application logs in cPanel Application Manager are in the `logs/` folder inside the application directory (per cPanel documentation).
- If the app was updated but changes are not active, run:

```bash
touch tmp/restart.txt
```

- If MySQL is not reachable from the app:
  - Check cPanel-prefixed database/user names
  - Verify the password
  - `MYSQL_HOST` is usually `localhost`

- If Application Manager does not show env vars:
  - The host may not have `ea-apache24-mod_env` enabled

- If the app is mounted at a path other than `/`, Shopify routes must be adjusted accordingly. For Shopify approval, a dedicated subdomain with base URL `/` is safest.
