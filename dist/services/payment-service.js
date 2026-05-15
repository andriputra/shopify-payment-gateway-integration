"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentService = void 0;
const providers_1 = require("../providers");
const swipe_1 = require("../providers/swipe");
const shop_domain_1 = require("../utils/shop-domain");
/** Same key used by Swipe webhooks (`invoice_number`) and `/api/payment-status` `orderReference`. */
function orderReferenceForPaymentRedirect(provider, orderId) {
    if (provider === "swipe") {
        return (0, swipe_1.swipeInvoiceNumberForOrder)(orderId);
    }
    return orderId.trim();
}
class PaymentService {
    constructor(storeRepo, paymentRedirectRepo) {
        this.storeRepo = storeRepo;
        this.paymentRedirectRepo = paymentRedirectRepo;
    }
    async createCheckout(input) {
        const shopKey = (0, shop_domain_1.normalizeMerchantShopKey)(input.shop);
        if (!shopKey || !shopKey.includes(".")) {
            throw new Error(`Invalid shop: ${input.shop}`);
        }
        const store = await this.storeRepo.get(shopKey);
        if (!store) {
            throw new Error(`Store config not found for shop: ${shopKey}`);
        }
        const provider = (0, providers_1.getProvider)(input.provider);
        const checkoutInput = { ...input, shop: shopKey };
        const result = await provider.createCheckout(store, checkoutInput);
        const returnUrlAfterPaid = checkoutInput.returnUrl?.trim() || store.redirectUrlAfterPaid?.trim() || undefined;
        if (this.paymentRedirectRepo) {
            const providerKey = input.provider;
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
                updatedAt: now,
                returnUrlAfterPaid,
                forwardWebhookUrl: checkoutInput.forwardWebhookUrl?.trim() || undefined,
                forwardWebhookSecret: checkoutInput.forwardWebhookSecret?.trim() || undefined
            });
        }
        return {
            ...result,
            returnUrlAfterPaid,
            forwardWebhookUrl: checkoutInput.forwardWebhookUrl?.trim() || undefined
        };
    }
    /** POST to Swipe from server (equivalent to Postman curl); useful for credential verification and raw JSON inspection. */
    async swipeTestRequest(shop, amount, orderId, swipePaymentMethod) {
        const normalized = (0, shop_domain_1.normalizeMerchantShopKey)(shop);
        const store = await this.storeRepo.get(normalized);
        if (!store) {
            throw new Error(`Store config not found for shop: ${normalized}`);
        }
        if (store.provider !== "swipe") {
            throw new Error(`This store is configured with provider "${store.provider}". Set provider to "swipe" and save the configuration first.`);
        }
        return (0, swipe_1.swipeTestPaymentRequest)(store, {
            amount,
            orderId: orderId?.trim() || `TEST-${Date.now()}`,
            swipePaymentMethod
        });
    }
    async handleWebhook(shop, providerId, payload) {
        const shopKey = (0, shop_domain_1.normalizeMerchantShopKey)(shop);
        const store = await this.storeRepo.get(shopKey);
        if (!store) {
            throw new Error(`Store config not found for shop: ${shopKey}`);
        }
        const provider = (0, providers_1.getProvider)(providerId);
        const result = provider.parseWebhook(store, payload);
        return {
            ...result,
            redirectUrl: result.paid ? store.redirectUrlAfterPaid : undefined
        };
    }
    /** Browser redirect URL for a paid checkout (per-request returnUrl wins over store default). */
    async resolveReturnUrlAfterPaid(shop, orderReference) {
        const shopKey = (0, shop_domain_1.normalizeMerchantShopKey)(shop);
        const store = await this.storeRepo.get(shopKey);
        if (!store) {
            return undefined;
        }
        const ref = orderReference.trim();
        if (this.paymentRedirectRepo && ref) {
            const record = await this.paymentRedirectRepo.get(shopKey, ref);
            if (record?.returnUrlAfterPaid?.trim()) {
                return record.returnUrlAfterPaid.trim();
            }
        }
        return store.redirectUrlAfterPaid?.trim() || undefined;
    }
}
exports.PaymentService = PaymentService;
