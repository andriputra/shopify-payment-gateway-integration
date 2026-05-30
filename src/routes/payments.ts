import { Router } from "express";
import { z } from "zod";
import { PaymentService } from "../services/payment-service";
import { readSwipeTransactionLogForShop } from "../services/swipe-transaction-log";
import { SupportedProvider } from "../types";
import { normalizeShopDomain } from "../utils/shop-domain";

const swipeMethodSchema = z.string().trim().min(1).max(64).optional();
const swipeDeviceUserSchema = z.string().trim().min(1).max(128).optional();

const createCheckoutSchema = z
  .object({
    shop: z.string().min(3),
    provider: z.enum(["xendit", "midtrans", "swipe", "sandbox", "custom"] as const),
    amount: z.coerce.number().min(0),
    currency: z.string().length(3),
    orderId: z.string().min(1),
    customerEmail: z.string().email().optional(),
    returnUrl: z.string().url().optional(),
    swipePaymentMethod: swipeMethodSchema,
    swipeDeviceUser: swipeDeviceUserSchema,
    /** Alias Swipe API field name; same as `swipeDeviceUser`. */
    device_user: swipeDeviceUserSchema
  })
  .transform(({ device_user, swipeDeviceUser, ...rest }) => ({
    ...rest,
    swipeDeviceUser: swipeDeviceUser ?? device_user
  }));

const swipeTestRequestSchema = z.object({
  shop: z.string().min(3),
  amount: z.coerce.number().min(0).optional().default(0),
  orderId: z.string().min(1).optional(),
  swipePaymentMethod: swipeMethodSchema,
  swipeDeviceUser: swipeDeviceUserSchema
});

type ShopifySessionLocals = { dest?: string };

export function paymentRoutes(service: PaymentService): Router {
  const router = Router();

  /** Requires `Authorization: Bearer <session token>` (embedded app). Filtered to JWT shop domain. */
  router.get("/swipe/transaction-log", (req, res, next) => {
    try {
      const session = res.locals.shopifySession as ShopifySessionLocals | undefined;
      const dest = session?.dest?.trim();
      if (!dest) {
        return res.status(401).json({ ok: false, message: "Missing embedded session shop (dest)" });
      }
      const limitRaw = req.query.limit;
      const limitNum =
        typeof limitRaw === "string" && limitRaw.trim()
          ? Number(limitRaw)
          : typeof limitRaw === "number"
            ? limitRaw
            : NaN;
      const limit = Number.isFinite(limitNum)
        ? Math.min(500, Math.max(1, Math.floor(limitNum)))
        : 100;

      const log = readSwipeTransactionLogForShop(dest, limit);
      return res.json({
        ok: true,
        shop: normalizeShopDomain(dest),
        limit,
        ...log
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/swipe/test-request", async (req, res, next) => {
    try {
      const raw = swipeTestRequestSchema.parse(req.body);
      const result = await service.swipeTestRequest(
        raw.shop,
        raw.amount,
        raw.orderId,
        raw.swipePaymentMethod,
        raw.swipeDeviceUser
      );
      res.json({ ok: true, swipe: result });
    } catch (error) {
      next(error);
    }
  });

  router.post("/checkout/create", async (req, res, next) => {
    try {
      const input = createCheckoutSchema.parse(req.body);
      const result = await service.createCheckout({
        ...input,
        provider: input.provider as SupportedProvider
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
