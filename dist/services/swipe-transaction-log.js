"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeSwipePayloadForLog = sanitizeSwipePayloadForLog;
exports.logSwipeTransaction = logSwipeTransaction;
exports.swipeTransactionLogAbsolutePath = swipeTransactionLogAbsolutePath;
exports.readSwipeTransactionLogForShop = readSwipeTransactionLogForShop;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const env_1 = require("../config/env");
const shop_domain_1 = require("../utils/shop-domain");
const LOG_PREFIX = "[SWIPE_TX]";
const SENSITIVE_KEY = /password|secret|token|apikey|authorization|card|credential/i;
function truncate(str, max = 200) {
    if (str.length <= max) {
        return str;
    }
    return `${str.slice(0, max)}…`;
}
/** Safe subset of callback body for JSONL (no full PAN etc.). */
function sanitizeSwipePayloadForLog(body) {
    const out = {};
    for (const [key, value] of Object.entries(body)) {
        if (SENSITIVE_KEY.test(key)) {
            out[key] = "[redacted]";
            continue;
        }
        if (value === null || value === undefined) {
            out[key] = value;
        }
        else if (typeof value === "string") {
            out[key] = truncate(value);
        }
        else if (typeof value === "number" || typeof value === "boolean") {
            out[key] = value;
        }
        else if (Array.isArray(value)) {
            out[key] = `[array:${value.length}]`;
        }
        else if (typeof value === "object") {
            out[key] = sanitizeSwipePayloadForLog(value);
        }
        else {
            out[key] = String(value);
        }
    }
    return out;
}
function ensureDataDir() {
    if (!node_fs_1.default.existsSync(env_1.env.dataDir)) {
        node_fs_1.default.mkdirSync(env_1.env.dataDir, { recursive: true });
    }
}
function appendJsonlLine(record) {
    if (!env_1.env.swipeTxLogJsonl) {
        return;
    }
    try {
        ensureDataDir();
        const filePath = node_path_1.default.join(env_1.env.dataDir, "swipe-transaction-log.jsonl");
        node_fs_1.default.appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
    }
    catch (err) {
        console.error(`${LOG_PREFIX} failed to append JSONL`, err);
    }
}
const nowIso = () => new Date().toISOString();
/**
 * Structured Swipe transaction logging: stdout + optional JSONL (`data/swipe-transaction-log.jsonl`).
 * Use this to trace create → EDC → callback and whether Shopify payment session resolve ran.
 */
function logSwipeTransaction(record) {
    const line = { ts: nowIso(), ...record };
    console.info(LOG_PREFIX, line);
    appendJsonlLine(line);
}
const JSONL_NAME = "swipe-transaction-log.jsonl";
const MAX_READ_BYTES = 5 * 1024 * 1024;
function swipeTransactionLogAbsolutePath() {
    return node_path_1.default.join(env_1.env.dataDir, JSONL_NAME);
}
/**
 * Read persisted JSONL lines for one shop (matches session token `dest`).
 * Returns newest events first, at most `limit` entries (max 500 from HTTP route).
 */
function readSwipeTransactionLogForShop(shopFilter, limit) {
    const filePath = swipeTransactionLogAbsolutePath();
    if (!node_fs_1.default.existsSync(filePath)) {
        return {
            entries: [],
            filePath,
            fileExists: false,
            totalLinesParsed: 0,
            totalMatching: 0,
            order: "newest_first"
        };
    }
    const stat = node_fs_1.default.statSync(filePath);
    let raw;
    let truncatedFile = false;
    if (stat.size > MAX_READ_BYTES) {
        const fd = node_fs_1.default.openSync(filePath, "r");
        try {
            const buf = Buffer.alloc(MAX_READ_BYTES);
            const start = Math.max(0, stat.size - MAX_READ_BYTES);
            node_fs_1.default.readSync(fd, buf, 0, MAX_READ_BYTES, start);
            raw = buf.toString("utf8");
            if (start > 0) {
                const firstNl = raw.indexOf("\n");
                if (firstNl >= 0) {
                    raw = raw.slice(firstNl + 1);
                }
            }
            truncatedFile = true;
        }
        finally {
            node_fs_1.default.closeSync(fd);
        }
    }
    else {
        raw = node_fs_1.default.readFileSync(filePath, "utf8");
    }
    const lines = raw.split("\n").filter((l) => l.trim());
    const parsed = [];
    for (const line of lines) {
        try {
            parsed.push(JSON.parse(line));
        }
        catch {
            // skip malformed line
        }
    }
    const matching = parsed.filter((r) => (0, shop_domain_1.shopDomainsMatch)(String(r.shop ?? ""), shopFilter));
    const newestFirst = matching.slice(-limit).reverse();
    return {
        entries: newestFirst,
        filePath,
        fileExists: true,
        totalLinesParsed: parsed.length,
        totalMatching: matching.length,
        order: "newest_first",
        ...(truncatedFile
            ? {
                truncatedFile: true,
                note: "Log file exceeded read cap; only the tail was scanned — oldest matching rows may be missing."
            }
            : {})
    };
}
