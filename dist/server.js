"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const app_1 = require("./app");
const env_1 = require("./config/env");
const storage_1 = require("./storage");
const app = (0, app_1.createApp)();
exports.app = app;
if (require.main === module) {
    (0, storage_1.initializeStorage)()
        .then(() => {
        app.listen(env_1.env.port, () => {
            console.log(`Server listening on ${env_1.env.host}`);
        });
    })
        .catch((error) => {
        console.error("Failed to initialize storage", error);
        process.exitCode = 1;
    });
}
