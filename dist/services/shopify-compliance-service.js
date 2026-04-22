"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShopifyComplianceService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const shop_domain_1 = require("../utils/shop-domain");
class ShopifyComplianceService {
    constructor(complianceRepo, storeRepo, tokenRepo, sessionRepo) {
        this.complianceRepo = complianceRepo;
        this.storeRepo = storeRepo;
        this.tokenRepo = tokenRepo;
        this.sessionRepo = sessionRepo;
    }
    async handleCustomersDataRequest(payload) {
        const shop = String(payload.shop_domain ?? "");
        const customerReference = this.buildCustomerReference(payload.customer);
        const matchingConfigs = (await this.storeRepo.list()).filter((entry) => (0, shop_domain_1.shopDomainsMatch)(entry.shop, shop));
        const matchingTokens = (await this.tokenRepo.list()).filter((entry) => (0, shop_domain_1.shopDomainsMatch)(entry.shop, shop));
        const matchingSessions = (await this.sessionRepo.list()).filter((entry) => (0, shop_domain_1.shopDomainsMatch)(entry.context.shop, shop));
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
    async handleCustomersRedact(payload) {
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
    async handleShopRedact(payload) {
        const shop = String(payload.shop_domain ?? "");
        const aliases = (0, shop_domain_1.shopDomainAliases)(shop);
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
            if ((0, shop_domain_1.shopDomainsMatch)(entry.context.shop, shop)) {
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
    async listRequests(filters) {
        let records = await this.complianceRepo.list();
        if (filters?.shop) {
            records = records.filter((record) => (0, shop_domain_1.shopDomainsMatch)(record.shop, filters.shop));
        }
        if (filters?.topic) {
            records = records.filter((record) => record.topic === filters.topic);
        }
        if (typeof filters?.limit === "number" && Number.isFinite(filters.limit) && filters.limit > 0) {
            records = records.slice(0, filters.limit);
        }
        return records;
    }
    async getRequest(id) {
        return this.complianceRepo.get(id);
    }
    async record(topic, payload, outcome) {
        const shop = String(payload.shop_domain ?? "");
        const customerReference = this.buildCustomerReference(payload.customer);
        const id = node_crypto_1.default.randomUUID();
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
    buildCustomerReference(customer) {
        if (!customer || typeof customer !== "object") {
            return undefined;
        }
        const maybeId = customer.id;
        if (maybeId === undefined || maybeId === null) {
            return undefined;
        }
        return node_crypto_1.default.createHash("sha256").update(String(maybeId)).digest("hex").slice(0, 16);
    }
    sanitizePayload(payload) {
        const customer = payload.customer && typeof payload.customer === "object"
            ? { id: payload.customer.id ?? undefined }
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
exports.ShopifyComplianceService = ShopifyComplianceService;
