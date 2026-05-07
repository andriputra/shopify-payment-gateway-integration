import fs from "node:fs";
import path from "node:path";
import { PaymentRedirectRecord, PaymentRedirectStore } from "./contracts";

type RedirectKey = string;
type RedirectMap = Record<RedirectKey, PaymentRedirectRecord>;

function keyOf(shop: string, orderReference: string): RedirectKey {
  return `${shop}::${orderReference}`;
}

export class PaymentRedirectRepository implements PaymentRedirectStore {
  private readonly filePath: string;

  constructor(filePath = path.resolve(process.cwd(), "data/payment-redirects.json")) {
    this.filePath = filePath;
    this.ensureFile();
  }

  async upsert(record: PaymentRedirectRecord): Promise<PaymentRedirectRecord> {
    const data = this.readAll();
    data[keyOf(record.shop, record.orderReference)] = record;
    this.writeAll(data);
    return record;
  }

  async get(shop: string, orderReference: string): Promise<PaymentRedirectRecord | undefined> {
    return this.readAll()[keyOf(shop, orderReference)];
  }

  async listByShop(shop: string, limit = 50): Promise<PaymentRedirectRecord[]> {
    const all = Object.values(this.readAll())
      .filter((r) => r.shop === shop)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return all.slice(0, Math.max(1, limit));
  }

  async markStatus(shop: string, orderReference: string, status: PaymentRedirectRecord["status"]): Promise<void> {
    const data = this.readAll();
    const k = keyOf(shop, orderReference);
    const existing = data[k];
    if (!existing) return;
    data[k] = { ...existing, status, updatedAt: new Date().toISOString() };
    this.writeAll(data);
  }

  async count(): Promise<number> {
    return Object.keys(this.readAll()).length;
  }

  private ensureFile(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, "{}");
    }
  }

  private readAll(): RedirectMap {
    this.ensureFile();
    const content = fs.readFileSync(this.filePath, "utf8");
    if (!content.trim()) return {};
    return JSON.parse(content) as RedirectMap;
  }

  private writeAll(data: RedirectMap): void {
    this.ensureFile();
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }
}

