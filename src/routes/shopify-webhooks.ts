import { Request, RequestHandler, Router } from "express";
import { ShopifyComplianceService } from "../services/shopify-compliance-service";
import { ShopifyAuthService } from "../services/shopify-auth-service";

type VerifiedWebhook =
  | {
      ok: true;
      topic: string;
      payload: Record<string, unknown>;
    }
  | {
      ok: false;
      status: number;
      body: { ok: false; message: string };
    };

export function shopifyWebhookRoutes(
  authService: ShopifyAuthService,
  complianceService: ShopifyComplianceService
): Router {
  const router = Router();

  function parseVerifiedWebhook(req: Request, expectedTopic?: string): VerifiedWebhook {
    const hmac = String(req.get("x-shopify-hmac-sha256") ?? "");
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from("");
    const topic = String(req.get("x-shopify-topic") ?? expectedTopic ?? "");

    if (!hmac || !authService.verifyWebhookHmac(rawBody, hmac)) {
      return {
        ok: false,
        status: 401,
        body: { ok: false, message: "Invalid Shopify webhook HMAC" }
      };
    }

    if (expectedTopic && topic !== expectedTopic) {
      return {
        ok: false,
        status: 400,
        body: { ok: false, message: `Unexpected Shopify topic: ${topic}` }
      };
    }

    return {
      ok: true,
      topic,
      payload: JSON.parse(rawBody.toString() || "{}") as Record<string, unknown>
    };
  }

  function handleComplianceWebhook(expectedTopic: string): RequestHandler {
    return async (req, res, next) => {
      try {
        return handleComplianceTopic(req, res, next, expectedTopic);
      } catch (error) {
        next(error);
      }
    };
  }

  async function handleComplianceTopic(
    req: Request,
    res: Parameters<RequestHandler>[1],
    next: Parameters<RequestHandler>[2],
    expectedTopic?: string
  ) {
    try {
      const verified = parseVerifiedWebhook(req, expectedTopic);
      if (!verified.ok) {
        return res.status(verified.status).json(verified.body);
      }

      if (
        verified.topic !== "customers/data_request" &&
        verified.topic !== "customers/redact" &&
        verified.topic !== "shop/redact"
      ) {
        return res.status(400).json({
          ok: false,
          message: `Unhandled Shopify topic: ${verified.topic}`
        });
      }

      const record =
        verified.topic === "customers/data_request"
          ? await complianceService.handleCustomersDataRequest(verified.payload)
          : verified.topic === "customers/redact"
            ? await complianceService.handleCustomersRedact(verified.payload)
            : await complianceService.handleShopRedact(verified.payload);

      console.log(`Compliance webhook received: ${verified.topic}`, {
        requestId: record.id,
        shop: record.shop
      });

      return res.status(200).json({
        ok: true,
        message: "Compliance webhook verified",
        topic: verified.topic,
        requestId: record.id
      });
    } catch (error) {
      next(error);
    }
  }

  router.post("/", (req, res, next) => {
    void handleComplianceTopic(req, res, next);
  });

  router.post("/shopify/customers/data_request", handleComplianceWebhook("customers/data_request"));
  router.post("/shopify/customers/redact", handleComplianceWebhook("customers/redact"));
  router.post("/shopify/shop/redact", handleComplianceWebhook("shop/redact"));

  router.post("/shopify/orders-paid", (req, res) => {
    const verified = parseVerifiedWebhook(req, "orders/paid");
    if (!verified.ok) {
      return res.status(verified.status).json(verified.body);
    }

    console.log("Order paid:", verified.payload.id);

    return res.json({
      ok: true,
      message: "Shopify webhook verified",
      topic: verified.topic
    });
  });

  return router;
}
