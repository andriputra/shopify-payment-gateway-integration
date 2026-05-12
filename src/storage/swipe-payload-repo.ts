import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env";
import { normalizeShopifyShopDomain } from "../utils/shop-domain";
import type {
  SwipePayloadAppendInput,
  SwipePayloadRecord,
  SwipePayloadSource,
  SwipePayloadStore
} from "./contracts";

export function bodyTextToPayload(bodyText: string): Record<string, unknown> {
  const t = (bodyText ?? "").trim();
  if (!t) {
    return { _empty: true };
  }
  try {
    const parsed = JSON.parse(t) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { _parsed: parsed };
  } catch {
    return { _raw: t };
  }
}

export class JsonlSwipePayloadRepository implements SwipePayloadStore {
  constructor(private readonly filePath: string) {}

  static defaultPath(): string {
    return path.join(env.dataDir, "swipe-payload-log.jsonl");
  }

  async append(input: SwipePayloadAppendInput): Promise<SwipePayloadRecord> {
    const shop = normalizeShopifyShopDomain(input.shop);
    const orderReference = input.orderReference.trim();
    const createdAt = new Date().toISOString();
    const record: SwipePayloadRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      shop,
      orderReference,
      source: input.source,
      httpStatus: input.httpStatus === undefined || input.httpStatus === null ? null : Number(input.httpStatus),
      payload: bodyTextToPayload(input.bodyText),
      createdAt
    };
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }

  async listByShopAndOrderReference(
    shop: string,
    orderReference: string,
    limit: number
  ): Promise<SwipePayloadRecord[]> {
    const shopKey = normalizeShopifyShopDomain(shop);
    const ref = orderReference.trim();
    const cap = Math.max(1, Math.min(limit, 500));
    if (!fs.existsSync(this.filePath)) {
      return [];
    }
    const raw = fs.readFileSync(this.filePath, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const matching: SwipePayloadRecord[] = [];
    for (const line of lines) {
      try {
        const row = JSON.parse(line) as SwipePayloadRecord;
        if (row.shop === shopKey && row.orderReference === ref) {
          matching.push({
            ...row,
            source: row.source as SwipePayloadSource
          });
        }
      } catch {
        // skip malformed line
      }
    }
    matching.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return matching.slice(0, cap);
  }

  async count(): Promise<number> {
    if (!fs.existsSync(this.filePath)) {
      return 0;
    }
    const raw = fs.readFileSync(this.filePath, "utf8");
    return raw.split("\n").filter((l) => l.trim()).length;
  }
}
