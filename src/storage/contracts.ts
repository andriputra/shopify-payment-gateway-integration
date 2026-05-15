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

/** Auto-generated payment links (post-checkout Swipe flow). */
export type PaymentRedirectRecord = {
  shop: string;
  orderReference: string;
  provider: string;
  paymentUrl: string;
  providerReference: string;
  /** Shopify Order GID (manual payment flow), when available. */
  shopifyOrderId?: string;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "failed";
  createdAt: string;
  updatedAt: string;
  /** Swipe EDC / gateway response code from the last callback (if reported). */
  swipeResponseCode?: string;
  /** Vendor message for `swipeResponseCode` (from reference table or callback body). */
  swipeResponseMessage?: string;
  /** Raw payment_status / status string from the last Swipe callback. */
  lastSwipeStatusRaw?: string;
  /** Per-checkout browser redirect (from bridge `returnUrl`); falls back to store config when absent. */
  returnUrlAfterPaid?: string;
};

export type PaymentRedirectMergePatch = Partial<
  Pick<
    PaymentRedirectRecord,
    | "status"
    | "swipeResponseCode"
    | "swipeResponseMessage"
    | "lastSwipeStatusRaw"
    | "paymentUrl"
    | "providerReference"
    | "shopifyOrderId"
    | "returnUrlAfterPaid"
  >
>;

export interface PaymentRedirectStore {
  upsert(record: PaymentRedirectRecord): Promise<PaymentRedirectRecord>;
  get(shop: string, orderReference: string): Promise<PaymentRedirectRecord | undefined>;
  getByShopifyOrderId(shop: string, shopifyOrderId: string): Promise<PaymentRedirectRecord | undefined>;
  listByShop(shop: string, limit?: number): Promise<PaymentRedirectRecord[]>;
  markStatus(shop: string, orderReference: string, status: PaymentRedirectRecord["status"]): Promise<void>;
  mergeUpdate(shop: string, orderReference: string, patch: PaymentRedirectMergePatch): Promise<void>;
  count(): Promise<number>;
}

/** Swipe HTTP create response or server-to-server webhook body (parsed JSON or `_raw` wrapper). */
export type SwipePayloadSource = "swipe_api_create" | "swipe_webhook";

export type SwipePayloadAppendInput = {
  shop: string;
  /** Same key as payment redirect / Swipe `invoice_number` when known (e.g. INV-…). */
  orderReference: string;
  source: SwipePayloadSource;
  httpStatus?: number | null;
  /** Raw body text from Swipe (JSON or non-JSON). */
  bodyText: string;
};

export type SwipePayloadRecord = {
  id: string;
  shop: string;
  orderReference: string;
  source: SwipePayloadSource;
  httpStatus: number | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export interface SwipePayloadStore {
  append(input: SwipePayloadAppendInput): Promise<SwipePayloadRecord>;
  listByShopAndOrderReference(shop: string, orderReference: string, limit: number): Promise<SwipePayloadRecord[]>;
  count(): Promise<number>;
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
  paymentRedirectRepo: PaymentRedirectStore;
  complianceRequestRepo: ComplianceRequestStore;
  swipePayloadRepo: SwipePayloadStore;
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
    paymentRedirects: number;
    complianceRequests: number;
    /** Rows in `swipe_response_codes` when using MySQL (reference dictionary). */
    swipeResponseCodes?: number;
    swipePayloadRecords?: number;
  };
  lastCompliance?: {
    id: string;
    topic: string;
    shop: string;
    triggeredAt: string;
  };
};
