import { createApp } from "./app";
import { env } from "./config/env";
import { initializeStorage } from "./storage";

const app = createApp();

if (require.main === module) {
  initializeStorage()
    .then(() => {
      app.listen(env.port, () => {
        console.log(`Server listening on ${env.host}`);
      });
    })
    .catch((error) => {
      console.error("Failed to initialize storage", error);
      process.exitCode = 1;
    });
}

export { app };
