import { env } from "../config/env";
import { ShopifyTokenStore } from "../storage/contracts";

type GraphqlEnvelope<T> = {
  data?: T;
  errors?: { message: string }[];
};

type ResolvePayload = {
  paymentSessionResolve?: {
    paymentSession?: { id: string; state?: string };
    userErrors?: { field?: string[]; message: string }[];
  };
};

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

export class ShopifyPaymentResolveService {
  constructor(private readonly tokenRepo: ShopifyTokenStore) {}

  async resolvePaymentSession(
    shop: string,
    paymentSessionGid: string
  ): Promise<{ ok: boolean; message?: string; userErrors?: { field?: string[]; message: string }[] }> {
    const token = await this.tokenRepo.get(shop);
    if (!token) {
      return {
        ok: false,
        message: "Token Shopify tidak ditemukan. Install app lewat OAuth dulu."
      };
    }

    const version = env.shopifyPaymentsApiVersion;
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

    const json = (await response.json()) as GraphqlEnvelope<ResolvePayload>;
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
