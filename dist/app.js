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
const verify_shopify_session_token_1 = require("./middlewares/verify-shopify-session-token");
const payments_1 = require("./routes/payments");
const shopify_auth_1 = require("./routes/shopify-auth");
const shopify_payment_session_1 = require("./routes/shopify-payment-session");
const shopify_webhooks_1 = require("./routes/shopify-webhooks");
const system_1 = require("./routes/system");
const webhooks_1 = require("./routes/webhooks");
const shopify_compliance_service_1 = require("./services/shopify-compliance-service");
const payment_service_1 = require("./services/payment-service");
const shopify_auth_service_1 = require("./services/shopify-auth-service");
const shopify_payment_resolve_service_1 = require("./services/shopify-payment-resolve-service");
const storage_1 = require("./storage");
function createApp() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json({
        verify: (req, _res, buf) => {
            req.rawBody = Buffer.from(buf);
        }
    }));
    const publicDir = node_path_1.default.join(process.cwd(), "public");
    app.use(express_1.default.static(publicDir));
    const indexHtmlTemplate = node_fs_1.default.readFileSync(node_path_1.default.join(publicDir, "index.html"), "utf8");
    const renderIndexHtml = () => indexHtmlTemplate.replace(/__SHOPIFY_API_KEY__/g, env_1.env.shopifyApiKey);
    const storage = (0, storage_1.getStorage)();
    const storeRepo = storage.storeRepo;
    const paymentService = new payment_service_1.PaymentService(storeRepo);
    const shopifyTokenRepo = storage.tokenRepo;
    const shopifyAuthService = new shopify_auth_service_1.ShopifyAuthService(shopifyTokenRepo);
    const sessionContextRepo = storage.sessionContextRepo;
    const complianceRequestRepo = storage.complianceRequestRepo;
    const shopifyComplianceService = new shopify_compliance_service_1.ShopifyComplianceService(complianceRequestRepo, storeRepo, shopifyTokenRepo, sessionContextRepo);
    const shopifyPaymentResolveService = new shopify_payment_resolve_service_1.ShopifyPaymentResolveService(shopifyTokenRepo);
    app.get("/", (_req, res) => {
        res.type("html").send(renderIndexHtml());
    });
    app.get("/app", (_req, res) => {
        res.type("html").send(renderIndexHtml());
    });
    app.get("/sandbox/pay", (req, res) => {
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
  <title>Sandbox Payment</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-slate-100 text-slate-800">
  <main class="mx-auto max-w-xl px-4 py-10">
    <section class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h1 class="text-2xl font-bold text-slate-900">Sandbox Payment Simulator</h1>
      <p class="mt-2 text-sm text-slate-600">Gunakan halaman ini untuk test status pembayaran tanpa akun payment gateway.</p>

      <div class="mt-5 space-y-1 rounded-lg bg-slate-50 p-4 text-sm">
        <p><span class="font-semibold">Shop:</span> ${safeShop}</p>
        <p><span class="font-semibold">Order ID:</span> ${safeOrderId}</p>
        <p><span class="font-semibold">Amount:</span> ${safeCurrency} ${safeAmount}</p>
      </div>

      <div class="mt-6 flex gap-3">
        <button id="paySuccess" class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Pay Success</button>
        <button id="payFailed" class="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Pay Failed</button>
      </div>

      <pre id="result" class="mt-5 overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-200">{}</pre>
    </section>
  </main>

  <script>
    const shop = ${JSON.stringify(shop)};
    const orderId = ${JSON.stringify(orderId)};
    const resultEl = document.getElementById("result");

    function show(data) {
      resultEl.textContent = JSON.stringify(data, null, 2);
    }

    async function sendWebhook(status) {
      if (!shop) {
        show({ ok: false, message: "Missing shop query parameter." });
        return;
      }

      try {
        const response = await fetch("/webhooks/payment/sandbox/" + encodeURIComponent(shop), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            id: "sandbox_" + orderId,
            orderId
          })
        });
        const data = await response.json();
        show(data);

        if (data.ok && data.paid && data.redirectUrl) {
          setTimeout(() => {
            window.location.href = data.redirectUrl;
          }, 1200);
        }
      } catch (error) {
        show({ ok: false, message: error.message || "Request failed" });
      }
    }

    document.getElementById("paySuccess").addEventListener("click", () => sendWebhook("PAID"));
    document.getElementById("payFailed").addEventListener("click", () => sendWebhook("FAILED"));
  </script>
</body>
</html>`;
        res.type("html").send(html);
    });
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
        paymentResolve: shopifyPaymentResolveService
    }));
    app.use("/webhooks", (0, shopify_webhooks_1.shopifyWebhookRoutes)(shopifyAuthService, shopifyComplianceService));
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
