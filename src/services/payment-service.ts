import { getProvider } from "../providers";
import { StoreConfigStore } from "../storage/contracts";
import { CreateCheckoutInput, CreateCheckoutResult } from "../types";

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
