"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentService = void 0;
const providers_1 = require("../providers");
class PaymentService {
    constructor(storeRepo) {
        this.storeRepo = storeRepo;
    }
    async createCheckout(input) {
        const store = await this.storeRepo.get(input.shop);
        if (!store) {
            throw new Error(`Store config not found for shop: ${input.shop}`);
        }
        const provider = (0, providers_1.getProvider)(input.provider);
        return provider.createCheckout(store, input);
    }
    async createCheckoutForConfiguredProvider(input) {
        const store = await this.storeRepo.get(input.shop);
        if (!store) {
            throw new Error(`Store config not found for shop: ${input.shop}`);
        }
        const provider = (0, providers_1.getProvider)(store.provider);
        const result = await provider.createCheckout(store, {
            ...input,
            provider: store.provider
        });
        return {
            ...result,
            provider: store.provider
        };
    }
    async handleWebhook(shop, providerId, payload) {
        const store = await this.storeRepo.get(shop);
        if (!store) {
            throw new Error(`Store config not found for shop: ${shop}`);
        }
        const provider = (0, providers_1.getProvider)(providerId);
        const result = provider.parseWebhook(store, payload);
        return {
            ...result,
            redirectUrl: result.paid ? store.redirectUrlAfterPaid : undefined
        };
    }
}
exports.PaymentService = PaymentService;
