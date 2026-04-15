"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const node_path_1 = __importDefault(require("node:path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function must(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env: ${name}`);
    }
    return value;
}
function resolveHost() {
    if (process.env.HOST) {
        return process.env.HOST;
    }
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    return "http://localhost:3000";
}
exports.env = {
    port: Number(process.env.PORT ?? 3000),
    host: resolveHost(),
    dataDir: process.env.DATA_DIR ?? node_path_1.default.join(process.cwd(), "data"),
    shopifyApiKey: must("SHOPIFY_API_KEY"),
    shopifyApiSecret: must("SHOPIFY_API_SECRET"),
    appSharedSecret: must("APP_SHARED_SECRET"),
    shopifyScopes: process.env.SHOPIFY_SCOPES ?? "read_orders,write_payment_sessions",
    shopifyRedirectPath: process.env.SHOPIFY_REDIRECT_PATH ?? "/auth/shopify/callback"
};
