import { getProvider } from "../providers";
import { swipeTestPaymentRequest, SwipeTestPaymentResult } from "../providers/swipe";
import { StoreConfigStore } from "../storage/contracts";
import { CreateCheckoutInput, CreateCheckoutResult } from "../types";

function normalizeShopKey(domain: string): string {
  let s = domain.trim().toLowerCase();
  if (s && !s.endsWith(".myshopify.com")) {
    s = `${s}.myshopify.com`;
  }
  return s;
}

export class PaymentService {
  constructor(private readonly storeRepo: StoreConfigStore) {}

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const store = await this.storeRepo.get(input.shop);
    if (!store) {
      throw new Error(`Store config not found for shop: ${input.shop}`);
    }

    const provider = getProvider(input.provider);
    return provider.createCheckout(store, input);
  }

  /** POST to Swipe from server (equivalent to Postman curl); useful for credential verification and raw JSON inspection. */
  async swipeTestRequest(
    shop: string,
    amount: number,
    orderId?: string,
    swipePaymentMethod?: string
  ): Promise<SwipeTestPaymentResult> {
    const normalized = normalizeShopKey(shop);
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
    const store = await this.storeRepo.get(shop);
    if (!store) {
      throw new Error(`Store config not found for shop: ${shop}`);
    }

    const provider = getProvider(providerId);
    const result = provider.parseWebhook(store, payload);
    return {
      ...result,
      redirectUrl: result.paid ? store.redirectUrlAfterPaid : undefined
    };
  }
}
