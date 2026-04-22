import mysql from "mysql2/promise";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { env } from "../config/env";
import { StoreConfig } from "../types";
import {
  ComplianceRequestRecord,
  ComplianceRequestStore,
  PaymentSessionContext,
  PaymentSessionContextStore,
  ShopifyTokenRecord,
  ShopifyTokenStore,
  StorageBundle,
  StoreConfigStore
} from "./contracts";

function parseJsonObject(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const parsed = JSON.parse(value) as Record<string, string>;
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  return JSON.parse(value) as Record<string, unknown>;
}

class MysqlStoreConfigRepository implements StoreConfigStore {
  constructor(private readonly pool: Pool) {}

  async get(shop: string): Promise<StoreConfig | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM store_configs WHERE shop = ? LIMIT 1",
      [shop]
    );
    return rows[0] ? this.mapRow(rows[0]) : undefined;
  }

  async list(): Promise<StoreConfig[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>("SELECT * FROM store_configs ORDER BY updated_at DESC");
    return rows.map((row) => this.mapRow(row));
  }

  async upsert(config: StoreConfig): Promise<StoreConfig> {
    await this.pool.execute(
      `INSERT INTO store_configs (
        shop, provider, redirect_url_after_paid, webhook_url_after_paid, api_key, api_secret, credentials_extra_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        provider = VALUES(provider),
        redirect_url_after_paid = VALUES(redirect_url_after_paid),
        webhook_url_after_paid = VALUES(webhook_url_after_paid),
        api_key = VALUES(api_key),
        api_secret = VALUES(api_secret),
        credentials_extra_json = VALUES(credentials_extra_json),
        updated_at = VALUES(updated_at)`,
      [
        config.shop,
        config.provider,
        config.redirectUrlAfterPaid,
        config.webhookUrlAfterPaid ?? null,
        config.credentials.apiKey,
        config.credentials.apiSecret ?? null,
        JSON.stringify(config.credentials.extra ?? {}),
        config.updatedAt
      ]
    );
    return config;
  }

  async delete(shop: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>("DELETE FROM store_configs WHERE shop = ?", [shop]);
    return result.affectedRows > 0;
  }

  private mapRow(row: RowDataPacket): StoreConfig {
    return {
      shop: String(row.shop),
      provider: row.provider as StoreConfig["provider"],
      redirectUrlAfterPaid: String(row.redirect_url_after_paid),
      webhookUrlAfterPaid: row.webhook_url_after_paid ? String(row.webhook_url_after_paid) : undefined,
      credentials: {
        apiKey: String(row.api_key),
        apiSecret: row.api_secret ? String(row.api_secret) : undefined,
        extra: parseJsonObject(row.credentials_extra_json)
      },
      updatedAt: String(row.updated_at)
    };
  }
}

class MysqlShopifyTokenRepository implements ShopifyTokenStore {
  constructor(private readonly pool: Pool) {}

  async get(shop: string): Promise<ShopifyTokenRecord | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM shopify_tokens WHERE shop = ? LIMIT 1",
      [shop]
    );
    return rows[0] ? this.mapRow(rows[0]) : undefined;
  }

  async list(): Promise<ShopifyTokenRecord[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>("SELECT * FROM shopify_tokens ORDER BY updated_at DESC");
    return rows.map((row) => this.mapRow(row));
  }

  async upsert(record: ShopifyTokenRecord): Promise<ShopifyTokenRecord> {
    await this.pool.execute(
      `INSERT INTO shopify_tokens (shop, access_token, scope, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        access_token = VALUES(access_token),
        scope = VALUES(scope),
        installed_at = VALUES(installed_at),
        updated_at = VALUES(updated_at)`,
      [record.shop, record.accessToken, record.scope ?? null, record.installedAt, new Date().toISOString()]
    );
    return record;
  }

  async delete(shop: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>("DELETE FROM shopify_tokens WHERE shop = ?", [shop]);
    return result.affectedRows > 0;
  }

  private mapRow(row: RowDataPacket): ShopifyTokenRecord {
    return {
      shop: String(row.shop),
      accessToken: String(row.access_token),
      scope: row.scope ? String(row.scope) : undefined,
      installedAt: String(row.installed_at)
    };
  }
}

class MysqlPaymentSessionContextRepository implements PaymentSessionContextStore {
  constructor(private readonly pool: Pool) {}

  async save(orderReference: string, ctx: PaymentSessionContext): Promise<void> {
    await this.pool.execute(
      `INSERT INTO payment_session_contexts (order_reference, shop, payment_session_id, created_at)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        shop = VALUES(shop),
        payment_session_id = VALUES(payment_session_id),
        created_at = VALUES(created_at)`,
      [orderReference, ctx.shop, ctx.paymentSessionId, ctx.createdAt]
    );
  }

  async get(orderReference: string): Promise<PaymentSessionContext | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM payment_session_contexts WHERE order_reference = ? LIMIT 1",
      [orderReference]
    );
    if (!rows[0]) {
      return undefined;
    }

    return {
      shop: String(rows[0].shop),
      paymentSessionId: String(rows[0].payment_session_id),
      createdAt: String(rows[0].created_at)
    };
  }

  async list(): Promise<Array<{ orderReference: string; context: PaymentSessionContext }>> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM payment_session_contexts ORDER BY created_at DESC"
    );
    return rows.map((row) => ({
      orderReference: String(row.order_reference),
      context: {
        shop: String(row.shop),
        paymentSessionId: String(row.payment_session_id),
        createdAt: String(row.created_at)
      }
    }));
  }

  async delete(orderReference: string): Promise<void> {
    await this.pool.execute("DELETE FROM payment_session_contexts WHERE order_reference = ?", [orderReference]);
  }
}

