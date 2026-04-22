import fs from "node:fs";
import path from "node:path";
import { PaymentSessionContext, PaymentSessionContextStore } from "./contracts";

type ContextMap = Record<string, PaymentSessionContext>;

export class PaymentSessionContextRepository implements PaymentSessionContextStore {
  private readonly filePath: string;

  constructor(filePath = path.resolve(process.cwd(), "data/payment-session-contexts.json")) {
    this.filePath = filePath;
    this.ensureFile();
  }

  async save(orderReference: string, ctx: PaymentSessionContext): Promise<void> {
    const data = this.readAll();
    data[orderReference] = ctx;
    this.writeAll(data);
  }

  async get(orderReference: string): Promise<PaymentSessionContext | undefined> {
    return this.readAll()[orderReference];
  }

  async list(): Promise<Array<{ orderReference: string; context: PaymentSessionContext }>> {
    return Object.entries(this.readAll()).map(([orderReference, context]) => ({
      orderReference,
      context
    }));
  }

  async delete(orderReference: string): Promise<void> {
    const data = this.readAll();
    delete data[orderReference];
    this.writeAll(data);
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

  private readAll(): ContextMap {
    this.ensureFile();
    const content = fs.readFileSync(this.filePath, "utf8");
    if (!content.trim()) {
      return {};
    }
    return JSON.parse(content) as ContextMap;
  }

  private writeAll(data: ContextMap): void {
    this.ensureFile();
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }
}
