"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeSwipePayloadForLog = sanitizeSwipePayloadForLog;
exports.logSwipeTransaction = logSwipeTransaction;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const env_1 = require("../config/env");
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
