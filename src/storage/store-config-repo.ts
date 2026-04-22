import fs from "node:fs";
import path from "node:path";
import { StoreConfig } from "../types";
import { StoreConfigStore } from "./contracts";

type StoreConfigMap = Record<string, StoreConfig>;

export class StoreConfigRepository implements StoreConfigStore {
  private readonly filePath: string;

  constructor(filePath = path.resolve(process.cwd(), "data/store-configs.json")) {
    this.filePath = filePath;
    this.ensureFile();
  }

  async get(shop: string): Promise<StoreConfig | undefined> {
    const data = this.readAll();
    return data[shop];
  }

  async list(): Promise<StoreConfig[]> {
    return Object.values(this.readAll());
  }

  async upsert(config: StoreConfig): Promise<StoreConfig> {
    const data = this.readAll();
    data[config.shop] = config;
    this.writeAll(data);
    return config;
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
