import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env";
import { shopDomainsMatch } from "../utils/shop-domain";

const LOG_PREFIX = "[SWIPE_TX]";

const SENSITIVE_KEY = /password|secret|token|apikey|authorization|card|credential/i;

function truncate(str: string, max = 200): string {
  if (str.length <= max) {
    return str;
  }
  return `${str.slice(0, max)}…`;
}

/** Safe subset of callback body for JSONL (no full PAN etc.). */
export function sanitizeSwipePayloadForLog(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (value === null || value === undefined) {
      out[key] = value;
    } else if (typeof value === "string") {
      out[key] = truncate(value);
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = `[array:${value.length}]`;
    } else if (typeof value === "object") {
      out[key] = sanitizeSwipePayloadForLog(value as Record<string, unknown>);
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

function ensureDataDir(): void {
  if (!fs.existsSync(env.dataDir)) {
    fs.mkdirSync(env.dataDir, { recursive: true });
  }
}

function appendJsonlLine(record: Record<string, unknown>): void {
  if (!env.swipeTxLogJsonl) {
    return;
  }
  try {
    ensureDataDir();
    const filePath = path.join(env.dataDir, "swipe-transaction-log.jsonl");
    fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
  } catch (err) {
    console.error(`${LOG_PREFIX} failed to append JSONL`, err);
  }
}

export type SwipeTxPhase =
  | "create_success"
  | "create_api_error"
  | "create_network_error"
  | "edc_callback";

export type SwipePaymentSurface = "edc_pending_page" | "sandbox_fallback" | "external_redirect";

const nowIso = () => new Date().toISOString();

/**
 * Structured Swipe transaction logging: stdout + optional JSONL (`data/swipe-transaction-log.jsonl`).
 * Use this to trace create → EDC → callback and whether Shopify payment session resolve ran.
 */
export function logSwipeTransaction(record: Record<string, unknown>): void {
  const line = { ts: nowIso(), ...record };
  console.info(LOG_PREFIX, line);
  appendJsonlLine(line);
}

const JSONL_NAME = "swipe-transaction-log.jsonl";
const MAX_READ_BYTES = 5 * 1024 * 1024;

export function swipeTransactionLogAbsolutePath(): string {
  return path.join(env.dataDir, JSONL_NAME);
}

/**
 * Read persisted JSONL lines for one shop (matches session token `dest`).
 * Returns newest events first, at most `limit` entries (max 500 from HTTP route).
 */
export function readSwipeTransactionLogForShop(
  shopFilter: string,
  limit: number
): {
  entries: Record<string, unknown>[];
  filePath: string;
  fileExists: boolean;
  totalLinesParsed: number;
  totalMatching: number;
  order: "newest_first";
  truncatedFile?: boolean;
  note?: string;
} {
  const filePath = swipeTransactionLogAbsolutePath();
  if (!fs.existsSync(filePath)) {
    return {
      entries: [],
      filePath,
      fileExists: false,
      totalLinesParsed: 0,
      totalMatching: 0,
      order: "newest_first"
    };
  }

  const stat = fs.statSync(filePath);
  let raw: string;
  let truncatedFile = false;
  if (stat.size > MAX_READ_BYTES) {
    const fd = fs.openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(MAX_READ_BYTES);
      const start = Math.max(0, stat.size - MAX_READ_BYTES);
      fs.readSync(fd, buf, 0, MAX_READ_BYTES, start);
      raw = buf.toString("utf8");
      if (start > 0) {
        const firstNl = raw.indexOf("\n");
        if (firstNl >= 0) {
          raw = raw.slice(firstNl + 1);
        }
      }
      truncatedFile = true;
    } finally {
      fs.closeSync(fd);
    }
  } else {
    raw = fs.readFileSync(filePath, "utf8");
  }

  const lines = raw.split("\n").filter((l) => l.trim());
  const parsed: Record<string, unknown>[] = [];
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      // skip malformed line
    }
  }

  const matching = parsed.filter((r) => shopDomainsMatch(String(r.shop ?? ""), shopFilter));
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
