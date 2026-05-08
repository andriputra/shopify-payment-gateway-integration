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

function toBool(value: string | undefined, defaultValue = false): boolean {
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  host: resolveHost(),
  dataDir: process.env.DATA_DIR ?? path.join(process.cwd(), "data"),
  storageDriver: (process.env.STORAGE_DRIVER ?? "json").toLowerCase(),
  shopifyApiKey: must("SHOPIFY_API_KEY"),
  shopifyApiSecret: must("SHOPIFY_API_SECRET"),
  appSharedSecret: must("APP_SHARED_SECRET"),
  shopifyScopes:
    process.env.SHOPIFY_SCOPES ??
    "read_orders,write_orders,read_products,write_products,read_inventory,write_inventory,write_payment_sessions",
  shopifyRedirectPath: process.env.SHOPIFY_REDIRECT_PATH ?? "/auth/callback",
  shopifyAppUiPath: process.env.SHOPIFY_APP_UI_PATH ?? "/app",
  shopifyPaymentsApiVersion: process.env.SHOPIFY_PAYMENTS_API_VERSION ?? "2025-01",
  swipeFallbackOn403: toBool(process.env.SWIPE_FALLBACK_ON_403, false),
  swipeDebugFingerprint: toBool(process.env.SWIPE_DEBUG_FINGERPRINT, false),
  /** Append one JSON object per line to `data/swipe-transaction-log.jsonl`. Set SWIPE_TX_LOG_JSONL=0 to disable. */
  swipeTxLogJsonl: toBool(process.env.SWIPE_TX_LOG_JSONL, true),
  mysqlUrl: process.env.MYSQL_URL ?? process.env.DATABASE_URL,
  mysqlHost: process.env.MYSQL_HOST,
  mysqlPort: Number(process.env.MYSQL_PORT ?? 3306),
  mysqlUser: process.env.MYSQL_USER,
  mysqlPassword: process.env.MYSQL_PASSWORD,
  mysqlDatabase: process.env.MYSQL_DATABASE,
  mysqlConnectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT ?? 10),
  mysqlConnectTimeoutMs: Number(process.env.MYSQL_CONNECT_TIMEOUT_MS ?? 5000)
};