class MysqlComplianceRequestRepository implements ComplianceRequestStore {
  constructor(private readonly pool: Pool) {}

  async append(record: ComplianceRequestRecord): Promise<ComplianceRequestRecord> {
    await this.pool.execute(
      `INSERT INTO compliance_requests (
        id, topic, shop, customer_reference, shop_id, payload_json, outcome_json, triggered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        topic = VALUES(topic),
        shop = VALUES(shop),
        customer_reference = VALUES(customer_reference),
        shop_id = VALUES(shop_id),
        payload_json = VALUES(payload_json),
        outcome_json = VALUES(outcome_json),
        triggered_at = VALUES(triggered_at)`,
      [
        record.id,
        record.topic,
        record.shop,
        record.customerReference ?? null,
        record.shopId ?? null,
        JSON.stringify(record.payload),
        JSON.stringify(record.outcome),
        record.triggeredAt
      ]
    );
    return record;
  }

  async list(): Promise<ComplianceRequestRecord[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM compliance_requests ORDER BY triggered_at DESC"
    );
    return rows.map((row) => this.mapRow(row));
  }

  async get(id: string): Promise<ComplianceRequestRecord | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM compliance_requests WHERE id = ? LIMIT 1",
      [id]
    );
    return rows[0] ? this.mapRow(rows[0]) : undefined;
  }

  private mapRow(row: RowDataPacket): ComplianceRequestRecord {
    return {
      id: String(row.id),
      topic: row.topic as ComplianceRequestRecord["topic"],
      shop: String(row.shop),
      customerReference: row.customer_reference ? String(row.customer_reference) : undefined,
      shopId: row.shop_id ? String(row.shop_id) : undefined,
      triggeredAt: String(row.triggered_at),
      payload: parseJsonRecord(row.payload_json),
      outcome: parseJsonRecord(row.outcome_json)
    };
  }
}

function createPoolFromEnv(): Pool {
  if (env.mysqlUrl) {
    const url = new URL(env.mysqlUrl);
    return mysql.createPool({
      host: url.hostname,
      port: Number(url.port || env.mysqlPort),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\/+/, ""),
      connectionLimit: env.mysqlConnectionLimit
    });
  }

  if (!env.mysqlHost || !env.mysqlUser || !env.mysqlDatabase) {
    throw new Error("Missing MySQL configuration. Set MYSQL_URL or MYSQL_HOST/MYSQL_USER/MYSQL_DATABASE.");
  }

  return mysql.createPool({
    host: env.mysqlHost,
    port: env.mysqlPort,
    user: env.mysqlUser,
    password: env.mysqlPassword,
    database: env.mysqlDatabase,
    connectionLimit: env.mysqlConnectionLimit
  });
}

export function createMysqlStorage(): StorageBundle {
  const pool = createPoolFromEnv();

  return {
    initialize: async () => {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS store_configs (
          shop VARCHAR(255) PRIMARY KEY,
          provider VARCHAR(50) NOT NULL,
          redirect_url_after_paid TEXT NOT NULL,
          webhook_url_after_paid TEXT NULL,
          api_key TEXT NOT NULL,
          api_secret TEXT NULL,
          credentials_extra_json LONGTEXT NULL,
          updated_at VARCHAR(64) NOT NULL
        )
      `);

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS shopify_tokens (
          shop VARCHAR(255) PRIMARY KEY,
          access_token TEXT NOT NULL,
          scope TEXT NULL,
          installed_at VARCHAR(64) NOT NULL,
          updated_at VARCHAR(64) NOT NULL
        )
      `);

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS payment_session_contexts (
          order_reference VARCHAR(255) PRIMARY KEY,
          shop VARCHAR(255) NOT NULL,
          payment_session_id VARCHAR(255) NOT NULL,
          created_at VARCHAR(64) NOT NULL,
          INDEX idx_payment_session_shop (shop)
        )
      `);

      await pool.execute(`
        CREATE TABLE IF NOT EXISTS compliance_requests (
          id VARCHAR(64) PRIMARY KEY,
          topic VARCHAR(64) NOT NULL,
          shop VARCHAR(255) NOT NULL,
          customer_reference VARCHAR(64) NULL,
          shop_id VARCHAR(64) NULL,
          payload_json LONGTEXT NOT NULL,
          outcome_json LONGTEXT NOT NULL,
          triggered_at VARCHAR(64) NOT NULL,
          INDEX idx_compliance_shop (shop),
          INDEX idx_compliance_topic (topic)
        )
      `);
    },
    storeRepo: new MysqlStoreConfigRepository(pool),
    tokenRepo: new MysqlShopifyTokenRepository(pool),
    sessionContextRepo: new MysqlPaymentSessionContextRepository(pool),
    complianceRequestRepo: new MysqlComplianceRequestRepository(pool)
  };
}
