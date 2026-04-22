import path from "node:path";
import { env } from "../config/env";
import { ComplianceRequestRepository } from "../storage/compliance-request-repo";
import { PaymentSessionContextRepository } from "../storage/payment-session-context-repo";
import { ShopifyTokenRepository } from "../storage/shopify-token-repo";
import { createMysqlStorage } from "../storage/mysql-storage";
import { StoreConfigRepository } from "../storage/store-config-repo";

async function main() {
  const target = createMysqlStorage();
  await target.initialize();

  const sourceStoreRepo = new StoreConfigRepository(path.join(env.dataDir, "store-configs.json"));
  const sourceTokenRepo = new ShopifyTokenRepository(path.join(env.dataDir, "shopify-tokens.json"));
  const sourceSessionRepo = new PaymentSessionContextRepository(path.join(env.dataDir, "payment-session-contexts.json"));
  const sourceComplianceRepo = new ComplianceRequestRepository(path.join(env.dataDir, "compliance-requests.json"));

  const storeConfigs = await sourceStoreRepo.list();
  for (const item of storeConfigs) {
    await target.storeRepo.upsert(item);
  }

  const tokens = await sourceTokenRepo.list();
  for (const item of tokens) {
    await target.tokenRepo.upsert(item);
  }

  const sessions = await sourceSessionRepo.list();
  for (const item of sessions) {
    await target.sessionContextRepo.save(item.orderReference, item.context);
  }

  const complianceRequests = await sourceComplianceRepo.list();
  for (const item of complianceRequests) {
    await target.complianceRequestRepo.append(item);
  }

  console.log(
    `Migrated ${storeConfigs.length} store configs, ${tokens.length} tokens, ${sessions.length} payment session contexts, and ${complianceRequests.length} compliance requests to MySQL.`
  );
}

main().catch((error) => {
  console.error("Failed to migrate JSON data to MySQL", error);
  process.exitCode = 1;
});
