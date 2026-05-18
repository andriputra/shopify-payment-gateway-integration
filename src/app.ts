import express from "express";
import fs from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { env } from "./config/env";
import { complianceRoutes } from "./routes/compliance";
import { configRoutes } from "./routes/config";
import { bridgeCheckoutRoutes } from "./routes/bridge-checkout";
import { docsBridgeRoutes } from "./routes/docs-bridge";
import { invStatusRoutes } from "./routes/inv-status";
import { verifyShopifySessionToken } from "./middlewares/verify-shopify-session-token";
import { paymentRoutes } from "./routes/payments";
import { paymentStatusRoutes } from "./routes/payment-status";
import { shopifyAuthRoutes } from "./routes/shopify-auth";
import { shopifyPaymentSessionRoutes } from "./routes/shopify-payment-session";
import { shopifyWebhookRoutes } from "./routes/shopify-webhooks";
import { systemRoutes } from "./routes/system";
import { webhookRoutes } from "./routes/webhooks";
import { ShopifyComplianceService } from "./services/shopify-compliance-service";
import { PaymentService } from "./services/payment-service";
import { ShopifyAuthService } from "./services/shopify-auth-service";
import { ShopifyPaymentResolveService } from "./services/shopify-payment-resolve-service";
import { ShopifyOrderService } from "./services/shopify-order-service";
import { getStorage } from "./storage";
import { normalizeMerchantShopKey } from "./utils/shop-domain";

export function createApp(): express.Application {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      }
    })
  );

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

  app.use("/docs", docsBridgeRoutes());

  const publicDir = path.join(process.cwd(), "public");
  app.use(express.static(publicDir));

  const indexHtmlTemplate = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
  const assetVersion = process.env.APP_ASSET_VERSION ?? String(Date.now());
  const renderIndexHtml = () =>
    indexHtmlTemplate
      .replace(/__SHOPIFY_API_KEY__/g, env.shopifyApiKey)
      .replace('src="/app.js"', `src="/app.js?v=${assetVersion}"`);

  const storage = getStorage();
  const storeRepo = storage.storeRepo;
  const paymentRedirectRepo = storage.paymentRedirectRepo;
  const paymentService = new PaymentService(storeRepo, paymentRedirectRepo);
  const shopifyTokenRepo = storage.tokenRepo;
  const shopifyAuthService = new ShopifyAuthService(shopifyTokenRepo);
  const sessionContextRepo = storage.sessionContextRepo;
  const complianceRequestRepo = storage.complianceRequestRepo;
  const shopifyComplianceService = new ShopifyComplianceService(
    complianceRequestRepo,
    storeRepo,
    shopifyTokenRepo,
    sessionContextRepo
  );
  const shopifyPaymentResolveService = new ShopifyPaymentResolveService(shopifyTokenRepo);
  const shopifyOrderService = new ShopifyOrderService(shopifyTokenRepo);

  const renderEmbeddedAppPage: express.RequestHandler = async (req, res, next) => {
    try {
      const shopRaw = String(req.query.shop ?? "").trim().toLowerCase();
      if (shopRaw) {
        const shop = shopRaw.endsWith(".myshopify.com") ? shopRaw : `${shopRaw}.myshopify.com`;
        if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
          const token = await shopifyTokenRepo.get(shop);
          if (!token) {
            res.redirect(302, `/auth/shopify?shop=${encodeURIComponent(shop)}`);
            return;
          }
        }
      }
      res.type("html").send(renderIndexHtml());
    } catch (error) {
      next(error);
    }
  };

  app.get("/", renderEmbeddedAppPage);
  app.get("/app", renderEmbeddedAppPage);

  /** Legacy sandbox URL — points to the UAT checkout simulation page. */
  app.get("/sandbox/pay", (req, res) => {
    const qs = new URLSearchParams(req.query as Record<string, string>).toString();
    res.redirect(302, `/uat/checkout${qs ? `?${qs}` : ""}`);
  });
  app.get("/uat/checkout", (_req, res) => {
    res.sendFile(path.join(publicDir, "uat-checkout.html"));
  });

  /** Demo UI with Shopify-like checkout layout (two columns + summary). */
  app.get("/checkout/like", (_req, res) => {
    res.sendFile(path.join(publicDir, "checkout-like-shopify.html"));
  });
  app.post("/checkout/like/swipe/create", async (req, res, next) => {
    try {
      const shopInput = String(req.body?.shop ?? "").trim();
      const orderId = String(req.body?.orderId ?? "").trim();
      const amount = Number(req.body?.amount ?? 0);
      const currency = String(req.body?.currency ?? "IDR").trim().toUpperCase();
      const customerEmail = req.body?.customerEmail
        ? String(req.body.customerEmail).trim()
        : undefined;
      const swipePaymentMethodRaw = req.body?.swipePaymentMethod;
      const swipePaymentMethod =
        typeof swipePaymentMethodRaw === "string" && swipePaymentMethodRaw.trim()
          ? swipePaymentMethodRaw.trim().slice(0, 64)
          : undefined;

      const shop = normalizeMerchantShopKey(shopInput);
      if (!shopInput || !shop || !orderId || !Number.isFinite(amount) || amount < 0) {
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
    } catch (error) {
      return next(error);
    }
  });

  app.get("/pay/edc-pending", (req, res) => {
    const shop = String(req.query.shop ?? "");
    const orderId = String(req.query.orderId ?? "");
    const amount = String(req.query.amount ?? "0");
    const currency = String(req.query.currency ?? "IDR");
    const returnUrl = String(req.query.returnUrl ?? "").trim();

    const safeShop = shop.replace(/"/g, "&quot;");
    const safeOrderId = orderId.replace(/"/g, "&quot;");
    const safeAmount = amount.replace(/"/g, "&quot;");
    const safeCurrency = currency.replace(/"/g, "&quot;");
    const safeReturnUrl = returnUrl.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const returnLinkBlock = returnUrl
      ? `<p class="mt-4"><a href="${safeReturnUrl}" class="inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Return to store</a></p>`
      : "";

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
      <p class="mt-4 text-xs text-slate-500">After payment succeeds, you may use the button below if your store provided a return URL.</p>
      ${returnLinkBlock}
    </section>
  </main>
</body>
</html>`;

    res.type("html").send(html);
  });

  app.use("/api", paymentStatusRoutes(paymentRedirectRepo));
  app.use(invStatusRoutes(storage.swipePayloadRepo));
  app.use("/api/bridge", bridgeCheckoutRoutes(paymentService));
  app.use("/api/config", verifyShopifySessionToken, configRoutes(storeRepo));
  // System status is safe read-only metadata; session tokens from App Bridge often omit Bearer on same-origin GET.
  app.use("/api/system", systemRoutes(storage));
  app.use("/api/compliance", verifyShopifySessionToken, complianceRoutes(shopifyComplianceService));
  app.use("/api/payments", verifyShopifySessionToken, paymentRoutes(paymentService));
  app.use("/auth", shopifyAuthRoutes(shopifyAuthService, shopifyTokenRepo));
  app.use(
    "/api",
    shopifyPaymentSessionRoutes({
      paymentService,
      storeRepo,
      sessionContextRepo
    })
  );
  app.use(
    "/webhooks",
    webhookRoutes(paymentService, {
      sessionContextRepo,
      paymentResolve: shopifyPaymentResolveService,
      paymentRedirectRepo,
      orderService: shopifyOrderService
    })
  );
  app.use(
    "/webhooks",
    shopifyWebhookRoutes(shopifyAuthService, shopifyComplianceService, {
      storeRepo,
      paymentService,
      paymentRedirectRepo
    })
  );

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
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
