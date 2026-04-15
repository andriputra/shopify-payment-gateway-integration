"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const app_1 = require("./app");
const env_1 = require("./config/env");
const app = (0, app_1.createApp)();
exports.app = app;
if (process.env.NODE_ENV !== "production") {
    app.listen(env_1.env.port, () => {
        console.log(`Server listening on ${env_1.env.host}`);
    });
}
