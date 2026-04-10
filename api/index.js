const path = require("node:path");
const serverless = require("serverless-http");

const distApp = path.join(__dirname, "..", "dist", "app.js");
const { createApp } = require(distApp);

const app = createApp();
module.exports = serverless(app);
