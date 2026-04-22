import fs from "node:fs";
import path from "node:path";
import { ComplianceRequestRecord, ComplianceRequestStore } from "./contracts";

export class ComplianceRequestRepository implements ComplianceRequestStore {
  private readonly filePath: string;

  constructor(filePath = path.resolve(process.cwd(), "data/compliance-requests.json")) {
    this.filePath = filePath;
    this.ensureFile();
  }

  async append(record: ComplianceRequestRecord): Promise<ComplianceRequestRecord> {
    const data = this.readAll();
    data.unshift(record);
    this.writeAll(data);
    return record;
  }

  async list(): Promise<ComplianceRequestRecord[]> {
    return this.readAll();
  }

  async get(id: string): Promise<ComplianceRequestRecord | undefined> {
    return this.readAll().find((record) => record.id === id);
  }

  private ensureFile(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, "[]");
    }
  }

  private readAll(): ComplianceRequestRecord[] {
    this.ensureFile();
    const content = fs.readFileSync(this.filePath, "utf8");
    if (!content.trim()) {
      return [];
    }
    return JSON.parse(content) as ComplianceRequestRecord[];
  }

  private writeAll(data: ComplianceRequestRecord[]): void {
    this.ensureFile();
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }
}
