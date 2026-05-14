import { getProvider } from "../providers";
import { swipeInvoiceNumberForOrder, swipeTestPaymentRequest, SwipeTestPaymentResult } from "../providers/swipe";
import { PaymentRedirectStore, StoreConfigStore } from "../storage/contracts";
import { CreateCheckoutInput, CreateCheckoutResult, SupportedProvider } from "../types";
import { normalizeMerchantShopKey } from "../utils/shop-domain";

/** Same key used by Swipe webhooks (`invoice_number`) and `/api/payment-status` `orderReference`. */
function orderReferenceForPaymentRedirect(provider: SupportedProvider, orderId: string): string {
  if (provider === "swipe") {
    return swipeInvoiceNumberForOrder(orderId);
  }
  return orderId.trim();
}

export class PaymentService {
  constructor(
    private readonly storeRepo: StoreConfigStore,
    private readonly paymentRedirectRepo?: PaymentRedirectStore
  ) {}

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const shopKey = normalizeMerchantShopKey(input.shop);
    if (!shopKey || !shopKey.includes(".")) {
      throw new Error(`Invalid shop: ${input.shop}`);
    }
    const store = await this.storeRepo.get(shopKey);
    if (!store) {
      throw new Error(`Store config not found for shop: ${shopKey}`);
    }

    const provider = getProvider(input.provider);
    const checkoutInput: CreateCheckoutInput = { ...input, shop: shopKey };
    const result = await provider.createCheckout(store, checkoutInput);

    if (this.paymentRedirectRepo) {
      const providerKey = input.provider as SupportedProvider;
      const orderRef = orderReferenceForPaymentRedirect(providerKey, checkoutInput.orderId);
      const now = new Date().toISOString();
      await this.paymentRedirectRepo.upsert({
        shop: shopKey,
        orderReference: orderRef,
        provider: String(input.provider),
        paymentUrl: result.paymentUrl,
        providerReference: result.providerReference,
        amount: input.amount,
        currency: String(input.currency ?? "").trim().toUpperCase() || "IDR",
        status: "pending",
        createdAt: now,
        updatedAt: now
      });
    }

    return result;
  }

  /** POST to Swipe from server (equivalent to Postman curl); useful for credential verification and raw JSON inspection. */
  async swipeTestRequest(
    shop: string,
    amount: number,
    orderId?: string,
    swipePaymentMethod?: string
  ): Promise<SwipeTestPaymentResult> {
    const normalized = normalizeMerchantShopKey(shop);
    const store = await this.storeRepo.get(normalized);
    if (!store) {
      throw new Error(`Store config not found for shop: ${normalized}`);
    }
    if (store.provider !== "swipe") {
      throw new Error(
        `This store is configured with provider "${store.provider}". Set provider to "swipe" and save the configuration first.`
      );
    }
    return swipeTestPaymentRequest(store, {
      amount,
      orderId: orderId?.trim() || `TEST-${Date.now()}`,
      swipePaymentMethod
    });
  }

  async handleWebhook(shop: string, providerId: string, payload: Record<string, unknown>) {
    const shopKey = normalizeMerchantShopKey(shop);
    const store = await this.storeRepo.get(shopKey);
    if (!store) {
      throw new Error(`Store config not found for shop: ${shopKey}`);
    }

    const provider = getProvider(providerId);
    const result = provider.parseWebhook(store, payload);
    return {
      ...result,
      redirectUrl: result.paid ? store.redirectUrlAfterPaid : undefined
    };
  }
}
