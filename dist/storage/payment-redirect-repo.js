"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentRedirectRepository = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function key(shop, orderReference) {
    return `${shop}::${orderReference}`;
}
class PaymentRedirectRepository {
    constructor(filePath = node_path_1.default.resolve(process.cwd(), "data/payment-redirects.json")) {
        this.filePath = filePath;
        this.ensureFile();
    }
    async upsert(record) {
        const data = this.readAll();
        data[key(record.shop, record.orderReference)] = record;
        this.writeAll(data);
        return record;
    }
    async get(shop, orderReference) {
        return this.readAll()[key(shop, orderReference)];
    }
    async listByShop(shop, limit = 50) {
        return Object.values(this.readAll())
            .filter((r) => r.shop === shop)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, Math.max(1, Math.min(200, limit)));
    }
    async markStatus(shop, orderReference, status) {
        const data = this.readAll();
        const k = key(shop, orderReference);
        const current = data[k];
        if (!current) {
            return;
        }
        data[k] = {
            ...current,
            status,
            updatedAt: new Date().toISOString()
        };
        this.writeAll(data);
    }
    async count() {
        return Object.keys(this.readAll()).length;
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
exports.PaymentRedirectRepository = PaymentRedirectRepository;
