const http = require("node:http");
const { createApp } = require("./dist/app.js");
const { initializeStorage } = require("./dist/storage/index.js");

const app = createApp();
const port = Number(process.env.PORT || 3000);

initializeStorage()
  .then(() => {
    http.createServer(app).listen(port, () => {
      console.log(`Passenger bootstrap listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize storage for Passenger", error);
    process.exitCode = 1;
  });
