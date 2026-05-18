# Shopify Partner — App testing information

Use this document when submitting **ID O2O Multi Payment Gateway** in the [Shopify Partner Dashboard](https://partners.shopify.com) → your app → **App store review** → **App testing information**.

The app is an **embedded Shopify Admin app**. It does **not** have its own username/password. Reviewers sign in with a **development store** staff account, then open the app from **Apps**.

---

## What to enter in the form

**Do not** check *“My app doesn't require an account to use it”* — Shopify requires login details for embedded apps (Shopify Admin access).

### Account 1 — Development store (required)

| Field | Value |
|--------|--------|
| **Username** | Staff email on your dev store, e.g. `shopify-review@yourcompany.com` |
| **Password** | Password for that staff user |
| **Account description** | Paste the block below (edit placeholders first). |

**Before submit:** In Partner Dashboard → **Stores**, create or use a **development store**, install the app on it, and create a **staff account** used only for review (no 2FA, no Google SSO — per Shopify form rules).

#### Account description (copy/paste, then edit)

```
Development store Admin login — used to open the embedded app inside Shopify Admin.

Store URL: https://YOUR-DEV-STORE.myshopify.com/admin
App name in Admin: ID O2O Multi Payment Gateway
Production app URL: https://dynapp.store/app

Steps to test:
1. Log in to the development store Admin with the username/password above.
2. Go to Apps → ID O2O Multi Payment Gateway (or open https://YOUR-DEV-STORE.myshopify.com/admin/apps).
3. On first open, Shopify OAuth runs automatically; approve permissions if prompted.
4. Config tab: set Provider to "sandbox" for a full flow without live payment keys.
   - Shop domain: YOUR-DEV-STORE.myshopify.com
   - Redirect URL after paid: https://YOUR-DEV-STORE.myshopify.com
   - API key: test-key (any non-empty value for sandbox)
   - Click Save Configuration.
5. Scroll to Sandbox Demo Checkout → Create Test Checkout → open payment simulator → Pay Success or Pay Failed.
6. System tab: confirms MySQL/storage and install counts (shopify_tokens >= 1 after OAuth).
7. Status tab: optional InvStatus lookup (requires APP_SHARED_SECRET in server env — contact us if needed for review).
8. Compliance Logs / Go-live tabs: read-only operational views.

Re-install / OAuth: OAuth is one-time per store; daily use only requires opening the app from Admin and refreshing. Re-authorize only if token was revoked.

Bridge API docs (optional, out of Admin UI): https://dynapp.store/docs/bridge

Support contact: YOUR-EMAIL@yourcompany.com
```

Replace:

- `YOUR-DEV-STORE` — e.g. `agena-dev-store`
- `YOUR-EMAIL@yourcompany.com` — your support email
- Staff username/password — real credentials for the staff user you created

---

### Account 2 — Swipe sandbox (optional, only if you test live Swipe)

Add a second row with **+ Add account** only if reviewers must test **Swipe** (not sandbox).

| Field | Value |
|--------|--------|
| **Username** | `n/a` or Swipe portal user if Swipe provides one |
| **Password** | Swipe sandbox password, or `see description` |
| **Account description** | Swipe UAT credentials and note that gateway keys are entered inside the app Config tab under provider "swipe". |

If Swipe is not required for review, use **sandbox** only (Account 1 steps) and skip Account 2.

---

## Checklist before you click Save

- [ ] Development store exists and app is **installed** on it
- [ ] Staff account for reviewers: **password login**, **no 2FA**, **no Google SSO**
- [ ] `HOST` / App URL in Partner app settings = `https://dynapp.store`
- [ ] Redirect URL = `https://dynapp.store/auth/callback`
- [ ] Compliance webhooks point to `https://dynapp.store/webhooks/shopify/...` (see README)
- [ ] Test yourself: Admin → Apps → app loads without errors after OAuth

---

## App URLs (for listing / review notes)

| Purpose | URL |
|---------|-----|
| App URL | `https://dynapp.store/app` |
| Allowed redirection URL(s) | `https://dynapp.store/auth/callback` |
| Privacy policy | `https://dynapp.store/privacy-policy/` (if published) |
| Public bridge API docs | `https://dynapp.store/docs/bridge` |

---

## If review asks for “account credentials” again

Usually means one of:

1. Form was empty or checkbox “no account required” was checked incorrectly.
2. Credentials expired or staff user has **2FA** / **Google login** enabled.
3. App not installed on the dev store named in the instructions.
4. Reviewer opened `https://dynapp.store/app` in a **new tab** instead of **Admin → Apps** (session token missing). Instructions must say to use Admin → Apps.

Update the password in Partner Dashboard whenever you rotate the review staff password.
