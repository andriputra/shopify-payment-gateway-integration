import fs from "node:fs";
import path from "node:path";
import { StoreConfig } from "../types";

type StoreConfigMap = Record<string, StoreConfig>;

export class StoreConfigRepository {
  private readonly filePath: string;

  constructor(filePath = path.resolve(process.cwd(), "data/store-configs.json")) {
    this.filePath = filePath;
    this.ensureFile();
  }

  get(shop: string): StoreConfig | undefined {
    const data = this.readAll();
    return data[shop];
  }

  upsert(config: StoreConfig): StoreConfig {
    const data = this.readAll();
    data[config.shop] = config;
    this.writeAll(data);
    return config;
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

  private readAll(): StoreConfigMap {
    this.ensureFile();
    try {
      const content = fs.readFileSync(this.filePath, "utf8");
      if (!content.trim()) {
        return {};
      }
      return JSON.parse(content) as StoreConfigMap;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        this.ensureFile();
        return {};
      }
      throw error;
    }
  }

  private writeAll(data: StoreConfigMap): void {
    this.ensureFile();
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }
}
