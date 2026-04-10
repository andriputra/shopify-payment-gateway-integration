const serverless = require("serverless-http");
const { createApp } = require("../dist/app");

const app = createApp();
module.exports = serverless(app);
