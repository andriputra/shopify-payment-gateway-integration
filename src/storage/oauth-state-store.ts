import fs from "node:fs";
import path from "node:path";
import type { Pool, RowDataPacket } from "mysql2/promise";

export type OAuthStateRecord = {
  shop: string;
  state: string;
  createdAt: string;
};

export interface OAuthStateStore {
  save(record: OAuthStateRecord): Promise<void>;
  consume(shop: string, state: string, maxAgeMs: number): Promise<boolean>;
  delete(shop: string): Promise<void>;
}

const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000;

export class JsonOAuthStateStore implements OAuthStateStore {
  private readonly filePath: string;

  constructor(filePath = path.resolve(process.cwd(), "data/oauth-states.json")) {
    this.filePath = filePath;
    this.ensureFile();
  }

  async save(record: OAuthStateRecord): Promise<void> {
    const data = this.readAll();
    data[record.shop] = record;
    this.writeAll(data);
  }

  async consume(shop: string, state: string, maxAgeMs = DEFAULT_MAX_AGE_MS): Promise<boolean> {
    const data = this.readAll();
    const entry = data[shop];
    if (!entry || entry.state !== state) {
      return false;
    }
    if (!this.isFresh(entry.createdAt, maxAgeMs)) {
      delete data[shop];
      this.writeAll(data);
      return false;
    }
    delete data[shop];
    this.writeAll(data);
    return true;
  }

  async delete(shop: string): Promise<void> {
    const data = this.readAll();
    if (!(shop in data)) {
      return;
    }
    delete data[shop];
    this.writeAll(data);
  }

  private isFresh(createdAt: string, maxAgeMs: number): boolean {
    const ts = Date.parse(createdAt);
    if (!Number.isFinite(ts)) {
      return false;
    }
    return Date.now() - ts <= maxAgeMs;
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

  private readAll(): Record<string, OAuthStateRecord> {
    this.ensureFile();
    const content = fs.readFileSync(this.filePath, "utf8");
    if (!content.trim()) {
      return {};
    }
    return JSON.parse(content) as Record<string, OAuthStateRecord>;
  }

  private writeAll(data: Record<string, OAuthStateRecord>): void {
    this.ensureFile();
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }
}

export class MysqlOAuthStateStore implements OAuthStateStore {
  constructor(private readonly pool: Pool) {}

  async save(record: OAuthStateRecord): Promise<void> {
    await this.pool.execute(
      `INSERT INTO oauth_states (shop, state, created_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE state = VALUES(state), created_at = VALUES(created_at)`,
      [record.shop, record.state, record.createdAt]
    );
  }

  async consume(shop: string, state: string, maxAgeMs = DEFAULT_MAX_AGE_MS): Promise<boolean> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT shop, state, created_at FROM oauth_states WHERE shop = ? LIMIT 1",
      [shop]
    );
    const row = rows[0];
    if (!row || String(row.state) !== state) {
      return false;
    }
    const createdAt = String(row.created_at);
    if (!this.isFresh(createdAt, maxAgeMs)) {
      await this.delete(shop);
      return false;
    }
    await this.delete(shop);
    return true;
  }

  async delete(shop: string): Promise<void> {
    await this.pool.execute("DELETE FROM oauth_states WHERE shop = ?", [shop]);
  }

  private isFresh(createdAt: string, maxAgeMs: number): boolean {
    const ts = Date.parse(createdAt);
    if (!Number.isFinite(ts)) {
      return false;
    }
    return Date.now() - ts <= maxAgeMs;
  }
}
