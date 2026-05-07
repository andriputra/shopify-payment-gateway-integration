import { env } from "../config/env";
import { ShopifyTokenStore } from "../storage/contracts";

type GraphqlEnvelope<T> = {
  data?: T;
  errors?: { message: string }[];
};

type MarkPaidPayload = {
  orderMarkAsPaid?: {
    order?: { id: string };
    userErrors?: { field?: string[]; message: string }[];
  };
};

const ORDER_MARK_PAID = `
mutation OrderMarkAsPaid($input: OrderMarkAsPaidInput!) {
  orderMarkAsPaid(input: $input) {
    order { id }
    userErrors { field message }
  }
}
`;

export class ShopifyOrderService {
  constructor(private readonly tokenRepo: ShopifyTokenStore) {}

  async markOrderPaid(shop: string, orderGid: string): Promise<{ ok: boolean; message?: string }> {
    const token = await this.tokenRepo.get(shop);
    if (!token) {
      return { ok: false, message: "Shopify token not found. Install the app through OAuth first." };
    }

    const version = env.shopifyPaymentsApiVersion; // re-use configured version
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

    const json = (await response.json()) as GraphqlEnvelope<MarkPaidPayload>;
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

