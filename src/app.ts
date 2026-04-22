import express from "express";
import path from "node:path";
import { ZodError } from "zod";
import { env } from "./config/env";
import { complianceRoutes } from "./routes/compliance";
import { configRoutes } from "./routes/config";
import { paymentRoutes } from "./routes/payments";
import { shopifyAuthRoutes } from "./routes/shopify-auth";
import { shopifyPaymentSessionRoutes } from "./routes/shopify-payment-session";
import { shopifyWebhookRoutes } from "./routes/shopify-webhooks";
import { systemRoutes } from "./routes/system";
import { webhookRoutes } from "./routes/webhooks";
import { ShopifyComplianceService } from "./services/shopify-compliance-service";
import { PaymentService } from "./services/payment-service";
import { ShopifyAuthService } from "./services/shopify-auth-service";
import { ShopifyPaymentResolveService } from "./services/shopify-payment-resolve-service";
import { getStorage } from "./storage";

export function createApp(): express.Application {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      }
    })
  );

  const publicDir = path.join(process.cwd(), "public");
  app.use(express.static(publicDir));

  const storage = getStorage();
  const storeRepo = storage.storeRepo;
  const paymentService = new PaymentService(storeRepo);
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

  app.get("/", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.get("/app", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
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

  app.use("/api/config", configRoutes(storeRepo));
  app.use("/api/system", systemRoutes(storage));
  app.use("/api/compliance", complianceRoutes(shopifyComplianceService));
  app.use("/api/payments", paymentRoutes(paymentService));
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
      paymentResolve: shopifyPaymentResolveService
    })
  );
  app.use("/webhooks", shopifyWebhookRoutes(shopifyAuthService, shopifyComplianceService));

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
