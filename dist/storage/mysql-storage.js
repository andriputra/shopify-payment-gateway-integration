"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMysqlStorage = createMysqlStorage;
const promise_1 = __importDefault(require("mysql2/promise"));
const env_1 = require("../config/env");
const swipe_response_codes_1 = require("../data/swipe-response-codes");
const swipe_payload_repo_1 = require("./swipe-payload-repo");
const shop_domain_1 = require("../utils/shop-domain");
function parseJsonObject(value) {
    if (typeof value !== "string" || !value.trim()) {
        return undefined;
    }
    const parsed = JSON.parse(value);
    return Object.keys(parsed).length > 0 ? parsed : undefined;
}
function parseJsonRecord(value) {
    if (typeof value !== "string" || !value.trim()) {
        return {};
    }
    return JSON.parse(value);
}
class MysqlStoreConfigRepository {
    constructor(pool) {
        this.pool = pool;
    }
    async get(shop) {
        const [rows] = await this.pool.query("SELECT * FROM store_configs WHERE shop = ? LIMIT 1", [shop]);
        return rows[0] ? this.mapRow(rows[0]) : undefined;
    }
    async list() {
        const [rows] = await this.pool.query("SELECT * FROM store_configs ORDER BY updated_at DESC");
        return rows.map((row) => this.mapRow(row));
    }
    async upsert(config) {
        await this.pool.execute(`INSERT INTO store_configs (
        shop, provider, redirect_url_after_paid, webhook_url_after_paid, api_key, api_secret, credentials_extra_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        provider = VALUES(provider),
        redirect_url_after_paid = VALUES(redirect_url_after_paid),
        webhook_url_after_paid = VALUES(webhook_url_after_paid),
        api_key = VALUES(api_key),
        api_secret = VALUES(api_secret),
        credentials_extra_json = VALUES(credentials_extra_json),
        updated_at = VALUES(updated_at)`, [
            config.shop,
            config.provider,
            config.redirectUrlAfterPaid,
            config.webhookUrlAfterPaid ?? null,
            config.credentials.apiKey,
            config.credentials.apiSecret ?? null,
            JSON.stringify(config.credentials.extra ?? {}),
            config.updatedAt
        ]);
        return config;
    }
    async delete(shop) {
        const [result] = await this.pool.execute("DELETE FROM store_configs WHERE shop = ?", [shop]);
        return result.affectedRows > 0;
    }
    mapRow(row) {
        return {
            shop: String(row.shop),
            provider: row.provider,
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
class MysqlShopifyTokenRepository {
    constructor(pool) {
        this.pool = pool;
    }
    async get(shop) {
        const [rows] = await this.pool.query("SELECT * FROM shopify_tokens WHERE shop = ? LIMIT 1", [shop]);
        return rows[0] ? this.mapRow(rows[0]) : undefined;
    }
    async list() {
        const [rows] = await this.pool.query("SELECT * FROM shopify_tokens ORDER BY updated_at DESC");
        return rows.map((row) => this.mapRow(row));
    }
    async upsert(record) {
        await this.pool.execute(`INSERT INTO shopify_tokens (shop, access_token, scope, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        access_token = VALUES(access_token),
        scope = VALUES(scope),
        installed_at = VALUES(installed_at),
        updated_at = VALUES(updated_at)`, [record.shop, record.accessToken, record.scope ?? null, record.installedAt, new Date().toISOString()]);
        return record;
    }
    async delete(shop) {
        const [result] = await this.pool.execute("DELETE FROM shopify_tokens WHERE shop = ?", [shop]);
        return result.affectedRows > 0;
    }
    mapRow(row) {
        return {
            shop: String(row.shop),
            accessToken: String(row.access_token),
            scope: row.scope ? String(row.scope) : undefined,
            installedAt: String(row.installed_at)
        };
    }
}
class MysqlPaymentSessionContextRepository {
    constructor(pool) {
        this.pool = pool;
    }
    async save(orderReference, ctx) {
        await this.pool.execute(`INSERT INTO payment_session_contexts (order_reference, shop, payment_session_id, created_at)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        shop = VALUES(shop),
        payment_session_id = VALUES(payment_session_id),
        created_at = VALUES(created_at)`, [orderReference, ctx.shop, ctx.paymentSessionId, ctx.createdAt]);
    }
    async get(orderReference) {
        const [rows] = await this.pool.query("SELECT * FROM payment_session_contexts WHERE order_reference = ? LIMIT 1", [orderReference]);
        if (!rows[0]) {
            return undefined;
        }
        return {
            shop: String(rows[0].shop),
            paymentSessionId: String(rows[0].payment_session_id),
            createdAt: String(rows[0].created_at)
        };
    }
    async list() {
        const [rows] = await this.pool.query("SELECT * FROM payment_session_contexts ORDER BY created_at DESC");
        return rows.map((row) => ({
            orderReference: String(row.order_reference),
            context: {
                shop: String(row.shop),
                paymentSessionId: String(row.payment_session_id),
                createdAt: String(row.created_at)
            }
        }));
    }
    async delete(orderReference) {
        await this.pool.execute("DELETE FROM payment_session_contexts WHERE order_reference = ?", [orderReference]);
    }
}
class MysqlComplianceRequestRepository {
    constructor(pool) {
        this.pool = pool;
    }
    async append(record) {
        await this.pool.execute(`INSERT INTO compliance_requests (
        id, topic, shop, customer_reference, shop_id, payload_json, outcome_json, triggered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        topic = VALUES(topic),
        shop = VALUES(shop),
        customer_reference = VALUES(customer_reference),
        shop_id = VALUES(shop_id),
        payload_json = VALUES(payload_json),
        outcome_json = VALUES(outcome_json),
        triggered_at = VALUES(triggered_at)`, [
            record.id,
            record.topic,
            record.shop,
            record.customerReference ?? null,
            record.shopId ?? null,
            JSON.stringify(record.payload),
            JSON.stringify(record.outcome),
            record.triggeredAt
        ]);
        return record;
    }
    async list() {
        const [rows] = await this.pool.query("SELECT * FROM compliance_requests ORDER BY triggered_at DESC");
        return rows.map((row) => this.mapRow(row));
    }
    async get(id) {
        const [rows] = await this.pool.query("SELECT * FROM compliance_requests WHERE id = ? LIMIT 1", [id]);
        return rows[0] ? this.mapRow(rows[0]) : undefined;
    }
    mapRow(row) {
        return {
            id: String(row.id),
            topic: row.topic,
            shop: String(row.shop),
            customerReference: row.customer_reference ? String(row.customer_reference) : undefined,
            shopId: row.shop_id ? String(row.shop_id) : undefined,
            triggeredAt: String(row.triggered_at),
            payload: parseJsonRecord(row.payload_json),
            outcome: parseJsonRecord(row.outcome_json)
        };
    }
}
async function ignoreDuplicateColumn(pool, sql) {
    try {
        await pool.execute(sql);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/Duplicate column name/i.test(msg)) {
            throw err;
        }
    }
}
class MysqlPaymentRedirectRepository {
    constructor(pool) {
        this.pool = pool;
    }
    async upsert(record) {
        await this.pool.execute(`INSERT INTO payment_redirects (
        shop, order_reference, provider, payment_url, provider_reference, shopify_order_id,
        amount, currency, status, created_at, updated_at,
        swipe_response_code, swipe_response_message, last_swipe_status_raw, return_url_after_paid,
        forward_webhook_url, forward_webhook_secret
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        provider = VALUES(provider),
        payment_url = VALUES(payment_url),
        provider_reference = VALUES(provider_reference),
        shopify_order_id = VALUES(shopify_order_id),
        amount = VALUES(amount),
        currency = VALUES(currency),
        status = VALUES(status),
        updated_at = VALUES(updated_at),
        swipe_response_code = VALUES(swipe_response_code),
        swipe_response_message = VALUES(swipe_response_message),
        last_swipe_status_raw = VALUES(last_swipe_status_raw),
        return_url_after_paid = VALUES(return_url_after_paid),
        forward_webhook_url = VALUES(forward_webhook_url),
        forward_webhook_secret = VALUES(forward_webhook_secret)`, [
            record.shop,
            record.orderReference,
            record.provider,
            record.paymentUrl,
            record.providerReference,
            record.shopifyOrderId ?? null,
            record.amount,
            record.currency,
            record.status,
            record.createdAt,
            record.updatedAt,
            record.swipeResponseCode ?? null,
            record.swipeResponseMessage ?? null,
            record.lastSwipeStatusRaw ?? null,
            record.returnUrlAfterPaid ?? null,
            record.forwardWebhookUrl ?? null,
            record.forwardWebhookSecret ?? null
        ]);
        return record;
    }
    async get(shop, orderReference) {
        const [rows] = await this.pool.query("SELECT * FROM payment_redirects WHERE shop = ? AND order_reference = ? LIMIT 1", [shop, orderReference]);
        return rows[0] ? this.mapRow(rows[0]) : undefined;
    }
    async getByShopifyOrderId(shop, shopifyOrderId) {
        const want = (0, shop_domain_1.normalizeShopifyOrderGid)(shopifyOrderId);
        const [rows] = await this.pool.query("SELECT * FROM payment_redirects WHERE shop = ? AND shopify_order_id = ? LIMIT 1", [shop, want]);
        return rows[0] ? this.mapRow(rows[0]) : undefined;
    }
    async listByShop(shop, limit = 50) {
        const [rows] = await this.pool.query("SELECT * FROM payment_redirects WHERE shop = ? ORDER BY updated_at DESC LIMIT ?", [shop, Math.max(1, limit)]);
        return rows.map((row) => this.mapRow(row));
    }
    async markStatus(shop, orderReference, status) {
        await this.mergeUpdate(shop, orderReference, { status });
    }
    async mergeUpdate(shop, orderReference, patch) {
        const existing = await this.get(shop, orderReference);
        if (!existing) {
            return;
        }
        const merged = { ...existing, updatedAt: new Date().toISOString() };
        for (const [key, value] of Object.entries(patch)) {
            if (value !== undefined) {
                merged[key] = value;
            }
        }
        await this.upsert(merged);
    }
    async count() {
        const [[row]] = await this.pool.query("SELECT COUNT(*) AS c FROM payment_redirects");
        return Number(row?.c ?? 0);
    }
    mapRow(row) {
        return {
            shop: String(row.shop),
            orderReference: String(row.order_reference),
            provider: String(row.provider),
            paymentUrl: String(row.payment_url),
            providerReference: String(row.provider_reference),
            shopifyOrderId: row.shopify_order_id ? String(row.shopify_order_id) : undefined,
            amount: Number(row.amount),
            currency: String(row.currency),
            status: row.status,
            createdAt: String(row.created_at),
            updatedAt: String(row.updated_at),
            swipeResponseCode: row.swipe_response_code != null ? String(row.swipe_response_code) : undefined,
            swipeResponseMessage: row.swipe_response_message != null ? String(row.swipe_response_message) : undefined,
            lastSwipeStatusRaw: row.last_swipe_status_raw != null ? String(row.last_swipe_status_raw) : undefined,
            returnUrlAfterPaid: row.return_url_after_paid != null ? String(row.return_url_after_paid) : undefined,
            forwardWebhookUrl: row.forward_webhook_url != null ? String(row.forward_webhook_url) : undefined,
            forwardWebhookSecret: row.forward_webhook_secret != null ? String(row.forward_webhook_secret) : undefined
        };
    }
}
class MysqlSwipePayloadRepository {
    constructor(pool) {
        this.pool = pool;
    }
    async append(input) {
        const shop = (0, shop_domain_1.normalizeMerchantShopKey)(input.shop);
        const orderReference = input.orderReference.trim();
        const createdAt = new Date().toISOString();
        const payload = (0, swipe_payload_repo_1.bodyTextToPayload)(input.bodyText);
        const httpStatus = input.httpStatus === undefined || input.httpStatus === null ? null : Number(input.httpStatus);
        const [result] = await this.pool.execute(`INSERT INTO swipe_payload_records (shop, order_reference, source, http_status, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`, [shop, orderReference, input.source, httpStatus, JSON.stringify(payload), createdAt]);
        const id = String(result.insertId);
        return {
            id,
            shop,
            orderReference,
            source: input.source,
            httpStatus,
            payload,
            createdAt
        };
    }
    async listByShopAndOrderReference(shop, orderReference, limit) {
        const shopKey = (0, shop_domain_1.normalizeMerchantShopKey)(shop);
        const ref = orderReference.trim();
        const cap = Math.max(1, Math.min(limit, 500));
        const [rows] = await this.pool.query(`SELECT * FROM swipe_payload_records WHERE shop = ? AND order_reference = ? ORDER BY id DESC LIMIT ?`, [shopKey, ref, cap]);
        return rows.map((row) => ({
            id: String(row.id),
            shop: String(row.shop),
            orderReference: String(row.order_reference),
            source: String(row.source),
            httpStatus: row.http_status != null ? Number(row.http_status) : null,
            payload: parseJsonRecord(row.payload_json),
            createdAt: String(row.created_at)
        }));
    }
    async count() {
        const [[row]] = await this.pool.query("SELECT COUNT(*) AS c FROM swipe_payload_records");
        return Number(row?.c ?? 0);
    }
}
function createPoolFromEnv() {
    if (env_1.env.mysqlUrl) {
        const url = new URL(env_1.env.mysqlUrl);
        return promise_1.default.createPool({
            host: url.hostname,
            port: Number(url.port || env_1.env.mysqlPort),
            user: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            database: url.pathname.replace(/^\/+/, ""),
            connectionLimit: env_1.env.mysqlConnectionLimit,
            connectTimeout: env_1.env.mysqlConnectTimeoutMs
        });
    }
    if (!env_1.env.mysqlHost || !env_1.env.mysqlUser || !env_1.env.mysqlDatabase) {
        throw new Error("Missing MySQL configuration. Set MYSQL_URL or MYSQL_HOST/MYSQL_USER/MYSQL_DATABASE.");
    }
    return promise_1.default.createPool({
        host: env_1.env.mysqlHost,
        port: env_1.env.mysqlPort,
        user: env_1.env.mysqlUser,
        password: env_1.env.mysqlPassword,
        database: env_1.env.mysqlDatabase,
        connectionLimit: env_1.env.mysqlConnectionLimit,
        connectTimeout: env_1.env.mysqlConnectTimeoutMs
    });
}
function createMysqlStorage() {
    const pool = createPoolFromEnv();
    function buildShopifyUrls(host) {
        const base = host.replace(/\/$/, "");
        return {
            customersDataRequest: `${base}/webhooks/shopify/customers/data_request`,
            customersRedact: `${base}/webhooks/shopify/customers/redact`,
            shopRedact: `${base}/webhooks/shopify/shop/redact`
        };
    }
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
            await pool.execute(`
        CREATE TABLE IF NOT EXISTS payment_redirects (
          shop VARCHAR(255) NOT NULL,
          order_reference VARCHAR(255) NOT NULL,
          provider VARCHAR(50) NOT NULL,
          payment_url LONGTEXT NOT NULL,
          provider_reference TEXT NOT NULL,
          shopify_order_id TEXT NULL,
          amount BIGINT NOT NULL,
          currency VARCHAR(8) NOT NULL,
          status VARCHAR(16) NOT NULL,
          created_at VARCHAR(64) NOT NULL,
          updated_at VARCHAR(64) NOT NULL,
          swipe_response_code VARCHAR(32) NULL,
          swipe_response_message TEXT NULL,
          last_swipe_status_raw VARCHAR(255) NULL,
          PRIMARY KEY (shop, order_reference),
          INDEX idx_payment_redirect_shop (shop),
          INDEX idx_payment_redirect_status (status)
        )
      `);
            await ignoreDuplicateColumn(pool, "ALTER TABLE payment_redirects ADD COLUMN swipe_response_code VARCHAR(32) NULL");
            await ignoreDuplicateColumn(pool, "ALTER TABLE payment_redirects ADD COLUMN swipe_response_message TEXT NULL");
            await ignoreDuplicateColumn(pool, "ALTER TABLE payment_redirects ADD COLUMN last_swipe_status_raw VARCHAR(255) NULL");
            await ignoreDuplicateColumn(pool, "ALTER TABLE payment_redirects ADD COLUMN return_url_after_paid TEXT NULL");
            await ignoreDuplicateColumn(pool, "ALTER TABLE payment_redirects ADD COLUMN forward_webhook_url TEXT NULL");
            await ignoreDuplicateColumn(pool, "ALTER TABLE payment_redirects ADD COLUMN forward_webhook_secret TEXT NULL");
            await pool.execute(`
        CREATE TABLE IF NOT EXISTS swipe_response_codes (
          code VARCHAR(16) PRIMARY KEY,
          message TEXT NOT NULL
        )
      `);
            for (const [code, message] of Object.entries(swipe_response_codes_1.SWIPE_RESPONSE_CODES)) {
                await pool.execute(`INSERT INTO swipe_response_codes (code, message) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE message = VALUES(message)`, [code, message]);
            }
            await pool.execute(`
        CREATE TABLE IF NOT EXISTS swipe_payload_records (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          shop VARCHAR(255) NOT NULL,
          order_reference VARCHAR(255) NOT NULL,
          source VARCHAR(32) NOT NULL,
          http_status INT NULL,
          payload_json LONGTEXT NOT NULL,
          created_at VARCHAR(64) NOT NULL,
          INDEX idx_swipe_payload_shop_ref (shop, order_reference),
          INDEX idx_swipe_payload_created (created_at)
        )
      `);
        },
        systemStatus: async () => {
            const startedAt = Date.now();
            const mysqlInfo = { ok: true };
            try {
                await pool.query("SELECT 1");
                mysqlInfo.latencyMs = Date.now() - startedAt;
            }
            catch (error) {
                mysqlInfo.ok = false;
                mysqlInfo.error = error instanceof Error ? error.message : "MySQL ping failed";
            }
            const [[storeCountRow]] = await pool.query("SELECT COUNT(*) AS c FROM store_configs");
            const [[tokenCountRow]] = await pool.query("SELECT COUNT(*) AS c FROM shopify_tokens");
            const [[sessionCountRow]] = await pool.query("SELECT COUNT(*) AS c FROM payment_session_contexts");
            const [[complianceCountRow]] = await pool.query("SELECT COUNT(*) AS c FROM compliance_requests");
            const [[redirectCountRow]] = await pool.query("SELECT COUNT(*) AS c FROM payment_redirects");
            const [[swipeCodesCountRow]] = await pool.query("SELECT COUNT(*) AS c FROM swipe_response_codes");
            const [[swipePayloadCountRow]] = await pool.query("SELECT COUNT(*) AS c FROM swipe_payload_records");
            const [lastRows] = await pool.query("SELECT id, topic, shop, triggered_at FROM compliance_requests ORDER BY triggered_at DESC LIMIT 1");
            const last = lastRows[0];
            return {
                ok: mysqlInfo.ok,
                driver: "mysql",
                time: new Date().toISOString(),
                uptimeSec: Math.floor(process.uptime()),
                host: env_1.env.host,
                shopify: {
                    appUiPath: env_1.env.shopifyAppUiPath,
                    redirectPath: env_1.env.shopifyRedirectPath,
                    complianceWebhooks: buildShopifyUrls(env_1.env.host)
                },
                mysql: mysqlInfo,
                counts: {
                    storeConfigs: Number(storeCountRow?.c ?? 0),
                    shopifyTokens: Number(tokenCountRow?.c ?? 0),
                    paymentSessionContexts: Number(sessionCountRow?.c ?? 0),
                    paymentRedirects: Number(redirectCountRow?.c ?? 0),
                    complianceRequests: Number(complianceCountRow?.c ?? 0),
                    swipeResponseCodes: Number(swipeCodesCountRow?.c ?? 0),
                    swipePayloadRecords: Number(swipePayloadCountRow?.c ?? 0)
                },
                lastCompliance: last
                    ? {
                        id: String(last.id),
                        topic: String(last.topic),
                        shop: String(last.shop),
                        triggeredAt: String(last.triggered_at)
                    }
                    : undefined
            };
        },
        storeRepo: new MysqlStoreConfigRepository(pool),
        tokenRepo: new MysqlShopifyTokenRepository(pool),
        sessionContextRepo: new MysqlPaymentSessionContextRepository(pool),
        paymentRedirectRepo: new MysqlPaymentRedirectRepository(pool),
        complianceRequestRepo: new MysqlComplianceRequestRepository(pool),
        swipePayloadRepo: new MysqlSwipePayloadRepository(pool)
    };
}
