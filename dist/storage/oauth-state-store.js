"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MysqlOAuthStateStore = exports.JsonOAuthStateStore = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000;
class JsonOAuthStateStore {
    constructor(filePath = node_path_1.default.resolve(process.cwd(), "data/oauth-states.json")) {
        this.filePath = filePath;
        this.ensureFile();
    }
    async save(record) {
        const data = this.readAll();
        data[record.shop] = record;
        this.writeAll(data);
    }
    async consume(shop, state, maxAgeMs = DEFAULT_MAX_AGE_MS) {
        const data = this.readAll();
        const entry = data[shop];
        if (!entry || entry.state !== state) {
            return false;
        }
        if (!this.isFresh(entry.createdAt, maxAgeMs)) {
            delete data[shop];
            this.writeAll(data);
            return false;
        }
        delete data[shop];
        this.writeAll(data);
        return true;
    }
    async delete(shop) {
        const data = this.readAll();
        if (!(shop in data)) {
            return;
        }
        delete data[shop];
        this.writeAll(data);
    }
    isFresh(createdAt, maxAgeMs) {
        const ts = Date.parse(createdAt);
        if (!Number.isFinite(ts)) {
            return false;
        }
        return Date.now() - ts <= maxAgeMs;
    }
    ensureFile() {
        const dir = node_path_1.default.dirname(this.filePath);
        if (!node_fs_1.default.existsSync(dir)) {
            node_fs_1.default.mkdirSync(dir, { recursive: true });
        }
        if (!node_fs_1.default.existsSync(this.filePath)) {
            node_fs_1.default.writeFileSync(this.filePath, "{}");
        }
    }
    readAll() {
        this.ensureFile();
        const content = node_fs_1.default.readFileSync(this.filePath, "utf8");
        if (!content.trim()) {
            return {};
        }
        return JSON.parse(content);
    }
    writeAll(data) {
        this.ensureFile();
        node_fs_1.default.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    }
}
exports.JsonOAuthStateStore = JsonOAuthStateStore;
class MysqlOAuthStateStore {
    constructor(pool) {
        this.pool = pool;
    }
    async save(record) {
        await this.pool.execute(`INSERT INTO oauth_states (shop, state, created_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE state = VALUES(state), created_at = VALUES(created_at)`, [record.shop, record.state, record.createdAt]);
    }
    async consume(shop, state, maxAgeMs = DEFAULT_MAX_AGE_MS) {
        const [rows] = await this.pool.query("SELECT shop, state, created_at FROM oauth_states WHERE shop = ? LIMIT 1", [shop]);
        const row = rows[0];
        if (!row || String(row.state) !== state) {
            return false;
        }
        const createdAt = String(row.created_at);
        if (!this.isFresh(createdAt, maxAgeMs)) {
            await this.delete(shop);
            return false;
        }
        await this.delete(shop);
        return true;
    }
    async delete(shop) {
        await this.pool.execute("DELETE FROM oauth_states WHERE shop = ?", [shop]);
    }
    isFresh(createdAt, maxAgeMs) {
        const ts = Date.parse(createdAt);
        if (!Number.isFinite(ts)) {
            return false;
        }
        return Date.now() - ts <= maxAgeMs;
    }
}
exports.MysqlOAuthStateStore = MysqlOAuthStateStore;
