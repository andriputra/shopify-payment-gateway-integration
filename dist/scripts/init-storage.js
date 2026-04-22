"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("../config/env");
const storage_1 = require("../storage");
async function main() {
    await (0, storage_1.initializeStorage)();
    console.log(`Storage initialized with driver: ${env_1.env.storageDriver}`);
}
main().catch((error) => {
    console.error("Failed to initialize storage", error);
    process.exitCode = 1;
});
