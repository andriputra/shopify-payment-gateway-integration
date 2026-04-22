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
  systemStatus: () => Promise<SystemStatus>;
  storeRepo: StoreConfigStore;
  tokenRepo: ShopifyTokenStore;
  sessionContextRepo: PaymentSessionContextStore;
  complianceRequestRepo: ComplianceRequestStore;
};

export type SystemStatus = {
  ok: boolean;
  driver: string;
  time: string;
  uptimeSec: number;
  host: string;
  shopify: {
    appUiPath: string;
    redirectPath: string;
    complianceWebhooks: {
      customersDataRequest: string;
      customersRedact: string;
      shopRedact: string;
    };
  };
  mysql?: {
    ok: boolean;
    latencyMs?: number;
    error?: string;
  };
  counts: {
    storeConfigs: number;
    shopifyTokens: number;
    paymentSessionContexts: number;
    complianceRequests: number;
  };
  lastCompliance?: {
    id: string;
    topic: string;
    shop: string;
    triggeredAt: string;
  };
};
