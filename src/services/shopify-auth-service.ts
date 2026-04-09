import crypto from "node:crypto";
import { env } from "../config/env";
import { ShopifyTokenRepository } from "../storage/shopify-token-repo";

const stateStore = new Map<string, string>();

type OAuthCallbackPayload = {
  shop: string;
  code: string;
  hmac: string;
  state: string;
  query: Record<string, string>;
};

export class ShopifyAuthService {
  constructor(private readonly tokenRepo: ShopifyTokenRepository) {}

  validateShop(shop: string): boolean {
    return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
  }

  buildInstallUrl(shop: string): string {
    const state = crypto.randomBytes(16).toString("hex");
    stateStore.set(shop, state);
    const redirectUri = `${env.host}${env.shopifyRedirectPath}`;
    const params = new URLSearchParams({
      client_id: env.shopifyApiKey,
      scope: env.shopifyScopes,
      redirect_uri: redirectUri,
      state
    });
    return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
  }

  async handleOAuthCallback(payload: OAuthCallbackPayload) {
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
        client_id: env.shopifyApiKey,
        client_secret: env.shopifyApiSecret,
        code: payload.code
      })
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      throw new Error(`OAuth token exchange failed: ${text}`);
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string; scope?: string };

    const saved = this.tokenRepo.upsert({
      shop: payload.shop,
      accessToken: tokenData.access_token,
      scope: tokenData.scope,
      installedAt: new Date().toISOString()
    });

    stateStore.delete(payload.shop);
    return saved;
  }

  verifyHmac(data: Record<string, string>, incomingHmac: string): boolean {
    const message = Object.keys(data)
      .filter((key) => key !== "hmac" && key !== "signature")
      .sort()
      .map((key) => `${key}=${data[key]}`)
      .join("&");

    const digest = crypto
      .createHmac("sha256", env.shopifyApiSecret)
      .update(message, "utf8")
      .digest("hex");

    const a = Buffer.from(digest, "utf8");
    const b = Buffer.from(incomingHmac, "utf8");
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }

  verifyWebhookHmac(rawBody: Buffer, incomingHmacBase64: string): boolean {
    const digest = crypto.createHmac("sha256", env.shopifyApiSecret).update(rawBody).digest("base64");
    const a = Buffer.from(digest, "utf8");
    const b = Buffer.from(incomingHmacBase64, "utf8");
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }
}
