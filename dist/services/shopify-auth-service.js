"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShopifyAuthService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const env_1 = require("../config/env");
const stateStore = new Map();
class ShopifyAuthService {
    constructor(tokenRepo) {
        this.tokenRepo = tokenRepo;
    }
    validateShop(shop) {
        return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
    }
    startOAuth(shop) {
        const state = node_crypto_1.default.randomBytes(16).toString("hex");
        stateStore.set(shop, state);
        return this.buildInstallUrl(shop, state);
    }
    buildInstallUrl(shop, state) {
        const scopes = env_1.env.shopifyScopes
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .join(",");
        const redirectPath = env_1.env.shopifyRedirectPath.startsWith("/")
            ? env_1.env.shopifyRedirectPath
            : `/${env_1.env.shopifyRedirectPath}`;
        const params = new URLSearchParams({
            client_id: env_1.env.shopifyApiKey,
            scope: scopes,
            redirect_uri: `${env_1.env.host.replace(/\/$/, "")}${redirectPath}`,
            state
        });
        return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
    }
    async handleOAuthCallback(payload) {
        const expectedState = stateStore.get(payload.shop);
        if (!expectedState || expectedState !== payload.state) {
            throw new Error("Invalid OAuth state");
        }
        if (!this.verifyHmac(payload.query, payload.hmac)) {
            throw new Error("Invalid Shopify callback HMAC");
        }
        const tokenResponse = await fetch(`https://${payload.shop}/admin/oauth/access_token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                client_id: env_1.env.shopifyApiKey,
                client_secret: env_1.env.shopifyApiSecret,
                code: payload.code
            })
        });
        if (!tokenResponse.ok) {
            const text = await tokenResponse.text();
            throw new Error(`OAuth token exchange failed: ${text}`);
        }
        const tokenData = (await tokenResponse.json());
        const saved = this.tokenRepo.upsert({
            shop: payload.shop,
            accessToken: tokenData.access_token,
            scope: tokenData.scope,
            installedAt: new Date().toISOString()
        });
        stateStore.delete(payload.shop);
        return saved;
    }
    verifyHmac(data, incomingHmac) {
        const message = Object.keys(data)
            .filter((key) => key !== "hmac" && key !== "signature")
            .sort()
            .map((key) => `${key}=${data[key]}`)
            .join("&");
        const digest = node_crypto_1.default
            .createHmac("sha256", env_1.env.shopifyApiSecret)
            .update(message, "utf8")
            .digest("hex");
        const a = Buffer.from(digest, "utf8");
        const b = Buffer.from(incomingHmac, "utf8");
        if (a.length !== b.length) {
            return false;
        }
        return node_crypto_1.default.timingSafeEqual(a, b);
    }
    verifyWebhookHmac(rawBody, incomingHmacBase64) {
        const digest = node_crypto_1.default.createHmac("sha256", env_1.env.shopifyApiSecret).update(rawBody).digest("base64");
        const a = Buffer.from(digest, "utf8");
        const b = Buffer.from(incomingHmacBase64, "utf8");
        if (a.length !== b.length) {
            return false;
        }
        return node_crypto_1.default.timingSafeEqual(a, b);
    }
}
exports.ShopifyAuthService = ShopifyAuthService;
