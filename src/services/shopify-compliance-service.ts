import crypto from "node:crypto";
import {
  ComplianceRequestRecord,
  ComplianceRequestStore,
  ComplianceTopic
} from "../storage/contracts";
import { PaymentSessionContextStore, ShopifyTokenStore, StoreConfigStore } from "../storage/contracts";
import { shopDomainAliases, shopDomainsMatch } from "../utils/shop-domain";

type DataRequestPayload = Record<string, unknown> & {
  shop_domain?: string;
  shop_id?: number | string;
  customer?: {
    id?: number | string;
    email?: string;
    phone?: string;
  };
  orders_requested?: unknown[];
};

type CustomerRedactPayload = Record<string, unknown> & {
  shop_domain?: string;
  shop_id?: number | string;
  customer?: {
    id?: number | string;
    email?: string;
    phone?: string;
  };
};

type ShopRedactPayload = Record<string, unknown> & {
  shop_domain?: string;
  shop_id?: number | string;
};

export class ShopifyComplianceService {
  constructor(
    private readonly complianceRepo: ComplianceRequestStore,
    private readonly storeRepo: StoreConfigStore,
    private readonly tokenRepo: ShopifyTokenStore,
    private readonly sessionRepo: PaymentSessionContextStore
  ) {}

  async handleCustomersDataRequest(payload: DataRequestPayload): Promise<ComplianceRequestRecord> {
    const shop = String(payload.shop_domain ?? "");
    const customerReference = this.buildCustomerReference(payload.customer);
    const matchingConfigs = (await this.storeRepo.list()).filter((entry) => shopDomainsMatch(entry.shop, shop));
    const matchingTokens = (await this.tokenRepo.list()).filter((entry) => shopDomainsMatch(entry.shop, shop));
    const matchingSessions = (await this.sessionRepo.list()).filter((entry) => shopDomainsMatch(entry.context.shop, shop));

    return this.record("customers/data_request", payload, {
      shop,
      customerReference,
      shopId: payload.shop_id,
      localDataSummary: {
        customerDataStored: false,
        matchingStoreConfigs: matchingConfigs.map((entry) => ({
          shop: entry.shop,
          provider: entry.provider,
          redirectUrlConfigured: Boolean(entry.redirectUrlAfterPaid),
          webhookUrlConfigured: Boolean(entry.webhookUrlAfterPaid),
          updatedAt: entry.updatedAt
        })),
        oauthInstallations: matchingTokens.map((entry) => ({
          shop: entry.shop,
          scope: entry.scope,
          installedAt: entry.installedAt
        })),
        paymentSessionReferences: matchingSessions.map((entry) => ({
          orderReference: entry.orderReference,
          paymentSessionId: entry.context.paymentSessionId,
          createdAt: entry.context.createdAt
        }))
      },
      action: "No customer PII is currently persisted by this app; request was recorded for compliance audit."
    });
  }

  async handleCustomersRedact(payload: CustomerRedactPayload): Promise<ComplianceRequestRecord> {
    const shop = String(payload.shop_domain ?? "");
    const customerReference = this.buildCustomerReference(payload.customer);

    return this.record("customers/redact", payload, {
      shop,
      customerReference,
      shopId: payload.shop_id,
      redactedRecords: 0,
      action: "No persisted customer PII found in local storage; request was recorded for compliance audit."
    });
  }

  async handleShopRedact(payload: ShopRedactPayload): Promise<ComplianceRequestRecord> {
    const shop = String(payload.shop_domain ?? "");
    const aliases = shopDomainAliases(shop);

    let deletedStoreConfigs = 0;
    for (const alias of aliases) {
      if (await this.storeRepo.delete(alias)) {
        deletedStoreConfigs += 1;
      }
    }

    let deletedTokens = 0;
    for (const alias of aliases) {
      if (await this.tokenRepo.delete(alias)) {
        deletedTokens += 1;
      }
    }

    let deletedPaymentSessions = 0;
    for (const entry of await this.sessionRepo.list()) {
      if (shopDomainsMatch(entry.context.shop, shop)) {
        await this.sessionRepo.delete(entry.orderReference);
        deletedPaymentSessions += 1;
      }
    }

    return this.record("shop/redact", payload, {
      shop,
      shopId: payload.shop_id,
      deletedStoreConfigs,
      deletedTokens,
      deletedPaymentSessions,
      action: "Local shop records were removed where available."
    });
  }

  async listRequests(filters?: { shop?: string; topic?: ComplianceTopic; limit?: number }): Promise<ComplianceRequestRecord[]> {
    let records = await this.complianceRepo.list();

    if (filters?.shop) {
      records = records.filter((record) => shopDomainsMatch(record.shop, filters.shop as string));
    }

    if (filters?.topic) {
      records = records.filter((record) => record.topic === filters.topic);
    }

    if (typeof filters?.limit === "number" && Number.isFinite(filters.limit) && filters.limit > 0) {
      records = records.slice(0, filters.limit);
    }

    return records;
  }

  async getRequest(id: string): Promise<ComplianceRequestRecord | undefined> {
    return this.complianceRepo.get(id);
  }

  private async record(
    topic: ComplianceTopic,
    payload: Record<string, unknown>,
    outcome: Record<string, unknown>
  ): Promise<ComplianceRequestRecord> {
    const shop = String(payload.shop_domain ?? "");
    const customerReference = this.buildCustomerReference(payload.customer);
    const id = crypto.randomUUID();

    return this.complianceRepo.append({
      id,
      topic,
      shop,
      customerReference,
      shopId: payload.shop_id ? String(payload.shop_id) : undefined,
      triggeredAt: new Date().toISOString(),
      payload: this.sanitizePayload(payload),
      outcome
    });
  }

  private buildCustomerReference(customer: unknown): string | undefined {
    if (!customer || typeof customer !== "object") {
      return undefined;
    }

    const maybeId = (customer as { id?: string | number }).id;
    if (maybeId === undefined || maybeId === null) {
      return undefined;
    }

    return crypto.createHash("sha256").update(String(maybeId)).digest("hex").slice(0, 16);
  }

  private sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
    const customer =
      payload.customer && typeof payload.customer === "object"
        ? { id: (payload.customer as { id?: string | number }).id ?? undefined }
        : undefined;
    const ordersRequested = Array.isArray(payload.orders_requested) ? payload.orders_requested.length : undefined;

    return {
      shop_domain: payload.shop_domain,
      shop_id: payload.shop_id,
      customer,
      orders_requested_count: ordersRequested
    };
  }
}
