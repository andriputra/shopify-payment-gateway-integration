import fs from "node:fs";
import path from "node:path";

export type ShopifyTokenRecord = {
  shop: string;
  accessToken: string;
  scope?: string;
  installedAt: string;
};

type TokenMap = Record<string, ShopifyTokenRecord>;

export class ShopifyTokenRepository {
  private readonly filePath: string;

  constructor(filePath = path.resolve(process.cwd(), "data/shopify-tokens.json")) {
    this.filePath = filePath;
    this.ensureFile();
  }

  get(shop: string): ShopifyTokenRecord | undefined {
    const data = this.readAll();
    return data[shop];
  }

  upsert(record: ShopifyTokenRecord): ShopifyTokenRecord {
    const data = this.readAll();
    data[record.shop] = record;
    this.writeAll(data);
    return record;
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
