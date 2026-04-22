import { StoreConfig } from "../types";

export type ShopifyTokenRecord = {
  shop: string;
  accessToken: string;
  scope?: string;
  installedAt: string;
};

export type PaymentSessionContext = {
  shop: string;
  paymentSessionId: string;
  createdAt: string;
};

export type ComplianceTopic = "customers/data_request" | "customers/redact" | "shop/redact";

export type ComplianceRequestRecord = {
  id: string;
  topic: ComplianceTopic;
  shop: string;
  customerReference?: string;
  shopId?: string;
  triggeredAt: string;
  payload: Record<string, unknown>;
  outcome: Record<string, unknown>;
};

export interface StoreConfigStore {
  get(shop: string): Promise<StoreConfig | undefined>;
  list(): Promise<StoreConfig[]>;
  upsert(config: StoreConfig): Promise<StoreConfig>;
  delete(shop: string): Promise<boolean>;
}

export interface ShopifyTokenStore {
  get(shop: string): Promise<ShopifyTokenRecord | undefined>;
  list(): Promise<ShopifyTokenRecord[]>;
  upsert(record: ShopifyTokenRecord): Promise<ShopifyTokenRecord>;
  delete(shop: string): Promise<boolean>;
}

export interface PaymentSessionContextStore {
  save(orderReference: string, ctx: PaymentSessionContext): Promise<void>;
  get(orderReference: string): Promise<PaymentSessionContext | undefined>;
  list(): Promise<Array<{ orderReference: string; context: PaymentSessionContext }>>;
  delete(orderReference: string): Promise<void>;
}

export interface ComplianceRequestStore {
  append(record: ComplianceRequestRecord): Promise<ComplianceRequestRecord>;
  list(): Promise<ComplianceRequestRecord[]>;
  get(id: string): Promise<ComplianceRequestRecord | undefined>;
}

export type StorageBundle = {
  initialize: () => Promise<void>;
  storeRepo: StoreConfigStore;
  tokenRepo: ShopifyTokenStore;
  sessionContextRepo: PaymentSessionContextStore;
  complianceRequestRepo: ComplianceRequestStore;
};
