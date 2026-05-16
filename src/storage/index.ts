import path from "node:path";
import { env } from "../config/env";
import { ComplianceRequestRepository } from "./compliance-request-repo";
import { PaymentSessionContextRepository } from "./payment-session-context-repo";
import { PaymentRedirectRepository } from "./payment-redirect-repo";
import { ShopifyTokenRepository } from "./shopify-token-repo";
import { StorageBundle, SystemStatus } from "./contracts";
import { createMysqlStorage } from "./mysql-storage";
import { StoreConfigRepository } from "./store-config-repo";
import { JsonlSwipePayloadRepository } from "./swipe-payload-repo";
import { JsonOAuthStateStore } from "./oauth-state-store";

let storage: StorageBundle | undefined;

function buildShopifyUrls(host: string) {
  const base = host.replace(/\/$/, "");
  return {
    customersDataRequest: `${base}/webhooks/shopify/customers/data_request`,
    customersRedact: `${base}/webhooks/shopify/customers/redact`,
    shopRedact: `${base}/webhooks/shopify/shop/redact`
  };
}

function createJsonStorage(): StorageBundle {
  const storeRepo = new StoreConfigRepository(path.join(env.dataDir, "store-configs.json"));
  const tokenRepo = new ShopifyTokenRepository(path.join(env.dataDir, "shopify-tokens.json"));
  const sessionContextRepo = new PaymentSessionContextRepository(path.join(env.dataDir, "payment-session-contexts.json"));
  const paymentRedirectRepo = new PaymentRedirectRepository(path.join(env.dataDir, "payment-redirects.json"));
  const complianceRequestRepo = new ComplianceRequestRepository(path.join(env.dataDir, "compliance-requests.json"));
  const swipePayloadRepo = new JsonlSwipePayloadRepository(JsonlSwipePayloadRepository.defaultPath());
  const oauthStateRepo = new JsonOAuthStateStore(path.join(env.dataDir, "oauth-states.json"));

  return {
    initialize: async () => undefined,
    systemStatus: async (): Promise<SystemStatus> => {
      const [storeConfigs, shopifyTokens, paymentSessionContexts, paymentRedirects, complianceRequests, swipePayloadRecords] =
        await Promise.all([
          storeRepo.list(),
          tokenRepo.list(),
          sessionContextRepo.list(),
          paymentRedirectRepo.count(),
          complianceRequestRepo.list(),
          swipePayloadRepo.count()
        ]);

      const last = complianceRequests[0];

      return {
        ok: true,
        driver: "json",
        time: new Date().toISOString(),
        uptimeSec: Math.floor(process.uptime()),
        host: env.host,
        shopify: {
          appUiPath: env.shopifyAppUiPath,
          redirectPath: env.shopifyRedirectPath,
          complianceWebhooks: buildShopifyUrls(env.host)
        },
        counts: {
          storeConfigs: storeConfigs.length,
          shopifyTokens: shopifyTokens.length,
          paymentSessionContexts: paymentSessionContexts.length,
          paymentRedirects: paymentRedirects,
          complianceRequests: complianceRequests.length,
          swipePayloadRecords
        },
        lastCompliance: last
          ? {
              id: last.id,
              topic: last.topic,
              shop: last.shop,
              triggeredAt: last.triggeredAt
            }
          : undefined
      };
    },
    storeRepo,
    tokenRepo,
    oauthStateRepo,
    sessionContextRepo,
    paymentRedirectRepo,
    complianceRequestRepo,
    swipePayloadRepo
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
