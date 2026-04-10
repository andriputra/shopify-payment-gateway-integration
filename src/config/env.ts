import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

function must(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function resolveHost(): string {
  if (process.env.HOST) {
    return process.env.HOST;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  host: resolveHost(),
  dataDir: process.env.DATA_DIR ?? path.join(process.cwd(), "data"),
  shopifyApiKey: must("SHOPIFY_API_KEY"),
  shopifyApiSecret: must("SHOPIFY_API_SECRET"),
  appSharedSecret: must("APP_SHARED_SECRET"),
  shopifyScopes: process.env.SHOPIFY_SCOPES ?? "read_orders,write_payment_sessions",
  shopifyRedirectPath: process.env.SHOPIFY_REDIRECT_PATH ?? "/auth/shopify/callback"
};
