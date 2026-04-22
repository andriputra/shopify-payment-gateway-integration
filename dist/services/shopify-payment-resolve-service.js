"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShopifyPaymentResolveService = void 0;
const env_1 = require("../config/env");
const RESOLVE_MUTATION = `
mutation PaymentSessionResolve($id: ID!) {
  paymentSessionResolve(id: $id) {
    paymentSession {
      id
      state
    }
    userErrors {
      field
      message
    }
  }
}
`;
class ShopifyPaymentResolveService {
    constructor(tokenRepo) {
        this.tokenRepo = tokenRepo;
    }
    async resolvePaymentSession(shop, paymentSessionGid) {
        const token = await this.tokenRepo.get(shop);
        if (!token) {
            return {
                ok: false,
                message: "Token Shopify tidak ditemukan. Install app lewat OAuth dulu."
            };
        }
        const version = env_1.env.shopifyPaymentsApiVersion;
        const url = `https://${shop}/payments_apps/api/${version}/graphql.json`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": token.accessToken
            },
            body: JSON.stringify({
                query: RESOLVE_MUTATION,
                variables: { id: paymentSessionGid }
            })
        });
        const json = (await response.json());
        if (json.errors?.length) {
            return { ok: false, message: json.errors.map((e) => e.message).join("; ") };
        }
        const userErrors = json.data?.paymentSessionResolve?.userErrors ?? [];
        if (userErrors.length > 0) {
            return { ok: false, message: userErrors.map((e) => e.message).join("; "), userErrors };
        }
        return { ok: true, message: json.data?.paymentSessionResolve?.paymentSession?.state };
    }
}
exports.ShopifyPaymentResolveService = ShopifyPaymentResolveService;
