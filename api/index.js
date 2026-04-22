const path = require("node:path");
const serverless = require("serverless-http");

const distApp = path.join(__dirname, "..", "dist", "app.js");
const distStorage = path.join(__dirname, "..", "dist", "storage", "index.js");
const { createApp } = require(distApp);
const { initializeStorage } = require(distStorage);

const appPromise = initializeStorage().then(() => createApp());

module.exports = async (req, res) => {
  const app = await appPromise;
  return serverless(app)(req, res);
};
