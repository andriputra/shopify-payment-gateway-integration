import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env";

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
