"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentService = void 0;
const providers_1 = require("../providers");
const swipe_1 = require("../providers/swipe");
function normalizeShopKey(domain) {
    let s = domain.trim().toLowerCase();
    if (s && !s.endsWith(".myshopify.com")) {
        s = `${s}.myshopify.com`;
    }
    return s;
}
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
    /** POST ke Swipe dari server (setara curl Postman); cocok untuk verifikasi credential & melihat JSON mentah. */
    async swipeTestRequest(shop, amount, orderId) {
        const normalized = normalizeShopKey(shop);
        const store = await this.storeRepo.get(normalized);
        if (!store) {
            throw new Error(`Store config not found for shop: ${normalized}`);
        }
        if (store.provider !== "swipe") {
            throw new Error(`Konfigurasi toko memakai provider "${store.provider}". Set provider ke swipe dan simpan konfigurasi.`);
        }
        return (0, swipe_1.swipeTestPaymentRequest)(store, {
            amount,
            orderId: orderId?.trim() || `TEST-${Date.now()}`
        });
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
