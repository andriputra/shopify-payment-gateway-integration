"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const env_1 = require("../config/env");
const compliance_request_repo_1 = require("../storage/compliance-request-repo");
const payment_session_context_repo_1 = require("../storage/payment-session-context-repo");
const shopify_token_repo_1 = require("../storage/shopify-token-repo");
const mysql_storage_1 = require("../storage/mysql-storage");
const store_config_repo_1 = require("../storage/store-config-repo");
async function main() {
    const target = (0, mysql_storage_1.createMysqlStorage)();
    await target.initialize();
    const sourceStoreRepo = new store_config_repo_1.StoreConfigRepository(node_path_1.default.join(env_1.env.dataDir, "store-configs.json"));
    const sourceTokenRepo = new shopify_token_repo_1.ShopifyTokenRepository(node_path_1.default.join(env_1.env.dataDir, "shopify-tokens.json"));
    const sourceSessionRepo = new payment_session_context_repo_1.PaymentSessionContextRepository(node_path_1.default.join(env_1.env.dataDir, "payment-session-contexts.json"));
    const sourceComplianceRepo = new compliance_request_repo_1.ComplianceRequestRepository(node_path_1.default.join(env_1.env.dataDir, "compliance-requests.json"));
    const storeConfigs = await sourceStoreRepo.list();
    for (const item of storeConfigs) {
        await target.storeRepo.upsert(item);
    }
    const tokens = await sourceTokenRepo.list();
    for (const item of tokens) {
        await target.tokenRepo.upsert(item);
    }
    const sessions = await sourceSessionRepo.list();
    for (const item of sessions) {
        await target.sessionContextRepo.save(item.orderReference, item.context);
    }
    const complianceRequests = await sourceComplianceRepo.list();
    for (const item of complianceRequests) {
        await target.complianceRequestRepo.append(item);
    }
    console.log(`Migrated ${storeConfigs.length} store configs, ${tokens.length} tokens, ${sessions.length} payment session contexts, and ${complianceRequests.length} compliance requests to MySQL.`);
}
main().catch((error) => {
    console.error("Failed to migrate JSON data to MySQL", error);
    process.exitCode = 1;
});
