import express from "express";
import path from "node:path";
import { ZodError } from "zod";
import { env } from "./config/env";
import { configRoutes } from "./routes/config";
import { paymentRoutes } from "./routes/payments";
import { webhookRoutes } from "./routes/webhooks";
import { PaymentService } from "./services/payment-service";
import { StoreConfigRepository } from "./storage/store-config-repo";

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), "public")));

const storeRepo = new StoreConfigRepository();
const paymentService = new PaymentService(storeRepo);

app.get("/", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "public/index.html"));
});

app.use("/api/config", configRoutes(storeRepo));
app.use("/api/payments", paymentRoutes(paymentService));
app.use("/webhooks", webhookRoutes(paymentService));

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

app.listen(env.port, () => {
  // Keep startup logs concise for easier debugging in local terminal.
  console.log(`Server listening on ${env.host}`);
});
