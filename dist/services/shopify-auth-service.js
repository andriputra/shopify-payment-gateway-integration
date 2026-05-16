"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShopifyAuthService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const env_1 = require("../config/env");
const OAUTH_STATE_MAX_AGE_MS = 15 * 60 * 1000;
class ShopifyAuthService {
    constructor(tokenRepo, oauthStateRepo) {
        this.tokenRepo = tokenRepo;
        this.oauthStateRepo = oauthStateRepo;
    }
    validateShop(shop) {
        return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
    }
    normalizeShop(shopParam) {
        const trimmed = shopParam.trim().toLowerCase();
        if (!trimmed) {
            return null;
        }
        const shop = trimmed.endsWith(".myshopify.com") ? trimmed : `${trimmed}.myshopify.com`;
        return this.validateShop(shop) ? shop : null;
    }
    async startOAuth(shop) {
        const state = node_crypto_1.default.randomBytes(16).toString("hex");
        await this.oauthStateRepo.save({
            shop,
            state,
            createdAt: new Date().toISOString()
        });
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
    buildAppRedirectUrl(params) {
        const appPath = env_1.env.shopifyAppUiPath.startsWith("/") ? env_1.env.shopifyAppUiPath : `/${env_1.env.shopifyAppUiPath}`;
        const search = new URLSearchParams({
            installed: params.installed ? "1" : "0"
        });
        if (params.shop) {
            search.set("shop", params.shop);
        }
        if (params.host) {
            search.set("host", params.host);
        }
        if (params.error) {
            search.set("error", params.error);
        }
        return `${appPath}?${search.toString()}`;
    }
    async getInstallStatus(shopParam) {
        const shop = this.normalizeShop(shopParam);
        if (!shop) {
            return { ok: false, message: "Invalid shop domain" };
        }
        const token = await this.tokenRepo.get(shop);
        if (!token) {
            return {
                ok: true,
                installed: false,
                shop,
                oauthRequired: true
            };
        }
        return {
            ok: true,
            installed: true,
            shop: token.shop,
            scope: token.scope,
            installedAt: token.installedAt,
            oauthRequired: false
        };
    }
    async handleOAuthCallback(payload) {
        const stateValid = await this.oauthStateRepo.consume(payload.shop, payload.state, OAUTH_STATE_MAX_AGE_MS);
        if (!stateValid) {
            throw new Error("Invalid or expired OAuth state");
        }
        const hmacValid = (payload.rawQueryString ? this.verifyHmacFromRawQuery(payload.rawQueryString, payload.hmac) : false) ||
            this.verifyHmac(payload.query, payload.hmac);
        if (!hmacValid) {
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
        const saved = await this.tokenRepo.upsert({
            shop: payload.shop,
            accessToken: tokenData.access_token,
            scope: tokenData.scope,
            installedAt: new Date().toISOString()
        });
        await this.oauthStateRepo.delete(payload.shop);
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
    verifyHmacFromRawQuery(rawQueryString, incomingHmac) {
        const source = rawQueryString.startsWith("?") ? rawQueryString.slice(1) : rawQueryString;
        const parts = source
            .split("&")
            .filter(Boolean)
            .filter((part) => !part.startsWith("hmac=") && !part.startsWith("signature="))
            .sort();
        const message = parts.join("&");
        const digest = node_crypto_1.default.createHmac("sha256", env_1.env.shopifyApiSecret).update(message, "utf8").digest("hex");
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
