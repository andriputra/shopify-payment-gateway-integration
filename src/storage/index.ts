import path from "node:path";
import { env } from "../config/env";
import { ComplianceRequestRepository } from "./compliance-request-repo";
import { PaymentSessionContextRepository } from "./payment-session-context-repo";
import { ShopifyTokenRepository } from "./shopify-token-repo";
import { StorageBundle } from "./contracts";
import { createMysqlStorage } from "./mysql-storage";
import { StoreConfigRepository } from "./store-config-repo";

let storage: StorageBundle | undefined;

function createJsonStorage(): StorageBundle {
  return {
    initialize: async () => undefined,
    storeRepo: new StoreConfigRepository(path.join(env.dataDir, "store-configs.json")),
    tokenRepo: new ShopifyTokenRepository(path.join(env.dataDir, "shopify-tokens.json")),
    sessionContextRepo: new PaymentSessionContextRepository(path.join(env.dataDir, "payment-session-contexts.json")),
    complianceRequestRepo: new ComplianceRequestRepository(path.join(env.dataDir, "compliance-requests.json"))
  };
}

export function getStorage(): StorageBundle {
  if (!storage) {
    storage = env.storageDriver === "mysql" ? createMysqlStorage() : createJsonStorage();
  }

  return storage;
}

export async function initializeStorage(): Promise<void> {
  await getStorage().initialize();
}
