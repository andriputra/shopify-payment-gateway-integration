"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStorage = getStorage;
exports.initializeStorage = initializeStorage;
const node_path_1 = __importDefault(require("node:path"));
const env_1 = require("../config/env");
const compliance_request_repo_1 = require("./compliance-request-repo");
const payment_session_context_repo_1 = require("./payment-session-context-repo");
const payment_redirect_repo_1 = require("./payment-redirect-repo");
const shopify_token_repo_1 = require("./shopify-token-repo");
const mysql_storage_1 = require("./mysql-storage");
const store_config_repo_1 = require("./store-config-repo");
const swipe_payload_repo_1 = require("./swipe-payload-repo");
let storage;
function buildShopifyUrls(host) {
    const base = host.replace(/\/$/, "");
    return {
        customersDataRequest: `${base}/webhooks/shopify/customers/data_request`,
        customersRedact: `${base}/webhooks/shopify/customers/redact`,
        shopRedact: `${base}/webhooks/shopify/shop/redact`
    };
}
function createJsonStorage() {
    const storeRepo = new store_config_repo_1.StoreConfigRepository(node_path_1.default.join(env_1.env.dataDir, "store-configs.json"));
    const tokenRepo = new shopify_token_repo_1.ShopifyTokenRepository(node_path_1.default.join(env_1.env.dataDir, "shopify-tokens.json"));
    const sessionContextRepo = new payment_session_context_repo_1.PaymentSessionContextRepository(node_path_1.default.join(env_1.env.dataDir, "payment-session-contexts.json"));
    const paymentRedirectRepo = new payment_redirect_repo_1.PaymentRedirectRepository(node_path_1.default.join(env_1.env.dataDir, "payment-redirects.json"));
    const complianceRequestRepo = new compliance_request_repo_1.ComplianceRequestRepository(node_path_1.default.join(env_1.env.dataDir, "compliance-requests.json"));
    const swipePayloadRepo = new swipe_payload_repo_1.JsonlSwipePayloadRepository(swipe_payload_repo_1.JsonlSwipePayloadRepository.defaultPath());
    return {
        initialize: async () => undefined,
        systemStatus: async () => {
            const [storeConfigs, shopifyTokens, paymentSessionContexts, paymentRedirects, complianceRequests, swipePayloadRecords] = await Promise.all([
                storeRepo.list(),
                tokenRepo.list(),
                sessionContextRepo.list(),
                paymentRedirectRepo.count(),
                complianceRequestRepo.list(),
                swipePayloadRepo.count()
            ]);
            const last = complianceRequests[0];
            return {
                ok: true,
                driver: "json",
                time: new Date().toISOString(),
                uptimeSec: Math.floor(process.uptime()),
                host: env_1.env.host,
                shopify: {
                    appUiPath: env_1.env.shopifyAppUiPath,
                    redirectPath: env_1.env.shopifyRedirectPath,
                    complianceWebhooks: buildShopifyUrls(env_1.env.host)
                },
                counts: {
                    storeConfigs: storeConfigs.length,
                    shopifyTokens: shopifyTokens.length,
                    paymentSessionContexts: paymentSessionContexts.length,
                    paymentRedirects: paymentRedirects,
                    complianceRequests: complianceRequests.length,
                    swipePayloadRecords
                },
                lastCompliance: last
                    ? {
                        id: last.id,
                        topic: last.topic,
                        shop: last.shop,
                        triggeredAt: last.triggeredAt
                    }
                    : undefined
            };
        },
        storeRepo,
        tokenRepo,
        sessionContextRepo,
        paymentRedirectRepo,
        complianceRequestRepo,
        swipePayloadRepo
    };
}
function getStorage() {
    if (!storage) {
        storage = env_1.env.storageDriver === "mysql" ? (0, mysql_storage_1.createMysqlStorage)() : createJsonStorage();
    }
    return storage;
}
async function initializeStorage() {
    await getStorage().initialize();
}
