import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

if (process.env.NODE_ENV !== "production") {
  app.listen(env.port, () => {
    console.log(`Server listening on ${env.host}`);
  });
}

export { app };