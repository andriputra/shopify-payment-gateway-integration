"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonlSwipePayloadRepository = void 0;
exports.bodyTextToPayload = bodyTextToPayload;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const env_1 = require("../config/env");
const shop_domain_1 = require("../utils/shop-domain");
function bodyTextToPayload(bodyText) {
    const t = (bodyText ?? "").trim();
    if (!t) {
        return { _empty: true };
    }
    try {
        const parsed = JSON.parse(t);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
        return { _parsed: parsed };
    }
    catch {
        return { _raw: t };
    }
}
class JsonlSwipePayloadRepository {
    constructor(filePath) {
        this.filePath = filePath;
    }
    static defaultPath() {
        return node_path_1.default.join(env_1.env.dataDir, "swipe-payload-log.jsonl");
    }
    async append(input) {
        const shop = (0, shop_domain_1.normalizeMerchantShopKey)(input.shop);
        const orderReference = input.orderReference.trim();
        const createdAt = new Date().toISOString();
        const record = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            shop,
            orderReference,
            source: input.source,
            httpStatus: input.httpStatus === undefined || input.httpStatus === null ? null : Number(input.httpStatus),
            payload: bodyTextToPayload(input.bodyText),
            createdAt
        };
        const dir = node_path_1.default.dirname(this.filePath);
        if (!node_fs_1.default.existsSync(dir)) {
            node_fs_1.default.mkdirSync(dir, { recursive: true });
        }
        node_fs_1.default.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
        return record;
    }
    async listByShopAndOrderReference(shop, orderReference, limit) {
        const shopKey = (0, shop_domain_1.normalizeMerchantShopKey)(shop);
        const ref = orderReference.trim();
        const cap = Math.max(1, Math.min(limit, 500));
        if (!node_fs_1.default.existsSync(this.filePath)) {
            return [];
        }
        const raw = node_fs_1.default.readFileSync(this.filePath, "utf8");
        const lines = raw.split("\n").filter((l) => l.trim());
        const matching = [];
        for (const line of lines) {
            try {
                const row = JSON.parse(line);
                if (row.shop === shopKey && row.orderReference === ref) {
                    matching.push({
                        ...row,
                        source: row.source
                    });
                }
            }
            catch {
                // skip malformed line
            }
        }
        matching.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        return matching.slice(0, cap);
    }
    async count() {
        if (!node_fs_1.default.existsSync(this.filePath)) {
            return 0;
        }
        const raw = node_fs_1.default.readFileSync(this.filePath, "utf8");
        return raw.split("\n").filter((l) => l.trim()).length;
    }
}
exports.JsonlSwipePayloadRepository = JsonlSwipePayloadRepository;
