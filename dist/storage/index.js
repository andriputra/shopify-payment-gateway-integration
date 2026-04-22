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
const shopify_token_repo_1 = require("./shopify-token-repo");
const mysql_storage_1 = require("./mysql-storage");
const store_config_repo_1 = require("./store-config-repo");
let storage;
function createJsonStorage() {
    return {
        initialize: async () => undefined,
        storeRepo: new store_config_repo_1.StoreConfigRepository(node_path_1.default.join(env_1.env.dataDir, "store-configs.json")),
        tokenRepo: new shopify_token_repo_1.ShopifyTokenRepository(node_path_1.default.join(env_1.env.dataDir, "shopify-tokens.json")),
        sessionContextRepo: new payment_session_context_repo_1.PaymentSessionContextRepository(node_path_1.default.join(env_1.env.dataDir, "payment-session-contexts.json")),
        complianceRequestRepo: new compliance_request_repo_1.ComplianceRequestRepository(node_path_1.default.join(env_1.env.dataDir, "compliance-requests.json"))
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
