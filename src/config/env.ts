import dotenv from "dotenv";

dotenv.config();

function must(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "http://localhost:3000",
  shopifyApiKey: must("SHOPIFY_API_KEY"),
  shopifyApiSecret: must("SHOPIFY_API_SECRET"),
  appSharedSecret: must("APP_SHARED_SECRET"),
  shopifyScopes: process.env.SHOPIFY_SCOPES ?? "read_orders,write_payment_sessions",
  shopifyRedirectPath: process.env.SHOPIFY_REDIRECT_PATH ?? "/auth/shopify/callback"
};
