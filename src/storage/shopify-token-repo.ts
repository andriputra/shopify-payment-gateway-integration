import fs from "node:fs";
import path from "node:path";
import { ShopifyTokenRecord, ShopifyTokenStore } from "./contracts";

type TokenMap = Record<string, ShopifyTokenRecord>;

export class ShopifyTokenRepository implements ShopifyTokenStore {
  private readonly filePath: string;

  constructor(filePath = path.resolve(process.cwd(), "data/shopify-tokens.json")) {
    this.filePath = filePath;
    this.ensureFile();
  }

  async get(shop: string): Promise<ShopifyTokenRecord | undefined> {
    const data = this.readAll();
    return data[shop];
  }

  async list(): Promise<ShopifyTokenRecord[]> {
    return Object.values(this.readAll());
  }

  async upsert(record: ShopifyTokenRecord): Promise<ShopifyTokenRecord> {
    const data = this.readAll();
    data[record.shop] = record;
    this.writeAll(data);
    return record;
  }

  async delete(shop: string): Promise<boolean> {
    const data = this.readAll();
    if (!(shop in data)) {
      return false;
    }
    delete data[shop];
    this.writeAll(data);
    return true;
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

  private readAll(): TokenMap {
    this.ensureFile();
    const content = fs.readFileSync(this.filePath, "utf8");
    if (!content.trim()) {
      return {};
    }
    return JSON.parse(content) as TokenMap;
  }

  private writeAll(data: TokenMap): void {
    this.ensureFile();
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }
}
