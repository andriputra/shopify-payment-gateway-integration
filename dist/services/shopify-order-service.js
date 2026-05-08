"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShopifyOrderService = void 0;
const env_1 = require("../config/env");
const ORDER_MARK_PAID = `
mutation OrderMarkAsPaid($input: OrderMarkAsPaidInput!) {
  orderMarkAsPaid(input: $input) {
    order { id }
    userErrors { field message }
  }
}
`;
class ShopifyOrderService {
    constructor(tokenRepo) {
        this.tokenRepo = tokenRepo;
    }
    async markOrderPaid(shop, orderGid) {
        const token = await this.tokenRepo.get(shop);
        if (!token) {
            return { ok: false, message: "Shopify token not found. Install the app through OAuth first." };
        }
        const version = env_1.env.shopifyPaymentsApiVersion; // re-use configured version
        const url = `https://${shop}/admin/api/${version}/graphql.json`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": token.accessToken
            },
            body: JSON.stringify({
                query: ORDER_MARK_PAID,
                variables: { input: { id: orderGid } }
            })
        });
        const json = (await response.json());
        if (json.errors?.length) {
            return { ok: false, message: json.errors.map((e) => e.message).join("; ") };
        }
        const userErrors = json.data?.orderMarkAsPaid?.userErrors ?? [];
        if (userErrors.length > 0) {
            return { ok: false, message: userErrors.map((e) => e.message).join("; ") };
        }
        return { ok: true };
    }
}
exports.ShopifyOrderService = ShopifyOrderService;
