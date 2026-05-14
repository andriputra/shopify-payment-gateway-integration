"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const zod_1 = require("zod");
const env_1 = require("./config/env");
const compliance_1 = require("./routes/compliance");
const config_1 = require("./routes/config");
const bridge_checkout_1 = require("./routes/bridge-checkout");
const docs_bridge_1 = require("./routes/docs-bridge");
const inv_status_1 = require("./routes/inv-status");
const verify_shopify_session_token_1 = require("./middlewares/verify-shopify-session-token");
const payments_1 = require("./routes/payments");
const payment_status_1 = require("./routes/payment-status");
const shopify_auth_1 = require("./routes/shopify-auth");
const shopify_payment_session_1 = require("./routes/shopify-payment-session");
const shopify_webhooks_1 = require("./routes/shopify-webhooks");
const system_1 = require("./routes/system");
const webhooks_1 = require("./routes/webhooks");
const shopify_compliance_service_1 = require("./services/shopify-compliance-service");
const payment_service_1 = require("./services/payment-service");
const shopify_auth_service_1 = require("./services/shopify-auth-service");
const shopify_payment_resolve_service_1 = require("./services/shopify-payment-resolve-service");
const shopify_order_service_1 = require("./services/shopify-order-service");
const storage_1 = require("./storage");
function createApp() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json({
        verify: (req, _res, buf) => {
            req.rawBody = Buffer.from(buf);
        }
    }));
    /** Shopify app URL is often `/app`; API lives under `/api`. Redirect mistaken `/app/api/...` browser hits to `/api/...`. */
    app.use((req, res, next) => {
        if (req.path.startsWith("/app/api")) {
            const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
            const corrected = `${req.path.replace(/^\/app\/api/, "/api")}${qs}`;
            res.redirect(307, corrected);
            return;
        }
        next();
    });
    app.use("/docs", (0, docs_bridge_1.docsBridgeRoutes)());
    const publicDir = node_path_1.default.join(process.cwd(), "public");
    app.use(express_1.default.static(publicDir));
    const indexHtmlTemplate = node_fs_1.default.readFileSync(node_path_1.default.join(publicDir, "index.html"), "utf8");
    const assetVersion = process.env.APP_ASSET_VERSION ?? String(Date.now());
    const renderIndexHtml = () => indexHtmlTemplate
        .replace(/__SHOPIFY_API_KEY__/g, env_1.env.shopifyApiKey)
        .replace('src="/app.js"', `src="/app.js?v=${assetVersion}"`);
    const storage = (0, storage_1.getStorage)();
    const storeRepo = storage.storeRepo;
    const paymentService = new payment_service_1.PaymentService(storeRepo);
    const shopifyTokenRepo = storage.tokenRepo;
    const paymentRedirectRepo = storage.paymentRedirectRepo;
    const shopifyAuthService = new shopify_auth_service_1.ShopifyAuthService(shopifyTokenRepo);
    const sessionContextRepo = storage.sessionContextRepo;
    const complianceRequestRepo = storage.complianceRequestRepo;
    const shopifyComplianceService = new shopify_compliance_service_1.ShopifyComplianceService(complianceRequestRepo, storeRepo, shopifyTokenRepo, sessionContextRepo);
    const shopifyPaymentResolveService = new shopify_payment_resolve_service_1.ShopifyPaymentResolveService(shopifyTokenRepo);
    const shopifyOrderService = new shopify_order_service_1.ShopifyOrderService(shopifyTokenRepo);
    app.get("/", (_req, res) => {
        res.type("html").send(renderIndexHtml());
    });
    app.get("/app", (_req, res) => {
        res.type("html").send(renderIndexHtml());
    });
    /** Legacy sandbox URL — points to the UAT checkout simulation page. */
    app.get("/sandbox/pay", (req, res) => {
        const qs = new URLSearchParams(req.query).toString();
        res.redirect(302, `/uat/checkout${qs ? `?${qs}` : ""}`);
    });
    app.get("/uat/checkout", (_req, res) => {
        res.sendFile(node_path_1.default.join(publicDir, "uat-checkout.html"));
    });
    /** Demo UI with Shopify-like checkout layout (two columns + summary). */
    app.get("/checkout/like", (_req, res) => {
        res.sendFile(node_path_1.default.join(publicDir, "checkout-like-shopify.html"));
    });
    app.post("/checkout/like/swipe/create", async (req, res, next) => {
        try {
            const shopRaw = String(req.body?.shop ?? "").trim().toLowerCase();
            const orderId = String(req.body?.orderId ?? "").trim();
            const amount = Number(req.body?.amount ?? 0);
            const currency = String(req.body?.currency ?? "IDR").trim().toUpperCase();
            const customerEmail = req.body?.customerEmail
                ? String(req.body.customerEmail).trim()
                : undefined;
            const swipePaymentMethodRaw = req.body?.swipePaymentMethod;
            const swipePaymentMethod = typeof swipePaymentMethodRaw === "string" && swipePaymentMethodRaw.trim()
                ? swipePaymentMethodRaw.trim().slice(0, 64)
                : undefined;
            const shop = shopRaw.endsWith(".myshopify.com") ? shopRaw : `${shopRaw}.myshopify.com`;
            if (!shopRaw || !orderId || !Number.isFinite(amount) || amount < 0) {
                return res.status(400).json({
                    ok: false,
                    message: "Body must include shop, orderId, amount >= 0, and currency."
                });
            }
            const store = await storeRepo.get(shop);
            if (!store) {
                return res.status(404).json({
                    ok: false,
                    message: `Store config not found for shop: ${shop}`
                });
            }
            if (store.provider !== "swipe") {
                return res.status(409).json({
                    ok: false,
                    message: `Current store provider is "${store.provider}". Change it to "swipe" so this page can continue to Swipe.`
                });
            }
            const checkout = await paymentService.createCheckout({
                shop,
                provider: "swipe",
                amount,
                currency: currency.length === 3 ? currency : "IDR",
                orderId,
                customerEmail,
                swipePaymentMethod
            });
            return res.json({
                ok: true,
                channel: "swipe",
                paymentUrl: checkout.paymentUrl,
                providerReference: checkout.providerReference
            });
        }
        catch (error) {
            return next(error);
        }
    });
    app.get("/pay/edc-pending", (req, res) => {
        const shop = String(req.query.shop ?? "");
        const orderId = String(req.query.orderId ?? "");
        const amount = String(req.query.amount ?? "0");
        const currency = String(req.query.currency ?? "IDR");
        const safeShop = shop.replace(/"/g, "&quot;");
        const safeOrderId = orderId.replace(/"/g, "&quot;");
        const safeAmount = amount.replace(/"/g, "&quot;");
        const safeCurrency = currency.replace(/"/g, "&quot;");
        const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Complete Payment in EDC</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-slate-100 text-slate-800">
  <main class="mx-auto max-w-lg px-4 py-10">
    <section class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h1 class="text-xl font-bold text-slate-900">Continue payment on EDC</h1>
      <p class="mt-3 text-sm text-slate-600">
        This transaction is processed through a <strong>Swipe EDC terminal</strong>, not a browser payment page.
        Complete the payment on the terminal. After Swipe sends a successful <strong>callback</strong> to the store, checkout will continue and inventory follows Shopify rules.
      </p>
      <div class="mt-5 space-y-1 rounded-lg bg-slate-50 p-4 text-sm">
        <p><span class="font-semibold">Shop:</span> ${safeShop}</p>
        <p><span class="font-semibold">Reference:</span> ${safeOrderId}</p>
        <p><span class="font-semibold">Amount:</span> ${safeCurrency} ${safeAmount}</p>
      </div>
      <p class="mt-4 text-xs text-slate-500">You may close this tab after payment is completed on EDC if your store redirects back to order confirmation.</p>
    </section>
  </main>
</body>
</html>`;
        res.type("html").send(html);
    });
    app.use("/api", (0, payment_status_1.paymentStatusRoutes)(paymentRedirectRepo));
    app.use((0, inv_status_1.invStatusRoutes)(storage.swipePayloadRepo));
    app.use("/api/bridge", (0, bridge_checkout_1.bridgeCheckoutRoutes)(paymentService));
    app.use("/api/config", verify_shopify_session_token_1.verifyShopifySessionToken, (0, config_1.configRoutes)(storeRepo));
    // System status is safe read-only metadata; session tokens from App Bridge often omit Bearer on same-origin GET.
    app.use("/api/system", (0, system_1.systemRoutes)(storage));
    app.use("/api/compliance", verify_shopify_session_token_1.verifyShopifySessionToken, (0, compliance_1.complianceRoutes)(shopifyComplianceService));
    app.use("/api/payments", verify_shopify_session_token_1.verifyShopifySessionToken, (0, payments_1.paymentRoutes)(paymentService));
    app.use("/auth", (0, shopify_auth_1.shopifyAuthRoutes)(shopifyAuthService, shopifyTokenRepo));
    app.use("/api", (0, shopify_payment_session_1.shopifyPaymentSessionRoutes)({
        paymentService,
        storeRepo,
        sessionContextRepo
    }));
    app.use("/webhooks", (0, webhooks_1.webhookRoutes)(paymentService, {
        sessionContextRepo,
        paymentResolve: shopifyPaymentResolveService,
        paymentRedirectRepo,
        orderService: shopifyOrderService
    }));
    app.use("/webhooks", (0, shopify_webhooks_1.shopifyWebhookRoutes)(shopifyAuthService, shopifyComplianceService, {
        storeRepo,
        paymentService,
        paymentRedirectRepo
    }));
    app.use((error, _req, res, _next) => {
        if (error instanceof zod_1.ZodError) {
            return res.status(400).json({
                ok: false,
                message: "Validation failed",
                issues: error.issues
            });
        }
        const message = error instanceof Error ? error.message : "Internal server error";
        return res.status(500).json({ ok: false, message });
    });
    return app;
}
