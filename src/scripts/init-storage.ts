import { env } from "../config/env";
import { initializeStorage } from "../storage";

async function main() {
  await initializeStorage();
  console.log(`Storage initialized with driver: ${env.storageDriver}`);
}

main().catch((error) => {
  console.error("Failed to initialize storage", error);
  process.exitCode = 1;
});
