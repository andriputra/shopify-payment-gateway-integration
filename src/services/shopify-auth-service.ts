import crypto from "node:crypto";
import { env } from "../config/env";
import { OAuthStateStore } from "../storage/oauth-state-store";
import { ShopifyTokenStore } from "../storage/contracts";

const OAUTH_STATE_MAX_AGE_MS = 15 * 60 * 1000;

type OAuthCallbackPayload = {
  shop: string;
  code: string;
  hmac: string;
  state: string;
  query: Record<string, string>;
  rawQueryString?: string;
};

export class ShopifyAuthService {
  constructor(
    private readonly tokenRepo: ShopifyTokenStore,
    private readonly oauthStateRepo: OAuthStateStore
  ) {}

  validateShop(shop: string): boolean {
    return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
  }

  normalizeShop(shopParam: string): string | null {
    const trimmed = shopParam.trim().toLowerCase();
    if (!trimmed) {
      return null;
    }
    const shop = trimmed.endsWith(".myshopify.com") ? trimmed : `${trimmed}.myshopify.com`;
    return this.validateShop(shop) ? shop : null;
  }

  async startOAuth(shop: string): Promise<string> {
    const state = crypto.randomBytes(16).toString("hex");
    await this.oauthStateRepo.save({
      shop,
      state,
      createdAt: new Date().toISOString()
    });
    return this.buildInstallUrl(shop, state);
  }

  buildInstallUrl(shop: string, state: string) {
    const scopes = env.shopifyScopes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .join(",");
    const redirectPath = env.shopifyRedirectPath.startsWith("/")
      ? env.shopifyRedirectPath
      : `/${env.shopifyRedirectPath}`;
    const params = new URLSearchParams({
      client_id: env.shopifyApiKey,
      scope: scopes,
      redirect_uri: `${env.host.replace(/\/$/, "")}${redirectPath}`,
      state
    });

    return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
  }

  buildAppRedirectUrl(params: { shop?: string; host?: string; installed: boolean; error?: string }): string {
    const appPath = env.shopifyAppUiPath.startsWith("/") ? env.shopifyAppUiPath : `/${env.shopifyAppUiPath}`;
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

  async getInstallStatus(shopParam: string) {
    const shop = this.normalizeShop(shopParam);
    if (!shop) {
      return { ok: false as const, message: "Invalid shop domain" };
    }

    const token = await this.tokenRepo.get(shop);
    if (!token) {
      return {
        ok: true as const,
        installed: false as const,
        shop,
        oauthRequired: true as const
      };
    }

    return {
      ok: true as const,
      installed: true as const,
      shop: token.shop,
      scope: token.scope,
      installedAt: token.installedAt,
      oauthRequired: false as const
    };
  }

  async handleOAuthCallback(payload: OAuthCallbackPayload) {
    const stateValid = await this.oauthStateRepo.consume(payload.shop, payload.state, OAUTH_STATE_MAX_AGE_MS);
    if (!stateValid) {
      throw new Error("Invalid or expired OAuth state");
    }

    const hmacValid =
      (payload.rawQueryString ? this.verifyHmacFromRawQuery(payload.rawQueryString, payload.hmac) : false) ||
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

    const saved = await this.tokenRepo.upsert({
      shop: payload.shop,
      accessToken: tokenData.access_token,
      scope: tokenData.scope,
      installedAt: new Date().toISOString()
    });

    await this.oauthStateRepo.delete(payload.shop);
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

  verifyHmacFromRawQuery(rawQueryString: string, incomingHmac: string): boolean {
    const source = rawQueryString.startsWith("?") ? rawQueryString.slice(1) : rawQueryString;
    const parts = source
      .split("&")
      .filter(Boolean)
      .filter((part) => !part.startsWith("hmac=") && !part.startsWith("signature="))
      .sort();
    const message = parts.join("&");
    const digest = crypto.createHmac("sha256", env.shopifyApiSecret).update(message, "utf8").digest("hex");
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
