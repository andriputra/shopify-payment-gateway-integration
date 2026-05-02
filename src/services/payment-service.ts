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

  /** POST ke Swipe dari server (setara curl Postman); cocok untuk verifikasi credential & melihat JSON mentah. */
  async swipeTestRequest(
    shop: string,
    amount: number,
    orderId?: string
  ): Promise<SwipeTestPaymentResult> {
    const normalized = normalizeShopKey(shop);
    const store = await this.storeRepo.get(normalized);
    if (!store) {
      throw new Error(`Store config not found for shop: ${normalized}`);
    }
    if (store.provider !== "swipe") {
      throw new Error(
        `Konfigurasi toko memakai provider "${store.provider}". Set provider ke swipe dan simpan konfigurasi.`
      );
    }
    return swipeTestPaymentRequest(store, {
      amount,
      orderId: orderId?.trim() || `TEST-${Date.now()}`
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
