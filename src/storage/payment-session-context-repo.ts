import fs from "node:fs";
import path from "node:path";

export type PaymentSessionContext = {
  shop: string;
  paymentSessionId: string;
  createdAt: string;
};

type ContextMap = Record<string, PaymentSessionContext>;

export class PaymentSessionContextRepository {
  private readonly filePath: string;

  constructor(filePath = path.resolve(process.cwd(), "data/payment-session-contexts.json")) {
    this.filePath = filePath;
    this.ensureFile();
  }

  save(orderReference: string, ctx: PaymentSessionContext): void {
    const data = this.readAll();
    data[orderReference] = ctx;
    this.writeAll(data);
  }

  get(orderReference: string): PaymentSessionContext | undefined {
    return this.readAll()[orderReference];
  }

  delete(orderReference: string): void {
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
